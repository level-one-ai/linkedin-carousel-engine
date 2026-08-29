import PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';

import { config } from './config';
import type { SlideImage } from './chromium';
import {
  PLATFORMS,
  PLATFORM_SPECS,
  coercePlan,
  emptyCaptions,
  type Platform,
  type PlatformCaptions,
} from './platforms';
import { repairTemplateHtml, templateProblem } from './template-html';
import type { HtmlTemplate, InputType, PostMode, PostSummary } from './types';

export const COLLECTIONS = {
  templates: 'html_templates',
  posts: 'generated_posts',
  errors: 'error_logs',
  connections: 'platform_connections',
  publications: 'post_publications',
} as const;

let cachedClient: PocketBase | null = null;

export function pb(): PocketBase {
  if (!cachedClient) {
    cachedClient = new PocketBase(config.pocketbaseUrl);
    // Server-side usage only, so there is no browser session to keep in sync.
    cachedClient.autoCancellation(false);
  }
  return cachedClient;
}

interface PocketBaseErrorShape {
  status?: number;
  message?: string;
  response?: {
    message?: string;
    data?: Record<string, { message?: string }>;
  };
}

/**
 * Turns a PocketBase failure into a sentence that names the real cause — an
 * unreachable host, a missing collection, a rejected field — instead of a
 * generic "could not save". Without this the actual reason only ever reaches
 * the server log while the UI shows nothing useful.
 */
export function describePocketBaseError(err: unknown): string {
  const e = err as PocketBaseErrorShape;
  const status = e?.status ?? 0;

  const fieldErrors = Object.entries(e?.response?.data ?? {})
    .map(([field, detail]) => `${field}: ${detail?.message ?? 'invalid'}`)
    .join('; ');

  if (status === 0) {
    return `Could not reach PocketBase at ${config.pocketbaseUrl}. Check POCKETBASE_URL and that the server is running.`;
  }
  if (status === 401 || status === 403) {
    return `PocketBase refused the request (${status}). Check POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD match the superuser account.`;
  }
  if (status === 404) {
    return `PocketBase returned 404 — a collection is missing at ${config.pocketbaseUrl}. Run "npm run seed" to create them.`;
  }
  if (status === 400) {
    return `PocketBase rejected the record (400)${fieldErrors ? ` — ${fieldErrors}` : ''}. If this names a field, the collection is out of date: rerun "npm run seed".`;
  }
  return `PocketBase error ${status}${fieldErrors ? ` — ${fieldErrors}` : ''}: ${
    e?.response?.message ?? e?.message ?? 'unknown error'
  }`;
}

/**
 * Signs in as the PocketBase superuser when credentials are configured.
 *
 * Templates are readable without auth, so a failure here is logged and
 * tolerated rather than fatal — but writing a post or reading a stored file
 * does need it, and those callers use `requireAdmin` instead.
 */
export async function authenticateAdmin(): Promise<boolean> {
  const email = config.pocketbaseAdminEmail;
  const password = config.pocketbaseAdminPassword;
  if (!email || !password) return false;

  const client = pb();
  if (client.authStore.isValid) return true;

  try {
    await client.collection('_superusers').authWithPassword(email, password);
    return true;
  } catch (error) {
    console.warn('PocketBase admin sign-in failed, continuing as a public client.', error);
    return false;
  }
}

