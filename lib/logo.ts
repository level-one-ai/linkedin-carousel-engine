import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let cachedLogo: string | null = null;

/**
 * The logo as a data URI.
 *
 * The slide templates are handed to Chromium through `setContent`, which gives
 * the page no origin — so `/logo-mark.png` resolves to nothing and the mark
 * silently disappears from every carousel. Inlining it is the only reliable
 * way to get it into a rendered PDF. Read once and cached, because it is
 * needed on every generation.
 */
export function logoDataUri(): string {
  if (cachedLogo) return cachedLogo;

  try {
    const bytes = readFileSync(join(process.cwd(), 'public', 'logo-mark.png'));
    cachedLogo = `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    // A missing logo must not stop a carousel being generated. A transparent
    // 1x1 keeps the layout intact and the slide simply has no mark on it.
    cachedLogo =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  }

  return cachedLogo;
}
