import { NextResponse } from 'next/server';
import { environmentReport } from '@/lib/config';
import { rendererDiagnosis } from '@/lib/chromium';
import { listTemplates } from '@/lib/pocketbase';
import { loadSeedTemplates } from '@/lib/template-seed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Small readiness endpoint so the create screen can tell the user which piece
 * is not ready, instead of failing halfway through a generation.
 */
export async function GET() {
  // Where the slide designs are actually coming from. The folder is the source
  // of truth; the database only contributes designs the folder does not have,
  // so those are the only ones worth counting on its side.
  const bundled = loadSeedTemplates();
  const bundledKeys = new Set(bundled.map((template) => template.template_key));

  const pocketbase = await listTemplates()
    .then((templates) => ({
      up: true,
      extraCount: templates.filter((t) => !bundledKeys.has(t.template_key)).length,
    }))
    .catch(() => ({ up: false, extraCount: 0 }));

  // One call, three fields: whether slides can be rendered, which browser would
  // do it, and — when there is none — which of the two causes it is.
  const renderer = rendererDiagnosis();

  return NextResponse.json({
    buildTime: process.env.BUILD_TIME ?? null,
    gemini: Boolean(process.env.GEMINI_API_KEY),
    renderer: renderer.available,
    rendererPath: renderer.path ?? null,
    rendererReason: renderer.reason ?? null,
    pocketbase: pocketbase.up,
    templateCount: bundled.length + pocketbase.extraCount,
    templates: {
      fromFolder: bundled.length,
      fromPocketBase: pocketbase.extraCount,
    },
    environment: environmentReport(),
  });
}
