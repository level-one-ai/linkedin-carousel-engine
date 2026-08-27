'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';

interface Health {
  gemini: boolean;
  renderer: boolean;
  /** Why there is no browser. Absent when there is one, or on an older server. */
  rendererReason?: string | null;
  pocketbase: boolean;
  templateCount: number;
}

/**
 * A quiet pre-flight check under the generate button.
 *
 * It only speaks up when something is actually wrong. A row of green ticks
 * saying everything is fine is noise on a screen whose job is one button —
 * but discovering PocketBase is down only after a full upload and a Gemini
 * call is worse, so the check still runs on arrival.
 */
export default function HealthLine() {
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      const response = await fetch('/api/health');
      setHealth(await response.json());
    } catch {
      setHealth({ gemini: false, renderer: false, pocketbase: false, templateCount: 0 });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    check();
  }, []);

  if (!health) return null;

  const problems: string[] = [];
  if (!health.gemini) problems.push('GEMINI_API_KEY is not set, so nothing can be written.');
  if (!health.renderer) {
    // The server says which of the two causes it is when it can. The old
    // sentence stays as the fallback, for a server deployed before it could.
    problems.push(
      health.rendererReason || 'No Chrome or Chromium was found, so slides cannot be rendered.',
    );
  }
  if (!health.pocketbase) {
    problems.push('PocketBase is unreachable, so posts cannot be saved to your history.');
  } else if (health.templateCount === 0) {
    problems.push('PocketBase has no slide designs yet. Run "npm run seed".');
  }

  if (problems.length === 0) return null;

  return (
    <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-fluid-xs text-amber-900">
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <ul className="space-y-1">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={check}
          disabled={checking}
          className="mt-2 inline-flex items-center gap-1.5 underline-offset-4 transition hover:underline disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} aria-hidden />
          Check again
        </button>
      </div>
    </div>
  );
}
