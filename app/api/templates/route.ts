import { NextResponse } from 'next/server';
import { listTemplates } from '@/lib/pocketbase';
import { templateProblem } from '@/lib/template-html';
import { loadSeedTemplates } from '@/lib/template-seed';
import type { HtmlTemplate } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The picker only needs the names, but this is also the one place to answer
 * "are my five designs actually intact" without running a generation. A design
 * stored as escaped text renders as one page of source code, so `ok` and
 * `problem` are worth more here than any of the rest.
 */
function describe(template: HtmlTemplate) {
  const { raw_html, ...rest } = template;
  const problem = template.problem ?? templateProblem(raw_html);

  return {
    ...rest,
    ok: problem === null,
    problem,
    repaired: Boolean(template.repaired),
    length: raw_html.length,
  };
}

export async function GET() {
  try {
    const templates = await listTemplates();
    if (templates.length > 0) {
      return NextResponse.json({
        source: 'pocketbase',
        templates: templates.map(describe),
      });
    }
  } catch {
    // Fall through to the bundled templates below.
  }

  return NextResponse.json({
    source: 'bundled',
    templates: loadSeedTemplates().map(describe),
  });
}
