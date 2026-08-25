'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Download,
  FileArchive,
  Image as ImageIcon,
  Layers,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import GeneratingLoader from './GeneratingLoader';
import HealthLine from './HealthLine';
import type { GenerateResult, PostMode } from '@/lib/types';

interface TemplateSummary {
  template_key: string;
  template_name: string;
  category: string;
}

const MODES: Array<{ id: PostMode; label: string; icon: typeof Layers; hint: string }> = [
  {
    id: 'carousel',
    label: 'Carousel',
    icon: Layers,
    hint: 'Eight slides, rendered here as a PDF',
  },
  {
    id: 'image',
    label: 'Single Image',
    icon: ImageIcon,
    hint: 'Caption plus a prompt for Google Labs Flow',
  },
];

/** Turns the fallback base64 into a blob URL when a post could not be saved. */
function toObjectUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

export default function GeneratorForm({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const router = useRouter();

  const [postMode, setPostMode] = useState<PostMode>('carousel');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [templateKey, setTemplateKey] = useState('');
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Only set when the post was generated but could not be saved. */
  const [rescue, setRescue] = useState<{ result: GenerateResult; url: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    fetch('/api/templates')
      .then((response) => response.json())
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => setTemplates([]));
  }, []);

  // Blob URLs leak until revoked.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const pickFile = useCallback((candidate: File | null) => {
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith('.zip')) {
      setError('That file is not a .zip archive.');
      return;
    }
    setError(null);
    setFile(candidate);
  }, []);

  async function submit() {
    if (busy) return;
    if (!file && description.trim().length < 20) {
      setError('Upload a zip archive or write at least a couple of sentences.');
      return;
    }

    setBusy(true);
    setError(null);
    setRescue(null);

    const form = new FormData();
    form.append('postMode', postMode);
    form.append('description', description);
    if (templateKey) form.append('templateKey', templateKey);
    if (file) form.append('file', file);

    try {
      const response = await fetch('/api/generate', { method: 'POST', body: form });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? 'Generation failed.');
        setBusy(false);
        return;
      }

      const result = data as GenerateResult;

      if (result.postId) {
        // Straight to the finished post. Nothing opens until it is written and
        // saved, so the page is never half-there.
        router.push(`/posts/${result.postId}`);
        // No setBusy(false): the page is navigating away, and dropping the
        // loader first would flash a finished-looking form for half a second.
        return;
      }

      // Saved nowhere, but the file is real. Offer it directly rather than
      // losing a finished carousel to a database problem.
      if (result.fallbackBase64) {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = toObjectUrl(result.fallbackBase64, result.mimeType);
        objectUrlRef.current = url;
        setRescue({ result, url });
      }
      setError(result.warnings.join(' '));
      setBusy(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'The request could not complete.',
      );
      setBusy(false);
    }
  }

  return (
    <AnimatePresence mode="wait">
      {busy ? (
        <motion.div key="loading" className="flex justify-center py-16">
          <GeneratingLoader />
        </motion.div>
      ) : (
        <motion.div
          key="form"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-5"
        >
          <section className="card">
            <h2 className="mb-3 text-fluid-sm font-semibold uppercase tracking-widest text-foreground">
              Type
            </h2>
            <div className="grid gap-3 xs:grid-cols-2">
              {MODES.map((mode) => {
                const Icon = mode.icon;
                const active = postMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setPostMode(mode.id)}
                    aria-pressed={active}
                    className={`rounded-2xl border p-4 text-left transition-colors ${
                      active
                        ? 'border-foreground/40 bg-white/80'
                        : 'border-line bg-white/40 hover:border-foreground/25'
                    }`}
                  >
                    <Icon
                      className={`mb-2 h-4 w-4 ${active ? 'text-foreground' : 'text-muted'}`}
                      aria-hidden
                    />
                    <div className="text-fluid-sm font-semibold text-foreground">{mode.label}</div>
                    <div className="text-fluid-xs text-muted">{mode.hint}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3 text-fluid-sm font-semibold uppercase tracking-widest text-foreground">
              What is it about
            </h2>

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                pickFile(event.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed p-8 text-center transition-colors ${
                dragging ? 'border-foreground/50 bg-white/80' : 'border-line bg-white/40 hover:border-foreground/30'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center gap-3">
                  <FileArchive className="h-4 w-4 text-foreground" aria-hidden />
                  <span className="text-fluid-sm font-medium text-foreground">{file.name}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setFile(null);
                      if (inputRef.current) inputRef.current.value = '';
                    }}
                    className="rounded-full p-1 text-muted transition-colors hover:bg-canvas-deep hover:text-foreground"
                    aria-label="Remove file"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="mb-2 h-5 w-5 text-muted" aria-hidden />
                  <p className="text-fluid-sm font-medium text-foreground">
                    Drop a project .zip here
                  </p>
                  <p className="mt-1 text-fluid-xs text-muted">
                    node_modules, .git, dist and .next are skipped automatically
                  </p>
                </>
              )}
            </div>

            <div className="my-4 flex items-center gap-3 text-fluid-xs uppercase tracking-widest text-muted">
              <span className="h-px flex-1 bg-line" />
              or describe it
              <span className="h-px flex-1 bg-line" />
            </div>

            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={6}
              placeholder="Describe the system, the problem it solves, and the stack behind it."
              className="field-input resize-y"
            />

            {/* A single image post uses no slide design, so the picker would
                be a control that changes nothing. */}
            {postMode === 'carousel' ? (
              <label className="mt-4 block text-fluid-xs uppercase tracking-widest text-muted">
                Slide design
                <select
                  value={templateKey}
                  onChange={(event) => setTemplateKey(event.target.value)}
                  className="field-input mt-1.5 text-fluid-sm normal-case tracking-normal"
                >
                  <option value="">Let the model choose</option>
                  {templates.map((template) => (
                    <option key={template.template_key} value={template.template_key}>
                      {template.template_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="mt-4 rounded-2xl border border-line bg-white/50 px-4 py-3 text-fluid-xs text-muted">
                You will get the caption and an image prompt to paste into Google Labs Flow. Bring
                the picture back and upload it onto the post.
              </p>
            )}

            <button type="button" onClick={submit} className="btn-primary mt-5 w-full">
              <Sparkles className="h-4 w-4" aria-hidden />
              {postMode === 'carousel' ? 'Generate carousel' : 'Generate text and prompt'}
            </button>

            <HealthLine />
          </section>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-fluid-xs text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          ) : null}

          {rescue ? (
            <div className="card">
              <h2 className="text-fluid-sm font-semibold text-foreground">
                Your post is ready but was not saved
              </h2>
              <p className="mt-1 text-fluid-xs text-muted">
                It will not appear under Previous Posts. Download it now to keep it.
              </p>
              <a
                href={rescue.url}
                download={rescue.result.fileName}
                className="btn-primary mt-4 !px-5 !py-2 !text-fluid-xs"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download {rescue.result.mimeType === 'application/pdf' ? 'PDF' : 'PNG'}
              </a>
              <textarea
                readOnly
                value={rescue.result.caption}
                rows={10}
                className="field-input mt-4 resize-y text-fluid-sm"
              />
            </div>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
