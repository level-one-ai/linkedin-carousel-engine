'use client';

import { useState } from 'react';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import dynamic from 'next/dynamic';

import CopyButton from '@/components/CopyButton';
import { PLATFORMS, PLATFORM_SPECS, POST_TYPE_LABELS, type Platform } from '@/lib/platforms';
import type { PostSummary } from '@/lib/types';

const LinkedInMockup = dynamic(() => import('@/components/previews/LinkedInMockup'), {
  ssr: false,
  loading: () => <PreviewSkeleton />,
});
const XMockup = dynamic(() => import('@/components/previews/XMockup'), { ssr: false });
const InstagramMockup = dynamic(() => import('@/components/previews/InstagramMockup'), {
  ssr: false,
});
const FacebookMockup = dynamic(() => import('@/components/previews/FacebookMockup'), { ssr: false });

function PreviewSkeleton() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-fluid-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Building preview
    </div>
  );
}

/**
 * One post, four networks, one tab each.
 *
 * The tabs are not four views of the same caption. Each carries the caption
 * written for that network, drawn inside that network's own chrome, with that
 * network's truncation — which is the only way to see that a paragraph that
 * reads well on Facebook is invisible on Instagram, or that an X post is four
 * characters over the limit.
 *
 * Approval and redo are per tab and write per tab. Redo asks the model to
 * rewrite one caption and swaps it in place; nothing else on the post is
 * touched, so the three you have already approved cannot be disturbed by
 * rewriting the fourth.
 */
export default function PlatformWorkspace({ post }: { post: PostSummary }) {
  const [active, setActive] = useState<Platform>('linkedin');
  const [captions, setCaptions] = useState(post.captions);
  const [approvals, setApprovals] = useState(post.approvals);
  const [busy, setBusy] = useState<Platform | null>(null);
  const [error, setError] = useState('');

  const fileUrl = post.hasAsset ? `/api/posts/${post.id}/file` : null;
  const entry = post.plan[active];
  const skipped = entry.type === 'skip';

  /**
   * Each tab shows its own network's design, not the lead one. An empty
   * templateKey means the row followed the post's own choice, which is the
   * design the record already names.
   */
  const design = entry.templateKey || post.chosen_template_key;
  const imageBase = `/api/posts/${post.id}/images?design=${encodeURIComponent(design)}`;
  // A single image post is page one and nothing else, whatever was rendered.
  const slides = entry.type === 'image' ? 1 : Math.max(1, post.slide_count);

  async function patch(platform: Platform, body: Record<string, unknown>) {
    setBusy(platform);
    setError('');
    try {
      const response = await fetch(`/api/posts/${post.id}/caption`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, ...body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'That did not work.');
      return data as { caption?: string };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function toggleApproval(platform: Platform) {
    const next = !approvals[platform];
    // Optimistic: a checkbox that waits for a round trip feels broken. It is
    // put back if the write fails.
    setApprovals((current) => ({ ...current, [platform]: next }));
    const result = await patch(platform, { action: 'approve', approved: next });
    if (!result) setApprovals((current) => ({ ...current, [platform]: !next }));
  }

  async function redo(platform: Platform) {
    const result = await patch(platform, { action: 'redo' });
    if (result?.caption) {
      setCaptions((current) => ({ ...current, [platform]: result.caption as string }));
    }
  }

  const caption = captions[active];
  const spec = PLATFORM_SPECS[active];
  const live = PLATFORMS.filter((platform) => post.plan[platform].type !== 'skip');
  const approvedCount = live.filter((platform) => approvals[platform]).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PLATFORMS.map((platform) => (
          <button
            key={platform}
            type="button"
            onClick={() => setActive(platform)}
            aria-current={platform === active}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-fluid-xs transition ${
              platform === active
                ? 'border-foreground bg-foreground text-white'
                : 'border-line bg-white/70 text-muted hover:text-foreground'
            }`}
          >
            {PLATFORM_SPECS[platform].label}
            {approvals[platform] ? (
              <Check
                className={`h-3.5 w-3.5 ${platform === active ? 'text-white' : 'text-emerald-600'}`}
                aria-label="approved"
              />
            ) : null}
          </button>
        ))}

        <span className="ml-auto text-fluid-xs text-muted">
          {approvedCount} of {live.length} approved
        </span>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-fluid-xs text-red-800"
        >
          {error}
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section>
          <p className="mb-3 text-fluid-xs uppercase tracking-widest text-muted">
            {skipped ? `${spec.label} was skipped` : `How it will look on ${spec.label}`}
          </p>

          <div className="mx-auto w-full max-w-[555px]">
            {/* A skipped network has no slides of its own, so drawing the
                mockup would show another network's pictures and read as
                something having gone wrong. */}
            {skipped ? (
              <div className="card text-center">
                <p className="text-fluid-sm font-semibold text-foreground">
                  No slides were rendered for {spec.label}
                </p>
                <p className="mt-1.5 text-fluid-xs text-muted">
                  This network was set to Skip when the post was made. The caption below is still
                  written for it, so you can copy it and post by hand.
                </p>
              </div>
            ) : active === 'linkedin' ? (
              <LinkedInMockup post={post} caption={caption} fileUrl={fileUrl} />
            ) : active === 'x' ? (
              <XMockup post={post} caption={caption} slides={slides} imageBase={imageBase} />
            ) : active === 'instagram' ? (
              <InstagramMockup post={post} caption={caption} slides={slides} imageBase={imageBase} />
            ) : (
              <FacebookMockup post={post} caption={caption} slides={slides} imageBase={imageBase} />
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="card">
            <p className="mb-3 text-fluid-xs text-muted">
              {POST_TYPE_LABELS[entry.type]}
              {skipped ? '' : ` · ${design.replace(/_/g, ' ')}`}
            </p>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={approvals[active]}
                onChange={() => toggleApproval(active)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              />
              <span>
                <span className="block text-fluid-sm font-semibold text-foreground">
                  Approve for {spec.label}
                </span>
                <span className="mt-1 block text-fluid-xs text-muted">
                  Only approved networks are sent when you publish.
                </span>
              </span>
            </label>

            <button
              type="button"
              onClick={() => redo(active)}
              disabled={busy === active}
              className="btn-ghost mt-4 w-full !py-2.5 !text-fluid-xs"
            >
              {busy === active ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              )}
              Redo this post
            </button>

            <p className="mt-2 text-fluid-xs text-muted">
              Rewrites the {spec.label} caption only. The slides and the other three networks are
              left exactly as they are.
            </p>
          </div>

          <div className="card">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-fluid-sm font-semibold uppercase tracking-widest text-foreground">
                {spec.label} caption
              </h2>
              <CopyButton text={caption} label="Copy" />
            </div>

            <p className="whitespace-pre-line text-fluid-sm leading-relaxed text-foreground/90">
              {caption}
            </p>

            <p className="mt-3 border-t border-line pt-3 text-fluid-xs text-muted">
              {caption.length} characters
              {caption.length > spec.limit ? ` — over the ${spec.limit} limit` : ''}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
