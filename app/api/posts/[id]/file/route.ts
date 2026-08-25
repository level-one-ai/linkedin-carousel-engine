import { NextResponse } from 'next/server';

import { describePocketBaseError, getPostRecord, pb } from '@/lib/pocketbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Streams a stored file back to the browser from our own origin.
 *
 * Both file fields are `protected` in PocketBase, which means they cannot be
 * fetched without a token. Minting one here keeps every PocketBase credential
 * on the server and gives the viewer a same-origin URL that no CORS rule can
 * block — the PDF viewer, the thumbnails and the download button all use it.
 *
 *   ?thumb=1     the card thumbnail instead of the full asset
 *   ?download=1  attachment disposition instead of inline
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const wantsThumbnail = query.get('thumb') === '1';
  const asDownload = query.get('download') === '1';

  try {
    const record = await getPostRecord(id);
    const field = wantsThumbnail ? 'thumbnail' : 'asset';
    const storedName = String(record[field] ?? '');

    if (!storedName) {
      return NextResponse.json(
        {
          error: wantsThumbnail
            ? 'This post has no thumbnail.'
            : 'This post has no file attached. It may have been saved before file storage was set up.',
        },
        { status: 404 },
      );
    }

    const mimeType = wantsThumbnail
      ? 'image/jpeg'
      : String(record.mime_type ?? 'application/pdf');

    // The name to SAVE it under, which is not the name PocketBase stored it
    // under: PocketBase appends a random suffix to keep filenames unique.
    const downloadName = wantsThumbnail
      ? 'thumbnail.jpg'
      : String(record.file_name ?? 'linkedin-post.pdf');

    const token = await pb().files.getToken();
    const fileUrl = pb().files.getURL(record, storedName, { token });

    const upstream = await fetch(fileUrl);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `PocketBase would not return the file (${upstream.status}).` },
        { status: 502 },
      );
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `${asDownload ? 'attachment' : 'inline'}; filename="${downloadName}"`,
        // The bytes never change once written, but the record can be deleted,
        // so keep it private and short.
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 404) {
      return NextResponse.json({ error: 'That post no longer exists.' }, { status: 404 });
    }
    console.error('[posts:file]', error);
    return NextResponse.json({ error: describePocketBaseError(error) }, { status: 500 });
  }
}
