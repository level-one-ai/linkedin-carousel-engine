import { NextResponse } from 'next/server';

import { scaleThumbnail } from '@/lib/chromium';
import { attachImage, describePocketBaseError, getPost, logError } from '@/lib/pocketbase';

export const runtime = 'nodejs';
// Scaling the thumbnail starts a browser, which is slow on a cold container.
export const maxDuration = 120;

/** What Google Labs Flow hands back, plus the obvious alternatives. */
const ALLOWED = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

const MAX_BYTES = 10 * 1024 * 1024;

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'linkedin-post'
  );
}

/**
 * Attaches the picture made in Google Labs Flow to a single image post.
 *
 * This is the second half of the image flow: generation writes the caption and
 * the prompt, and this is where the result of that prompt comes back.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const post = await getPost(id);

    if (post.post_mode !== 'image') {
      return NextResponse.json(
        { error: 'Only single image posts take an uploaded picture. This one is a carousel.' },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'No image was received.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'That image is larger than the 10 MB limit.' },
        { status: 413 },
      );
    }

    const extension = ALLOWED.get(file.type);
    if (!extension) {
      return NextResponse.json(
        { error: 'Upload a PNG, JPEG or WebP image.' },
        { status: 415 },
      );
    }

    const image = Buffer.from(await file.arrayBuffer());
    const thumbnail = await scaleThumbnail(image, file.type);

    await attachImage({
      id,
      image,
      thumbnail,
      mimeType: file.type,
      fileName: `${slugify(post.project_title)}.${extension}`,
    });

    return NextResponse.json({ post: await getPost(id) });
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 404) {
      return NextResponse.json({ error: 'That post no longer exists.' }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : describePocketBaseError(error);
    await logError({ stage: 'attach-image', message, details: String(error) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
