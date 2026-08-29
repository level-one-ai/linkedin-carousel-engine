#!/usr/bin/env node
/**
 * Creates the three PocketBase collections this engine needs and loads the
 * starter HTML slide templates into them.
 *
 * Safe to run repeatedly: collections that already exist are left alone, and
 * templates are matched on template_key so an existing row is updated instead
 * of duplicated.
 *
 * Usage: npm run seed
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

loadDotEnv(join(ROOT, '.env.local'));
loadDotEnv(join(ROOT, '.env'));

const PB_URL = (process.env.POCKETBASE_URL_LOCAL || process.env.POCKETBASE_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

/** Minimal .env reader so the script does not need a dependency. */
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, '');
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

/**
 * The designs, read from templates/index.json — the same list the app itself
 * reads, so this script cannot drift from what actually renders.
 *
 * Seeding is now a convenience rather than the supply line: the app reads the
 * folder directly, so these records exist for anyone browsing the database and
 * as the starting point for a design of your own.
 */
const TEMPLATES = (() => {
  const index = JSON.parse(readFileSync(join(ROOT, 'templates', 'index.json'), 'utf8'));
  return Array.isArray(index.designs) ? index.designs : [];
})();

/**
 * Designs from before the Level One set, removed on the next seed.
 *
 * Left in place they would keep appearing in the picker and, worse, keep being
 * offered to the model as a valid choice - so a carousel could still come out
 * in a layout that carries none of the branding.
 */
const RETIRED_TEMPLATE_KEYS = [
  'dark_technical',
  'light_business',
  'gradient_product',
  'single_image_bold',
];

