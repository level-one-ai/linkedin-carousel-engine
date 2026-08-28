'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Globe, ImageOff, Loader2, MoreHorizontal } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import type { PostSummary } from '@/lib/types';
import { AUTHOR } from './shared';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/**
 * The post as LinkedIn will draw it.
 *
 * This exists because a caption in a textarea beside a list of slides tells you
 * almost nothing about the thing you are about to publish. Truncation is where
 * hooks live or die, and a carousel is judged on its first frame — neither is
 * visible until the two are shown together at the size a reader sees them.
 *
 * Deliberately styled in LinkedIn's own palette rather than the Level One one:
 * a preview that matched the surrounding app would be a prettier lie.
 */

/** LinkedIn shows roughly three lines before it cuts a post off. */
const COLLAPSED_LINES = 3;

function AuthorHeader({ name, tagline }: { name: string; tagline: string }) {
  return (
    <header className="flex items-start gap-2 px-4 pt-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-mark.png"
        alt=""
        className="h-12 w-12 shrink-0 rounded-full bg-[#f4f2ee] object-contain p-1.5"
      />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[14px] font-semibold text-[rgba(0,0,0,0.9)]">{name}</p>
        <p className="truncate text-[12px] text-[rgba(0,0,0,0.6)]">{tagline}</p>
        <p className="flex items-center gap-1 text-[12px] text-[rgba(0,0,0,0.6)]">
          Now
          <span aria-hidden>·</span>
          <Globe className="h-3 w-3" aria-hidden />
        </p>
      </div>
      <MoreHorizontal className="h-5 w-5 shrink-0 text-[rgba(0,0,0,0.6)]" aria-hidden />
    </header>
  );
}

function Caption({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const body = useRef<HTMLParagraphElement>(null);

  // Only offer "see more" when the text is actually being cut off, which
  // depends on the rendered width and so cannot be worked out from length.
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    setClamped(element.scrollHeight > element.clientHeight + 1);
  }, [text]);

  return (
    <div className="px-4 pb-2 pt-3">
      <p
        ref={body}
        className="whitespace-pre-line text-[14px] leading-[20px] text-[rgba(0,0,0,0.9)]"
        style={
          expanded
            ? undefined
            : {
                display: '-webkit-box',
                WebkitLineClamp: COLLAPSED_LINES,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }
        }
      >
        {text}
      </p>
      {clamped && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-0.5 text-[14px] text-[rgba(0,0,0,0.6)] hover:text-[#0a66c2] hover:underline"
        >
          …see more
        </button>
      ) : null}
    </div>
  );
}

/**
 * A document post, one page at a time, the way LinkedIn presents a carousel.
 * Showing all eight stacked would answer a question nobody asks: the reader
 * only ever sees one frame, and only swipes if the first one earned it.
 */
function CarouselAttachment({ fileUrl, title }: { fileUrl: string; title: string }) {
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (failed) {
    return (
      <div className="flex items-center justify-center gap-2 bg-[#f4f2ee] py-16 text-[13px] text-[rgba(0,0,0,0.6)]">
        <ImageOff className="h-4 w-4" aria-hidden />
        The document could not be displayed
      </div>
    );
  }

  return (
    <div ref={holder} className="relative bg-[#f4f2ee]">
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages }) => setPageCount(numPages)}
        onLoadError={() => setFailed(true)}
        loading={
          <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-[rgba(0,0,0,0.6)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading document
          </div>
        }
      >
        {width > 0 ? (
          <Page
            pageNumber={page}
            width={width}
            renderAnnotationLayer={false}
            renderTextLayer={false}
          />
        ) : null}
      </Document>

      {pageCount > 1 ? (
        <>
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md transition hover:bg-white disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronLeft className="h-5 w-5 text-[rgba(0,0,0,0.75)]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={page === pageCount}
            aria-label="Next slide"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md transition hover:bg-white disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronRight className="h-5 w-5 text-[rgba(0,0,0,0.75)]" aria-hidden />
          </button>
        </>
      ) : null}

      {/* The dark strip LinkedIn lays over the foot of a document post. */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-black/70 px-4 py-2.5">
        <p className="truncate text-[14px] font-semibold text-white">{title}</p>
        <span className="shrink-0 text-[13px] text-white/90">
          {page} / {pageCount || '–'}
        </span>
      </div>
    </div>
  );
}

const ACTIONS = ['Like', 'Comment', 'Repost', 'Send'];

export default function LinkedInMockup({
  post,
  caption,
  fileUrl,
}: {
  post: PostSummary;
  /** The LinkedIn caption, which a redo can change without a page reload. */
  caption: string;
  /** Where the stored asset is served from, or null while none exists. */
  fileUrl: string | null;
}) {
  const isCarousel = post.post_mode === 'carousel';

  return (
    <article className="mx-auto w-full max-w-[555px] overflow-hidden rounded-lg border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_2px_6px_rgba(0,0,0,0.06)]">
      <AuthorHeader name={AUTHOR.name} tagline={AUTHOR.tagline} />

      <Caption text={caption} />

      {!fileUrl ? (
        <div className="flex flex-col items-center justify-center gap-2 border-y border-[rgba(0,0,0,0.08)] bg-[#f4f2ee] py-20 text-center">
          <ImageOff className="h-5 w-5 text-[rgba(0,0,0,0.4)]" aria-hidden />
          <p className="text-[13px] text-[rgba(0,0,0,0.6)]">
            {isCarousel ? 'No document attached' : 'No image yet'}
          </p>
        </div>
      ) : isCarousel ? (
        <CarouselAttachment fileUrl={fileUrl} title={post.project_title} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl} alt="" className="w-full bg-[#f4f2ee]" />
      )}

      <div className="flex items-center justify-between px-4 py-2.5">
        {ACTIONS.map((action) => (
          <span
            key={action}
            className="rounded px-3 py-1.5 text-[14px] font-semibold text-[rgba(0,0,0,0.6)]"
          >
            {action}
          </span>
        ))}
      </div>
    </article>
  );
}