/** Same as above, but a missing or rejected login is an error the user sees. */
export async function requireAdmin(): Promise<PocketBase> {
  const email = config.pocketbaseAdminEmail;
  const password = config.pocketbaseAdminPassword;

  if (!email || !password) {
    throw new Error(
      'POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set to save and open posts. See SETUP.md.',
    );
  }

  const client = pb();
  if (client.authStore.isValid) return client;

  try {
    await client.collection('_superusers').authWithPassword(email, password);
  } catch (error) {
    throw new Error(`Could not sign in to PocketBase. ${describePocketBaseError(error)}`);
  }
  return client;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function toTemplate(record: RecordModel): HtmlTemplate {
  // Every template read in the app comes through here, which is why the repair
  // lives here rather than at each call site.
  const { html, repaired } = repairTemplateHtml(String(record.raw_html ?? ''));

  return {
    id: record.id,
    template_key: String(record.template_key),
    template_name: String(record.template_name),
    category: String(record.category),
    raw_html: html,
    repaired,
    problem: templateProblem(html),
  };
}

/**
 * Overwrites a stored design with a known good copy.
 *
 * Only ever called with a template the app has already found unusable, and
 * only when it has a bundled file of the same key to put there instead. A
 * design of your own that renders is never touched.
 */
/**
 * Writes one platform's caption, or one platform's approval, and nothing else.
 *
 * A partial update is the whole point of the redo button: the other three
 * captions have already been read and approved, and a full-record write would
 * put them at risk of being replaced by a stale copy from the browser.
 */
export async function updatePlatformField(
  id: string,
  platform: Platform,
  patch: { caption?: string; approved?: boolean },
): Promise<void> {
  const client = await requireAdmin();
  const data: Record<string, unknown> = {};

  if (patch.caption !== undefined) {
    data[PLATFORM_SPECS[platform].captionField] = patch.caption;
  }
  if (patch.approved !== undefined) {
    data[PLATFORM_SPECS[platform].approvedField] = patch.approved;
  }

  if (Object.keys(data).length === 0) return;
  await client.collection(COLLECTIONS.posts).update(id, data);
}

/**
 * Stores a newly written design, so it is in the picker immediately.
 *
 * The folder is the source of truth for the designs that ship, but a design
 * generated at runtime cannot be in a folder the running container built from.
 * PocketBase is what makes it usable before the next deploy; the commit
 * alongside it is what makes it permanent.
 */
export async function saveTemplate(template: {
  template_key: string;
  template_name: string;
  category: string;
  raw_html: string;
}): Promise<string> {
  const client = await requireAdmin();
  const filter = `template_key="${template.template_key.replace(/"/g, '')}"`;

  try {
    const existing = await client.collection(COLLECTIONS.templates).getFirstListItem(filter);
    await client.collection(COLLECTIONS.templates).update(existing.id, template);
    return existing.id;
  } catch {
    const created = await client.collection(COLLECTIONS.templates).create(template);
    return created.id;
  }
}

export async function replaceTemplateHtml(id: string, rawHtml: string): Promise<void> {
  const client = await requireAdmin();
  await client.collection(COLLECTIONS.templates).update(id, { raw_html: rawHtml });
}

export async function listTemplates(): Promise<HtmlTemplate[]> {
  await authenticateAdmin();
  const records = await pb()
    .collection(COLLECTIONS.templates)
    .getFullList({ sort: 'template_key' });
  return records.map(toTemplate);
}

export async function getTemplateByKey(templateKey: string): Promise<HtmlTemplate | null> {
  await authenticateAdmin();
  try {
    const record = await pb()
      .collection(COLLECTIONS.templates)
      .getFirstListItem(`template_key="${templateKey.replace(/"/g, '')}"`);
    return toTemplate(record);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generated posts
// ---------------------------------------------------------------------------

/**
 * PocketBase hands `json` fields back already parsed, but a record written
 * before a field existed — or edited by hand in the Admin UI — can still
 * arrive as a string or as null. Every read goes through here so the UI never
 * has to guard the shape itself.
 */
function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/**
 * Sending a text field through multipart/form-data normalises every newline to
 * CRLF — that is the encoding's own rule, not PocketBase's. Left alone it
 * breaks paragraph splitting on the detail screen (a blank line arrives as
 * "\r\n\r\n", which has no two consecutive \n for a split to find) and puts
 * stray carriage returns on the clipboard. Normalising on the way out fixes
 * records already saved as well as new ones.
 */
function normalizeNewlines(value: unknown): string {
  return String(value ?? '').replace(/\r\n/g, '\n');
}

export function toPostSummary(record: RecordModel): PostSummary {
  return {
    id: record.id,
    project_title: String(record.project_title ?? 'Untitled post'),
    caption_text: normalizeNewlines(record.caption_text),
    input_type: (String(record.input_type ?? 'text') as InputType) ?? 'text',
    source_name: String(record.source_name ?? ''),
    post_mode: (String(record.post_mode ?? 'carousel') as PostMode) ?? 'carousel',
    chosen_template_key: String(record.chosen_template_key ?? ''),
    template_name: String(record.template_name ?? ''),
    slide_count: Number(record.slide_count ?? 0),
    mime_type: String(record.mime_type ?? 'application/pdf'),
    file_name: String(record.file_name ?? 'linkedin-post.pdf'),
    hashtags: parseJson<string[]>(record.hashtags, []),
    image_prompt: normalizeNewlines(record.image_prompt),
    hasAsset: Boolean(record.asset),
    hasThumbnail: Boolean(record.thumbnail),
    created: String(record.created ?? ''),
    captions: readCaptions(record),
    approvals: readApprovals(record),
    // The stored filenames, as <design>_<slide>.jpg.
    imageNames: Array.isArray(record.images) ? record.images.map(String) : [],
    plan: coercePlan(parseJson<unknown>(record.plan, null)),
    accountType: String(record.account_type ?? 'personal'),
  };
}

/**
 * The four captions off a record.
 *
 * A post saved before this existed has none, so each falls back to the single
 * caption it does have. That is better than four empty tabs on old history.
 */
function readCaptions(record: RecordModel): PlatformCaptions {
  const fallback = normalizeNewlines(record.caption_text);
  const out = emptyCaptions();

  for (const platform of PLATFORMS) {
    const stored = normalizeNewlines(record[PLATFORM_SPECS[platform].captionField]);
    out[platform] = stored || fallback;
  }

  return out;
}

function readApprovals(record: RecordModel): Record<Platform, boolean> {
  const out = {} as Record<Platform, boolean>;
  for (const platform of PLATFORMS) {
    out[platform] = Boolean(record[PLATFORM_SPECS[platform].approvedField]);
  }
  return out;
}

export interface NewPost {
  input_type: InputType;
  source_name: string;
  post_mode: PostMode;
  caption_text: string;
  chosen_template_key: string;
  template_name: string;
  project_title: string;
  slide_count: number;
  mime_type: string;
  file_name: string;
  hashtags: string[];
  /** Single image posts: the Google Labs Flow prompt. Empty for carousels. */
  image_prompt: string;
  /** One caption per network. */
  captions: PlatformCaptions;
  /**
   * The rendered designs, keyed by template. Two networks on the same design
   * share one entry rather than storing the same pictures twice.
   */
  renders?: Array<{ templateKey: string; pdf: Buffer; images: SlideImage[] }>;
  /** What each network is doing, and with which design. */
  plan: unknown;
  account_type: string;
  /**
   * The rendered carousel. Absent on a single image post, which has no file
   * until a picture is uploaded onto it.
   */
  asset?: Buffer;
  thumbnail?: Buffer;
}

/**
 * Writes the finished post, binary included.
 *
 * The asset is uploaded as a file rather than kept in the response, which is
 * the whole reason a post can be reopened later. Both file fields are
 * `protected` in PocketBase, so they are only ever served back through
 * /api/posts/[id]/file with a short-lived token.
 */
export async function savePost(entry: NewPost): Promise<string> {
  const client = await requireAdmin();

  const form = new FormData();
  form.append('input_type', entry.input_type);
  form.append('source_name', entry.source_name);
  form.append('post_mode', entry.post_mode);
  form.append('caption_text', entry.caption_text);
  form.append('chosen_template_key', entry.chosen_template_key);
  form.append('template_name', entry.template_name);
  form.append('project_title', entry.project_title);
  form.append('slide_count', String(entry.slide_count));
  form.append('mime_type', entry.mime_type);
  form.append('file_name', entry.file_name);
  form.append('hashtags', JSON.stringify(entry.hashtags));
  form.append('image_prompt', entry.image_prompt);

  for (const platform of PLATFORMS) {
    form.append(PLATFORM_SPECS[platform].captionField, entry.captions[platform] ?? '');
  }

  form.append('plan', JSON.stringify(entry.plan ?? {}));
  form.append('account_type', entry.account_type);

  // Named by design and slide, so a preview can ask for "the third slide of
  // level_one_noir" without depending on the order PocketBase returns them in,
  // and so two networks sharing a design share the stored pictures.
  //
  // Underscores rather than hyphens because PocketBase slugifies a filename on
  // upload and turns hyphens into underscores, then appends a random suffix.
  // Uploading the name it is going to store anyway keeps the two ends agreeing.
  for (const render of entry.renders ?? []) {
    form.append(
      'renders',
      new Blob([new Uint8Array(render.pdf)], { type: 'application/pdf' }),
      `${render.templateKey}.pdf`,
    );

    for (const image of render.images) {
      form.append(
        'images',
        new Blob([new Uint8Array(image.buffer)], { type: 'image/jpeg' }),
        // One underscore, not two: PocketBase slugifies the filename on the
        // way in and collapses a double underscore, so a name written with
        // one would never be found again.
        `${render.templateKey}_${String(image.slide).padStart(2, '0')}.jpg`,
      );
    }
  }

  if (entry.asset) {
    form.append(
      'asset',
      new Blob([new Uint8Array(entry.asset)], { type: entry.mime_type }),
      entry.file_name,
    );
  }
  if (entry.thumbnail) {
    form.append(
      'thumbnail',
      new Blob([new Uint8Array(entry.thumbnail)], { type: 'image/jpeg' }),
      'thumbnail.jpg',
    );
  }

  const record = await client.collection(COLLECTIONS.posts).create(form);

  // PocketBase drops an unknown field on create WITHOUT complaining, so a
  // collection missing `asset` would save the caption and silently lose the
  // carousel. Saying so here is what turns that into something fixable.
  if (entry.asset && !record.asset) {
    console.warn(
      `[posts] The post saved but its file did not: the ${COLLECTIONS.posts} collection ` +
        'has no `asset` field, so PocketBase discarded it. Run "npm run seed" to add it.',
    );
  }

  return record.id;
}

/**
 * Attaches a picture to a single image post that was waiting for one.
 *
 * Uploading again replaces both files rather than adding to them, because both
 * fields are maxSelect 1 — so a second attempt after a bad generation is just
 * another upload, not a cleanup job.
 */
export async function attachImage(args: {
  id: string;
  image: Buffer;
  thumbnail: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<void> {
  const client = await requireAdmin();

  const form = new FormData();
  form.append(
    'asset',
    new Blob([new Uint8Array(args.image)], { type: args.mimeType }),
    args.fileName,
  );
  form.append(
    'thumbnail',
    new Blob([new Uint8Array(args.thumbnail)], { type: 'image/jpeg' }),
    'thumbnail.jpg',
  );
  form.append('mime_type', args.mimeType);
  form.append('file_name', args.fileName);

  const saved = await client.collection(COLLECTIONS.posts).update(args.id, form);

  if (!saved.asset) {
    throw new Error(
      `The image did not save: the ${COLLECTIONS.posts} collection has no \`asset\` field. ` +
        'Run "npm run seed" to add it.',
    );
  }
}

export async function listPosts(limit = 200): Promise<PostSummary[]> {
  const client = await requireAdmin();
  const records = await client.collection(COLLECTIONS.posts).getList(1, limit, {
    // Needs the `created` autodate field to exist on the collection: sorting on
    // a field PocketBase does not have is a 400, not an empty list.
    sort: '-created',
  });
  return records.items.map(toPostSummary);
}

export async function getPost(id: string): Promise<PostSummary> {
  const client = await requireAdmin();
  return toPostSummary(await client.collection(COLLECTIONS.posts).getOne(id));
}

/** The raw record, for the file route which needs the stored file names. */
export async function getPostRecord(id: string): Promise<RecordModel> {
  const client = await requireAdmin();
  return client.collection(COLLECTIONS.posts).getOne(id);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * The stored slides of one design, in order, as bytes.
 *
 * Publishing needs the pictures themselves, not a URL: LinkedIn takes an
 * upload rather than a link. The field is `protected`, so this goes through a
 * file token the same way the image route does.
 */
export async function readSlideImages(postId: string, design: string): Promise<Buffer[]> {
  const client = await requireAdmin();
  const record = await client.collection(COLLECTIONS.posts).getOne(postId);
  const stored = (Array.isArray(record.images) ? record.images.map(String) : []).filter((name) =>
    design ? name.startsWith(`${design}_`) : true,
  );

  // Sorted by the two-digit slide number in the name, because PocketBase
  // returns them in its own order.
  stored.sort();

  const token = await client.files.getToken();
  const buffers: Buffer[] = [];

  for (const name of stored) {
    const response = await fetch(client.files.getURL(record, name, { token }));
    if (!response.ok) {
      throw new Error(`Slide ${name} could not be read back (${response.status}).`);
    }
    buffers.push(Buffer.from(await response.arrayBuffer()));
  }

  return buffers;
}

/** The rendered PDF for one design, as bytes. */
export async function readRender(postId: string, design: string): Promise<Buffer | null> {
  const client = await requireAdmin();
  const record = await client.collection(COLLECTIONS.posts).getOne(postId);
  const stored = Array.isArray(record.renders) ? record.renders.map(String) : [];
  const name = stored.find((file) => file.startsWith(`${design}_`)) ?? stored[0];
  if (!name) return null;

  const token = await client.files.getToken();
  const response = await fetch(client.files.getURL(record, name, { token }));
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

export async function logError(entry: {
  stage: string;
  message: string;
  details?: string;
}): Promise<void> {
  try {
    await authenticateAdmin();
    await pb().collection(COLLECTIONS.errors).create({
      stage: entry.stage,
      message: entry.message.slice(0, 2000),
      details: (entry.details ?? '').slice(0, 5000),
    });
  } catch {
    // The error log is best effort by design; the console keeps the record.
    console.error(`[${entry.stage}] ${entry.message}`);
  }
}
