import { NextResponse } from 'next/server';
import { describePocketBaseError, listPosts } from '@/lib/pocketbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Everything ever generated, newest first. Powers the Previous Posts grid. */
export async function GET() {
  try {
    return NextResponse.json({ posts: await listPosts() });
  } catch (error) {
    return NextResponse.json({ error: describePocketBaseError(error) }, { status: 500 });
  }
}
