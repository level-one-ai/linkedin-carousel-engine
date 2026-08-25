'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';

import PostCard from '@/components/PostCard';
import type { PostSummary } from '@/lib/types';

/** Everything ever generated, newest first. */
export default function PostsPage() {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/posts');
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Could not load your posts.');
        if (!cancelled) setPosts(body.posts ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load your posts.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="custom-scrollbar h-screen overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-fluid-xs text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </Link>

        <header className="mb-8 mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-fluid-2xl font-semibold tracking-tight text-foreground">
              Previous posts
            </h1>
            <p className="mt-2 text-fluid-sm text-muted">
              {loading
                ? 'Loading your history.'
                : posts.length === 0
                  ? 'Nothing here yet.'
                  : `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}, newest first.`}
            </p>
          </div>

          <Link href="/create" className="btn-primary !px-6 !py-2.5 !text-fluid-xs">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            New post
          </Link>
        </header>

        {error ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-fluid-sm text-red-800"
          >
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 py-16 text-fluid-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading
          </div>
        ) : null}

        {!loading && !error && posts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="card flex flex-col items-center gap-4 py-16 text-center"
          >
            <p className="text-fluid-base font-semibold text-foreground">No posts yet</p>
            <p className="max-w-sm text-fluid-sm text-muted">
              Make your first one and it will appear here, with its caption and its slides, ready
              to open again whenever you need it.
            </p>
            <Link href="/create" className="btn-primary mt-1">
              <Sparkles className="h-4 w-4" aria-hidden />
              Create New Post
            </Link>
          </motion.div>
        ) : null}

        {posts.length > 0 ? (
          <div className="grid gap-5 xs:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <PostCard key={post.id} post={post} index={index} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
