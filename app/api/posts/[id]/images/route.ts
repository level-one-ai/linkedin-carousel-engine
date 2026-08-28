import { NextResponse } from 'next/server';

import { describePocketBaseError, getPostRecord, pb } from '@/lib/pocketbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Streams one stored slide image back from our own origin.
 *
 * Same reasoning as the file route beside this one: the field is `protected`,
 * so the bytes need a token that must not reach the browser.
 *
 *   ?slide=3&shape=wide   the 16:9 crop of slide three
 *   ?slide=3              the 4:5 slide as designed
 *
 * Asked for by slide and shape rather than by index, because PocketBase
 * appends a random suffix to every filename and returns them in its own order.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const slide = Math.max(1, Number(query.get('slide') ?? '1') || 1);
  const shape = query.get('shape') === 'wide' ? 'wide' : 'portrait';

  try {
    const record = await getPostRecord(id);
    const stored = Array.isArray(record.images) ? record.images.map(String) : [];

    // Either separator: PocketBase slugifies on upload, and a record written
    // before that was understood holds hyphens.
    const wanted = new RegExp(`^slide[-_]${String(slide).padStart(2, '0')}[-_]${shape}`);
    const name = stored.find((file) => wanted.test(file));

    if (!name) {
      return NextResponse.json(
        {
          error:
            stored.length === 0
              ? 'This post has no slide images. It was generated before they were rendered.'
              : `No ${shape} image for slide ${slide}.`,
        },
        { status: 404 },
      );
    }

    const token = await pb().files.getToken();
    const upstream = await fetch(pb().files.getURL(record, name, { token }));

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `PocketBase would not return the image (${upstream.status}).` },
        { status: 502 },
      );
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `inline; filename="slide-${slide}-${shape}.jpg"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 404) {
      return NextResponse.json({ error: 'That post no longer exists.' }, { status: 404 });
    }
    console.error('[posts:images]', error);
    return NextResponse.json({ error: describePocketBaseError(error) }, { status: 500 });
  }
}
