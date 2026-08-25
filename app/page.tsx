'use client';

import { motion } from 'framer-motion';
import { LayoutGrid, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// Reaches for `window` (WebGL), so it cannot be server-rendered.
const Background3D = dynamic(() => import('@/components/Background3D'), { ssr: false });

/**
 * The front door.
 *
 * Two buttons, and deliberately only two: making a post, and looking at the
 * posts already made. Everything else — the mode toggle, the template picker,
 * the health check — belongs one screen in, where it is about to be used.
 */
export default function HomePage() {
  return (
    <div className="relative flex h-screen overflow-hidden">
      <Background3D busy={false} dimmed={false} />

      <main className="custom-scrollbar min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-8 px-4 py-10 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-6 text-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-mark.png"
              alt=""
              className="h-16 w-16 object-contain sm:h-20 sm:w-20"
            />

            <h1 className="text-fluid-3xl font-semibold tracking-tight text-foreground">
              Hi Dean, let&rsquo;s write a post
            </h1>

            <p className="max-w-md text-fluid-base text-muted">
              Drop in a project archive or describe something you have built. The engine writes
              the caption, picks a slide design, and renders a carousel at the size LinkedIn
              wants.
            </p>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              <Link href="/create" className="btn-primary">
                <Sparkles className="h-4 w-4" aria-hidden />
                Create New Post
              </Link>

              <Link href="/posts" className="btn-ghost">
                <LayoutGrid className="h-4 w-4" aria-hidden />
                Previous Posts
              </Link>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
