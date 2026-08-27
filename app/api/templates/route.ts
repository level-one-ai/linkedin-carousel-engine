import { NextResponse } from 'next/server';
import { listTemplates } from '@/lib/pocketbase';
import { templateProblem } from '@/lib/template-html';
import { loadSeedTemplates, unavailableTemplates } from '@/lib/template-seed';
import type { HtmlTemplate } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The picker only needs the names, but this is also the one place to answer
 * "are my five designs actually intact" without running a generation. A design
 * stored as escaped text renders as one page of source code, so `ok` and
 * `problem` are worth more here than any of the rest.
 */
function describe(template: HtmlTemplate, source: 'folder' | 'pocketbase') {
  const { raw_html, ...rest } = template;
  const problem = template.problem ?? templateProblem(raw_html);

  return {
    ...rest,
    source,
    ok: problem === null,
    problem,
    repaired: Boolean(template.repaired),
    length: raw_html.length,
  };
}

export async function GET() {
  // Same order the generator uses: the folder first and always, then whatever
  // PocketBase holds under a key the folder does not have.
  const bundled = loadSeedTemplates();
  const keys = new Set(bundled.map((template) => template.template_key));

  let extra: HtmlTemplate[] = [];
  try {
    extra = (await listTemplates()).filter((template) => !keys.has(template.template_key));
  } catch {
    // The folder is enough. An unreachable database costs nothing here.
  }

  return NextResponse.json({
    // Designs in the folder that cannot be offered yet, so one waiting on a
    // photograph reads as pending rather than missing.
    waiting: unavailableTemplates(),
    templates: [
      ...bundled.map((template) => describe(template, 'folder')),
      ...extra.map((template) => describe(template, 'pocketbase')),
    ],
  });
}
