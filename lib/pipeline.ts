import { renderSlides } from './chromium';
import { generateContentPayload } from './gemini';
import {
  describePocketBaseError,
  getTemplateByKey,
  listTemplates,
  logError,
  replaceTemplateHtml,
  savePost,
} from './pocketbase';
import { renderTemplate } from './render';
import { stripEmojis } from './sanitize';
import { templateProblem } from './template-html';
import { loadSeedTemplates } from './template-seed';
import type { GenerateResult, HtmlTemplate, InputType, PostMode } from './types';
import { extractCodebaseContext } from './unzipper';

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'linkedin-post'
  );
}

/**
 * The PocketBase limit on the `asset` field. A PDF past this is rejected on
 * save, so it is worth catching here where the message can say which design
 * produced it.
 */
const MAX_ASSET_BYTES = 10 * 1024 * 1024;

/**
 * Makes sure the design about to be used can actually render, and leaves the
 * database better than it found it.
 *
 * Two failures, with different answers. A design pasted into the PocketBase
 * admin UI's rich editor comes back escaped into visible text, or wrapped in a
 * paragraph — `repairTemplateHtml` undoes both on the way out of the database,
 * and the repaired copy is written back so the next read does not have to.
 * A design the editor has *stripped*, usually of its <style> block, cannot be
 * recovered from what is left; there the bundled file of the same key takes
 * over and is written back in its place.
 *
 * Rendering either without this produces the failure this exists to prevent: a
 * page of HTML source code, saved as a one slide carousel.
 */
async function healTemplate(template: HtmlTemplate, warnings: string[]): Promise<HtmlTemplate> {
  const problem = template.problem ?? templateProblem(template.raw_html);

  // Best effort throughout. A read-only database must not stop a post that is
  // otherwise about to render correctly.
  async function store(html: string) {
    if (!template.id) return;
    try {
      await replaceTemplateHtml(template.id, html);
    } catch (error) {
      await logError({
        stage: 'templates',
        message: `Could not repair template ${template.template_key}`,
        details: String(error),
      });
    }
  }

  if (!problem) {
    if (template.repaired) {
      // Un-escaping worked, so the design itself is intact and there is no
      // reason to replace it with a bundled one — including when it is a
      // design of your own that has no bundled copy.
      warnings.push(
        `"${template.template_name}" was stored as plain text rather than HTML. It has been ` +
          'unscrambled and saved back properly, so this will not happen again.',
      );
      await store(template.raw_html);
    }
    return template;
  }

  const bundled = loadSeedTemplates().find((t) => t.template_key === template.template_key);
  if (!bundled) {
    warnings.push(
      `The design "${template.template_name}" cannot be used because ${problem}, and there is ` +
        'no built in copy of it to fall back on.',
    );
    return template;
  }

  warnings.push(
    `The stored copy of "${template.template_name}" was damaged (${problem}), so the built in ` +
      'copy was used instead and saved back in its place.',
  );
  await store(bundled.raw_html);

  return { ...template, raw_html: bundled.raw_html, problem: null, repaired: true };
}

/**
 * Every design the model may choose from.
 *
 * The `templates/` folder in the repository comes first and always wins.
 * PocketBase is asked only for designs stored under a key the folder does not
 * have, so a design can still be added without a deploy, but nothing in the
 * database can override or break one of the five that ship with the app.
 *
 * That order is the whole point. A design pasted into the PocketBase admin UI
 * comes back escaped into text or stripped of its <style> block, and renders
 * as a page of its own source code. A file in git cannot be damaged that way.
 */
async function resolveTemplates(warnings: string[]): Promise<HtmlTemplate[]> {
  const bundled = loadSeedTemplates();
  const keys = new Set(bundled.map((template) => template.template_key));

  if (bundled.length === 0) {
    warnings.push(
      'No slide designs were found in the templates folder, so PocketBase is being used instead.',
    );
  }

  let extra: HtmlTemplate[] = [];
  try {
    extra = (await listTemplates()).filter((template) => !keys.has(template.template_key));
  } catch (error) {
    // Not worth a warning any more. The designs are on disk; an unreachable
    // database costs nothing here, and it is reported when saving the post.
    await logError({
      stage: 'templates',
      message: 'listTemplates failed',
      details: String(error),
    });
  }

  return [...bundled, ...extra];
}

