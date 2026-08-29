import { GoogleGenAI, Type } from '@google/genai';
import { config } from './config';
import { PLATFORMS, PLATFORM_SPECS, type Platform, type PlatformCaptions } from './platforms';
import { commentKeyword, stripEmojis } from './sanitize';
import type {
  GeneratedPayload,
  HtmlTemplate,
  PostMode,
  SlideContent,
  SlideRole,
} from './types';

export const GEMINI_SYSTEM_PROMPT = `
You write social posts that get read, saved and replied to. You are given a
codebase or a description of a system, and you turn it into posts for LinkedIn,
X, Facebook and Instagram.

Two rules override everything else.

1. ZERO EMOJIS. Not in a caption, not in a bullet, not in a heading, not in
   slide content. None, anywhere, ever, for any reason.
2. WRITE FOR A 12 YEAR OLD. Seventh grade reading level. Short words, short
   sentences, one idea per sentence. No corporate language: no "leverage", no
   "utilize", no "seamless", no "robust", no "solution", no "streamline", no
   "empower", no "cutting-edge". Say "use", "easy", "strong", "system". If a
   sentence needs reading twice, rewrite it.

HOW A POST EARNS ATTENTION

  - The first line decides everything. Nobody reads line two of a post whose
    line one was a warm-up. Never open with context, a greeting, or "I want to
    share".
  - Be specific or say nothing. "Saves time" is worthless. "Eight hours of
    posting became twenty minutes" is the post. Use real numbers from the
    source material: how many steps, how long before, how long after, how many
    files, how many platforms. Never invent a number the material does not
    support.
  - White space is a feature. One sentence per line beats a paragraph on every
    network here except Facebook.
  - Ask for something small. A reader will type one word. They will not write
    you a paragraph, and asking for one gets nothing.

THE HOOK, WHICH IS THE SAME CRAFT ON EVERY NETWORK

  A hook is one of these, and nothing else:
    - A bold claim: "Most content tools make the wrong thing faster."
    - A number: "Four platforms, one prompt, twenty minutes."
    - A contradiction: "I stopped writing posts. I get more replies now."
    - A cost: "Posting by hand was costing me a day a week."
  Twelve words maximum. No emoji, no hashtag, no link, no name-dropping.

PER NETWORK

  LINKEDIN. The two line hook is the whole post above the fold.
    Line 1: the hook, twelve words maximum.
    Line 2: the bridge. Say what they get if they open it, without giving it
    away, so the "see more" is the obvious next move. Then a blank line.
    Body: one sentence per line, blank line between. Steps become bullets
    starting with a hyphen. Show the value in numbers.
    Close: a question that can be answered in one word, then the hashtags on
    their own final line.

  X. One post, under 280 characters including the hashtags. Either one bold
    takeaway, or a numbered promise that leads with the number - "3 steps to
    automate your posting" - and the steps behind it. Two hashtags at most.

  INSTAGRAM. Open by telling them to keep it: "Save this post for later" on its
    own line. Then a short setup, then the takeaways as short bullets, one
    thing each. Close on the trigger word: tell them to comment the keyword to
    get the full blueprint.

  FACEBOOK. A story. Start where the problem was actually felt - what kept
    going wrong, what it cost - and only then what was built and what changed.
    Conversational, no bullets, no jargon. End on a question worth answering.

  The four are four different pieces of writing. Never write one and paste it
  four times, and never truncate the long one to make the short one.

SLIDES

  When slides are asked for, they follow the blueprint given with the request,
  and every rule above applies to them: no emojis, plain words, real specifics,
  and a hook on slide one that is a claim rather than a title.

REGENERATING ONE PLATFORM

  When you are asked to rewrite a single platform's caption, return only that
  one caption. Do not return the others, do not restate the slides, and do not
  comment on what you changed. Everything else about that post already exists
  and is not yours to touch.
`;

