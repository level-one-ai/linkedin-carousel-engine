'use client';

import { useEffect, useState } from 'react';
import { Check, ClipboardCopy, Download, Eye, Info } from 'lucide-react';
import type { GenerateResult } from '@/lib/types';

interface Props {
  result: GenerateResult | null;
  fileUrl: string | null;
  onOpenDrawer: () => void;
}

export default function CaptionBox({ result, fileUrl, onOpenDrawer }: Props) {
  const [caption, setCaption] = useState('');
  const [copied, setCopied] = useState(false);

  // The caption stays editable, so it is seeded from each new result.
  useEffect(() => {
    if (result) setCaption(result.caption);
  }, [result]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(caption);
    } catch {
      // Clipboard access is blocked outside a secure context, so fall back
      // to a selection the user can copy with the keyboard.
      const area = document.createElement('textarea');
      area.value = caption;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!result) {
    return (
      <div className="rounded-2xl border border-dashed border-edge bg-panel/50 p-8 text-center text-slate-400">
        <Eye className="mx-auto mb-3 h-6 w-6" />
        <p className="font-medium text-slate-300">No post yet</p>
        <p className="mt-1 text-sm">
          Your caption and carousel preview appear here once a generation finishes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-edge bg-panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
          LinkedIn caption
        </h2>
        <span className="rounded-full border border-edge px-3 py-1 text-xs text-slate-400">
          {result.templateName}
        </span>
      </div>

      <textarea
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
        rows={16}
        className="w-full resize-y rounded-xl border border-edge bg-ink p-4 text-sm leading-relaxed outline-none focus:border-accent"
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={copy}
          className="flex items-center justify-center gap-2 rounded-xl border border-edge bg-ink px-4 py-3 text-sm font-semibold transition hover:border-accent"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <ClipboardCopy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy text to clipboard'}
        </button>

        {fileUrl && (
          <a
            href={fileUrl}
            download={result.fileName}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-600"
          >
            <Download className="h-4 w-4" />
            Download {result.mimeType === 'application/pdf' ? 'PDF' : 'PNG'}
          </a>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenDrawer}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-edge px-4 py-3 text-sm font-semibold transition hover:border-accent"
      >
        <Eye className="h-4 w-4" />
        Open slide preview
        {result.slideCount > 0 && (
          <span className="text-slate-400">
            ({result.slideCount} {result.slideCount === 1 ? 'slide' : 'slides'})
          </span>
        )}
      </button>

      {result.warnings.length > 0 && (
        <ul className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {result.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
