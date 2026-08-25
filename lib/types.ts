export type PostMode = 'carousel' | 'image';
export type InputType = 'zip' | 'text';

export interface SlideContent {
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
}

export interface HtmlTemplate {
  id?: string;
  template_key: string;
  template_name: string;
  category: string;
  raw_html: string;
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
  hasAsset: boolean;
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
  warnings: string[];
  /**
   * The rendered bytes, present ONLY when the post could not be saved.
   * A finished carousel must never be lost because the database was down, so
   * the failure path hands it straight to the browser instead. On the happy
   * path this is absent and the file is streamed from /api/posts/[id]/file.
   */
  fallbackBase64?: string;
}
