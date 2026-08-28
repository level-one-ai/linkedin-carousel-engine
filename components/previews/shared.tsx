'use client';

import { useEffect, useRef, useState } from 'react';

import { BRAND } from '@/lib/brand';
import type { PostSummary } from '@/lib/types';

/**
 * The parts every network preview needs, written once.
 *
 * What is deliberately NOT shared is the chrome itself. Each mockup draws its
 * own header, its own action row and its own image treatment in its own
 * palette, because the whole reason these screens exist is that the same
 * caption does not look the same on four networks — a shared "post card" with
 * a few colours swapped would hide exactly the differences you are checking.
 */

export interface MockupProps {
  post: PostSummary;
  caption: string;
  /** Slide count, for paging through the image set. */
  slides: number;
  /** /api/posts/<id>/images — the query is added per platform. */
  imageBase: string;
}

export const AUTHOR = {
  name: BRAND.name,
  handle: 'levelone',
  tagline: BRAND.tagline,
};

/**
 * A caption cut off at the fold, with the network's own "more" affordance.
 *
 * Measured rather than counted: whether a line clamp actually bites depends on
 * the rendered width, so a character count would be wrong at every width but
 * one. Truncation is where a hook lives or dies, which is why this is not
 * approximated.
 */
export function ClampedCaption({
  text,
  lines,
  moreLabel,
  className = '',
  moreClassName = '',
}: {
  text: string;
  lines: number;
  moreLabel: string;
  className?: string;
  moreClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const body = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const element = body.current;
    if (!element) return;
    setClamped(element.scrollHeight > element.clientHeight + 1);
  }, [text, lines]);

  return (
    <div>
      <p
        ref={body}
        className={`whitespace-pre-line ${className}`}
        style={
          expanded
            ? undefined
            : {
                display: '-webkit-box',
                WebkitLineClamp: lines,
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
          className={`mt-0.5 ${moreClassName}`}
        >
          {moreLabel}
        </button>
      ) : null}
    </div>
  );
}

/**
 * One slide of the image set, paged.
 *
 * Every network but LinkedIn posts the carousel as pictures, so this is what
 * three of the four previews attach. `shape` decides which crop is fetched:
 * the 4:5 slide as designed, or the 16:9 version for X.
 */
export function SlideImages({
  imageBase,
  slides,
  shape,
  aspect,
  rounded = '',
  showDots = false,
}: {
  imageBase: string;
  slides: number;
  shape: 'portrait' | 'wide';
  aspect: string;
  rounded?: string;
  showDots?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const count = Math.max(1, slides);

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [imageBase, shape]);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-black/5 text-center text-[12px] text-black/50 ${aspect} ${rounded}`}
      >
        <span className="px-6">
          No slide images stored for this post. Generate it again to render them.
        </span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-black/5 ${aspect} ${rounded}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${imageBase}?slide=${index + 1}&shape=${shape}`}
        alt={`Slide ${index + 1} of ${count}`}
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />

      {count > 1 ? (
        <>
          {index > 0 ? (
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => setIndex((n) => Math.max(0, n - 1))}
              className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[16px] leading-none text-black/70 shadow"
            >
              ‹
            </button>
          ) : null}

          {index < count - 1 ? (
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => setIndex((n) => Math.min(count - 1, n + 1))}
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[16px] leading-none text-black/70 shadow"
            >
              ›
            </button>
          ) : null}

          <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
            {index + 1}/{count}
          </span>

          {showDots ? (
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
              {Array.from({ length: count }).map((_, dot) => (
                <span
                  key={dot}
                  className={`h-1.5 w-1.5 rounded-full ${
                    dot === index ? 'bg-white' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** "2h" style relative time, so a mockup does not read as posted in 1970. */
export const POSTED_AT = 'now';