/**
 * The eight-slide blueprint every carousel follows. Stated to the model slide
 * by slide, because "write eight slides" reliably produces eight slides that
 * are all the same shape.
 */
const CAROUSEL_BLUEPRINT = `
Produce EXACTLY 8 slides, in this order, each with its "role" field set.

EVERY SLIDE FROM 2 TO 8 MUST CARRY REAL CONTENT. A heading and a single line is
not a slide - it is a title. Each of those slides needs BOTH:
  - "body": two full sentences that say something, 25 to 45 words in total. Not
    a restatement of the heading in other words. Explain, give the reason, name
    the mechanism, or say what it means for the reader.
  - "bullets": exactly three supporting points, 5 to 11 words each. Concrete.
    A number, a name, a specific consequence. Never three ways of saying the
    same thing.

1. role "hook" - The cover, and the exception to the rule above. The heading is
   the hook itself: a bold claim, a number, a contradiction or a cost, twelve
   words maximum. Never a title, never a topic, never the project's name. The
   body is ONE short line saying what the reader gets by reading on. NO bullets
   on this slide.
2. role "problem" - Why this matters, or the mistake people make. The body
   explains what it costs them. The bullets name three symptoms they will
   recognise in their own work.
3. role "point" - One distinct idea, step or piece of system architecture. The
   body explains how it works. The bullets give the specifics.
4. role "point" - The next distinct idea. Never repeat slide 3.
5. role "point" - The next distinct idea.
6. role "point" - The final distinct idea.
7. role "summary" - A recap. The body says what the reader now knows. The
   bullets are a checklist drawn from slides 3 to 6, one line each, and they
   must read as a list a person could act on.
8. role "cta" - The body is the reason to act on the post. Three bullets: save
   it, share it with whoever on their team needs it, follow for more. Do NOT
   ask for a comment in these bullets — the slide already carries the comment
   ask in its own block, using comment_keyword, and saying it twice reads as a
   mistake. No new information here.
`;

/**
 * What the single image prompt has to achieve. Written to be pasted straight
 * into Google Labs Flow, so it is one paragraph of description with no
 * preamble, no options and no commentary.
 */
const IMAGE_PROMPT_BRIEF = `
Write a single image generation prompt to paste into Google Labs Flow.

Rules for that prompt:
- One paragraph. No preamble, no alternatives, no explanation. Just the prompt.
- The palette is the Level One palette and nothing else: warm off-white
  (#faf9f6), near black (#111110), and soft smoke greys between them. Name
  those tones in the prompt. No other colours.
- Minimalist. Generous empty space, one clear subject, soft diffuse studio
  light, subtle smoke or haze, shallow depth. Editorial rather than busy.
- It must CARRY THE IDEA of the post, not decorate it. Describe an object,
  material or composition that stands for the central point the caption makes,
  so someone seeing the image alone understands what the post is about.
- Portrait orientation, 4:5 aspect ratio.
- Absolutely no text, letters, numbers, logos, watermarks or user interface in
  the image. Say so explicitly inside the prompt.
`;

const SLIDE_ROLES: SlideRole[] = ['hook', 'problem', 'point', 'summary', 'cta'];