const COLLECTIONS = [
  {
    name: 'html_templates',
    type: 'base',
    // Templates are read by the server on every generation, so list and view
    // are public while writes stay restricted to a signed in superuser.
    listRule: '',
    viewRule: '',
    fields: [
      { name: 'template_key', type: 'text', required: true, presentable: true },
      { name: 'template_name', type: 'text', required: true, presentable: true },
      { name: 'category', type: 'text', required: true },
      { name: 'raw_html', type: 'editor', required: true },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_html_templates_key ON html_templates (template_key)'],
  },
  {
    name: 'generated_posts',
    type: 'base',
    // Written by the server while signed in as the superuser, so no public
    // rules are opened up here. The files are `protected` on top of that, so
    // they can only be fetched with a token minted server side.
    fields: [
      { name: 'input_type', type: 'text', required: true },
      { name: 'source_name', type: 'text', required: false },
      { name: 'post_mode', type: 'text', required: true },
      // A blank max on a PocketBase text field does NOT mean unlimited: it
      // means 5000, and a long carousel caption goes past that.
      { name: 'caption_text', type: 'text', required: true, max: 6000 },
      { name: 'chosen_template_key', type: 'text', required: true },
      { name: 'template_name', type: 'text', required: false },
      { name: 'project_title', type: 'text', required: false },
      { name: 'slide_count', type: 'number', required: false },
      { name: 'mime_type', type: 'text', required: false },
      { name: 'file_name', type: 'text', required: false },
      { name: 'hashtags', type: 'json', maxSize: 200000 },
      // Single image posts: the prompt to paste into Google Labs Flow. Kept on
      // the record so it can be re-run months later without regenerating.
      { name: 'image_prompt', type: 'text', required: false, max: 4000 },
      // One caption per network. caption_text above stays as the LinkedIn one
      // so posts saved before this existed still read correctly.
      { name: 'linkedin_caption', type: 'text', required: false, max: 6000 },
      { name: 'x_caption', type: 'text', required: false, max: 1000 },
      { name: 'facebook_caption', type: 'text', required: false, max: 6000 },
      { name: 'instagram_caption', type: 'text', required: false, max: 6000 },
      // Which networks you approved. Nothing is sent without one of these.
      { name: 'linkedin_approved', type: 'bool' },
      { name: 'x_approved', type: 'bool' },
      { name: 'facebook_approved', type: 'bool' },
      { name: 'instagram_approved', type: 'bool' },
      // Filled in when publishing is wired up, so the record can be matched
      // back to the live post for analytics and comments.
      { name: 'linkedin_post_id', type: 'text', required: false },
      { name: 'x_post_id', type: 'text', required: false },
      { name: 'facebook_post_id', type: 'text', required: false },
      { name: 'instagram_post_id', type: 'text', required: false },
      { name: 'target_profile_type', type: 'text', required: false },
      // What each network is doing: its type (carousel, image, skip) and the
      // design it uses. Stored so a post can be reopened and understood.
      { name: 'plan', type: 'json', maxSize: 200000 },
      { name: 'account_type', type: 'text', required: false },
      // The carousel PDF or the single PNG. This is what makes a post
      // reopenable rather than a one-time download.
      {
        name: 'asset',
        type: 'file',
        maxSelect: 1,
        maxSize: 10485760,
        protected: true,
      },
      // Slide one as a JPEG, so the history grid does not have to render a
      // PDF per card just to show a picture.
      {
        name: 'thumbnail',
        type: 'file',
        maxSelect: 1,
        maxSize: 2097152,
        protected: true,
      },
      // Every slide as a picture, named <design>__<slide>.jpg. Four networks
      // can use four different designs, so ten slides each needs forty slots.
      {
        name: 'images',
        type: 'file',
        maxSelect: 40,
        maxSize: 3145728,
        protected: true,
      },
      // One PDF per distinct design, named <design>.pdf. `asset` above stays
      // as the lead network's copy, which is what the download button serves.
      {
        name: 'renders',
        type: 'file',
        maxSelect: 6,
        maxSize: 10485760,
        protected: true,
      },
      // The history grid sorts on `created`. Without these fields declared,
      // that sort is a 400 on the listing rather than an empty page.
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [],
  },
  {
    name: 'error_logs',
    type: 'base',
    fields: [
      { name: 'stage', type: 'text', required: true },
      { name: 'message', type: 'text', required: true, max: 2000 },
      { name: 'details', type: 'text', required: false, max: 5000 },
    ],
    indexes: [],
  },

  // The three collections below are created now and written to later, when
  // publishing and the giveaway engine are wired up to Postiz. Creating them
  // with the rest costs nothing and means that work adds no migration to a
  // database already holding your posts.
  {
    name: 'post_analytics',
    type: 'base',
    fields: [
      { name: 'post_id', type: 'text', required: true },
      { name: 'platform', type: 'text', required: true },
      { name: 'post_url', type: 'text', required: false },
      { name: 'impressions_count', type: 'number', required: false },
      { name: 'views_count', type: 'number', required: false },
      { name: 'likes_count', type: 'number', required: false },
      { name: 'comments_count', type: 'number', required: false },
      { name: 'shares_count', type: 'number', required: false },
      { name: 'last_updated', type: 'date', required: false },
    ],
    // One row per post per network, refreshed rather than appended, so a
    // chart is not drawn from duplicates.
    indexes: [
      'CREATE UNIQUE INDEX idx_post_analytics_post_platform ON post_analytics (post_id, platform)',
    ],
  },
  {
    name: 'hosted_prompts',
    type: 'base',
    fields: [
      { name: 'trigger_keyword', type: 'text', required: true },
      { name: 'generated_prompt', type: 'text', required: true, max: 20000 },
      { name: 'source_post_id', type: 'text', required: false },
      { name: 'views_count', type: 'number', required: false },
    ],
    indexes: [],
  },
  {
    name: 'giveaway_logs',
    type: 'base',
    fields: [
      { name: 'platform', type: 'text', required: true },
      { name: 'commenter_handle', type: 'text', required: true },
      { name: 'prompt_id', type: 'text', required: false },
      { name: 'delivered_at', type: 'date', required: false },
    ],
    // A commenter gets the prompt once per post, not once per time the
    // webhook redelivers the same comment.
    indexes: [
      'CREATE UNIQUE INDEX idx_giveaway_once ON giveaway_logs (platform, commenter_handle, prompt_id)',
    ],
  },
];

let token = '';

async function api(path, options = {}) {
  const response = await fetch(`${PB_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const error = new Error(
      `${options.method ?? 'GET'} ${path} failed with ${response.status}: ${
        typeof body === 'string' ? body : JSON.stringify(body)
      }`,
    );
    error.status = response.status;
    throw error;
  }
  return body;
}

async function authenticate() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD before seeding.');
    console.error('Create the account first with:');
    console.error('  docker compose exec pocketbase /usr/local/bin/pocketbase superuser upsert EMAIL PASSWORD');
    process.exit(1);
  }

  // PocketBase 0.23 and newer authenticate superusers through a collection.
  // Older builds expose /api/admins instead, so both paths are tried.
  try {
    const result = await api('/api/collections/_superusers/auth-with-password', {
      method: 'POST',
      body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
    });
    token = result.token;
    return;
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  const legacy = await api('/api/admins/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  });
  token = legacy.token;
}

async function getCollection(name) {
  try {
    return await api(`/api/collections/${name}`);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function ensureCollections() {
  for (const definition of COLLECTIONS) {
    const existing = await getCollection(definition.name);
    if (existing) {
      await addMissingFields(existing, definition);
      continue;
    }
    await createCollection(definition);
    console.log(`Created collection ${definition.name}.`);
  }
}

/**
 * Adds fields this version of the app needs to a collection made by an older
 * one.
 *
 * Without this, someone who seeded before file storage existed would keep a
 * `generated_posts` with no `asset` field — and PocketBase discards an unknown
 * field on create WITHOUT complaining, so every post would save its caption
 * and silently lose its carousel. Existing fields are never touched, so a max
 * length or rule changed by hand in the Admin UI survives a reseed.
 */
async function addMissingFields(existing, definition) {
  const current = existing.fields ?? existing.schema ?? [];
  const have = new Set(current.map((field) => field.name));
  const missing = definition.fields.filter((field) => !have.has(field.name));

  if (missing.length === 0) {
    console.log(`Collection ${definition.name} is up to date.`);
    return;
  }

  const key = existing.fields ? 'fields' : 'schema';
  await api(`/api/collections/${existing.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ [key]: [...current, ...missing] }),
  });
  console.log(
    `Updated ${definition.name}: added ${missing.map((field) => field.name).join(', ')}.`,
  );
}

