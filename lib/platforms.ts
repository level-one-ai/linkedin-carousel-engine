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

/**
 * What a platform is doing for a given post.
 *
 * "skip" is a first-class choice rather than an unticked box, because leaving
 * a network out is a decision worth recording — X and the LinkedIn company
 * page are posted by hand, and the post should say so rather than looking
 * like something failed.
 */
export const POST_TYPES = ['carousel', 'image', 'skip'] as const;
export type PostType = (typeof POST_TYPES)[number];

export function isPostType(value: unknown): value is PostType {
  return POST_TYPES.includes(value as PostType);
}

export const POST_TYPE_LABELS: Record<PostType, string> = {
  carousel: 'Carousel',
  image: 'Single image',
  skip: 'Skip',
};

/** Whose account the post goes out as. */
export const ACCOUNT_TYPES = ['personal', 'business'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export function isAccountType(value: unknown): value is AccountType {
  return ACCOUNT_TYPES.includes(value as AccountType);
}

/** One platform's decisions for one post. */
export interface PlatformPlan {
  type: PostType;
  /** Which design renders it. Empty means let the model choose. */
  templateKey: string;
}

export type PostPlan = Record<Platform, PlatformPlan>;

/**
 * The default plan: a carousel everywhere, design left to the model.
 *
 * Deliberately not "skip everything" — a post that does nothing unless you
 * configure four dropdowns is a worse starting point than one that does the
 * obvious thing and lets you turn parts off.
 */
export function defaultPlan(): PostPlan {
  return {
    linkedin: { type: 'carousel', templateKey: '' },
    x: { type: 'carousel', templateKey: '' },
    facebook: { type: 'carousel', templateKey: '' },
    instagram: { type: 'carousel', templateKey: '' },
  };
}

/** Reads a plan back off a stored record, filling in anything absent. */
export function coercePlan(value: unknown): PostPlan {
  const stored = (value ?? {}) as Record<string, unknown>;
  const plan = defaultPlan();

  for (const platform of PLATFORMS) {
    const entry = (stored[platform] ?? {}) as Record<string, unknown>;
    if (isPostType(entry.type)) plan[platform].type = entry.type;
    if (typeof entry.templateKey === 'string') plan[platform].templateKey = entry.templateKey;
  }

  return plan;
}

/** The captions as they travel through the app, keyed by platform. */
export type PlatformCaptions = Record<Platform, string>;

export function emptyCaptions(): PlatformCaptions {
  return { linkedin: '', x: '', facebook: '', instagram: '' };
}
