'use client';

import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, ImagePlus, Loader2, Upload } from 'lucide-react';

import CopyButton from './CopyButton';
import type { PostSummary } from '@/lib/types';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * The second half of a single image post.
 *
 * The picture is made in Google Labs Flow, not here, so this panel does the two
 * things that bridge the gap: hands over the prompt, and takes the result back.
 */
export default function ImagePromptPanel({
  post,
  onUploaded,
}: {
  post: PostSummary;
  onUploaded: (post: PostSummary) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File | null) => {
      if (!file || busy) return;

      if (!ACCEPTED.includes(file.type)) {
        setError('Upload a PNG, JPEG or WebP image.');
        return;
      }

      setBusy(true);
      setError('');

      try {
        const form = new FormData();
        form.append('file', file);

        const response = await fetch(`/api/posts/${post.id}/image`, {
          method: 'POST',
          body: form,
        });
        const body = await response.json();

        if (!response.ok) {
          setError(body.error ?? 'The image could not be saved.');
          return;
        }

        onUploaded(body.post as PostSummary);
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : 'The upload could not complete.',
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, onUploaded, post.id],
  );

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-fluid-sm font-semibold uppercase tracking-widest text-foreground">
              Image prompt
            </h2>
            <p className="mt-1 text-fluid-xs text-muted">
              Paste this into Google Labs Flow, then bring the picture back here.
            </p>
          </div>
          <CopyButton text={post.image_prompt} label="Copy prompt" />
        </div>

        <p className="rounded-2xl border border-line bg-white/70 p-4 text-fluid-sm leading-relaxed text-foreground/90">
          {post.image_prompt || 'No prompt was stored for this post.'}
        </p>

        <a
          href="https://labs.google/fx/tools/flow"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-fluid-xs text-muted underline-offset-4 transition hover:text-foreground hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Open Google Labs Flow
        </a>
      </section>

      <section className="card">
        <h2 className="mb-3 text-fluid-sm font-semibold uppercase tracking-widest text-foreground">
          {post.hasAsset ? 'Replace the image' : 'Add the image'}
        </h2>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            upload(event.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => !busy && inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed p-8 text-center transition-colors ${
            dragging
              ? 'border-foreground/50 bg-white/80'
              : 'border-line bg-white/40 hover:border-foreground/30'
          } ${busy ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => upload(event.target.files?.[0] ?? null)}
          />

          {busy ? (
            <>
              <Loader2 className="mb-2 h-5 w-5 animate-spin text-muted" aria-hidden />
              <p className="text-fluid-sm font-medium text-foreground">Saving your image</p>
            </>
          ) : (
            <>
              {post.hasAsset ? (
                <ImagePlus className="mb-2 h-5 w-5 text-muted" aria-hidden />
              ) : (
                <Upload className="mb-2 h-5 w-5 text-muted" aria-hidden />
              )}
              <p className="text-fluid-sm font-medium text-foreground">
                Drop your image here
              </p>
              <p className="mt-1 text-fluid-xs text-muted">PNG, JPEG or WebP, up to 10 MB</p>
            </>
          )}
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-fluid-xs text-red-800"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