/** Structured output contract. Gemini must fill exactly these fields. */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    caption: {
      type: Type.STRING,
      description:
        'The full LinkedIn caption, to the LinkedIn brief: the two line hook, then one sentence ' +
        'per line, then bullets prefixed with a hyphen, then a one word question, then the ' +
        'hashtags on the final line. No emojis.',
    },
    template_key: {
      type: Type.STRING,
      description: 'The template_key of the slide template that best fits this project.',
    },
    project_title: {
      type: Type.STRING,
      description:
        'Short product or project name, shown as the label on the cover slide. Six words maximum.',
    },
    project_subtitle: {
      type: Type.STRING,
      description: 'One supporting line under the title. Twelve words maximum.',
    },
    captions: {
      type: Type.OBJECT,
      description:
        'One caption per network, each written for that network rather than copied between them.',
      properties: {
        linkedin: { type: Type.STRING, description: PLATFORM_SPECS.linkedin.brief },
        x: { type: Type.STRING, description: PLATFORM_SPECS.x.brief },
        facebook: { type: Type.STRING, description: PLATFORM_SPECS.facebook.brief },
        instagram: { type: Type.STRING, description: PLATFORM_SPECS.instagram.brief },
      },
      required: ['linkedin', 'x', 'facebook', 'instagram'],
    },
    comment_keyword: {
      type: Type.STRING,
      description:
        'One memorable word taken from this project, for readers to comment so they can be sent ' +
        'the build. Letters and hyphens only, no spaces, no punctuation. For example CO-PILOT, ' +
        'OUTREACH or INGEST. It is printed large on the last slide, so make it specific to this ' +
        'project rather than generic.',
    },
    image_prompt: {
      type: Type.STRING,
      description:
        'Single image posts only: the Google Labs Flow prompt. Empty string for a carousel.',
    },
    hashtags: {
      type: Type.ARRAY,
      description: 'Three to five professional hashtags, each starting with a hash symbol.',
      items: { type: Type.STRING },
    },
    slides: {
      type: Type.ARRAY,
      description:
        'The eight carousel slides in blueprint order. Empty array for a single image post.',
      items: {
        type: Type.OBJECT,
        properties: {
          role: {
            type: Type.STRING,
            enum: SLIDE_ROLES,
            description: 'Which slot in the blueprint this slide fills.',
          },
          kicker: {
            type: Type.STRING,
            description: 'Small corner label, for example "Step two". Three words maximum.',
          },
          heading: {
            type: Type.STRING,
            description:
              'Slide headline, eight words maximum so it fits the canvas. On the hook slide this ' +
              'is the hook itself: a bold claim, a number or a contradiction, never a title.',
          },
          body: {
            type: Type.STRING,
            description:
              'Two full sentences of real content, 25 to 45 words, that explain the heading ' +
              'rather than restate it. The exception is the hook slide, where this is one ' +
              'short promise line. No emojis.',
          },
          bullets: {
            type: Type.ARRAY,
            description:
              'Exactly three concrete supporting points, 5 to 11 words each, on every slide ' +
              'except the hook, which has none. Specifics, not three phrasings of one idea.',
            items: { type: Type.STRING },
          },
        },
        required: ['role', 'heading', 'body', 'bullets'],
      },
    },
  },
  required: [
    'caption',
    'template_key',
    'project_title',
    'project_subtitle',
    'slides',
    'hashtags',
    'image_prompt',
    'comment_keyword',
    'captions',
  ],
} as const;

let cachedClient: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (!cachedClient) {
    const baseUrl = config.geminiBaseUrl;
    cachedClient = new GoogleGenAI({
      apiKey: config.geminiApiKey,
      ...(baseUrl ? { httpOptions: { baseUrl } } : {}),
    });
  }
  return cachedClient;
}

/**
 * The four captions, cleaned and held to their limits.
 *
 * X is the one network whose limit rejects rather than truncates, so a caption
 * over it is trimmed at a word boundary here rather than failing at post time.
 * A platform the model skipped falls back to the LinkedIn caption, because a
 * tab with something in it that you can redo beats an empty one.
 */
