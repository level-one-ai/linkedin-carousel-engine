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

export interface GenerateResult {
  caption: string;
  templateKey: string;
  templateName: string;
  postMode: PostMode;
  slideCount: number;
  /** Base64 of the PDF or PNG binary produced by Gotenberg. */
  fileBase64: string;
  fileName: string;
  mimeType: string;
  recordId: string | null;
  warnings: string[];
}
