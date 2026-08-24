import { generateContentPayload } from './gemini';
import { convertHtml } from './gotenberg';
import { getTemplateByKey, listTemplates, logError, logGeneratedPost } from './pocketbase';
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
 * on-disk starter set takes over, so a missing container degrades the feature
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
 * Phase 1 through Phase 4 of the specification: ingestion, analysis, HTML
 * rendering, and compilation. Phase 5 happens in the browser.
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

  // Phase 2: analysis, caption, template selection, and slide payload.
  const templates = await resolveTemplates(warnings);

  // Image mode is steered toward single frame templates when one exists.
  const candidateTemplates =
    input.postMode === 'image'
      ? templates.filter((template) => template.template_key.startsWith('single_image'))
      : templates.filter((template) => !template.template_key.startsWith('single_image'));
  const selectable = candidateTemplates.length > 0 ? candidateTemplates : templates;

  const payload = await generateContentPayload({
    contextString,
    postMode: input.postMode,
    templates: selectable,
    sourceName: input.sourceName,
  });

  const templateKey = input.forcedTemplateKey?.trim() || payload.template_key;
  const template = await resolveChosenTemplate(templateKey, selectable);
  if (template.template_key !== templateKey) {
    warnings.push(`Template "${templateKey}" was not found, so "${template.template_name}" was used.`);
  }

  // Phase 3: merge the payload into the raw HTML.
  const html = renderTemplate(template, { ...payload, template_key: template.template_key });

  // Phase 4: compile through Gotenberg.
  const conversion = await convertHtml(html, input.postMode);

  const caption = stripEmojis(payload.caption);

  const recordId = await logGeneratedPost({
    input_type: input.inputType,
    source_name: input.sourceName,
    post_mode: input.postMode,
    caption_text: caption,
    chosen_template_key: template.template_key,
  });

  return {
    caption,
    templateKey: template.template_key,
    templateName: template.template_name,
    postMode: input.postMode,
    slideCount: input.postMode === 'image' ? 1 : payload.slides.length,
    fileBase64: conversion.buffer.toString('base64'),
    fileName: `${slugify(payload.project_title || input.sourceName)}.${conversion.extension}`,
    mimeType: conversion.mimeType,
    recordId,
    warnings,
  };
}
