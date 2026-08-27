import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { missingAssets } from './template-assets';
import { templateProblem } from './template-html';
import type { HtmlTemplate } from './types';

/**
 * The slide designs, read from the `templates/` folder in the repository.
 *
 * This folder is the source of truth, not PocketBase. The designs are static
 * files that change when someone edits them in git, so putting them in a
 * database bought nothing and cost a great deal: `raw_html` is an `editor`
 * field, the admin UI puts a rich text editor in front of it, and a template
 * that goes through a rich text editor comes back escaped into visible text or
 * stripped of its <style> block. Chromium then renders the source code as
 * words on one page. Nothing typed into an admin UI can damage a file in git.
 *
 * PocketBase keeps a smaller job, in `lib/pipeline.ts`: a design stored there
 * under a key that is *not* in this folder still appears, so one can be added
 * without a deploy. It can no longer override one of these.
 */

interface IndexEntry {
  template_key: string;
  template_name: string;
  category: string;
  file: string;
  /**
   * Images from templates/assets this design cannot render without, by name
   * without the extension. A design listing one that is not there is left out
   * rather than rendered with an empty frame where the picture goes.
   */
  requires?: string[];
}

const FALLBACK_CATEGORY =
  'A slide design added to the templates folder. No description was given for it, so the model has ' +
  'little to go on when choosing between this and the others.';

function templatesDirectory(): string {
  return join(process.cwd(), 'templates');
}

function readIndex(directory: string): IndexEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(join(directory, 'index.json'), 'utf8')) as {
      designs?: IndexEntry[];
    };
    return Array.isArray(parsed.designs) ? parsed.designs : [];
  } catch (error) {
    // A missing or malformed index is not fatal: the .html files are still
    // there and the scan below finds them.
    console.warn(`[templates] Could not read templates/index.json: ${String(error)}`);
    return [];
  }
}

/** "level_one_cream" -> "Level One Cream", for a file with no index entry. */
function nameFromKey(key: string): string {
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Every usable design in the folder.
 *
 * Indexed files first, in the order the index lists them, then any other
 * `.html` in the folder — so dropping a file in is enough to see it in the
 * picker, and adding an entry to the index is only needed to give it a proper
 * name and a description for the model to choose on.
 *
 * A file that cannot render is left out rather than offered. Serving one would
 * reproduce the failure this whole arrangement exists to prevent.
 */
/**
 * Designs the folder holds but cannot offer yet, and why.
 *
 * Kept separate from loadSeedTemplates so that a design waiting on a
 * photograph is explainable — absent from the picker, but not a mystery.
 */
export function unavailableTemplates(): Array<{ template_name: string; reason: string }> {
  const directory = templatesDirectory();
  const out: Array<{ template_name: string; reason: string }> = [];

  for (const entry of readIndex(directory)) {
    const missing = missingAssets(entry.requires);
    if (missing.length === 0) continue;
    out.push({
      template_name: entry.template_name,
      reason: `waiting for ${missing.join(', ')} in templates/assets`,
    });
  }

  return out;
}

export function loadSeedTemplates(): HtmlTemplate[] {
  const directory = templatesDirectory();
  const indexed = readIndex(directory);

  let files: string[] = [];
  try {
    files = readdirSync(directory).filter((name) => name.endsWith('.html'));
  } catch (error) {
    console.warn(`[templates] Could not read the templates folder: ${String(error)}`);
    return [];
  }

  const claimed = new Set(indexed.map((entry) => entry.file));
  const entries: IndexEntry[] = [
    ...indexed.filter((entry) => files.includes(entry.file)),
    ...files
      .filter((file) => !claimed.has(file))
      .map((file) => {
        const key = file.replace(/\.html$/, '');
        return {
          template_key: key,
          template_name: nameFromKey(key),
          category: FALLBACK_CATEGORY,
          file,
        };
      }),
  ];

  const templates: HtmlTemplate[] = [];
  for (const entry of entries) {
    let raw_html: string;
    try {
      raw_html = readFileSync(join(directory, entry.file), 'utf8');
    } catch (error) {
      console.warn(`[templates] Could not read ${entry.file}: ${String(error)}`);
      continue;
    }

    const problem = templateProblem(raw_html);
    if (problem) {
      console.warn(`[templates] Skipping ${entry.file}: ${problem}`);
      continue;
    }

    const missing = missingAssets(entry.requires);
    if (missing.length > 0) {
      console.warn(
        `[templates] Skipping ${entry.file}: it needs ${missing.join(', ')} in templates/assets.`,
      );
      continue;
    }

    templates.push({
      template_key: entry.template_key,
      template_name: entry.template_name,
      category: entry.category,
      raw_html,
      problem: null,
    });
  }

  return templates;
}
