import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { prepareSlideImage } from './chromium';

/**
 * Images a slide design can use, dropped into `templates/assets/`.
 *
 * They are handed to templates as data URIs rather than paths, for the same
 * reason `logoDataUri()` in `lib/brand.ts` exists: a template reaches Chromium
 * through `setContent`, which gives the page no origin, so `/portrait.jpg`
 * resolves to nothing and the image silently disappears from the PDF.
 *
 * A design says which of these it needs with `"requires"` in
 * `templates/index.json`. Without them it is left out of the picker entirely,
 * so a design built around a photograph does not appear as an empty frame
 * before the photograph exists.
 */

const EXTENSIONS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/**
 * How large a file this will read.
 *
 * Generous, because it is not the number that matters: every image is redrawn
 * at the width a slide actually shows it before it reaches a template, so the
 * source size affects how long that takes and nothing else. A cut-out saved
 * straight out of a background remover is easily this big.
 */
const MAX_BYTES = 12 * 1024 * 1024;

export function assetsDirectory(): string {
  return join(process.cwd(), 'templates', 'assets');
}

let cache: Record<string, string> | null = null;

/**
 * Every usable image in the folder, keyed by filename without the extension —
 * so `portrait.jpg` becomes `{{assets.portrait}}`.
 *
 * Cached, because this runs on every generation and the files only change when
 * the repository does.
 */
export function loadTemplateAssets(): Record<string, string> {
  if (cache) return cache;

  const directory = assetsDirectory();
  const assets: Record<string, string> = {};

  if (!existsSync(directory)) {
    cache = assets;
    return assets;
  }

  for (const file of readdirSync(directory)) {
    const dot = file.lastIndexOf('.');
    if (dot <= 0) continue;

    const mime = EXTENSIONS[file.slice(dot).toLowerCase()];
    if (!mime) continue;

    try {
      const bytes = readFileSync(join(directory, file));
      if (bytes.length > MAX_BYTES) {
        console.warn(
          `[assets] Skipping ${file}: ${(bytes.length / 1024 / 1024).toFixed(1)}MB is past the ` +
            '12MB limit. Save it smaller — around 1000 pixels wide is plenty.',
        );
        continue;
      }
      assets[file.slice(0, dot).toLowerCase()] = `data:${mime};base64,${bytes.toString('base64')}`;
    } catch (error) {
      console.warn(`[assets] Could not read ${file}: ${String(error)}`);
    }
  }

  cache = assets;
  return assets;
}

let prepared: Record<string, string> | null = null;

/**
 * The images, redrawn at the size a slide actually shows them, plus a black and
 * white copy of each as `<name>Mono`.
 *
 * Both matter for size. A photograph goes into two slides of the portrait
 * design, in colour on the cover and in black and white on the sign off, and
 * doing that second one with a CSS filter costs far more than it looks:
 * Chromium cannot put a filter in a PDF, so it rasterises the filtered image at
 * full page resolution. Measured on a detailed 961KB photograph, the carousel
 * came to 6.3MB against a 10MB field. Converting once here brings the whole
 * thing back under a megabyte.
 *
 * Cached after the first generation, because the files only change when the
 * repository does. Falls back to the untouched image if the browser is
 * unavailable — a slightly heavy PDF beats no carousel.
 */
export async function prepareTemplateAssets(): Promise<Record<string, string>> {
  if (prepared) return prepared;

  const source = loadTemplateAssets();
  const out: Record<string, string> = { ...source };

  for (const [name, dataUri] of Object.entries(source)) {
    const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUri);
    if (!match) continue;

    try {
      const { colour, mono } = await prepareSlideImage(Buffer.from(match[2], 'base64'), match[1]);
      // The type comes back from the redraw rather than being assumed: a
      // cut-out has to stay a PNG to keep its transparency, and calling it a
      // JPEG here would hand the browser bytes that do not match the label.
      out[name] = `data:${colour.mimeType};base64,${colour.buffer.toString('base64')}`;
      out[`${name}Mono`] = `data:${mono.mimeType};base64,${mono.buffer.toString('base64')}`;
    } catch (error) {
      console.warn(`[assets] Could not redraw ${name}, using it as it is: ${String(error)}`);
      out[`${name}Mono`] = dataUri;
    }
  }

  prepared = out;
  return out;
}

/** Which of a design's required images are not there. Empty when it is ready. */
export function missingAssets(required: string[] | undefined): string[] {
  if (!required || required.length === 0) return [];
  const assets = loadTemplateAssets();
  return required.filter((name) => !assets[name.toLowerCase()]);
}
