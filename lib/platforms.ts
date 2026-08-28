/**
 * The four networks a post goes out to, and what each one wants.
 *
 * Stated once here because the same list drives four things that must not
 * drift apart: what Gemini is asked to write, what the record stores, what the
 * preview tabs render, and what a redo request is allowed to name.
 */

export const PLATFORMS = ['linkedin', 'x', 'facebook', 'instagram'] as const;

export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: unknown): value is Platform {
  return PLATFORMS.includes(value as Platform);
}

interface PlatformSpec {
  /** What the tab says. */
  label: string;
  /** The field on the PocketBase record. */
  captionField: string;
  approvedField: string;
  postIdField: string;
  /**
   * The brief handed to Gemini. Written per platform because a LinkedIn post
   * and an X post are different pieces of writing, not the same one truncated.
   */
  brief: string;
  /**
   * Hard limit on the caption. X enforces its own; the rest are the point past
   * which a network hides the remainder behind "see more", which is worth
   * writing to even though nothing rejects a longer one.
   */
  limit: number;
  /** Where the reader stops before the "see more" fold, in characters. */
  fold: number;
}

export const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
  linkedin: {
    label: 'LinkedIn',
    captionField: 'linkedin_caption',
    approvedField: 'linkedin_approved',
    postIdField: 'linkedin_post_id',
    brief:
      'A hook line, then a short technical breakdown, then three or four bullet points each ' +
      'starting with a hyphen, then the comment ask, then professional hashtags on the final ' +
      'line. Blank line between sections. Around 1200 characters.',
    limit: 3000,
    fold: 210,
  },
  x: {
    label: 'X',
    captionField: 'x_caption',
    approvedField: 'x_approved',
    postIdField: 'x_post_id',
    brief:
      'One punchy post, 200 to 260 characters INCLUDING the hashtags, hard maximum 280. One idea ' +
      'and one reason to care. No bullet lists, no headers, at most two hashtags. This is the ' +
      'only platform with a limit that rejects rather than truncates, so count it.',
    limit: 280,
    fold: 280,
  },
  facebook: {
    label: 'Facebook',
    captionField: 'facebook_caption',
    approvedField: 'facebook_approved',
    postIdField: 'facebook_post_id',
    brief:
      'A community narrative: what the problem felt like, what was built, what changed for the ' +
      'people using it. Conversational and plain, no bullet lists, ends on a question. Around ' +
      '600 characters. One or two hashtags at most.',
    limit: 2000,
    fold: 250,
  },
  instagram: {
    label: 'Instagram',
    captionField: 'instagram_caption',
    approvedField: 'instagram_approved',
    postIdField: 'instagram_post_id',
    brief:
      'Visual first: one strong opening line, then short lines separated by blank lines so it ' +
      'reads down the phone rather than as a paragraph. Around 500 characters, then five to ' +
      'eight hashtags on the final line.',
    limit: 2200,
    fold: 125,
  },
};

/** The captions as they travel through the app, keyed by platform. */
export type PlatformCaptions = Record<Platform, string>;

export function emptyCaptions(): PlatformCaptions {
  return { linkedin: '', x: '', facebook: '', instagram: '' };
}
