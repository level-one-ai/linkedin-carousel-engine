'use client';

import { Bookmark, Heart, MessageCircle, MoreHorizontal, Send } from 'lucide-react';

import { AUTHOR, ClampedCaption, SlideImages, type MockupProps } from './shared';

/**
 * The post as Instagram will draw it.
 *
 * Instagram is picture first and text second, and it cuts the caption harder
 * than any other network here: roughly one line under the actions before
 * "more". A caption written as a paragraph is effectively invisible, which is
 * why the brief for this platform asks for short lines with blank lines
 * between them — and why seeing it cut here is the point of the screen.
 *
 * The image is the 4:5 slide as designed. Instagram accepts that ratio, so
 * nothing is cropped.
 */
export default function InstagramMockup({ post, caption, slides, imageBase }: MockupProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#dbdbdb] bg-white text-[#262626]">
      <header className="flex items-center gap-3 px-3 py-2.5">
        {/* The gradient ring is Instagram's, not ours. */}
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-[#fdf497] via-[#d6249f] to-[#285AEB] p-[2px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.png"
            alt=""
            className="h-full w-full rounded-full bg-white object-contain p-1"
          />
        </span>

        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[14px] font-semibold">{AUTHOR.handle}</p>
          <p className="truncate text-[12px] text-[#737373]">Sponsored</p>
        </div>

        <MoreHorizontal className="h-5 w-5 shrink-0" aria-hidden />
      </header>

      {post.post_mode === 'carousel' ? (
        <SlideImages
          imageBase={imageBase}
          slides={slides}
          shape="portrait"
          aspect="aspect-[4/5]"
          showDots
        />
      ) : (
        <div className="grid aspect-[4/5] place-items-center bg-black/5 text-[12px] text-black/50">
          <span className="px-6 text-center">The uploaded picture goes here.</span>
        </div>
      )}

      <div className="px-3 pb-3 pt-2">
        <div className="flex items-center gap-4">
          <Heart className="h-6 w-6" aria-hidden />
          <MessageCircle className="h-6 w-6" aria-hidden />
          <Send className="h-6 w-6" aria-hidden />
          <Bookmark className="ml-auto h-6 w-6" aria-hidden />
        </div>

        <p className="mt-2 text-[14px] font-semibold">248 likes</p>

        <div className="mt-1 text-[14px] leading-[18px]">
          <ClampedCaption
            text={`${AUTHOR.handle}  ${caption}`}
            lines={2}
            moreLabel="more"
            moreClassName="text-[14px] text-[#737373]"
          />
        </div>

        <p className="mt-1.5 text-[12px] text-[#737373]">View all 31 comments</p>
      </div>
    </div>
  );
}
