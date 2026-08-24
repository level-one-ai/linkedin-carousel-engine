import { GoogleGenAI, Type } from '@google/genai';
import { config } from './config';
import { stripEmojis } from './sanitize';
import type { GeneratedPayload, HtmlTemplate, PostMode, SlideContent } from './types';

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
      description: 'Short product or project name for the cover slide. Six words maximum.',
    },
    project_subtitle: {
      type: Type.STRING,
      description: 'One supporting line under the title. Twelve words maximum.',
    },
    hashtags: {
      type: Type.ARRAY,
      description: 'Three to five professional hashtags, each starting with a hash symbol.',
      items: { type: Type.STRING },
    },
    slides: {
      type: Type.ARRAY,
      description: 'Slide by slide content, ordered from cover slide to closing slide.',
      items: {
        type: Type.OBJECT,
        properties: {
          kicker: {
            type: Type.STRING,
            description: 'Small corner label, for example a section name. Three words maximum.',
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
            description: 'Zero to four short supporting points. Each under twelve words.',
            items: { type: Type.STRING },
          },
        },
        required: ['heading', 'body'],
      },
    },
  },
  required: ['caption', 'template_key', 'project_title', 'project_subtitle', 'slides', 'hashtags'],
} as const;

let cachedClient: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return cachedClient;
}

function slideBudget(postMode: PostMode): string {
  return postMode === 'image'
    ? 'Produce exactly 1 slide. It must stand alone as a single graphic.'
    : 'Produce between 6 and 8 slides: one cover slide, four to six body slides, one closing slide with the call to action.';
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
  return [
    `SOURCE NAME: ${args.sourceName}`,
    `POST MODE: ${args.postMode === 'image' ? 'Single Image Post' : 'PDF Carousel'}`,
    '',
    'AVAILABLE SLIDE TEMPLATES (choose exactly one template_key from this list):',
    templateCatalogue(args.templates),
    '',
    `SLIDE COUNT REQUIREMENT: ${slideBudget(args.postMode)}`,
    '',
    'Every slide renders on a fixed 1080 by 1350 pixel canvas, so keep headings short and bodies tight.',
    'Never invent features the source material does not support.',
    '',
    'SOURCE MATERIAL TO ANALYZE:',
    args.contextString,
  ].join('\n');
}

function coerceSlides(raw: unknown): SlideContent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((slide) => {
      const record = slide as Record<string, unknown>;
      return {
        kicker: stripEmojis(String(record.kicker ?? '')),
        heading: stripEmojis(String(record.heading ?? '')),
        body: stripEmojis(String(record.body ?? '')),
        bullets: Array.isArray(record.bullets)
          ? record.bullets.map((bullet) => stripEmojis(String(bullet))).filter(Boolean)
          : [],
      };
    })
    .filter((slide) => slide.heading !== '' || slide.body !== '');
}

/**
 * Runs the single structured-output call that produces the caption, the chosen
 * template key, and the slide payload in one pass.
 */
export async function generateContentPayload(args: {
  contextString: string;
  postMode: PostMode;
  templates: HtmlTemplate[];
  sourceName: string;
}): Promise<GeneratedPayload> {
  if (args.templates.length === 0) {
    throw new Error('No HTML templates available. Run "npm run seed" to load the starter set.');
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

  const requestedKey = stripEmojis(String(parsed.template_key ?? '')).trim();
  const known = args.templates.some((template) => template.template_key === requestedKey);

  const slides = coerceSlides(parsed.slides);
  if (slides.length === 0) {
    throw new Error('Gemini returned no usable slides.');
  }

  return {
    caption: stripEmojis(String(parsed.caption ?? '')).trim(),
    template_key: known ? requestedKey : args.templates[0].template_key,
    project_title: stripEmojis(String(parsed.project_title ?? 'Untitled Project')).trim(),
    project_subtitle: stripEmojis(String(parsed.project_subtitle ?? '')).trim(),
    slides: args.postMode === 'image' ? slides.slice(0, 1) : slides.slice(0, 10),
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map((tag) => stripEmojis(String(tag)).trim()).filter(Boolean)
      : [],
  };
}
