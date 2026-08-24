# Automated AI LinkedIn Carousel and Content Generator Engine

Turns a project `.zip` or a plain text description into a publication ready LinkedIn post: a written
caption plus a 1080 x 1350 PDF carousel or a single PNG graphic.

No third party SaaS. Gemini writes the words, a self hosted Gotenberg container renders the pixels,
and a self hosted PocketBase instance stores the slide designs and the history.

**New here? Read [SETUP.md](SETUP.md).** It walks through every environment variable in plain
language. For the database layout, see [POCKETBASE.md](POCKETBASE.md).

---

## Quick start

```bash
cp .env.example .env.local          # then fill in GEMINI_API_KEY, see SETUP.md
docker compose up -d gotenberg pocketbase
docker compose exec pocketbase /usr/local/bin/pocketbase superuser upsert you@example.com YourPassword123
npm install
npm run seed                        # creates collections, loads the four starter templates
npm run dev                         # http://localhost:3001
```

To run the whole thing in Docker instead of the last step, set `GOTENBERG_URL=http://gotenberg:3000`
and `POCKETBASE_URL=http://pocketbase:8090` in `.env.local`, then `docker compose up -d`.

---

## How a generation flows

1. **Ingestion.** `lib/unzipper.ts` reads the `.zip` in memory with `jszip`. It never writes to
   disk. `node_modules`, `.git`, `dist`, `.next`, build output, and dotfiles are dropped. What
   remains is `README.md`, `package.json`, architecture docs, and source files. Everything is merged
   into one Codebase Context String, with descriptive files first so they survive the size cap.
2. **Analysis.** `lib/gemini.ts` sends that string to `gemini-2.5-flash` with a `responseSchema`.
   One call returns the caption, the chosen `template_key`, and the slide by slide payload.
3. **Rendering.** `lib/render.ts` pulls the raw HTML for that key out of PocketBase and merges the
   payload in with Handlebars.
4. **Compilation.** `lib/gotenberg.ts` posts the HTML as `index.html` to the local Gotenberg
   container. Carousel mode hits `/forms/chromium/convert/html` for a multi page PDF. Image mode
   hits `/forms/chromium/screenshot/html` for one PNG.
5. **Preview.** The dashboard shows the caption in an editable box with a copy button, and a
   slide over drawer opens on its own with a page by page `react-pdf` preview and a download button.

`lib/pipeline.ts` sequences all of it. If PocketBase is unreachable, the four starter templates in
`templates/` are used instead so a generation still completes.

---

## The zero emoji rule

The system prompt bans emojis, but a prompt is a request, not a guarantee. Every string that reaches
a caption, a slide, or the rendered HTML also passes through `lib/sanitize.ts`, which strips
pictographs, dingbats, keycaps, regional indicator flags, and the zero width joiners and variation
selectors left behind. The rule holds even when the model slips.

---

## Layout

```
app/
  api/generate/route.ts     the one endpoint that runs the pipeline
  api/templates/route.ts    template list for the picker
  api/health/route.ts       readiness of Gemini, Gotenberg, and PocketBase
  page.tsx                  dashboard
components/
  GeneratorForm.tsx         mode toggle, drop zone, text input, template picker
  CaptionBox.tsx            editable caption, copy to clipboard, download
  PdfDrawer.tsx             slide over drawer, opens on completion
  PdfViewer.tsx             react-pdf Document and Page, client only
  HealthStrip.tsx           the three status lights
lib/
  unzipper.ts               jszip extraction and filtering
  gemini.ts                 system prompt and structured output schema
  gotenberg.ts              PDF and PNG conversion client
  pocketbase.ts             SDK client, template reads, post and error logging
  render.ts                 Handlebars merge
  sanitize.ts               emoji stripping
  pipeline.ts               end to end orchestration
  config.ts                 every environment variable, read in one place
templates/                  the four starter slide designs
scripts/seed-pocketbase.mjs collection creation and template seeding
```

---

## Slide geometry

Every template declares:

```css
@page { size: 1080px 1350px; margin: 0; }
.slide { width: 1080px; height: 1350px; page-break-after: always; }
```

Gotenberg is also given the same page size explicitly, as `11.25in` by `14.0625in`, which is
1080 x 1350 at Chromium's 96 DPI. Chromium writes the resulting page box as 810 x 1013 PDF points.
That is the 4:5 ratio LinkedIn wants, within half a point.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dashboard on http://localhost:3001 |
| `npm run build` | Production build |
| `npm run seed` | Create collections and load the starter templates. Safe to rerun. |
| `npm run typecheck` | TypeScript, no emit |
| `docker compose up -d` | All three services |
| `docker compose down` | Stop everything. The database on disk is kept. |
