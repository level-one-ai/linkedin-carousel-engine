'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ChevronDown, Download, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import ImagePromptPanel from '@/components/ImagePromptPanel';
import { formatDate } from '@/components/PostCard';
import type { PostSummary } from '@/lib/types';

// Both reach for browser only APIs, so neither can be server-rendered.
const PlatformWorkspace = dynamic(() => import('@/components/PlatformWorkspace'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center gap-2 py-24 text-fluid-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Building previews
    </div>
  ),
});

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), { ssr: false });

/**
 * One finished post.
 *
 * The preview leads, because the question this screen answers is "does this
 * work as a post". The panel beside it is for the things you then do with it:
 * copy the caption, download the file, or — on an image post still waiting for
 * its picture — fetch the prompt and bring the picture back.
 */
export default function PostPage() {
  const params = useParams<{ id: string }>();

  const [post, setPost] = useState<PostSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // The all-slides list is mounted only once opened. A collapsed <details>
  // still renders its children, so leaving it mounted downloaded the whole
  // carousel a second time on every visit, in parallel with the preview.
  const [slidesOpen, setSlidesOpen] = useState(false);

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

  const isCarousel = post?.post_mode === 'carousel';
  const isPdf = post?.mime_type === 'application/pdf';
  // Busted on every change to hasAsset so a freshly uploaded image is not
  // served from the cache of the 404 that came before it.
  const fileUrl = post?.hasAsset
    ? `/api/posts/${params.id}/file?v=${post.hasAsset ? 1 : 0}`
    : null;
  const downloadUrl = `/api/posts/${params.id}/file?download=1`;

  // On a wide screen the post fills the window and nothing scrolls: the mockup,
  // the caption and the publish panel are one view, because checking a post
  // against four networks is a comparison, and a comparison you have to scroll
  // through is not one. A phone still scrolls, which is right.
  return (
    <div className="custom-scrollbar h-screen overflow-y-auto lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-10 sm:px-6 lg:h-full lg:py-5">
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
            className="flex min-h-0 flex-1 flex-col"
          >
            <header className="mb-4 mt-4 flex shrink-0 flex-wrap items-end justify-between gap-4 lg:mb-3 lg:mt-3">
              <div className="min-w-0">
                <h1 className="text-fluid-xl font-semibold tracking-tight text-foreground">
                  {post.project_title}
                </h1>
                <p className="mt-1 text-fluid-xs text-muted">
                  {formatDate(post.created)}
                  {` · ${isCarousel ? `Carousel, ${post.slide_count} slides` : 'Single image'}`}
                  {isCarousel && post.template_name ? ` · ${post.template_name}` : ''}
                  {post.source_name ? ` · from ${post.source_name}` : ''}
                </p>
              </div>

              {post.hasAsset ? (
                <a href={downloadUrl} className="btn-primary !px-6 !py-2.5 !text-fluid-xs">
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Download {isPdf ? 'PDF' : 'image'}
                </a>
              ) : null}
            </header>

            <PlatformWorkspace
              post={post}
              extras={
                <>
                  {post.hashtags.length > 0 ? (
                    <div className="card">
                      <h2 className="mb-3 text-fluid-sm font-semibold uppercase tracking-widest text-foreground">
                        Hashtags
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        {post.hashtags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-line bg-white/70 px-3 py-1 text-fluid-xs text-muted"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {post.post_mode === 'image' ? (
                    <ImagePromptPanel post={post} onUploaded={setPost} />
                  ) : null}

                  {isCarousel && post.hasAsset && fileUrl ? (
                    <div className="card">
                      <button
                        type="button"
                        onClick={() => setSlidesOpen((open) => !open)}
                        aria-expanded={slidesOpen}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <span className="text-fluid-sm font-semibold uppercase tracking-widest text-foreground">
                          Every slide
                          <span className="ml-2 font-normal normal-case tracking-normal text-muted">
                            ({post.slide_count})
                          </span>
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-muted transition-transform ${
                            slidesOpen ? 'rotate-180' : ''
                          }`}
                          aria-hidden
                        />
                      </button>

                      {slidesOpen ? (
                        <div className="mt-4">
                          <PdfViewer fileUrl={fileUrl} downloadUrl={downloadUrl} />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {isCarousel && !post.hasAsset ? (
                    <div className="card">
                      <p className="text-fluid-sm font-semibold text-foreground">
                        No slides stored for this post
                      </p>
                      <p className="mt-2 text-fluid-sm text-muted">
                        The caption was saved but the file was not. Generate it again to get the
                        slides.
                      </p>
                    </div>
                  ) : null}
                </>
              }
            />

          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
