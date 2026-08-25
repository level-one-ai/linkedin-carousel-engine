'use client';

import { motion } from 'framer-motion';
import { FileText, Images } from 'lucide-react';
import Link from 'next/link';

import type { PostSummary } from '@/lib/types';

export function formatDate(iso: string): string {
  const date = new Date((iso ?? '').replace(' ', 'T'));
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * One saved post in the history grid.
 *
 * The picture is slide one, stored as a JPEG when the post was made. Rendering
 * a PDF per card just to show a thumbnail would make this screen cost as much
 * as the generator it lists.
 */
export default function PostCard({ post, index }: { post: PostSummary; index: number }) {
  const isCarousel = post.post_mode === 'carousel';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/posts/${post.id}`}
        className="card group block h-full transition-shadow hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <div className="relative overflow-hidden rounded-2xl border border-line bg-canvas-deep">
          {post.hasThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/posts/${post.id}/file?thumb=1`}
              alt=""
              loading="lazy"
              className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex aspect-[4/5] w-full items-center justify-center text-muted">
              {isCarousel ? (
                <Images className="h-6 w-6" aria-hidden />
              ) : (
                <FileText className="h-6 w-6" aria-hidden />
              )}
            </div>
          )}

          <span className="absolute right-2 top-2 rounded-full bg-foreground/85 px-2.5 py-1 text-fluid-xs font-medium text-cream backdrop-blur">
            {isCarousel ? `${post.slide_count} slides` : 'Image'}
          </span>

          {/* An image post with no picture yet is unfinished, and the grid is
              the only place that is visible at a glance. */}
          {!post.hasAsset ? (
            <span className="absolute left-2 top-2 rounded-full bg-amber-100 px-2.5 py-1 text-fluid-xs font-medium text-amber-900">
              {isCarousel ? 'No file' : 'Needs image'}
            </span>
          ) : null}
        </div>

        <h2 className="mt-3 text-fluid-base font-semibold leading-snug text-foreground">
          {post.project_title}
        </h2>

        <p className="mt-1 text-fluid-xs text-muted">
          {formatDate(post.created)}
          {post.template_name ? ` · ${post.template_name}` : ''}
        </p>

        {post.caption_text ? (
          <p className="clamp-2 mt-2 text-fluid-xs leading-relaxed text-muted">
            {post.caption_text}
          </p>
        ) : null}
      </Link>
    </motion.div>
  );
}
