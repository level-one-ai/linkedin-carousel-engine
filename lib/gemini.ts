import { GoogleGenAI, Type } from '@google/genai';
import { config } from './config';
import { stripEmojis } from './sanitize';
import type {
  GeneratedPayload,
  HtmlTemplate,
  PostMode,
  SlideContent,
  SlideRole,
} from './types';

export const GEMINI_SYSTEM_PROMPT = `
You are an expert technical content writer and software architect. Your job is to analyze codebases or project descriptions and create professional, clear, and engaging LinkedIn posts.

CRITICAL FORMATTING RULES:
1. Tone: Professional, authoritative, yet written in simple language that is easy for any business reader or engineer to understand without jargon overload.
2. EMOJI BAN: Absolutely NO emojis are allowed anywhere in the text, captions, bullet points, or generated HTML output. Zero emojis under any circumstances.
3. Caption Structure:
   - Hook: A strong 1-sentence opening statement about the business problem or system integration.
   - Context: 2-3 short sentences explaining how the system works.
   - Key Takeaways: 3 concise bullet points highlighting business or technical value.
   - Call to Action & Hashtags: A clean sign-off question and professional hashtags.
4. Slide Content: Return structured JSON matching the requested template schema, maintaining clean, professional typography and zero emojis.
`;

/**
 * The eight-slide blueprint every carousel follows. Stated to the model slide
 * by slide, because "write eight slides" reliably produces eight slides that
 * are all the same shape.
 */
const CAROUSEL_BLUEPRINT = `
Produce EXACTLY 8 slides, in this order, each with its "role" field set:

1. role "hook" - The headline that stops the scroll. A bold claim or a clear
   benefit. The body is one short line promising what the reader gets. No bullets.
2. role "problem" - Why this matters, or the common mistake people make. Bullets
   may name the symptoms.
3. role "point" - One distinct idea, step or piece of system architecture.
4. role "point" - The next distinct idea. Never repeat slide 3.
5. role "point" - The next distinct idea.
6. role "point" - The final distinct idea.
7. role "summary" - A recap. The bullets are a checklist of the key points from
   slides 3 to 6, one line each, and they must read as a list a person could
   act on.
8. role "cta" - Ask for the save, the comment and the follow. Three short
   bullets, one per action. No new information here.
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
        'The full LinkedIn caption: hook, context, three bullet takeaways prefixed with a hyphen, a closing question, and hashtags on the final line. No emojis.',
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
            description: 'Slide headline. Eight words maximum so it fits the canvas.',
          },
          body: {
            type: Type.STRING,
            description: 'One or two plain sentences supporting the heading. No emojis.',
          },
          bullets: {
            type: Type.ARRAY,
            description: 'Zero to four short supporting points. Each under eleven words.',
            items: { type: Type.STRING },
          },
        },
        required: ['role', 'heading', 'body'],
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
  ],
} as const;

let cachedClient: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return cachedClient;
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
          'Every slide renders on a fixed 1080 by 1350 pixel canvas, so keep headings short',
          'and bodies tight. Return an empty string for image_prompt.',
        ].join('\n'),
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
  };
}

function coerceHashtags(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.map((tag) => stripEmojis(String(tag)).trim()).filter(Boolean)
    : [];
}