async function resolveChosenTemplate(
  templateKey: string,
  available: HtmlTemplate[],
  warnings: string[],
): Promise<HtmlTemplate> {
  // A design from the folder carries no id, was validated as it was read, and
  // has nothing to repair — healTemplate is only for the database ones.
  const fromList = available.find((template) => template.template_key === templateKey);
  if (fromList) return fromList.id ? healTemplate(fromList, warnings) : fromList;

  const fromDb = await getTemplateByKey(templateKey);
  if (fromDb) return healTemplate(fromDb, warnings);

  const fallback = available[0];
  return fallback.id ? healTemplate(fallback, warnings) : fallback;
}

export interface GenerateInput {
  postMode: PostMode;
  inputType: InputType;
  /** Raw .zip bytes when inputType is "zip". */
  zipBuffer?: Buffer;
  /** Free text description when inputType is "text". */
  description?: string;
  sourceName: string;
  /** Optional operator override that skips the model's template choice. */
  forcedTemplateKey?: string;
}

/**
 * Ingestion, analysis, HTML rendering, compilation, and persistence.
 * The browser only ever sees the record id that comes out of this.
 */
export async function runGeneration(input: GenerateInput): Promise<GenerateResult> {
  const warnings: string[] = [];

  // Phase 1: build the codebase context string.
  let contextString: string;
  if (input.inputType === 'zip') {
    if (!input.zipBuffer) throw new Error('No zip archive was received.');
    const extraction = await extractCodebaseContext(input.zipBuffer);
    if (extraction.fileCount === 0) {
      throw new Error(
        'No readable source files were found in that archive. Try a zip that contains the project source.',
      );
    }
    if (extraction.truncated) {
      warnings.push(
        `The project is large, so only the ${extraction.fileCount} most descriptive files were analyzed.`,
      );
    }
    contextString = extraction.contextString;
  } else {
    const description = (input.description ?? '').trim();
    if (description.length < 20) {
      throw new Error('Add a longer description so there is enough material to work with.');
    }
    contextString = `===== PROJECT DESCRIPTION =====\n${description}`;
  }

  // Phase 2: analysis, caption, and either a slide payload or an image prompt.
  // A single image post needs no design, so PocketBase is not consulted for one.
  const selectable = input.postMode === 'image' ? [] : await resolveTemplates(warnings);

  const payload = await generateContentPayload({
    contextString,
    postMode: input.postMode,
    templates: selectable,
    sourceName: input.sourceName,
  });

  const projectTitle = payload.project_title || input.sourceName;

  // A single image post stops here. The picture is made in Google Labs Flow
  // from the prompt below and uploaded afterwards, so there is nothing to
  // render and no file to save yet.
  if (input.postMode === 'image') {
    return finish({
      input,
      warnings,
      caption: stripEmojis(payload.caption),
      projectTitle,
      hashtags: payload.hashtags,
      imagePrompt: payload.image_prompt,
      templateKey: 'user_image',
      templateName: 'Uploaded image',
      slideCount: 1,
      mimeType: '',
      fileName: '',
    });
  }

  const templateKey = input.forcedTemplateKey?.trim() || payload.template_key;
  const template = await resolveChosenTemplate(templateKey, selectable, warnings);
  if (template.template_key !== templateKey) {
    warnings.push(`Template "${templateKey}" was not found, so "${template.template_name}" was used.`);
  }

  // Phase 3: merge the payload into the raw HTML.
  const html = renderTemplate(template, { ...payload, template_key: template.template_key });

  // Phase 4: render through headless Chromium.
  const { asset, thumbnail, overflowingSlides } = await renderSlides(html, input.postMode);

  // The count comes from the finished PDF, not from what the model intended.
  // A design that renders as one page of source code gets this far looking
  // fine and then saves a post that says "Carousel, 1 slides" — unusable, and
  // worse than an error because it looks like a result.
  if (asset.slideCount !== payload.slides.length) {
    throw new Error(
      `The design "${template.template_name}" produced ${asset.slideCount} ` +
        `${asset.slideCount === 1 ? 'page' : 'pages'} instead of ${payload.slides.length}, so the ` +
        'carousel was not saved. The stored copy of that design is probably damaged: rerun ' +
        '"npm run seed" to restore it.',
    );
  }

  if (asset.buffer.length > MAX_ASSET_BYTES) {
    const megabytes = (asset.buffer.length / 1024 / 1024).toFixed(1);
    throw new Error(
      `The carousel came to ${megabytes}MB, which is past the 10MB limit on the file field, so ` +
        `it was not saved. The design "${template.template_name}" is producing files too large ` +
        'to store. Generate again with a different design.',
    );
  }

  if (overflowingSlides.length > 0) {
    // The slide was shrunk as far as it can legibly go and the copy still does
    // not fit, so something is being clipped. Better to say so than to publish
    // a slide with its last bullet missing.
    warnings.push(
      `Slide ${overflowingSlides.join(', ')} has more text than fits the frame and may be ` +
        'cut off at the bottom. Generate again for shorter copy.',
    );
  }

  return finish({
    input,
    warnings,
    caption: stripEmojis(payload.caption),
    projectTitle,
    hashtags: payload.hashtags,
    imagePrompt: '',
    templateKey: template.template_key,
    templateName: template.template_name,
    slideCount: asset.slideCount,
    mimeType: asset.mimeType,
    fileName: `${slugify(projectTitle)}.${asset.extension}`,
    asset: asset.buffer,
    thumbnail,
  });
}

