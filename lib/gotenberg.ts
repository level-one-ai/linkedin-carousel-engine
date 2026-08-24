import { config } from './config';
import type { PostMode } from './types';

/** LinkedIn's 4:5 portrait canvas, in CSS pixels. */
export const SLIDE_WIDTH_PX = 1080;
export const SLIDE_HEIGHT_PX = 1350;

/** Gotenberg expects page dimensions in inches, and Chromium renders at 96 DPI. */
const CHROMIUM_DPI = 96;
const PAGE_WIDTH_IN = SLIDE_WIDTH_PX / CHROMIUM_DPI;
const PAGE_HEIGHT_IN = SLIDE_HEIGHT_PX / CHROMIUM_DPI;

export interface ConversionResult {
  buffer: Buffer;
  mimeType: string;
  extension: 'pdf' | 'png';
}

async function post(url: string, form: FormData): Promise<Response> {
  const response = await fetch(url, {
    method: 'POST',
    body: form,
    // A large carousel with web fonts can take a while on a cold container.
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Gotenberg returned ${response.status} ${response.statusText} for ${url}. ${detail.slice(0, 500)}`,
    );
  }
  return response;
}

/**
 * Sends the populated HTML to the local Gotenberg container and returns the
 * compiled binary: a multi-page PDF for carousels, or a single PNG for image posts.
 */
export async function convertHtml(html: string, postMode: PostMode): Promise<ConversionResult> {
  if (postMode === 'image') {
    // Screenshot route: same container, a single PNG instead of a PDF stream.
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('width', String(SLIDE_WIDTH_PX));
    form.append('height', String(SLIDE_HEIGHT_PX));
    form.append('format', 'png');
    form.append('optimizeForSpeed', 'false');
    form.append('waitDelay', '1s');

    const response = await post(`${config.gotenbergUrl}/forms/chromium/screenshot/html`, form);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: 'image/png',
      extension: 'png',
    };
  }

  const form = new FormData();
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');

  // Exact page geometry. printBackground keeps the slide backgrounds visible.
  form.append('paperWidth', String(PAGE_WIDTH_IN));
  form.append('paperHeight', String(PAGE_HEIGHT_IN));
  form.append('marginTop', '0');
  form.append('marginBottom', '0');
  form.append('marginLeft', '0');
  form.append('marginRight', '0');
  form.append('preferCssPageSize', 'true');
  form.append('printBackground', 'true');
  form.append('scale', '1');
  // Give web fonts and layout a moment to settle before the snapshot is taken.
  form.append('waitDelay', '1s');

  const response = await post(`${config.gotenbergUrl}/forms/chromium/convert/html`, form);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: 'application/pdf',
    extension: 'pdf',
  };
}

/** Lightweight readiness probe used by the dashboard health strip. */
export async function gotenbergHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`${config.gotenbergUrl}/health`, {
      signal: AbortSignal.timeout(4_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
