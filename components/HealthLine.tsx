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

interface TemplateHealth {
  template_name: string;
  ok: boolean;
  problem: string | null;
  repaired: boolean;
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
  const [templates, setTemplates] = useState<TemplateHealth[]>([]);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      // Both, because a design stored as escaped text leaves every other check
      // green and still renders one page of source code.
      const [healthResponse, templateResponse] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/templates'),
      ]);
      setHealth(await healthResponse.json());
      const body = await templateResponse.json();
      setTemplates(Array.isArray(body.templates) ? body.templates : []);
    } catch {
      setHealth({ gemini: false, renderer: false, pocketbase: false, templateCount: 0 });
      setTemplates([]);
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

  const broken = templates.filter((template) => !template.ok);
  if (broken.length > 0) {
    problems.push(
      `${broken.length === 1 ? 'This slide design is' : 'These slide designs are'} stored damaged ` +
        `and will be replaced with the built in copy: ${broken
          .map((template) => template.template_name)
          .join(', ')}.`,
    );
  } else if (templates.some((template) => template.repaired)) {
    problems.push(
      'Some slide designs are stored as plain text rather than HTML. They are being unscrambled ' +
        'on the way in, which works, but "npm run seed" would store them properly.',
    );
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
