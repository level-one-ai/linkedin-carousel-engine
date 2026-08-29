import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { chromium, type Browser, type Page } from 'playwright-core';

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

/**
 * The page a design is drawn on.
 *
 * Not a constant any more. LinkedIn wants 4:5, Instagram is square, X is
 * widescreen — and a design laid out for one and cropped into another is a
 * design nobody drew. Each template declares its own size and the renderer
 * reads it.
 */
export interface SlideSize {
  width: number;
  height: number;
}

/** What a design is assumed to be when it does not say. */
export const DEFAULT_SLIDE_SIZE: SlideSize = { width: 1080, height: 1350 };

/** Chromium lays out CSS pixels at 96 DPI, so page size is stated in inches. */
const CHROMIUM_DPI = 96;

function pageInches(size: SlideSize) {
  return {
    width: `${size.width / CHROMIUM_DPI}in`,
    height: `${size.height / CHROMIUM_DPI}in`,
  };
}

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
 * Browsers reachable through PATH.
 *
 * The fixed list below covers a browser installed by a package manager into a
 * predictable place. Nix does not work that way: `chromium` from nixpkgs lands
 * in /nix/store under a hashed path that cannot be written down in advance, and
 * is reached only because the build puts it on PATH. That is what a Nixpacks
 * build gives you, so without this the browser it installed would be invisible.
 */
