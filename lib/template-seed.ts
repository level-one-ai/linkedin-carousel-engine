import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HtmlTemplate } from './types';

/**
 * The starter template set. The seed script writes these into PocketBase, and
 * the generate route falls back to them if PocketBase is unreachable so the
 * engine still produces a carousel.
 */
export const TEMPLATE_MANIFEST: Array<Omit<HtmlTemplate, 'raw_html'> & { file: string }> = [
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

function templatesDirectory(): string {
  return join(process.cwd(), 'templates');
}

export function loadSeedTemplates(): HtmlTemplate[] {
  return TEMPLATE_MANIFEST.map((entry) => ({
    template_key: entry.template_key,
    template_name: entry.template_name,
    category: entry.category,
    raw_html: readFileSync(join(templatesDirectory(), entry.file), 'utf8'),
  }));
}
