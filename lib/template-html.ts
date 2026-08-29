/**
 * Guards against a slide design that cannot render.
 *
 * `raw_html` is an `editor` field, which the PocketBase admin UI puts a rich
 * text editor in front of. A rich text editor assumes you are writing prose, so
 * a template pasted into it comes back changed: either escaped into visible
 * text (`&lt;style&gt;`), or wrapped in paragraphs with the newlines turned
 * into `<br>`. Neither is a failure anything notices. Chromium is handed the
 * result, renders the source code as words on one page, and a post is saved
 * that says "Carousel, 1 slides".
 *
 * Both shapes are repairable, and a template that is damaged some other way is
 * at least detectable, which is what this module is for.
 */

const ENTITIES: Array<[RegExp, string]> = [
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#0*39;|&apos;/g, "'"],
  [/&nbsp;/g, ' '],
  // Last, so an escaped entity inside the template ("&amp;lt;") survives one
  // pass rather than being decoded twice.
  [/&amp;/g, '&'],
];

/** Does this string contain real markup, as opposed to a description of it. */
function hasRealTags(html: string): boolean {
  return /<(style|section|div|meta|svg|html|body)\b/i.test(html);
}

/**
 * Undoes what a rich text editor did to a template, where it can.
 *
 * Returns the original string untouched when there is nothing to undo, so a
 * template written through the API or `npm run seed` is never rewritten.
 */
export function repairTemplateHtml(raw: string): { html: string; repaired: boolean } {
  let html = raw;

  // A paragraph shell around the whole thing, with the line breaks converted.
  // Done first: the escaped source usually sits inside one of these.
  if (/^\s*<(p|div)\b[^>]*>[\s\S]*<\/(p|div)>\s*$/i.test(html) && !hasRealTags(html)) {
    html = html
      .replace(/^\s*<(?:p|div)\b[^>]*>/i, '')
      .replace(/<\/(?:p|div)>\s*$/i, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div)>\s*<(?:p|div)\b[^>]*>/gi, '\n');
  }

  // Escaped markup: no real tags, but plenty of descriptions of them.
  if (!hasRealTags(html) && /&lt;/.test(html)) {
    for (const [pattern, replacement] of ENTITIES) {
      html = html.replace(pattern, replacement);
    }
  }

  return html === raw ? { html: raw, repaired: false } : { html, repaired: true };
}

/**
 * Can this template produce a multi-page carousel at all.
 *
 * The loop is the load-bearing part: without `{{#each slides}}` there is one
 * page no matter what else is right, which is exactly the failure this exists
 * to catch. The page break is what makes those pages separate rather than one
 * long scroll, and `.slide` is what the renderer measures for overflow.
 */
export function templateProblem(html: string): string | null {
  if (!html.trim()) return 'it is empty';
  if (!hasRealTags(html)) return 'it is plain text rather than HTML';
  // No stylesheet, no design: a 1080x1350 slide is entirely a CSS construct.
  // This is also what catches an editor that took the <style> tags off and
  // left the rules behind, where the checks below all still pass on the text.
  if (!/<style\b/i.test(html)) return 'it has no <style> block, so there is no design left in it';
  if (!/\{\{#each\s+slides\s*\}\}/.test(html)) return 'it has no {{#each slides}} loop, so it can only ever be one page';
  if (!/page-break-after|break-after/.test(html)) return 'it has no page break rule, so the slides would run together';
  if (!/\.slide\b/.test(html)) return 'it has no .slide block for the renderer to measure';

  // The size is the design's to choose, but @page and .slide have to agree on
  // it: Chromium takes the page from @page and lays the slide out from .slide,
  // so a mismatch is a design that prints with a band of blank down one side.
  const page = declaredSlideSize(html);
  if (!page) return 'it has no @page size, so there is no page to print it on';

  const slide = /\.slide\s*\{[^}]*?width:\s*(\d+(?:\.\d+)?)px[^}]*?height:\s*(\d+(?:\.\d+)?)px/is.exec(html);
  if (slide) {
    const width = Math.round(Number(slide[1]));
    const height = Math.round(Number(slide[2]));
    if (width !== page.width || height !== page.height) {
      return (
        `its @page is ${page.width}x${page.height} but its .slide is ${width}x${height}, ` +
        'so every page would print with a blank band'
      );
    }
  }

  return null;
}

export function templateIsRenderable(html: string): boolean {
  return templateProblem(html) === null;
}

/**
 * The page size a design declares, read out of its own @page rule.
 *
 * A design is drawn for one shape. LinkedIn wants 1080x1350, Instagram a
 * 1080x1080 square, X 1600x900 — and rendering a square design on a portrait
 * page puts it in a letterbox. So the size comes from the template rather than
 * from a constant, and the template is the only thing that knows it.
 *
 * Returns null when there is no readable size, which the caller treats as the
 * LinkedIn default so the six designs that predate this keep working.
 */
export function declaredSlideSize(html: string): { width: number; height: number } | null {
  const page = /@page\s*\{[^}]*size:\s*(\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px/i.exec(html);
  if (!page) return null;

  const width = Math.round(Number(page[1]));
  const height = Math.round(Number(page[2]));

  // A page smaller than a phone icon or larger than a poster is a typo, not a
  // design decision, and rendering it would waste a browser launch to find out.
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 240 || height < 240 || width > 4096 || height > 4096) return null;

  return { width, height };
}