function pathChromiums(): string[] {
  const entries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const names = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome'];
  return entries.flatMap((dir) => names.map((name) => path.join(dir, name)));
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
    // Last, because a browser on PATH is more likely to be a wrapper script or
    // a snap shim than the fixed locations above are.
    ...pathChromiums(),
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

/**
 * One slide as a picture, in one of the two shapes the networks want.
 *
 * "portrait" is the slide as designed, 4:5, which Facebook and Instagram post
 * as it is. "wide" is the top of the same slide cropped to 16:9 for X, whose
 * timeline puts bars down both sides of a 4:5 image.
 */
export interface SlideImage {
  slide: number;
  shape: 'portrait' | 'wide';
  buffer: Buffer;
}

export interface RenderResult {
  asset: RenderedAsset;
  /** Slide one as a JPEG, for the history cards. */
  thumbnail: Buffer;
  /** Every slide as a picture, for the networks that post images. Carousels only. */
  images: SlideImage[];
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
/**
 * Every slide as a picture, for the networks that post images rather than a
 * document.
 *
 * LinkedIn takes the PDF. Facebook and Instagram take the slide as it is, at
 * its native 4:5. X is the exception: a 4:5 image is shown in the timeline with
 * bars down both sides, so each slide is cropped to 16:9 from the top, where
 * the heading is.
 *
 * JPEG rather than PNG. Eight slides times two sizes is sixteen images on one
 * record, and a slide is photographic enough — smoke gradients, a photograph on
 * the portrait design — that lossless costs several megabytes for no visible
 * gain.
 */
async function captureSlideImages(page: Page): Promise<SlideImage[]> {
  const slides = page.locator('.slide');
  const count = await slides.count();
  const images: SlideImage[] = [];

  for (let index = 0; index < count; index += 1) {
    const slide = slides.nth(index);

    images.push({
      slide: index + 1,
      shape: 'portrait',
      buffer: Buffer.from(
        await slide.screenshot({ type: 'jpeg', quality: SLIDE_IMAGE_QUALITY, scale: 'css' }),
      ),
    });

    const box = await slide.boundingBox();
    if (!box) continue;

    // Cropped from the middle rather than the top. The designs do not agree on
    // where the content sits — cream centres its cover, noir hangs it from the
    // top, sand anchors it to the bottom — so taking the top band gives an
    // empty rectangle on some of them. The middle is the one band that holds
    // something on all six.
    const wideHeight = Math.round((box.width * 9) / 16);

    images.push({
      slide: index + 1,
      shape: 'wide',
      buffer: Buffer.from(
        await page.screenshot({
          type: 'jpeg',
          quality: SLIDE_IMAGE_QUALITY,
          scale: 'css',
          clip: {
            x: box.x,
            y: box.y + Math.max(0, Math.round((box.height - wideHeight) / 2)),
            width: box.width,
            height: wideHeight,
          },
        }),
      ),
    });
  }

  return images;
}

export async function renderSlides(
  html: string,
  postMode: PostMode,
  size: SlideSize = DEFAULT_SLIDE_SIZE,
): Promise<RenderResult> {
  const browser = await launch();

  try {
    const page = await browser.newPage({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
    });

    // The templates inline everything — styles included — so there is nothing
    // to fetch. "load" is enough and cannot hang on a request that never comes.
    await page.setContent(html, { waitUntil: 'load' });

    // Fit the copy before anything is captured, so the thumbnail, the PNG and
    // the PDF all show the same slides.
    const overflowingSlides = await fitSlides(page, size.width, size.height, MIN_SLIDE_ZOOM);

    // The thumbnail is slide one, taken before print emulation so it matches
    // what the browser shows rather than what the printer would.
    const firstSlide = page.locator('.slide').first();
    const thumbnail = Buffer.from(
      (await firstSlide.count()) > 0
        ? await firstSlide.screenshot({ type: 'jpeg', quality: THUMBNAIL_QUALITY, scale: 'css' })
        : await page.screenshot({
            type: 'jpeg',
            quality: THUMBNAIL_QUALITY,
            clip: { x: 0, y: 0, width: size.width, height: size.height },
          }),
    );

    if (postMode === 'image') {
      const shot = Buffer.from(
        await page.screenshot({
          type: 'png',
          clip: { x: 0, y: 0, width: size.width, height: size.height },
        }),
      );

      return {
        asset: { buffer: shot, mimeType: 'image/png', extension: 'png', slideCount: 1 },
        thumbnail,
        images: [],
        overflowingSlides,
      };
    }

    // The image set for the networks that take pictures rather than a
    // document. Taken here, from the page that is already open and already
    // fitted, so a generation launches one browser rather than two.
    const images = await captureSlideImages(page);

    // Chromium only applies @media print rules, and the @page size, when told
    // to emulate print. Gotenberg did this for us; here it has to be said.
    await page.emulateMedia({ media: 'print' });

    const pdf = Buffer.from(
      await page.pdf({
        ...pageInches(size),
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
      images,
      overflowingSlides,
    };
  } finally {
    // Always close, even if rendering threw — a leaked Chromium is several
    // hundred MB that never comes back.
    await browser.close().catch(() => {});
  }
}

/** Longest edge of a stored card thumbnail. */
const THUMBNAIL_WIDTH_PX = 432;

/**
 * Redraws an image at a given width.
 *
 * Two callers, one reason: a picture that arrives at whatever size it happens
 * to be has to be brought down to the size it is actually shown at before it
 * goes anywhere near a size limit.
 *
 * Doing this in the slide template instead would be expensive in the wrong
 * place. Chromium cannot express a CSS filter or a scaled-down source in a PDF
 * without rasterising it at full page resolution, which is how a 961KB
 * photograph once turned an 8 slide carousel into 6.3MB against a 10MB field.
 * Same lesson as the smoke textures.
 */
async function redrawImage(
  image: Buffer,
  mimeType: string,
  options: { width: number; quality: number; transparent?: boolean },
): Promise<PreparedImage> {
  const browser = await launch();

  try {
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.width },
      deviceScaleFactor: 1,
    });

    await page.setContent(
      // A transparent source gets no background painted behind it. Painting one
      // and saving as JPEG — which has no alpha channel at all — turns a
      // cut-out figure into a figure inside a #faf9f6 rectangle, which then
      // sits as a visible box on a slide of any other colour.
      `<style>html,body{margin:0;padding:0` +
        `${options.transparent ? '' : ';background:#faf9f6'}}` +
        `img{display:block;width:${options.width}px;height:auto}</style>` +
        `<img id="t" src="data:${mimeType};base64,${image.toString('base64')}">`,
      { waitUntil: 'load' },
    );

    // A data URI image can still be decoding when "load" fires.
    await page.waitForFunction(() => {
      const img = document.getElementById('t') as HTMLImageElement | null;
      return Boolean(img?.complete && img.naturalWidth > 0);
    }, undefined, { timeout: 20_000 });

    const natural = await page.evaluate(
      () => (document.getElementById('t') as HTMLImageElement).naturalWidth,
    );

    // Never enlarge. Blowing a small source up to the target width costs a
    // bigger file for the same detail, and the slide can scale it just as
    // badly for free.
    const width = Math.min(options.width, natural);
    if (width !== options.width) {
      await page.evaluate((w) => {
        (document.getElementById('t') as HTMLImageElement).style.width = `${w}px`;
      }, width);
    }

    const box = await page.locator('#t').boundingBox();
    const height = Math.max(1, Math.round(box?.height ?? width));
    await page.setViewportSize({ width, height });

    const clip = { x: 0, y: 0, width, height };

    if (options.transparent) {
      return {
        buffer: Buffer.from(await page.screenshot({ type: 'png', omitBackground: true, clip })),
        mimeType: 'image/png',
        width,
      };
    }

    return {
      buffer: Buffer.from(
        await page.screenshot({ type: 'jpeg', quality: options.quality, clip }),
      ),
      mimeType: 'image/jpeg',
      width,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Shrinks an uploaded picture down to a card thumbnail.
 *
 * Carousel thumbnails come free, as a screenshot of slide one taken during the
 * render that was happening anyway. An uploaded image has no such render to
 * borrow from, and a 4MB PNG out of an image generator cannot go straight into
 * the 2MB thumbnail field, so this is the one case that pays for its own
 * browser launch.
 */
export async function scaleThumbnail(image: Buffer, mimeType: string): Promise<Buffer> {
  // Always JPEG. A thumbnail is drawn on the history card's own background and
  // has a 2MB field to fit, which is what the format was chosen for.
  const { buffer } = await redrawImage(image, mimeType, {
    width: THUMBNAIL_WIDTH_PX,
    quality: THUMBNAIL_QUALITY,
  });
  return buffer;
}

const SLIDE_IMAGE_QUALITY = 84;

/**
 * The widest a template image is drawn on a slide.
 *
 * Not the slide width: no design puts a picture across the full page any
 * more, and this is the number that keeps a transparent cut-out affordable,
 * since it has to be a PNG and a PNG of a photograph is many times the size of
 * the same photograph as a JPEG.
 */
const TEMPLATE_IMAGE_WIDTH_PX = 640;

/**
 * Formats that can carry an alpha channel.
 *
 * A cut-out arrives as one of these. A JPEG cannot be transparent, so a
 * photograph with its background still on takes the cheaper path.
 */
const TRANSPARENT_CAPABLE = new Set(['image/png', 'image/webp', 'image/avif']);

export interface PreparedImage {
  buffer: Buffer;
  mimeType: string;
  /** What it actually came out at, which is the source width when that is smaller. */
  width: number;
}

/**
 * A template image at the size a slide shows it.
 *
 * No black and white copy is made here. The portrait design takes two uploaded
 * files — the colour photograph and a black and white one — so a conversion
 * done here would be a second guess at something already supplied, and would
 * cost a browser page per image on every generation for nothing.
 */
export async function prepareSlideImage(
  image: Buffer,
  mimeType: string,
): Promise<PreparedImage> {
  return redrawImage(image, mimeType, {
    width: TEMPLATE_IMAGE_WIDTH_PX,
    quality: SLIDE_IMAGE_QUALITY,
    transparent: TRANSPARENT_CAPABLE.has(mimeType.toLowerCase()),
  });
}

export interface RendererDiagnosis {
  available: boolean;
  /** The browser that would be used, whether or not it is actually there. */
  path?: string;
  /** Why there is no browser, phrased for the person reading the screen. */
  reason?: string;
}

/**
 * Readiness probe for the dashboard: is there a browser to render with, and if
 * not, which of the two very different reasons is it.
 *
 * "No browser is installed" and "PDF_CHROMIUM_PATH points at a file that is not
 * there" have nothing in common as remedies — the first is a deployment that
 * did not use the Dockerfile, the second is one setting with a typo in it — and
 * reporting both as "no Chromium found" sends people looking in the wrong
 * place. So the distinction is made here and carried through /api/health to the
 * warning box, rather than being left for someone to work out.
 */
export function rendererDiagnosis(): RendererDiagnosis {
  const explicit = process.env.PDF_CHROMIUM_PATH?.trim();

  if (explicit) {
    if (existsSync(explicit)) return { available: true, path: explicit };
    return {
      available: false,
      path: explicit,
      reason:
        `PDF_CHROMIUM_PATH is set to "${explicit}", but there is no file there, ` +
        'so slides cannot be rendered. Either correct that setting or remove it ' +
        'and let the app find a browser itself.',
    };
  }

  const found = executablePath();
  if (found) return { available: true, path: found };

  return {
    available: false,
    reason:
      'No Chrome or Chromium is installed on this server, so slides cannot be ' +
      'rendered. If this is a Coolify deployment, the Build Pack is not using ' +
      'the Dockerfile: set it to Dockerfile and deploy again.',
  };
}

/** Readiness probe for the dashboard: is there a browser to render with. */
export function rendererAvailable(): boolean {
  return rendererDiagnosis().available;
}
