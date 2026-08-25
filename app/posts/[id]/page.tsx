'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import CopyButton from '@/components/CopyButton';
import { formatDate } from '@/components/PostCard';
import type { PostSummary } from '@/lib/types';

// Reaches for browser only APIs, so it cannot be server-rendered.
const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center gap-2 py-16 text-fluid-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Preparing preview
    </div>
  ),
});

/** Preserves the model's paragraphing rather than collapsing it to one block. */
function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-fluid-base leading-relaxed text-foreground/90">
      {text
        .split(/(?:\r?\n){2,}/)
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
    </div>
  );
}

/**
 * One finished post: the caption you paste into LinkedIn, and the slides you
 * attach to it. Both are read from the record rather than regenerated, so
 * opening a post from six weeks ago costs nothing and gives the same file.
 */
export default function PostPage() {
  const params = useParams<{ id: string }>();

  const [post, setPost] = useState<PostSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/posts/${params.id}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Could not open that post.');
        if (!cancelled) setPost(body.post as PostSummary);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open that post.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const fileUrl = `/api/posts/${params.id}/file`;
  const downloadUrl = `${fileUrl}?download=1`;
  const isPdf = post?.mime_type === 'application/pdf';

  return (
    <div className="custom-scrollbar h-screen overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <Link
          href="/posts"
          className="inline-flex items-center gap-1.5 text-fluid-xs text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to posts
        </Link>

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-fluid-sm text-red-800"
          >
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-10 flex items-center gap-2 text-fluid-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading
          </div>
        ) : null}

        {post ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="mb-8 mt-6 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-fluid-2xl font-semibold tracking-tight text-foreground">
                  {post.project_title}
                </h1>
                <p className="mt-2 text-fluid-xs text-muted">
                  {formatDate(post.created)}
                  {post.template_name ? ` · ${post.template_name}` : ''}
                  {` · ${post.post_mode === 'carousel' ? `${post.slide_count} slides` : 'Single image'}`}
                  {post.source_name ? ` · from ${post.source_name}` : ''}
                </p>
              </div>

              {post.hasAsset ? (
                <a href={downloadUrl} className="btn-primary !px-6 !py-2.5 !text-fluid-xs">
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Download {isPdf ? 'PDF' : 'PNG'}
                </a>
              ) : null}
            </header>

            <div className="grid items-start gap-6 lg:grid-cols-2">
              {/* Sticky so the caption stays readable while scrolling a long
                  carousel, rather than leaving a column of empty card. */}
              <section className="card lg:sticky lg:top-10">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h2 className="text-fluid-sm font-semibold uppercase tracking-widest text-foreground">
                    Caption
                  </h2>
                  <CopyButton text={post.caption_text} label="Copy text" />
                </div>

                <Prose text={post.caption_text} />

                {post.hashtags.length > 0 ? (
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                    {post.hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-line bg-white/70 px-3 py-1 text-fluid-xs text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </section>

              <section>
                {!post.hasAsset ? (
                  <div className="card">
                    <p className="text-fluid-sm font-semibold text-foreground">
                      No slides stored for this post
                    </p>
                    <p className="mt-2 text-fluid-sm text-muted">
                      The caption was saved but the file was not. This happens to posts made
                      before file storage was set up. Generate it again to get the slides.
                    </p>
                  </div>
                ) : isPdf ? (
                  <PdfViewer fileUrl={fileUrl} downloadUrl={downloadUrl} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fileUrl}
                    alt="Generated post graphic"
                    className="w-full rounded-2xl border border-line shadow-[0_24px_80px_-40px_rgba(17,17,16,0.25)]"
                  />
                )}
              </section>
            </div>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
