import { NextResponse } from 'next/server';
import { environmentReport } from '@/lib/config';
import { executablePath, rendererAvailable } from '@/lib/chromium';
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

  return NextResponse.json({
    gemini: Boolean(process.env.GEMINI_API_KEY),
    renderer: rendererAvailable(),
    rendererPath: executablePath() ?? null,
    pocketbase: pocketbase.up,
    templateCount: pocketbase.templateCount,
    environment: environmentReport(),
  });
}