function coerceCaptions(raw: unknown, fallback: string): PlatformCaptions {
  const record = (raw ?? {}) as Record<string, unknown>;
  const out = {} as PlatformCaptions;

  for (const platform of PLATFORMS) {
    const { limit } = PLATFORM_SPECS[platform];
    let text = stripEmojis(String(record[platform] ?? '')).trim() || fallback;

    if (text.length > limit) {
      const cut = text.slice(0, limit);
      const lastSpace = cut.lastIndexOf(' ');
      text = (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
    }

    out[platform] = text;
  }

  return out;
}

function platformBriefs(): string {
  return PLATFORMS.map(
    (platform) => `- ${PLATFORM_SPECS[platform].label}: ${PLATFORM_SPECS[platform].brief}`,
  ).join('\n');
}

function templateCatalogue(templates: HtmlTemplate[]): string {
  return templates
    .map(
      (template) =>
        `- key: ${template.template_key} | name: ${template.template_name} | best for: ${template.category}`,
    )
    .join('\n');
}

function buildUserPrompt(args: {
  contextString: string;
  postMode: PostMode;
  templates: HtmlTemplate[];
  sourceName: string;
}): string {
  const isImage = args.postMode === 'image';

  return [
    `SOURCE NAME: ${args.sourceName}`,
    `POST TYPE: ${isImage ? 'Single Image Post' : 'PDF Carousel'}`,
    '',
    isImage
      ? [
          'This is a single image post. Return an EMPTY slides array and an empty template_key.',
          'Write the caption, then write image_prompt.',
          '',
          IMAGE_PROMPT_BRIEF,
        ].join('\n')
      : [
          'AVAILABLE SLIDE DESIGNS (choose exactly one template_key from this list):',
          templateCatalogue(args.templates),
          '',
          CAROUSEL_BLUEPRINT,
          '',
          'Every slide renders on a fixed canvas whose size the design chooses. Keep headings',
          'short, but do NOT thin out the bodies or drop the bullets to save room: the renderer',
          'shrinks a slide that overruns, and a slide with nothing on it cannot be fixed that way.',
          'Return an empty string for image_prompt.',
        ].join('\n'),
    '',
    'CAPTIONS. Write one for each network, to these briefs:',
    platformBriefs(),
    '',
    'Never invent features the source material does not support.',
    '',
    'SOURCE MATERIAL TO ANALYZE:',
    args.contextString,
  ].join('\n');
}

/**
 * Positions a slide in the blueprint when the model returned a role that is
 * missing or not one of the five. Position is a good enough answer because the
 * blueprint is positional, and it stops a template falling through every role
 * branch and rendering an empty slide.
 */
function coerceRole(raw: unknown, index: number, total: number): SlideRole {
  const value = String(raw ?? '').toLowerCase() as SlideRole;
  if (SLIDE_ROLES.includes(value)) return value;
  if (index === 0) return 'hook';
  if (index === total - 1) return 'cta';
  if (index === 1) return 'problem';
  if (index === total - 2) return 'summary';
  return 'point';
}

function coerceSlides(raw: unknown): SlideContent[] {
  if (!Array.isArray(raw)) return [];

  const cleaned = raw
    .map((slide) => {
      const record = slide as Record<string, unknown>;
      return {
        rawRole: record.role,
        kicker: stripEmojis(String(record.kicker ?? '')),
        heading: stripEmojis(String(record.heading ?? '')),
        body: stripEmojis(String(record.body ?? '')),
        bullets: Array.isArray(record.bullets)
          ? record.bullets.map((bullet) => stripEmojis(String(bullet))).filter(Boolean)
          : [],
      };
    })
    .filter((slide) => slide.heading !== '' || slide.body !== '');

  return cleaned.map(({ rawRole, ...slide }, index) => ({
    ...slide,
    role: coerceRole(rawRole, index, cleaned.length),
  }));
}

/**
 * Runs the single structured-output call that produces the caption and, for a
 * carousel, the chosen design and slide payload; for a single image post, the
 * Google Labs Flow prompt instead.
 */
export async function generateContentPayload(args: {
  contextString: string;
  postMode: PostMode;
  templates: HtmlTemplate[];
  sourceName: string;
}): Promise<GeneratedPayload> {
  if (args.postMode === 'carousel' && args.templates.length === 0) {
    throw new Error('No slide designs available. Run "npm run seed" to load them.');
  }

  const response = await client().models.generateContent({
    model: config.geminiModel,
    contents: buildUserPrompt(args),
    config: {
      systemInstruction: GEMINI_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA as never,
      temperature: 0.7,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Gemini returned output that is not valid JSON: ${text.slice(0, 400)}`);
  }

  const caption = stripEmojis(String(parsed.caption ?? '')).trim();
  const keyword = commentKeyword(parsed.comment_keyword);
  const imagePrompt = stripEmojis(String(parsed.image_prompt ?? '')).trim();

  if (args.postMode === 'image') {
    if (!caption) throw new Error('Gemini returned no caption.');
    if (!imagePrompt) throw new Error('Gemini returned no image prompt.');

    return {
      caption,
      template_key: '',
      project_title: stripEmojis(String(parsed.project_title ?? 'Untitled post')).trim(),
      project_subtitle: stripEmojis(String(parsed.project_subtitle ?? '')).trim(),
      slides: [],
      hashtags: coerceHashtags(parsed.hashtags),
      image_prompt: imagePrompt,
      comment_keyword: keyword,
      captions: coerceCaptions(parsed.captions, caption),
    };
  }

  const requestedKey = stripEmojis(String(parsed.template_key ?? '')).trim();
  const known = args.templates.some((template) => template.template_key === requestedKey);

  const slides = coerceSlides(parsed.slides);
  if (slides.length === 0) {
    throw new Error('Gemini returned no usable slides.');
  }

  return {
    caption,
    template_key: known ? requestedKey : args.templates[0].template_key,
    project_title: stripEmojis(String(parsed.project_title ?? 'Untitled Project')).trim(),
    project_subtitle: stripEmojis(String(parsed.project_subtitle ?? '')).trim(),
    // The blueprint is eight. More than ten would overflow a reader's patience
    // and the template's page counter, so it is capped rather than trusted.
    slides: slides.slice(0, 10),
    hashtags: coerceHashtags(parsed.hashtags),
    image_prompt: '',
    comment_keyword: keyword,
    captions: coerceCaptions(parsed.captions, caption),
  };
}

/**
 * Rewrites one platform's caption and nothing else.
 *
 * The whole value of a redo button is that it cannot touch the other three, so
 * this asks for a single string rather than the full payload: there is nothing
 * in the response that could overwrite anything else even if the model tried.
 * It reuses the same system prompt, so a redo is written to the same rules as
 * the original rather than to a second set that can drift from them.
 */
export async function regenerateCaption(args: {
  platform: Platform;
  contextString: string;
  previous: string;
}): Promise<string> {
  const spec = PLATFORM_SPECS[args.platform];

  const response = await client().models.generateContent({
    model: config.geminiModel,
    contents: [
      `Rewrite the ${spec.label} caption for this project, and return nothing else.`,
      '',
      `BRIEF: ${spec.brief}`,
      '',
      'It must be a genuinely different take rather than the same caption reworded:',
      'a different opening, a different angle on what matters.',
      '',
      'THE CAPTION BEING REPLACED:',
      args.previous || '(there was none)',
      '',
      'SOURCE MATERIAL:',
      args.contextString,
    ].join('\n'),
    config: {
      systemInstruction: GEMINI_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: { caption: { type: Type.STRING, description: spec.brief } },
        required: ['caption'],
      } as never,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Gemini returned an empty response.');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Gemini returned output that is not valid JSON: ${text.slice(0, 200)}`);
  }

  const rewritten = coerceCaptions({ [args.platform]: parsed.caption }, args.previous);
  return rewritten[args.platform];
}

function coerceHashtags(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.map((tag) => stripEmojis(String(tag)).trim()).filter(Boolean)
    : [];
}

/**
 * Writes a new slide design from a description and a piece of HTML to work
 * from.
 *
 * The model is given the blueprint it has to satisfy rather than being asked
 * for "a template", because a design that misses the loop renders one page of
 * its own source code — which is a failure this system has already had, and
 * the reason the caller renders the result before offering it.
 *
 * The sample HTML is a reference for look, not a base to edit. Handing back a
 * lightly modified copy of someone's landing page produces something that is
 * not a 1080x1350 slide deck.
 */
export async function generateTemplateHtml(args: {
  description: string;
  sampleHtml: string;
}): Promise<{ template_key: string; template_name: string; category: string; raw_html: string }> {
  const response = await client().models.generateContent({
    model: config.geminiModel,
    contents: [
      'Write a complete Handlebars slide design for an 8 slide LinkedIn carousel.',
      '',
      'IT MUST HAVE, or it cannot render:',
      '- <meta charset="utf-8" /> and a <style> block.',
      '- @page { size: 1080px 1350px; margin: 0; }',
      '- A .slide rule that is exactly 1080px by 1350px, with page-break-after:',
      '  always, break-after: page, and overflow: hidden.',
      '- html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      '  without which Chromium drops every background colour when it prints.',
      '- {{#each slides}}<section class="slide slide-{{role}}"> ... </section>{{/each}}',
      '  wrapping the whole body. One section per slide, nothing outside the loop.',
      '',
      'INSIDE THE LOOP you have: heading, body, bullets, kicker, role, number,',
      'isFirst, isLast, and one boolean per role: isHook, isProblem, isPoint,',
      'isSummary, isCta. Outside it, with ../ : title, subtitle, totalLabel,',
      'wordmark, brandName, author, commentKeyword, logoDataUri.',
      '',
      'BRANCH on the role so the cover, the middle slides, the summary and the',
      'sign off do not look the same: {{#if isHook}} ... {{else if isCta}} ...',
      '{{else}} ... {{/if}}. The cover shows <img src="{{../logoDataUri}}">, the',
      'heading and the body. The sign off asks for a comment using',
      '{{../commentKeyword}}.',
      '',
      'RULES: self contained — no external stylesheet, font or image, because the',
      'page is rendered with no origin and anything fetched silently vanishes.',
      'Fonts must come from "Helvetica Neue", Helvetica, Arial, "Liberation Sans"',
      'or Georgia, "Times New Roman", "Liberation Serif". No emojis anywhere. Type',
      'large enough to read on a phone: headings 60px and up, body 28px and up.',
      '',
      'WHAT IT SHOULD LOOK LIKE:',
      args.description,
      '',
      'HTML TO TAKE THE LOOK FROM. Use its colours, spacing and type as a',
      'reference. Do NOT edit it into a template — write a new one that feels',
      'like it:',
      args.sampleHtml.slice(0, 12000),
    ].join('\n'),
    config: {
      systemInstruction: GEMINI_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          template_key: {
            type: Type.STRING,
            description:
              'Lowercase key with underscores, starting level_one_, for example ' +
              'level_one_harbour. Two or three words.',
          },
          template_name: {
            type: Type.STRING,
            description: 'Friendly name for the dropdown, for example "Level One Harbour".',
          },
          category: {
            type: Type.STRING,
            description:
              'A sentence describing what this design suits. The model reads this to choose ' +
              'between designs, so describe the use rather than the colours alone.',
          },
          raw_html: {
            type: Type.STRING,
            description: 'The complete template, ready to render. No commentary around it.',
          },
        },
        required: ['template_key', 'template_name', 'category', 'raw_html'],
      } as never,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Gemini returned an empty response.');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Gemini returned output that is not valid JSON: ${text.slice(0, 300)}`);
  }

  const key = String(parsed.template_key ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return {
    template_key: key || `level_one_${Date.now().toString(36)}`,
    template_name: stripEmojis(String(parsed.template_name ?? '')).trim() || 'New design',
    category: stripEmojis(String(parsed.category ?? '')).trim() || 'A new slide design.',
    // NOT stripped of emojis as a whole: it is HTML, and the sanitiser walks
    // text. Emojis in a template would be the model disobeying the system
    // prompt, and the render check below is what actually gates it.
    raw_html: String(parsed.raw_html ?? ''),
  };
}
