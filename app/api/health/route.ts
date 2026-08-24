import { NextResponse } from 'next/server';
import { environmentReport } from '@/lib/config';
import { gotenbergHealthy } from '@/lib/gotenberg';
import { listTemplates } from '@/lib/pocketbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Small readiness endpoint so the dashboard can tell the user which service is
 * not up yet instead of failing halfway through a generation.
 */
export async function GET() {
  const [gotenberg, pocketbase] = await Promise.all([
    gotenbergHealthy(),
    listTemplates()
      .then((templates) => ({ up: true, templateCount: templates.length }))
      .catch(() => ({ up: false, templateCount: 0 })),
  ]);

  return NextResponse.json({
    gemini: Boolean(process.env.GEMINI_API_KEY),
    gotenberg,
    pocketbase: pocketbase.up,
    templateCount: pocketbase.templateCount,
    environment: environmentReport(),
  });
}
