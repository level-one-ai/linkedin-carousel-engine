/**
 * Who the posts are published as.
 *
 * Stated once here because it is needed in three places that cannot share a
 * component: the slide templates (rendered by Chromium), the four feed
 * previews (rendered by React in the browser), and the download filenames.
 *
 * Values only. The logo lives in lib/logo.ts because reading it needs the file
 * system, and this module is imported by client components — pulling node:fs
 * into the browser bundle fails the build.
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
