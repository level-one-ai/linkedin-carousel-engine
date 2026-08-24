'use client';

import { useEffect, useState } from 'react';
import { CircleCheck, CircleX, RefreshCw } from 'lucide-react';

interface Health {
  gemini: boolean;
  gotenberg: boolean;
  pocketbase: boolean;
  templateCount: number;
}

/**
 * Shows at a glance which of the three services is not ready. Without this the
 * first failure only appears after a full upload and analysis round trip.
 */
export default function HealthStrip() {
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      const response = await fetch('/api/health');
      setHealth(await response.json());
    } catch {
      setHealth({ gemini: false, gotenberg: false, pocketbase: false, templateCount: 0 });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    check();
  }, []);

  const items = [
    { label: 'Gemini key', ok: health?.gemini ?? false },
    { label: 'Gotenberg', ok: health?.gotenberg ?? false },
    {
      label: health ? `PocketBase (${health.templateCount} templates)` : 'PocketBase',
      ok: health?.pocketbase ?? false,
    },
  ];

  return (
    <div className="mb-8 flex flex-wrap items-center gap-4 rounded-2xl border border-edge bg-panel px-5 py-3 text-sm">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-2">
          {item.ok ? (
            <CircleCheck className="h-4 w-4 text-emerald-400" />
          ) : (
            <CircleX className="h-4 w-4 text-red-400" />
          )}
          <span className={item.ok ? 'text-slate-300' : 'text-slate-400'}>{item.label}</span>
        </span>
      ))}
      <button
        type="button"
        onClick={check}
        disabled={checking}
        className="ml-auto flex items-center gap-2 text-slate-400 transition hover:text-white disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
        Recheck
      </button>
    </div>
  );
}
