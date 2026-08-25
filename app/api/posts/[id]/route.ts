import { NextResponse } from 'next/server';
import { describePocketBaseError, getPost } from '@/lib/pocketbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    return NextResponse.json({ post: await getPost(id) });
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 404) {
      return NextResponse.json({ error: 'That post no longer exists.' }, { status: 404 });
    }
    return NextResponse.json({ error: describePocketBaseError(error) }, { status: 500 });
  }
}
