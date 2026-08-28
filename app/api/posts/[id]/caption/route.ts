import { NextResponse } from 'next/server';

import { regenerateCaption } from '@/lib/gemini';
import { isPlatform, PLATFORM_SPECS } from '@/lib/platforms';
import {
  describePocketBaseError,
  getPostRecord,
  logError,
  toPostSummary,
  updatePlatformField,
} from '@/lib/pocketbase';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * One platform's caption or approval, and nothing else.
 *
 * The redo button only means anything if it cannot disturb the other three
 * captions, so this route names the platform it is allowed to touch and writes
 * exactly that one field. Nothing about the post is re-generated: no new
 * slides, no new design, no new PDF. The other tabs are not even read.
 *
 *   { platform, action: "approve", approved: true }
 *   { platform, action: "redo" }
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = (await request.json()) as {
      platform?: unknown;
      action?: unknown;
      approved?: unknown;
    };

    if (!isPlatform(body.platform)) {
      return NextResponse.json(
        { error: 'Name one of linkedin, x, facebook or instagram.' },
        { status: 400 },
      );
    }

    const platform = body.platform;

    if (body.action === 'approve') {
      await updatePlatformField(id, platform, { approved: Boolean(body.approved) });
      return NextResponse.json({ platform, approved: Boolean(body.approved) });
    }

    if (body.action !== 'redo') {
      return NextResponse.json({ error: 'Ask for "approve" or "redo".' }, { status: 400 });
    }

    const record = await getPostRecord(id);
    const post = toPostSummary(record);

    // The source material a redo is written from. The original zip is long
    // gone — it is never stored — so the post's own title, subject and
    // existing captions stand in for it. That is enough for a rewrite, which
    // is a change of angle rather than a fresh analysis.
    const contextString = [
      `PROJECT: ${post.project_title}`,
      post.source_name ? `SOURCE: ${post.source_name}` : '',
      '',
      'WHAT THE POST SAYS, as written for LinkedIn:',
      post.captions.linkedin || post.caption_text,
      '',
      post.hashtags.length > 0 ? `HASHTAGS IN USE: ${post.hashtags.join(' ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    let caption: string;
    try {
      caption = await regenerateCaption({
        platform,
        contextString,
        previous: post.captions[platform],
      });
    } catch (error) {
      // Named separately because everything else in this route talks to
      // PocketBase, and reporting a rejected API key as "PocketBase rejected
      // the record" sends you to the wrong system entirely.
      console.error('[posts:caption] model', error);
      await logError({
        stage: 'generate',
        message: `redo failed for ${platform}`,
        details: String(error),
      });
      return NextResponse.json(
        { error: `The model could not rewrite that caption. ${String((error as Error)?.message ?? error).slice(0, 300)}` },
        { status: 502 },
      );
    }

    await updatePlatformField(id, platform, { caption });

    return NextResponse.json({
      platform,
      caption,
      label: PLATFORM_SPECS[platform].label,
    });
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 404) {
      return NextResponse.json({ error: 'That post no longer exists.' }, { status: 404 });
    }

    const reason = describePocketBaseError(error);
    console.error('[posts:caption]', error);
    await logError({ stage: 'generate', message: 'caption update failed', details: String(error) });
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
