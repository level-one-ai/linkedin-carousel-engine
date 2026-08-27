import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Who the posts are published as, and the mark that goes with them.
 *
 * Stated once here because it is needed in three places that cannot share a
 * component: the slide templates (rendered by Chromium), the LinkedIn preview
 * (rendered by React), and the download filenames.
 */
export const BRAND = {
  name: 'Level One',
  /** The line under the name in the preview header. */
  tagline: 'AI systems and automation for growing businesses',
  /** The large letterspaced wordmark on the carousel cover slide. */
  wordmark: 'LEVEL ONE',
  /**
   * The person posting, shown in the top corner of the portrait design the way
   * the reference carousel carries its author's name.
   */
  author: 'Dean',
} as const;

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
