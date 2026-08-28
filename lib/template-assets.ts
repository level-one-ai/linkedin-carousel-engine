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
 * The images, redrawn at the size a slide actually shows them.
 *
 * Size is the reason. Chromium embeds a picture in the PDF at the resolution it
 * is painted, so a photograph straight off a phone costs the same whether the
 * slide draws it 1080px wide or 560px, and a transparent cut-out has to be a
 * lossless PNG on top of that. Bringing it down to 640px first is what keeps an
 * eight slide carousel around a megabyte against a 10MB field.
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
      const image = await prepareSlideImage(Buffer.from(match[2], 'base64'), match[1]);

      // A design draws these up to 560px across. Anything smaller is being
      // enlarged on the slide, which no amount of processing here can undo.
      if (image.width < 560) {
        console.warn(
          `[assets] ${name} is only ${image.width}px wide and will be enlarged to fill the ` +
            'slide, so it will look soft. Save it at around 1000px across.',
        );
      }

      // The type comes back from the redraw rather than being assumed: a
      // cut-out has to stay a PNG to keep its transparency, and calling it a
      // JPEG here would hand the browser bytes that do not match the label.
      out[name] = `data:${image.mimeType};base64,${image.buffer.toString('base64')}`;
    } catch (error) {
      console.warn(`[assets] Could not redraw ${name}, using it as it is: ${String(error)}`);
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
