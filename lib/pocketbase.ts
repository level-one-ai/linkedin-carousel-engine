import PocketBase from 'pocketbase';
import { config } from './config';
import type { HtmlTemplate, InputType, PostMode } from './types';

let cachedClient: PocketBase | null = null;

export function pb(): PocketBase {
  if (!cachedClient) {
    cachedClient = new PocketBase(config.pocketbaseUrl);
    // Server-side usage only, so there is no browser session to keep in sync.
    cachedClient.autoCancellation(false);
  }
  return cachedClient;
}

/**
 * Signs in as the PocketBase superuser when credentials are configured.
 * Collections created by the seed script are readable without auth, so a
 * failure here is logged and tolerated rather than fatal.
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

export async function listTemplates(): Promise<HtmlTemplate[]> {
  await authenticateAdmin();
  const records = await pb()
    .collection('html_templates')
    .getFullList({ sort: 'template_key' });

  return records.map((record) => ({
    id: record.id,
    template_key: String(record.template_key),
    template_name: String(record.template_name),
    category: String(record.category),
    raw_html: String(record.raw_html),
  }));
}

export async function getTemplateByKey(templateKey: string): Promise<HtmlTemplate | null> {
  await authenticateAdmin();
  try {
    const record = await pb()
      .collection('html_templates')
      .getFirstListItem(`template_key="${templateKey.replace(/"/g, '')}"`);
    return {
      id: record.id,
      template_key: String(record.template_key),
      template_name: String(record.template_name),
      category: String(record.category),
      raw_html: String(record.raw_html),
    };
  } catch {
    return null;
  }
}

export async function logGeneratedPost(entry: {
  input_type: InputType;
  source_name: string;
  post_mode: PostMode;
  caption_text: string;
  chosen_template_key: string;
}): Promise<string | null> {
  try {
    await authenticateAdmin();
    const record = await pb().collection('generated_posts').create(entry);
    return record.id;
  } catch (error) {
    // A logging failure must never cost the user their generated carousel.
    console.warn('Could not write the generated_posts record.', error);
    return null;
  }
}

export async function logError(entry: {
  stage: string;
  message: string;
  details?: string;
}): Promise<void> {
  try {
    await authenticateAdmin();
    await pb().collection('error_logs').create({
      stage: entry.stage,
      message: entry.message.slice(0, 2000),
      details: (entry.details ?? '').slice(0, 5000),
    });
  } catch {
    // The error log is best effort by design; the console keeps the record.
    console.error(`[${entry.stage}] ${entry.message}`);
  }
}
