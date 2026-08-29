import type { AccountType, Platform, PlatformCaptions, PostPlan } from './platforms';
export type PostMode = 'carousel' | 'image';
export type InputType = 'zip' | 'text';

/**
 * Where a slide sits in the eight-slide blueprint. Templates style on this,
 * so a cover, a checklist and a call to action can look completely different
 * without the template needing eight hardcoded blocks.
 */
export type SlideRole = 'hook' | 'problem' | 'point' | 'summary' | 'cta';

export interface SlideContent {
  /** Position in the blueprint. Defaults to "point" for a middle slide. */
  role?: SlideRole;
  /** Slide headline. Kept short so it fits the 1080x1350 canvas. */
  heading: string;
  /** One or two sentences of supporting copy. */
  body: string;
  /** Optional bullets rendered under the body. */
  bullets?: string[];
  /** Small label in the slide corner, for example "01" or "Architecture". */
  kicker?: string;
}

export interface GeneratedPayload {
  caption: string;
  template_key: string;
  project_title: string;
  project_subtitle: string;
  slides: SlideContent[];
  hashtags: string[];
  /**
   * Single image posts only: the prompt to paste into Google Labs Flow.
   * Empty for carousels, which make their own picture.
   */
  image_prompt: string;
  /** The one word readers are asked to comment, printed on the last slide. */
  comment_keyword: string;
  /** One caption per network, each written for that network. */
  captions: PlatformCaptions;
}

export interface HtmlTemplate {
  id?: string;
  template_key: string;
  template_name: string;
  category: string;
  raw_html: string;
  /** True when the stored copy had to be un-escaped or unwrapped on the way in. */
  repaired?: boolean;
  /** Why this design cannot render, in a sentence. Null when it is fine. */
  problem?: string | null;
  /**
   * Which network this design is drawn for. Used to filter the picker, not to
   * enforce anything — a square design on LinkedIn is unusual, not invalid.
   */
  platform?: string;
}

/**
 * One saved post, as the history grid and the detail screen see it.
 * The binary never travels with this — it is fetched from
 * /api/posts/[id]/file so the bytes are streamed rather than base64 inlined.
 */
export interface PostSummary {
  id: string;
  project_title: string;
  caption_text: string;
  input_type: InputType;
  source_name: string;
  post_mode: PostMode;
  chosen_template_key: string;
  template_name: string;
  slide_count: number;
  mime_type: string;
  file_name: string;
  hashtags: string[];
  /** The Google Labs Flow prompt, on single image posts. */
  image_prompt: string;
  hasAsset: boolean;
  /** One caption per network, falling back to caption_text on older posts. */
  captions: PlatformCaptions;
  /** Which networks are approved for posting. */
  approvals: Record<Platform, boolean>;
  /** Stored slide image filenames, as level_one_noir__03.jpg. */
  imageNames: string[];
  /** What each network is doing, and with which design. */
  plan: PostPlan;
  accountType: AccountType | string;
  hasThumbnail: boolean;
  created: string;
}

/** What /api/generate returns once the post is written and saved. */
export interface GenerateResult {
  /** PocketBase record id, or null when the post could not be saved. */
  postId: string | null;
  caption: string;
  templateKey: string;
  templateName: string;
  postMode: PostMode;
  slideCount: number;
  fileName: string;
  mimeType: string;
  /** Single image posts only: the prompt to paste into Google Labs Flow. */
  imagePrompt: string;
  warnings: string[];
  /**
   * The rendered bytes, present ONLY when the post could not be saved.
   * A finished carousel must never be lost because the database was down, so
   * the failure path hands it straight to the browser instead. On the happy
   * path this is absent and the file is streamed from /api/posts/[id]/file.
   */
  fallbackBase64?: string;
}
