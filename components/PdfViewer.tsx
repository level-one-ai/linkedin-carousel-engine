'use client';

import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Loader2 } from 'lucide-react';

// The worker is bundled from the local pdfjs-dist copy that react-pdf depends
// on, so the preview keeps working with no outbound network access.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface Props {
  fileUrl: string;
}

export default function PdfViewer({ fileUrl }: Props) {
  const [pageCount, setPageCount] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
        The PDF could not be rendered in the browser. The download button still works.
      </p>
    );
  }

  return (
    <Document
      file={fileUrl}
      onLoadSuccess={({ numPages }) => setPageCount(numPages)}
      onLoadError={() => setFailed(true)}
      loading={
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading slides
        </div>
      }
      className="space-y-6"
    >
      {Array.from({ length: pageCount }, (_, index) => (
        <div key={index} className="pdf-page">
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">
            Slide {index + 1} of {pageCount}
          </div>
          {/* width is set by the drawer container; react-pdf scales the canvas to it. */}
          <Page
            pageNumber={index + 1}
            width={420}
            renderAnnotationLayer={false}
            renderTextLayer={false}
          />
        </div>
      ))}
    </Document>
  );
}
