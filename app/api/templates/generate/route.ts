import { NextResponse } from 'next/server';

import { renderSlides } from '@/lib/chromium';
import { generateTemplateHtml } from '@/lib/gemini';
import { githubConfigured, readFile, writeFile } from '@/lib/github';
import { logError, saveTemplate } from '@/lib/pocketbase';
import { renderTemplate } from '@/lib/render';
import { templateProblem } from '@/lib/template-html';
import { loadSeedTemplates } from '@/lib/template-seed';
import type { GeneratedPayload, SlideRole } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Writes a new slide design, proves it renders, then saves it.
 *
 * The proof is the point. A design that misses the {{#each slides}} loop, or
 * loses its <style> block, renders as one page of its own source code and
 * saves as a one slide carousel — this system has shipped that failure before.
 * So nothing is written anywhere until a real Chromium has turned the design
 * into eight pages.
 */

const ROLES: SlideRole[] = ['hook', 'problem', 'point', 'point', 'point', 'point', 'summary', 'cta'];

/** Realistic copy, so a design is judged at the length it will actually carry. */
function sampleSlides(): GeneratedPayload {
  return {
    project_title: 'Example project',
    project_subtitle: 'What it does, in six words',
    caption: '',
    hashtags: [],
    image_prompt: '',
    comment_keyword: 'BLUEPRINT',
    captions: { linkedin: '', x: '', facebook: '', instagram: '' },
    template_key: 'preview',
    slides: ROLES.map((role, index) => ({
      role,
      kicker: 'Section',
      heading:
        index === 0
          ? 'The headline that stops the scroll'
          : `Slide ${index + 1}: the point being made here`,
      body:
        index === 0
          ? 'One line promising what the reader gets.'
          : 'Two sentences of real body copy, because a design that only holds a heading looks fine empty and breaks the moment it is used. This is roughly the length it will carry.',
      bullets:
        index === 0
          ? []
          : [
              'A concrete supporting point',
              'A second one, of similar length',
              'And a third to fill the slide',
            ],
    })),
  } as GeneratedPayload;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { description?: unknown; sampleHtml?: unknown };
    const description = String(body.description ?? '').trim();
    const sampleHtml = String(body.sampleHtml ?? '').trim();

    if (description.length < 20) {
      return NextResponse.json(
        { error: 'Describe the design you want in a sentence or two first.' },
        { status: 400 },
      );
    }

    const draft = await generateTemplateHtml({ description, sampleHtml });

    // 1. The cheap structural check, before paying for a render.
    const problem = templateProblem(draft.raw_html);
    if (problem) {
      return NextResponse.json(
        {
          error: `The design came back unusable: ${problem}. Try again, or describe it differently.`,
          raw_html: draft.raw_html,
        },
        { status: 422 },
      );
    }

    // 2. The real one. Eight slides in, eight pages out, or it is not a design.
    let slideCount = 0;
    let overflowing: number[] = [];
    try {
      const rendered = await renderSlides(
        renderTemplate({ ...draft, raw_html: draft.raw_html }, sampleSlides(), {}),
        'carousel',
      );
      slideCount = rendered.asset.slideCount;
      overflowing = rendered.overflowingSlides;
    } catch (error) {
      return NextResponse.json(
        { error: `The design would not render: ${String((error as Error)?.message ?? error).slice(0, 300)}` },
        { status: 422 },
      );
    }

    if (slideCount !== ROLES.length) {
      return NextResponse.json(
        {
          error:
            `The design rendered ${slideCount} ${slideCount === 1 ? 'page' : 'pages'} instead of ` +
            `${ROLES.length}, so it is not usable as a carousel. Try again.`,
        },
        { status: 422 },
      );
    }

    // 3. A key nobody else is using. Checked against the folder, which is the
    // source of truth, so a generated design can never shadow a shipped one.
    const taken = new Set(loadSeedTemplates().map((template) => template.template_key));
    let key = draft.template_key;
    for (let suffix = 2; taken.has(key); suffix += 1) key = `${draft.template_key}_${suffix}`;

    const template = { ...draft, template_key: key };
    const warnings: string[] = [];

    if (overflowing.length > 0) {
      warnings.push(
        `Slide ${overflowing.join(', ')} overran the canvas and had to be shrunk. The design ` +
          'works, but it is tight on long copy.',
      );
    }

    // 4. PocketBase, so it is in the dropdown now.
    let savedToDatabase = false;
    try {
      await saveTemplate(template);
      savedToDatabase = true;
    } catch (error) {
      warnings.push(`It could not be saved to PocketBase, so it will not appear in the picker yet.`);
      await logError({ stage: 'templates', message: 'saveTemplate failed', details: String(error) });
    }

    // 5. The repository, so it survives the database.
    let committed = false;
    if (githubConfigured()) {
      try {
        await commitTemplate(template);
        committed = true;
      } catch (error) {
        warnings.push(`It could not be committed to GitHub: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
      }
    } else {
      warnings.push(
        'GITHUB_TOKEN and GITHUB_REPO are not set, so it was not committed to the repository. ' +
          'It lives only in PocketBase until they are.',
      );
    }

    return NextResponse.json({
      template: { ...template, raw_html: undefined },
      slideCount,
      savedToDatabase,
      committed,
      warnings,
    });
  } catch (error) {
    console.error('[templates:generate]', error);
    await logError({
      stage: 'templates',
      message: 'template generation failed',
      details: String(error),
    });
    return NextResponse.json(
      { error: String((error as Error)?.message ?? error).slice(0, 400) },
      { status: 500 },
    );
  }
}

/** The HTML file and its index entry, as two commits on the working branch. */
async function commitTemplate(template: {
  template_key: string;
  template_name: string;
  category: string;
  raw_html: string;
}): Promise<void> {
  const file = `${template.template_key}.html`;

  const existing = await readFile(`templates/${file}`);
  await writeFile({
    path: `templates/${file}`,
    content: template.raw_html,
    message: `Add the ${template.template_name} slide design`,
    sha: existing?.sha,
  });

  const index = await readFile('templates/index.json');
  if (!index) return;

  const parsed = JSON.parse(index.text) as { designs?: unknown[] };
  const designs = Array.isArray(parsed.designs) ? parsed.designs : [];

  if (designs.some((entry) => (entry as { template_key?: string }).template_key === template.template_key)) {
    return;
  }

  designs.push({
    template_key: template.template_key,
    template_name: template.template_name,
    file,
    category: template.category,
  });

  await writeFile({
    path: 'templates/index.json',
    content: `${JSON.stringify({ ...parsed, designs }, null, 2)}\n`,
    message: `List ${template.template_name} in the design index`,
    sha: index.sha,
  });
}
