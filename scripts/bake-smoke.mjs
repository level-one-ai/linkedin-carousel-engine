#!/usr/bin/env node
/**
 * Bakes the smoke texture into the three templates that use it.
 *
 * Why: the smoke was an inline SVG `feTurbulence` filter, drawn live on every
 * slide. Chromium cannot express a filter in a PDF, so it renders one to a
 * bitmap and embeds that — at the size the element is *painted*, which is
 * 1080x1350, once per slide. Shrinking the SVG's `viewBox` did not help,
 * because the viewBox is a coordinate space and not a resolution. Measured on
 * a realistic eight slide payload:
 *
 *     noir 9.8MB    mist 23.3MB    slate 9.5MB
 *
 * The `asset` field in `generated_posts` holds 10MB. Mist could never be
 * saved, and the other two were one dense slide away from the same.
 *
 * So the filter is run once, here, composited onto the design's own background
 * colour, and written into the template as a JPEG data URI. Around 30KB each.
 * Compositing is what makes it small: an alpha channel is most of a PNG of
 * soft grey noise, and once the smoke sits on its final colour there is no
 * transparency left to store.
 *
 * Smoke has no hard edges, so a 720x900 raster stretched to 1080x1350 is
 * indistinguishable from one drawn at full size.
 *
 * Run:  node scripts/bake-smoke.mjs
 *
 * The output is committed. This only needs running again if the smoke itself
 * is being redesigned, which is why the filter parameters live here now: they
 * are no longer in the templates to read back.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');

/** The raster written into each template. Smoke is soft; this is plenty. */
const WIDTH = 720;
const HEIGHT = 900;
const QUALITY = 88;

/**
 * The coordinate box the filters were authored in, and the page they were
 * painted onto.
 *
 * These matter because turbulence is scale dependent. `baseFrequency` is per
 * coordinate unit, so the same number in a 270 unit box stretched to 1080px
 * gives blobs four times the size it gives in a 720 unit box stretched to the
 * same width. Baking at a different resolution without correcting for that
 * keeps the colours and loses the design: soft drifting smoke turns into a
 * fine busy mottle.
 *
 * So the frequency and the blur are rescaled below to hold the feature size in
 * *page* pixels exactly where it was, and the raster resolution above becomes
 * free to choose on file size alone.
 */
const SOURCE_BOX = 270;

/** Turbulence frequency that puts the blobs back where they were on the page. */
function scaledFrequency(baseFrequency) {
  return (baseFrequency * SOURCE_BOX) / WIDTH;
}

/** Blur radius that puts the softness back where it was on the page. */
function scaledBlur(blur) {
  return (blur * WIDTH) / SOURCE_BOX;
}

/**
 * The filter each design used, lifted verbatim from the templates before the
 * bake, plus the background it sits on and the opacity it was drawn at.
 */
const DESIGNS = [
  {
    key: 'noir',
    // What the raster is drawn on, so the smoke ends up composited onto its
    // final colour and needs no alpha channel.
    bakeBackground: '#0d0d0c',
    // What .slide's background becomes. The colour behind the image matters
    // only if the image ever fails to decode.
    fallback: '#0d0d0c',
    opacity: 0.3,
    baseFrequency: 0.022,
    seed: 11,
    blur: 6.5,
    matrix: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.1 0 0 0 -0.18',
  },
  {
    key: 'mist',
    bakeBackground: '#ffffff',
    fallback: '#ffffff',
    opacity: 0.4,
    baseFrequency: 0.017,
    seed: 19,
    blur: 6,
    matrix: '0 0 0 0 0.62  0 0 0 0 0.62  0 0 0 0 0.62  1.1 0 0 0 -0.18',
  },
  {
    key: 'slate',
    // Slate's page is a gradient rather than a flat colour, so the gradient is
    // baked in with the smoke and the slide keeps only the image.
    bakeBackground: 'linear-gradient(168deg, #55534f 0%, #302f2c 62%, #232220 100%)',
    fallback: '#302f2c',
    opacity: 0.42,
    baseFrequency: 0.019,
    seed: 29,
    blur: 6.5,
    matrix: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.1 0 0 0 -0.18',
  },
];

function chromiumPath() {
  return process.env.PDF_CHROMIUM_PATH || undefined;
}

async function bake(browser, design) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  await page.setContent(`<!doctype html>
    <style>
      html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
                   background: ${design.bakeBackground}; }
      svg { display: block; opacity: ${design.opacity}; }
    </style>
    <svg width="${WIDTH}" height="${HEIGHT}">
      <filter id="smoke" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="${scaledFrequency(design.baseFrequency)}"
                      numOctaves="5" seed="${design.seed}" result="noise" />
        <feColorMatrix in="noise" type="matrix" values="${design.matrix}" result="tinted" />
        <feGaussianBlur in="tinted" stdDeviation="${scaledBlur(design.blur)}" />
      </filter>
      <rect width="100%" height="100%" filter="url(#smoke)" />
    </svg>`);

  const jpeg = await page.screenshot({ type: 'jpeg', quality: QUALITY });
  await page.close();

  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

/**
 * Rewrites one template around the baked image.
 *
 * Four edits: the texture rules become the background of the slide itself, the
 * filter definitions go, and the per-slide texture element goes with them.
 */
function rewrite(html, dataUri, fallback) {
  let out = html;

  // 1. The .texture rules, which have nothing left to style.
  out = out.replace(
    /  \/\* ---- Texture[\s\S]*?\.texture svg \{[^}]*\}\n/,
    `  /* ---- Texture --------------------------------------------------------
     The smoke is baked into .slide's background by scripts/bake-smoke.mjs.
     It was an SVG turbulence filter, which Chromium rasterises into the PDF
     once per slide at full page size — 9 to 23MB a carousel, past the 10MB
     the file field holds. A JPEG costs about 30KB and looks the same. */\n`,
  );

  // 2. The z-index guard no longer has a .texture to exclude.
  out = out.replace(/\.slide > \*:not\(\.texture\) \{[^}]*\}/, '.slide > * { position: relative; }');

  // 3. The slide's own background gains the image.
  const slideBlock = out.match(/\n  \.slide \{[\s\S]*?\n  \}/);
  if (!slideBlock) throw new Error('could not find the .slide block');
  out = out.replace(
    slideBlock[0],
    slideBlock[0].replace(
      /background: [^;]+;/,
      `background: ${fallback} url("${dataUri}") center / cover no-repeat;`,
    ),
  );

  // 4. The filter definitions and the element that referenced them.
  out = out.replace(/\n<!-- Filter definitions[\s\S]*?<\/svg>\n/, '\n');
  out = out.replace(/\n  <div class="texture">[\s\S]*?<\/div>\n/, '\n');

  return out;
}

async function main() {
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ['--no-sandbox'],
  });

  try {
    for (const design of DESIGNS) {
      const file = join(TEMPLATES, `level_one_${design.key}.html`);
      const before = readFileSync(file, 'utf8');

      if (!/feTurbulence/.test(before)) {
        console.log(`${design.key}: already baked, skipping`);
        continue;
      }

      const dataUri = await bake(browser, design);
      const after = rewrite(before, dataUri, design.fallback);
      writeFileSync(file, after);

      console.log(
        `${design.key}: ${(before.length / 1024).toFixed(1)}KB -> ` +
          `${(after.length / 1024).toFixed(1)}KB ` +
          `(image ${(((dataUri.length * 3) / 4 / 1024) | 0)}KB)`,
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
