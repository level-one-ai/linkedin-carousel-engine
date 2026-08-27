import Handlebars from 'handlebars';

import { BRAND, logoDataUri } from './brand';

import { stripEmojis, stripEmojisDeep } from './sanitize';
import type { GeneratedPayload, HtmlTemplate, SlideRole } from './types';

/** Slide numbering, for example "01". */
Handlebars.registerHelper('slideNumber', (index: number) => String(index + 1).padStart(2, '0'));

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
 * Fills in a slide's role when the model did not give one.
 *
 * The blueprint is positional — slide one hooks, slide two frames the problem,
 * the last slide asks for something — so position is a good enough answer and
 * keeps a template from falling through all its role branches and rendering
 * nothing.
 */
function resolveRole(role: SlideRole | undefined, index: number, total: number): SlideRole {
  if (role) return role;
  if (index === 0) return 'hook';
  if (index === total - 1) return 'cta';
  if (index === 1) return 'problem';
  if (index === total - 2) return 'summary';
  return 'point';
}

/**
 * Merges the model's slide payload into the raw HTML held in PocketBase.
 *
 * Every string is stripped of emojis one last time on the way in, so nothing
 * that reaches Chromium can carry one.
 */
export function renderTemplate(
  template: HtmlTemplate,
  payload: GeneratedPayload,
  assets: Record<string, string> = {},
): string {
  const total = payload.slides.length;

  const safePayload = stripEmojisDeep({
    title: payload.project_title,
    subtitle: payload.project_subtitle,
    caption: payload.caption,
    hashtags: payload.hashtags,
    slides: payload.slides.map((slide, index) => {
      const role = resolveRole(slide.role, index, total);
      return {
        ...slide,
        role,
        // Booleans as well as the role string: Handlebars has no equality
        // helper built in, so a template cannot ask "is this the hook" from
        // the role alone without one.
        isHook: role === 'hook',
        isProblem: role === 'problem',
        isPoint: role === 'point',
        isSummary: role === 'summary',
        isCta: role === 'cta',
        bullets: slide.bullets ?? [],
        index,
        number: String(index + 1).padStart(2, '0'),
        isFirst: index === 0,
        isLast: index === total - 1,
      };
    }),
    slideCount: total,
    totalLabel: String(total).padStart(2, '0'),
  });

  // Brand values are added after the emoji pass: they are ours, not the
  // model's, and the data URI must not be walked character by character.
  return compile(template)({
    ...safePayload,
    wordmark: BRAND.wordmark,
    brandName: BRAND.name,
    author: BRAND.author,
    logoDataUri: logoDataUri(),
    // Images from templates/assets, as {{assets.portrait}} and so on. Same
    // reasoning as the logo: setContent gives the page no origin, so a path
    // would resolve to nothing. Passed in rather than read here because
    // preparing them needs a browser, and this function is synchronous.
    assets,
  });
}
