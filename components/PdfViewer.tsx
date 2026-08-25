'use client';

import { useEffect, useRef, useState } from 'react';
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

/**
 * A carousel, one slide at a time.
 *
 * A plain iframe would show the same PDF in the browser's own viewer, but a
 * carousel is a sequence of frames rather than a document — seeing each slide
 * as its own numbered card is what makes it checkable before publishing.
 */
export default function PdfViewer({
  fileUrl,
  downloadUrl,
}: {
  fileUrl: string;
  /** Offered when the PDF cannot be rendered in this browser. */
  downloadUrl?: string;
}) {
  const [pageCount, setPageCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  // react-pdf renders each page into a fixed-width canvas, so the width has to
  // be a number rather than a CSS rule. Measuring the container keeps the
  // slides inside it on a phone as well as on a desktop.
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (failed) {
    return (
      <div className="card">
        <p className="text-fluid-sm font-semibold text-foreground">Could not display the slides</p>
        <p className="mt-2 text-fluid-sm text-muted">
          The PDF could not be rendered in this browser. Downloading it still works.
        </p>
        {downloadUrl ? (
          <a href={downloadUrl} className="btn-ghost mt-4 !px-5 !py-2 !text-fluid-xs">
            Download PDF
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={holder}>
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages }) => setPageCount(numPages)}
      onLoadError={() => setFailed(true)}
      loading={
        <div className="flex items-center justify-center gap-2 py-16 text-fluid-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading slides
        </div>
      }
      className="space-y-5"
    >
      {Array.from({ length: pageCount }, (_, index) => (
        <div key={index} className="pdf-page">
          <div className="mb-1.5 text-fluid-xs uppercase tracking-widest text-muted">
            Slide {index + 1} of {pageCount}
          </div>
          {width > 0 ? (
            <Page
              pageNumber={index + 1}
              width={width}
              renderAnnotationLayer={false}
              renderTextLayer={false}
            />
          ) : null}
        </div>
      ))}
      </Document>
    </div>
  );
}
