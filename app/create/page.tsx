'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import GeneratorForm from '@/components/GeneratorForm';

const Background3D = dynamic(() => import('@/components/Background3D'), { ssr: false });

/**
 * Making a post. The background speeds up while Gemini and Chromium are
 * working, so the wait has something to look at that is not a spinner.
 */
export default function CreatePage() {
  const [busy, setBusy] = useState(false);

  return (
    <div className="relative flex h-screen overflow-hidden">
      <Background3D busy={busy} dimmed={false} />

      <main className="custom-scrollbar min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-fluid-xs text-muted transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back
          </Link>

          <header className="mb-8 mt-6">
            <h1 className="text-fluid-2xl font-semibold tracking-tight text-foreground">
              Create a new post
            </h1>
            <p className="mt-2 text-fluid-sm text-muted">
              Everything is written in plain language with no emojis, and rendered at 1080 by 1350
              so it fills the frame on LinkedIn.
            </p>
          </header>

          <GeneratorForm onBusyChange={setBusy} />
        </div>
      </main>
    </div>
  );
}