/**
 * PocketBase 0.23 renamed the collection "schema" property to "fields".
 * The modern shape is tried first and the older one is used as a fallback so
 * the script works against either build.
 */
async function createCollection(definition) {
  try {
    await api('/api/collections', { method: 'POST', body: JSON.stringify(definition) });
  } catch (error) {
    if (error.status !== 400) throw error;
    const { fields, ...rest } = definition;
    await api('/api/collections', {
      method: 'POST',
      body: JSON.stringify({ ...rest, schema: fields }),
    });
  }
}

async function retireOldTemplates() {
  for (const key of RETIRED_TEMPLATE_KEYS) {
    const filter = encodeURIComponent(`template_key="${key}"`);
    const found = await api(`/api/collections/html_templates/records?filter=${filter}&perPage=1`);

    if (found.items && found.items.length > 0) {
      await api(`/api/collections/html_templates/records/${found.items[0].id}`, {
        method: 'DELETE',
      });
      console.log(`Removed retired template ${key}.`);
    }
  }
}

async function upsertTemplates() {
  for (const template of TEMPLATES) {
    const raw_html = readFileSync(join(ROOT, 'templates', template.file), 'utf8');
    const record = {
      template_key: template.template_key,
      template_name: template.template_name,
      category: template.category,
      raw_html,
    };

    const filter = encodeURIComponent(`template_key="${template.template_key}"`);
    const existing = await api(
      `/api/collections/html_templates/records?filter=${filter}&perPage=1`,
    );

    if (existing.items && existing.items.length > 0) {
      await api(`/api/collections/html_templates/records/${existing.items[0].id}`, {
        method: 'PATCH',
        body: JSON.stringify(record),
      });
      console.log(`Updated template ${template.template_key}.`);
    } else {
      await api('/api/collections/html_templates/records', {
        method: 'POST',
        body: JSON.stringify(record),
      });
      console.log(`Added template ${template.template_key}.`);
    }
  }
}

async function main() {
  console.log(`Seeding PocketBase at ${PB_URL}`);
  await authenticate();
  await ensureCollections();
  await retireOldTemplates();
  await upsertTemplates();
  console.log('Done. PocketBase is ready.');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
