import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { chromium, type Browser } from 'playwright-core';

import type { PostMode } from './types';

/**
 * Turns finished slide HTML into a LinkedIn carousel PDF or a single PNG,
 * using headless Chromium directly.
 *
 * This is the same engine Gotenberg wraps in a Docker container — Gotenberg is
 * a headless Chromium with an HTTP API in front of it. Driving it here gives
 * identical output with no second service to deploy and no network hop, which
 * is what lets the whole system run as one Coolify application. The trade is
 * that a Chromium has to exist wherever this app runs, which is why the
 * Dockerfile installs one.
 */

/** LinkedIn's 4:5 portrait canvas, in CSS pixels. */
export const SLIDE_WIDTH_PX = 1080;
export const SLIDE_HEIGHT_PX = 1350;

/** Chromium lays out CSS pixels at 96 DPI, so page size is stated in inches. */
const CHROMIUM_DPI = 96;
const PAGE_WIDTH_IN = `${SLIDE_WIDTH_PX / CHROMIUM_DPI}in`;
const PAGE_HEIGHT_IN = `${SLIDE_HEIGHT_PX / CHROMIUM_DPI}in`;

/**
 * Card thumbnails are JPEG, not PNG. Slide one is a full 1080x1350 frame, and
 * the gradient template renders to a 630KB PNG because a smooth gradient is the
 * worst case for lossless compression. The same frame as quality-72 JPEG is
 * around 60KB, which is what the history grid loads on every visit.
 */
const THUMBNAIL_QUALITY = 72;

/**
 * How far a slide is allowed to shrink to make its content fit. Below this the
 * text is too small to read on a phone, so the slide is left overflowing and
 * the caller is told rather than shipping something illegible.
 */
const MIN_SLIDE_ZOOM = 0.72;

export interface RenderedAsset {
  buffer: Buffer;
  mimeType: string;
  extension: 'pdf' | 'png';
  /** Pages in the PDF, or 1 for an image post. */
  slideCount: number;
}

/**
 * Chromium builds Playwright has already downloaded, if any.
 * The folder is named per build (chromium-1194), so the version is discovered
 * rather than pinned — a Playwright upgrade must not break rendering.
 */
