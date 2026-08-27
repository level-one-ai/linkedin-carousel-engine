import { NextResponse } from 'next/server';
import { environmentReport } from '@/lib/config';
import { rendererDiagnosis } from '@/lib/chromium';
import { listTemplates } from '@/lib/pocketbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Small readiness endpoint so the create screen can tell the user which piece
 * is not ready, instead of failing halfway through a generation.
 */
export async function GET() {
  const pocketbase = await listTemplates()
    .then((templates) => ({ up: true, templateCount: templates.length }))
    .catch(() => ({ up: false, templateCount: 0 }));

  // One call, three fields: whether slides can be rendered, which browser would
  // do it, and — when there is none — which of the two causes it is.
  const renderer = rendererDiagnosis();

  return NextResponse.json({
    gemini: Boolean(process.env.GEMINI_API_KEY),
    renderer: renderer.available,
    rendererPath: renderer.path ?? null,
    rendererReason: renderer.reason ?? null,
    pocketbase: pocketbase.up,
    templateCount: pocketbase.templateCount,
    environment: environmentReport(),
  });
}
