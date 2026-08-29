'use client';

import { Globe, MessageCircle, MoreHorizontal, Share2, ThumbsUp } from 'lucide-react';

import { AUTHOR, ClampedCaption, SlideImages, type MockupProps } from './shared';

/**
 * The post as Facebook will draw it.
 *
 * Facebook is the most forgiving of the four: a generous fold, a full width
 * image, and a reader who will sit through a paragraph. That is why the brief
 * for this platform asks for a narrative rather than bullets — and seeing it
 * beside the X tab, where the same idea has to survive in 280 characters, is
 * the argument for writing four captions instead of one.
 */
export default function FacebookMockup({ post, caption, slides, imageBase }: MockupProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#dddfe2] bg-white text-[#050505] shadow-sm">
      <header className="flex items-start gap-2 px-4 pt-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-mark.png"
          alt=""
          className="h-10 w-10 shrink-0 rounded-full bg-[#f0f2f5] object-contain p-1.5"
        />

        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold">{AUTHOR.name}</p>
          <p className="flex items-center gap-1 text-[13px] text-[#65676b]">
            Just now
            <span aria-hidden>·</span>
            <Globe className="h-3 w-3" aria-hidden />
          </p>
        </div>

        <MoreHorizontal className="h-5 w-5 shrink-0 text-[#65676b]" aria-hidden />
      </header>

      <div className="px-4 pb-3 pt-2.5">
        <ClampedCaption
          text={caption}
          lines={5}
          moreLabel="See more"
          className="text-[15px] leading-[20px]"
          moreClassName="text-[15px] font-medium text-[#65676b]"
        />
      </div>

      {post.post_mode === 'carousel' ? (
        <SlideImages imageBase={imageBase} slides={slides} aspect="aspect-[4/5]" />
      ) : (
        <div className="grid aspect-[4/5] place-items-center bg-black/5 text-[12px] text-black/50">
          <span className="px-6 text-center">The uploaded picture goes here.</span>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-2 text-[13px] text-[#65676b]">
        <span className="flex items-center gap-1.5">
          <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[#1877f2]">
            <ThumbsUp className="h-2.5 w-2.5 text-white" aria-hidden />
          </span>
          Level One and 87 others
        </span>
        <span>14 comments</span>
      </div>

      <footer className="mx-4 flex items-center justify-around border-t border-[#dddfe2] py-1 text-[15px] font-medium text-[#65676b]">
        <span className="flex items-center gap-2 px-4 py-1.5">
          <ThumbsUp className="h-[18px] w-[18px]" aria-hidden />
          Like
        </span>
        <span className="flex items-center gap-2 px-4 py-1.5">
          <MessageCircle className="h-[18px] w-[18px]" aria-hidden />
          Comment
        </span>
        <span className="flex items-center gap-2 px-4 py-1.5">
          <Share2 className="h-[18px] w-[18px]" aria-hidden />
          Share
        </span>
      </footer>
    </div>
  );
}
