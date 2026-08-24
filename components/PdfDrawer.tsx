'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Download, Loader2, X } from 'lucide-react';

// react-pdf touches browser only APIs, so it is loaded on the client alone.
const PdfViewer = dynamic(() => import('./PdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      Preparing preview
    </div>
  ),
});

interface Props {
  open: boolean;
  onClose: () => void;
  fileUrl: string | null;
  fileName: string;
  mimeType: string;
  slideCount: number;
}

export default function PdfDrawer({
  open,
  onClose,
  fileUrl,
  fileName,
  mimeType,
  slideCount,
}: Props) {
  // Escape closes the drawer, and the page behind it stops scrolling while open.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  const isPdf = mimeType === 'application/pdf';

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-label="Slide preview"
        aria-modal="true"
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-edge bg-panel shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-edge p-5">
          <div>
            <h2 className="font-semibold">Slide preview</h2>
            <p className="text-xs text-slate-400">
              {slideCount > 0
                ? `${slideCount} ${slideCount === 1 ? 'frame' : 'frames'} at 1080 x 1350`
                : '1080 x 1350'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {!fileUrl && <p className="py-16 text-center text-slate-400">Nothing to preview yet.</p>}
          {fileUrl && isPdf && <PdfViewer fileUrl={fileUrl} />}
          {fileUrl && !isPdf && (
            // Image mode returns a single PNG, which needs no PDF worker at all.
            <img
              src={fileUrl}
              alt="Generated post graphic"
              className="w-full rounded-lg shadow-2xl"
            />
          )}
        </div>

        {fileUrl && (
          <footer className="border-t border-edge p-5">
            <a
              href={fileUrl}
              download={fileName}
              className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-white transition hover:bg-blue-600"
            >
              <Download className="h-4 w-4" />
              Download {isPdf ? 'PDF' : 'PNG'}
            </a>
          </footer>
        )}
      </aside>
    </>
  );
}
