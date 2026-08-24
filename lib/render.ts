import Handlebars from 'handlebars';
import { stripEmojis, stripEmojisDeep } from './sanitize';
import type { GeneratedPayload, HtmlTemplate } from './types';

/** Slide numbering, for example "01 / 07". */
Handlebars.registerHelper('slideNumber', (index: number) =>
  String(index + 1).padStart(2, '0'),
);

Handlebars.registerHelper('totalSlides', function (this: { slides?: unknown[] }) {
  return String(this.slides?.length ?? 0).padStart(2, '0');
});

Handlebars.registerHelper('isFirst', (index: number) => index === 0);

Handlebars.registerHelper('isLast', function (index: number, options: Handlebars.HelperOptions) {
  const total = (options.data?.root?.slides?.length ?? 0) as number;
  return index === total - 1;
});

/** Emoji-safe output helper, usable as {{clean heading}} inside a template. */
Handlebars.registerHelper('clean', (value: unknown) => stripEmojis(String(value ?? '')));

const compiledCache = new Map<string, HandlebarsTemplateDelegate>();

function compile(template: HtmlTemplate): HandlebarsTemplateDelegate {
  const cacheKey = `${template.template_key}:${template.raw_html.length}`;
  const cached = compiledCache.get(cacheKey);
  if (cached) return cached;

  const compiled = Handlebars.compile(template.raw_html, { noEscape: false });
  compiledCache.set(cacheKey, compiled);
  return compiled;
}

/**
 * Merges the model's slide payload into the raw HTML stored in PocketBase.
 * Every string is stripped of emojis one last time on the way in, so nothing
 * that reaches Chromium can carry one.
 */
export function renderTemplate(template: HtmlTemplate, payload: GeneratedPayload): string {
  const safePayload = stripEmojisDeep({
    title: payload.project_title,
    subtitle: payload.project_subtitle,
    caption: payload.caption,
    hashtags: payload.hashtags,
    slides: payload.slides.map((slide, index) => ({
      ...slide,
      bullets: slide.bullets ?? [],
      index,
      number: String(index + 1).padStart(2, '0'),
      isFirst: index === 0,
      isLast: index === payload.slides.length - 1,
    })),
    slideCount: payload.slides.length,
    totalLabel: String(payload.slides.length).padStart(2, '0'),
  });

  return compile(template)(safePayload);
}
