'use client';

import { BadgeCheck, BarChart3, Bookmark, Heart, MessageCircle, Repeat2, Upload } from 'lucide-react';

import { AUTHOR, ClampedCaption, POSTED_AT, SlideImages, type MockupProps } from './shared';

/**
 * The post as X will draw it.
 *
 * Two things about X that no other network here does, and that this exists to
 * show you: the caption is not truncated at all, it is simply rejected past
 * 280 characters, and an attached image is shown at 16:9 with the sides
 * cropped away — so a 4:5 slide loses its top and bottom unless a wide crop is
 * posted instead, which is what the renderer produces.
 *
 * Drawn in X's own dark palette rather than the Level One one, because a
 * preview that matched the surrounding app would be a prettier lie.
 */

const LIMIT = 280;

export default function XMockup({ post, caption, slides, imageBase }: MockupProps) {
  const remaining = LIMIT - caption.length;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#2f3336] bg-black text-[#e7e9ea]">
      <article className="flex gap-3 px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-mark.png"
          alt=""
          className="h-10 w-10 shrink-0 rounded-full bg-white object-contain p-1.5"
        />

        <div className="min-w-0 flex-1">
          <header className="flex items-center gap-1 text-[15px] leading-tight">
            <span className="truncate font-bold">{AUTHOR.name}</span>
            <BadgeCheck className="h-4 w-4 shrink-0 text-[#1d9bf0]" aria-hidden />
            <span className="truncate text-[#71767b]">@{AUTHOR.handle}</span>
            <span className="text-[#71767b]" aria-hidden>
              ·
            </span>
            <span className="shrink-0 text-[#71767b]">{POSTED_AT}</span>
          </header>

          <div className="mt-1">
            <ClampedCaption
              text={caption}
              lines={12}
              moreLabel="Show more"
              className="text-[15px] leading-[20px]"
              moreClassName="text-[15px] text-[#1d9bf0] hover:underline"
            />
          </div>

          {post.post_mode === 'carousel' ? (
            <div className="mt-3">
              <SlideImages
                imageBase={imageBase}
                slides={slides}
                shape="wide"
                aspect="aspect-[16/9]"
                rounded="rounded-2xl border border-[#2f3336]"
              />
            </div>
          ) : null}

          <footer className="mt-3 flex max-w-[425px] items-center justify-between text-[#71767b]">
            <span className="flex items-center gap-1.5 text-[13px]">
              <MessageCircle className="h-[18px] w-[18px]" aria-hidden />
              12
            </span>
            <span className="flex items-center gap-1.5 text-[13px]">
              <Repeat2 className="h-[18px] w-[18px]" aria-hidden />
              8
            </span>
            <span className="flex items-center gap-1.5 text-[13px]">
              <Heart className="h-[18px] w-[18px]" aria-hidden />
              64
            </span>
            <span className="flex items-center gap-1.5 text-[13px]">
              <BarChart3 className="h-[18px] w-[18px]" aria-hidden />
              3,204
            </span>
            <span className="flex items-center gap-3">
              <Bookmark className="h-[18px] w-[18px]" aria-hidden />
              <Upload className="h-[18px] w-[18px]" aria-hidden />
            </span>
          </footer>
        </div>
      </article>

      {/* The one count on any of these screens that decides whether a post can
          be sent at all, so it is stated rather than left to be discovered. */}
      <p
        className={`border-t border-[#2f3336] px-4 py-2 text-[12px] ${
          remaining < 0 ? 'text-[#f4212e]' : 'text-[#71767b]'
        }`}
      >
        {remaining < 0
          ? `${Math.abs(remaining)} characters over the 280 limit. X will reject this.`
          : `${caption.length} of 280 characters.`}
      </p>
    </div>
  );
}
