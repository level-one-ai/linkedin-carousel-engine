import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { runGeneration } from '@/lib/pipeline';
import { coercePlan, isAccountType, type AccountType, type PostPlan } from '@/lib/platforms';
import { logError } from '@/lib/pocketbase';
import type { InputType, PostMode } from '@/lib/types';

export const runtime = 'nodejs';
// Gemini plus a cold Chromium render can exceed the default budget.
export const maxDuration = 300;

function parseMode(value: FormDataEntryValue | null): PostMode {
  return value === 'image' ? 'image' : 'carousel';
}

/**
 * The per-network plan, as the form sends it.
 *
 * Anything unparseable falls through to `coercePlan`, which fills every gap
 * with the default — a bad JSON blob costs you the plan, not the generation.
 */
function parsePlan(value: FormDataEntryValue | null): PostPlan | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  try {
    return coercePlan(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function parseAccountType(value: FormDataEntryValue | null): AccountType {
  return isAccountType(value) ? value : 'personal';
}

export async function POST(request: Request) {
  let inputType: InputType = 'text';
  try {
    const form = await request.formData();
    const postMode = parseMode(form.get('postMode'));
    const description = String(form.get('description') ?? '');
    const forcedTemplateKey = String(form.get('templateKey') ?? '');
    const plan = parsePlan(form.get('plan'));
    const accountType = parseAccountType(form.get('accountType'));
    const file = form.get('file');

    let zipBuffer: Buffer | undefined;
    let sourceName = 'Text description';

    if (file instanceof File && file.size > 0) {
      const limitBytes = config.maxUploadMb * 1024 * 1024;
      if (file.size > limitBytes) {
        return NextResponse.json(
          { error: `That archive is larger than the ${config.maxUploadMb} MB limit.` },
          { status: 413 },
        );
      }
      if (!file.name.toLowerCase().endsWith('.zip')) {
        return NextResponse.json({ error: 'Upload a .zip archive.' }, { status: 415 });
      }
      inputType = 'zip';
      sourceName = file.name.replace(/\.zip$/i, '');
      zipBuffer = Buffer.from(await file.arrayBuffer());
    } else if (description.trim() === '') {
      return NextResponse.json(
        { error: 'Upload a zip archive or write a description first.' },
        { status: 400 },
      );
    }

    const result = await runGeneration({
      postMode,
      inputType,
      zipBuffer,
      description,
      sourceName,
      forcedTemplateKey,
      plan,
      accountType,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed.';
    await logError({ stage: 'generate', message, details: String(error) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
