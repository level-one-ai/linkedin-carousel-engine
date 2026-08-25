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
    template_key: 'level_one_cream',
    template_name: 'Level One Cream',
    category:
      'Clean, flat and editorial. The default for step by step walkthroughs, workflow breakdowns and anything instructional where the words carry the whole slide.',
    file: 'level_one_cream.html',
  },
  {
    template_key: 'level_one_noir',
    template_name: 'Level One Noir',
    category:
      'Near black with drifting smoke. Use for myth busting, hard truths, contrarian takes and posts meant to stop the scroll with a bold claim.',
    file: 'level_one_noir.html',
  },
  {
    template_key: 'level_one_mist',
    template_name: 'Level One Mist',
    category:
      'White with pale smoke. Suits tool stacks, technical architecture, product teardowns and anything that benefits from a light, airy, spacious feel.',
    file: 'level_one_mist.html',
  },
  {
    template_key: 'level_one_sand',
    template_name: 'Level One Sand',
    category:
      'Warm flat beige. Best for business outcomes, before and after transformations, client results and growth stories aimed at a commercial reader.',
    file: 'level_one_sand.html',
  },
  {
    template_key: 'level_one_slate',
    template_name: 'Level One Slate',
    category:
      'Heavy grey smoke with depth. Use for mistakes to avoid, risk and warning posts, and anything with a serious or cautionary tone.',
    file: 'level_one_slate.html',
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
