'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  FileArchive,
  FileText,
  Images,
  Loader2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import CaptionBox from './CaptionBox';
import PdfDrawer from './PdfDrawer';
import type { GenerateResult, PostMode } from '@/lib/types';

interface TemplateSummary {
  template_key: string;
  template_name: string;
  category: string;
}

/** Turns the base64 payload from the API into a blob URL the viewer can read. */
function toObjectUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

export default function GeneratorForm() {
  const [postMode, setPostMode] = useState<PostMode>('carousel');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [templateKey, setTemplateKey] = useState('');
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    fetch('/api/templates')
      .then((response) => response.json())
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => setTemplates([]));
  }, []);

  // Blob URLs leak until they are revoked, so the previous one is released
  // whenever a new result replaces it and when the page unmounts.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

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
        return;
      }

      const payload = data as GenerateResult;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = toObjectUrl(payload.fileBase64, payload.mimeType);
      objectUrlRef.current = url;

      setResult(payload);
      setFileUrl(url);
      // Phase 5: the preview drawer opens on its own once assets are ready.
      setDrawerOpen(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'The request could not complete.',
      );
    } finally {
      setBusy(false);
    }
  }

  const modes: Array<{ id: PostMode; label: string; icon: typeof Images; hint: string }> = [
    { id: 'carousel', label: 'PDF Carousel', icon: Images, hint: 'Multi page 1080 x 1350 PDF' },
    { id: 'image', label: 'Single Image Post', icon: FileText, hint: 'One 1080 x 1350 PNG' },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-5">
      <section className="lg:col-span-3 space-y-6">
        <div className="rounded-2xl border border-edge bg-panel p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
            Post mode
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {modes.map((mode) => {
              const Icon = mode.icon;
              const active = postMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setPostMode(mode.id)}
                  className={`rounded-xl border p-4 text-left transition ${
                    active
                      ? 'border-accent bg-accent/10'
                      : 'border-edge bg-ink hover:border-slate-600'
                  }`}
                >
                  <Icon className={`mb-2 h-5 w-5 ${active ? 'text-accent' : 'text-slate-400'}`} />
                  <div className="font-semibold">{mode.label}</div>
                  <div className="text-sm text-slate-400">{mode.hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-edge bg-panel p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
            Source material
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
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${
              dragging ? 'border-accent bg-accent/10' : 'border-edge hover:border-slate-600'
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
                <FileArchive className="h-5 w-5 text-accent" />
                <span className="font-medium">{file.name}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="mb-2 h-6 w-6 text-slate-400" />
                <p className="font-medium">Drop a project .zip here</p>
                <p className="text-sm text-slate-400">
                  node_modules, .git, dist and .next are skipped automatically
                </p>
              </>
            )}
          </div>

          <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-widest text-slate-500">
            <span className="h-px flex-1 bg-edge" />
            or describe it
            <span className="h-px flex-1 bg-edge" />
          </div>

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={6}
            placeholder="Describe the system, the problem it solves, and the stack behind it."
            className="w-full resize-y rounded-xl border border-edge bg-ink p-4 text-sm outline-none focus:border-accent"
          />

          <label className="mt-4 block text-sm text-slate-400">
            Template
            <select
              value={templateKey}
              onChange={(event) => setTemplateKey(event.target.value)}
              className="mt-1 w-full rounded-xl border border-edge bg-ink p-3 text-sm text-slate-100 outline-none focus:border-accent"
            >
              <option value="">Let the model choose</option>
              {templates.map((template) => (
                <option key={template.template_key} value={template.template_key}>
                  {template.template_name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing, rendering, and compiling
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate post
              </>
            )}
          </button>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </section>

      <section className="lg:col-span-2">
        <CaptionBox
          result={result}
          fileUrl={fileUrl}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
      </section>

      <PdfDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        fileUrl={fileUrl}
        fileName={result?.fileName ?? 'linkedin-post'}
        mimeType={result?.mimeType ?? 'application/pdf'}
        slideCount={result?.slideCount ?? 0}
      />
    </div>
  );
}
