'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, CircleAlert, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface Result {
  template: { template_key: string; template_name: string; category: string };
  slideCount: number;
  savedToDatabase: boolean;
  committed: boolean;
  warnings: string[];
}

/**
 * Describe a design, paste some HTML you like, get a slide design.
 *
 * The HTML is a reference for the look, not a base to edit — a landing page
 * with the text swapped is not a 1080x1350 deck. What comes back is rendered
 * before it is offered, so a design that cannot produce eight pages is shown
 * back with the reason rather than quietly added to the picker.
 */
export default function NewTemplatePage() {
  const [description, setDescription] = useState('');
  const [sampleHtml, setSampleHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  async function generate() {
    setBusy(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, sampleHtml }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'That did not work.');
      setResult(data as Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="custom-scrollbar h-screen overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <Link
          href="/create"
          className="inline-flex items-center gap-1.5 text-fluid-xs text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to create
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="mt-6 text-fluid-2xl font-semibold tracking-tight text-foreground">
            New slide design
          </h1>
          <p className="mt-2 max-w-xl text-fluid-sm text-muted">
            Describe the look you want and paste a piece of HTML to take it from. The design is
            rendered here before it is saved, so one that cannot produce eight slides never reaches
            the picker.
          </p>

          <div className="card mt-8 space-y-5">
            <label className="block">
              <span className="text-fluid-xs uppercase tracking-widest text-muted">
                What it should look like
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                placeholder="Deep green with a thin gold rule under every heading. Serif headings, generous margins, quiet and editorial. Suits case studies and client results."
                className="mt-2 w-full rounded-2xl border border-line bg-white/80 px-4 py-3 text-fluid-sm text-foreground placeholder:text-muted/70 focus:border-foreground/40 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="text-fluid-xs uppercase tracking-widest text-muted">
                HTML to take the look from
                <span className="ml-2 normal-case tracking-normal opacity-70">optional</span>
              </span>
              <textarea
                value={sampleHtml}
                onChange={(event) => setSampleHtml(event.target.value)}
                rows={10}
                placeholder="Paste a page or a component whose colours, spacing and type you like."
                className="custom-scrollbar mt-2 w-full rounded-2xl border border-line bg-white/80 px-4 py-3 font-mono text-[12px] leading-relaxed text-foreground placeholder:font-sans placeholder:text-fluid-sm placeholder:text-muted/70 focus:border-foreground/40 focus:outline-none"
              />
            </label>

            <button
              type="button"
              onClick={generate}
              disabled={busy || description.trim().length < 20}
              className="btn-primary w-full"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              {busy ? 'Writing and rendering' : 'Generate design'}
            </button>

            {busy ? (
              <p className="text-center text-fluid-xs text-muted">
                This writes the design and then renders all eight slides to check it. Give it a
                minute.
              </p>
            ) : null}
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-fluid-sm text-red-800"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          ) : null}

          {result ? (
            <div className="card mt-6">
              <h2 className="text-fluid-sm font-semibold uppercase tracking-widest text-foreground">
                {result.template.template_name}
              </h2>
              <p className="mt-1 text-fluid-xs text-muted">{result.template.template_key}</p>
              <p className="mt-3 text-fluid-sm text-foreground/90">{result.template.category}</p>

              <ul className="mt-5 space-y-1.5 border-t border-line pt-4 text-fluid-xs text-muted">
                <li>Rendered {result.slideCount} slides.</li>
                <li>
                  {result.savedToDatabase
                    ? 'Saved to PocketBase, so it is in the design picker now.'
                    : 'Not saved to PocketBase.'}
                </li>
                <li>
                  {result.committed
                    ? 'Committed to templates/ in the repository.'
                    : 'Not committed to the repository.'}
                </li>
              </ul>

              {result.warnings.length > 0 ? (
                <ul className="mt-4 space-y-1.5 rounded-2xl border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-fluid-xs text-amber-900">
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}

              <Link href="/create" className="btn-ghost mt-5 w-full !py-2.5 !text-fluid-xs">
                Use it on a post
              </Link>
            </div>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}