/**
 * Saves the post and shapes the reply, for both kinds of post.
 *
 * A carousel arrives here with bytes; a single image post arrives with none and
 * gets them later through the upload route. Everything after that split is the
 * same, so it lives in one place.
 */
async function finish(args: {
  input: GenerateInput;
  warnings: string[];
  caption: string;
  projectTitle: string;
  hashtags: string[];
  imagePrompt: string;
  templateKey: string;
  templateName: string;
  slideCount: number;
  mimeType: string;
  fileName: string;
  asset?: Buffer;
  thumbnail?: Buffer;
}): Promise<GenerateResult> {
  const { input, warnings } = args;
  let postId: string | null = null;

  try {
    postId = await savePost({
      input_type: input.inputType,
      source_name: input.sourceName,
      post_mode: input.postMode,
      caption_text: args.caption,
      chosen_template_key: args.templateKey,
      template_name: args.templateName,
      project_title: args.projectTitle,
      slide_count: args.slideCount,
      mime_type: args.mimeType,
      file_name: args.fileName,
      hashtags: args.hashtags,
      image_prompt: args.imagePrompt,
      asset: args.asset,
      thumbnail: args.thumbnail,
    });
  } catch (error) {
    const reason = describePocketBaseError(error);
    warnings.push(
      args.asset
        ? `The post was generated but could not be saved to your history, so it will not ` +
          `appear under Previous Posts. Download it now if you want to keep it. ${reason}`
        : `The post was written but could not be saved, so there is nowhere to upload the ` +
          `image to. Copy the caption and the prompt below before leaving this page. ${reason}`,
    );
    await logError({ stage: 'save-post', message: reason, details: String(error) });
  }

  return {
    postId,
    ...(postId || !args.asset ? {} : { fallbackBase64: args.asset.toString('base64') }),
    caption: args.caption,
    templateKey: args.templateKey,
    templateName: args.templateName,
    postMode: input.postMode,
    slideCount: args.slideCount,
    fileName: args.fileName,
    mimeType: args.mimeType,
    imagePrompt: args.imagePrompt,
    warnings,
  };
}
