import { renderSlides } from './chromium';
import { generateContentPayload } from './gemini';
import {
  describePocketBaseError,
  getTemplateByKey,
  listTemplates,
  logError,
  savePost,
} from './pocketbase';
import { renderTemplate } from './render';
import { stripEmojis } from './sanitize';
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
 * Templates come from PocketBase. If the database is empty or unreachable the
 * on-disk starter set takes over, so a missing database degrades the feature
 * set rather than breaking generation entirely.
 */
async function resolveTemplates(warnings: string[]): Promise<HtmlTemplate[]> {
  try {
    const templates = await listTemplates();
    if (templates.length > 0) return templates;
    warnings.push('PocketBase has no templates yet. Using the built in starter templates.');
  } catch (error) {
    warnings.push('PocketBase is not reachable. Using the built in starter templates.');
    await logError({
      stage: 'templates',
      message: 'listTemplates failed',
      details: String(error),
    });
  }
  return loadSeedTemplates();
}

async function resolveChosenTemplate(
  templateKey: string,
  available: HtmlTemplate[],
): Promise<HtmlTemplate> {
  const fromList = available.find((template) => template.template_key === templateKey);
  if (fromList) return fromList;

  const fromDb = await getTemplateByKey(templateKey);
  if (fromDb) return fromDb;

  return available[0];
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
  const template = await resolveChosenTemplate(templateKey, selectable);
  if (template.template_key !== templateKey) {
    warnings.push(`Template "${templateKey}" was not found, so "${template.template_name}" was used.`);
  }

  // Phase 3: merge the payload into the raw HTML.
  const html = renderTemplate(template, { ...payload, template_key: template.template_key });

  // Phase 4: render through headless Chromium.
  const { asset, thumbnail, overflowingSlides } = await renderSlides(html, input.postMode);

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