function playwrightChromiums(root: string): string[] {
  try {
    return readdirSync(root)
      .filter((entry) => entry.startsWith('chromium-'))
      .flatMap((entry) => [
        path.join(root, entry, 'chrome-linux', 'chrome'),
        path.join(root, entry, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        path.join(root, entry, 'chrome-win', 'chrome.exe'),
      ]);
  } catch {
    return [];
  }
}

/**
 * Finds a Chromium to render with.
 *
 * Most machines already have Google Chrome or Edge installed, so this looks for
 * one before asking anyone to download 150MB. PDF_CHROMIUM_PATH always wins
 * when it is set, which is how the Docker image states its own copy.
 */
export function executablePath(): string | undefined {
  const explicit = process.env.PDF_CHROMIUM_PATH?.trim();
  if (explicit) return explicit;

  const browsersRoot =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');

  const candidates = [
    ...playwrightChromiums(browsersRoot),
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function describeLaunchFailure(err: unknown): Error {
  const message = String((err as Error)?.message ?? err);

  if (/Executable doesn't exist|browserType.launch|ENOENT/i.test(message)) {
    return new Error(
      'Could not find a Chrome or Chromium to render the slides.\n' +
        'If you have Google Chrome installed, set PDF_CHROMIUM_PATH in .env.local\n' +
        'to point at it. Otherwise install one once with:\n' +
        '  npx playwright install --with-deps chromium',
    );
  }
  if (/libnss3|libatk|shared librar/i.test(message)) {
    return new Error(
      'Chromium is installed but is missing some system libraries.\n' +
        'Install them with:  npx playwright install-deps chromium\n' +
        `Original error: ${message}`,
    );
  }
  return new Error(`Could not render the slides: ${message}`);
}

/**
 * Counts pages without a PDF parser. Chromium writes one /Type /Page object per
 * sheet, and /Type /Pages (plural) once for the tree — the negative lookahead
 * is what keeps the tree node out of the count.
 */
export function countPages(pdf: Buffer): number {
  const matches = pdf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g);
  return matches ? matches.length : 1;
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({
      executablePath: executablePath(),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (err) {
    throw describeLaunchFailure(err);
  }
}

export interface RenderResult {
  asset: RenderedAsset;
  /** Slide one as a JPEG, for the history cards. */
  thumbnail: Buffer;
  /** Slides that could not be made to fit even at the minimum zoom. */
  overflowingSlides: number[];
}

/**
 * Shrinks any slide whose content runs past the bottom of the canvas.
 *
 * Slide copy is written by a language model against a word budget, not a
 * pixel budget, so a heading that runs to three lines plus four bullets can
 * overflow 1350px. The slide has `overflow: hidden`, which means the overflow
 * does not look broken — it looks like the last bullet was never written. That
 * is the worst possible failure for something about to be published.
 *
 * `zoom` is used rather than `transform: scale()` because zoom reflows the
 * text; scale would just shrink an already-wrapped block. The width and height
 * are divided by the same factor so the rendered box stays exactly
 * 1080x1350 after zoom is applied.
 *
 * Runs in the page, so it is stringified — no closure over anything here.
 */
async function fitSlides(
  page: import('playwright-core').Page,
  width: number,
  height: number,
  minZoom: number,
): Promise<number[]> {
  return page.evaluate(
    ({ width, height, minZoom }) => {
      const overflowing: number[] = [];
      const slides = Array.from(document.querySelectorAll<HTMLElement>('.slide'));

      slides.forEach((slide, index) => {
        if (slide.scrollHeight <= slide.clientHeight + 1) return;

        let zoom = 1;
        while (zoom > minZoom) {
          zoom = Math.round((zoom - 0.02) * 100) / 100;
          slide.style.zoom = String(zoom);
          slide.style.width = `${width / zoom}px`;
          slide.style.height = `${height / zoom}px`;
          if (slide.scrollHeight <= slide.clientHeight + 1) return;
        }

        overflowing.push(index + 1);
      });

      return overflowing;
    },
    { width, height, minZoom },
  );
}

/**
 * Renders the populated HTML once, producing both the deliverable and its
 * thumbnail from a single browser launch.
 *
 * Both come out of one page load on purpose: starting Chromium twice for the
 * same HTML would roughly double the slowest step in the pipeline.
 */
export async function renderSlides(html: string, postMode: PostMode): Promise<RenderResult> {
  const browser = await launch();

  try {
    const page = await browser.newPage({
      viewport: { width: SLIDE_WIDTH_PX, height: SLIDE_HEIGHT_PX },
      deviceScaleFactor: 1,
    });

    // The templates inline everything — styles included — so there is nothing
    // to fetch. "load" is enough and cannot hang on a request that never comes.
    await page.setContent(html, { waitUntil: 'load' });

    // Fit the copy before anything is captured, so the thumbnail, the PNG and
    // the PDF all show the same slides.
    const overflowingSlides = await fitSlides(page, SLIDE_WIDTH_PX, SLIDE_HEIGHT_PX, MIN_SLIDE_ZOOM);

    // The thumbnail is slide one, taken before print emulation so it matches
    // what the browser shows rather than what the printer would.
    const firstSlide = page.locator('.slide').first();
    const thumbnail = Buffer.from(
      (await firstSlide.count()) > 0
        ? await firstSlide.screenshot({ type: 'jpeg', quality: THUMBNAIL_QUALITY, scale: 'css' })
        : await page.screenshot({
            type: 'jpeg',
            quality: THUMBNAIL_QUALITY,
            clip: { x: 0, y: 0, width: SLIDE_WIDTH_PX, height: SLIDE_HEIGHT_PX },
          }),
    );

    if (postMode === 'image') {
      const shot = Buffer.from(
        await page.screenshot({
          type: 'png',
          clip: { x: 0, y: 0, width: SLIDE_WIDTH_PX, height: SLIDE_HEIGHT_PX },
        }),
      );

      return {
        asset: { buffer: shot, mimeType: 'image/png', extension: 'png', slideCount: 1 },
        thumbnail,
        overflowingSlides,
      };
    }

    // Chromium only applies @media print rules, and the @page size, when told
    // to emulate print. Gotenberg did this for us; here it has to be said.
    await page.emulateMedia({ media: 'print' });

    const pdf = Buffer.from(
      await page.pdf({
        width: PAGE_WIDTH_IN,
        height: PAGE_HEIGHT_IN,
        printBackground: true,
        // The templates own their geometry through @page, so Chromium adds none.
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        scale: 1,
      }),
    );

    return {
      asset: {
        buffer: pdf,
        mimeType: 'application/pdf',
        extension: 'pdf',
        slideCount: countPages(pdf),
      },
      thumbnail,
      overflowingSlides,
    };
  } finally {
    // Always close, even if rendering threw — a leaked Chromium is several
    // hundred MB that never comes back.
    await browser.close().catch(() => {});
  }
}

/** Readiness probe for the dashboard: is there a browser to render with. */
export function rendererAvailable(): boolean {
  return Boolean(executablePath());
}
