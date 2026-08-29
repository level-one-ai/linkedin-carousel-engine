import { NextResponse } from 'next/server';

import { describePocketBaseError, logError } from '@/lib/pocketbase';
import { publishPost } from '@/lib/publish';

export const runtime = 'nodejs';
// Nine slides uploaded one at a time to two networks takes a while.
export const maxDuration = 300;

/**
 * Sends one post to the networks it is approved for.
 *
 * Always 200 when the run completed, even if a network refused: the body says
 * per platform what happened, and a blanket 500 would hide that LinkedIn went
 * out while Instagram did not.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const reports = await publishPost(id);
    return NextResponse.json({ reports });
  } catch (error) {
    const message = describePocketBaseError(error);
    await logError({ stage: 'publish', message, details: String(error) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
