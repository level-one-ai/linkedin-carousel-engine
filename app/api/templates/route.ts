import { NextResponse } from 'next/server';
import { listTemplates } from '@/lib/pocketbase';
import { loadSeedTemplates } from '@/lib/template-seed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Powers the template picker. Falls back to the on-disk starter set. */
export async function GET() {
  try {
    const templates = await listTemplates();
    if (templates.length > 0) {
      return NextResponse.json({
        source: 'pocketbase',
        templates: templates.map(({ raw_html, ...rest }) => rest),
      });
    }
  } catch {
    // Fall through to the bundled templates below.
  }

  return NextResponse.json({
    source: 'bundled',
    templates: loadSeedTemplates().map(({ raw_html, ...rest }) => rest),
  });
}
