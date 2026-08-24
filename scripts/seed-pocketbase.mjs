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

const TEMPLATES = [
  {
    template_key: 'dark_technical',
    template_name: 'Dark Technical Deep Dive',
    category:
      'Engineering architecture, infrastructure, developer tooling, backend systems, and technical walkthroughs',
    file: 'dark_technical.html',
  },
  {
    template_key: 'light_business',
    template_name: 'Light Business Case Study',
    category:
      'Business outcomes, client case studies, process automation, consulting work, and results driven storytelling',
    file: 'light_business.html',
  },
  {
    template_key: 'gradient_product',
    template_name: 'Gradient Product Launch',
    category:
      'Product launches, new feature announcements, AI products, startups, and marketing forward posts',
    file: 'gradient_product.html',
  },
  {
    template_key: 'single_image_bold',
    template_name: 'Bold Single Image',
    category:
      'Single image posts, announcements, and quote graphics that need one strong standalone frame',
    file: 'single_image_bold.html',
  },
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
    // rules are opened up here.
    fields: [
      { name: 'input_type', type: 'text', required: true },
      { name: 'source_name', type: 'text', required: false },
      { name: 'post_mode', type: 'text', required: true },
      { name: 'caption_text', type: 'text', required: true, max: 6000 },
      { name: 'chosen_template_key', type: 'text', required: true },
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

async function collectionExists(name) {
  try {
    await api(`/api/collections/${name}`);
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

async function ensureCollections() {
  for (const definition of COLLECTIONS) {
    if (await collectionExists(definition.name)) {
      console.log(`Collection ${definition.name} already exists, leaving it as is.`);
      continue;
    }
    await createCollection(definition);
    console.log(`Created collection ${definition.name}.`);
  }
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
  await upsertTemplates();
  console.log('Done. PocketBase is ready.');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
