# Automated AI LinkedIn Carousel and Content Generator Engine

Turns a project `.zip` or a plain text description into a publication ready LinkedIn post: a
written caption plus a 1080 x 1350 PDF carousel or a single PNG graphic. Every post is saved, so
you can reopen one from six weeks ago and get the same caption and the same file back.

No third party SaaS. Gemini writes the words, a headless Chromium renders the pixels, and a self
hosted PocketBase stores the slide designs and the history.

**Getting started:** [SETUP.md](SETUP.md) walks through every setting in plain language.
**Deploying:** [COOLIFY.md](COOLIFY.md). **Database layout:** [POCKETBASE.md](POCKETBASE.md).

---

## The two screens that matter

The front door has two buttons.

- **Create New Post** takes a `.zip` or a description, writes the post, renders the slides, saves
  it, and opens it.
- **Previous Posts** is every post you have made, as cards. Click one and it opens in full: the
  caption with a copy button, the slides page by page, and a download.

---

## Quick start

```bash
cp .env.example .env.local          # then fill in GEMINI_API_KEY, see SETUP.md
docker compose up -d pocketbase
docker compose exec pocketbase /usr/local/bin/pocketbase superuser upsert you@example.com YourPassword123
npm install
npm run seed                        # creates collections, loads four starter templates
npm run dev                         # http://localhost:3001
```

Rendering needs a Chrome or Chromium. If you have Google Chrome installed, nothing to do. If not:
`npx playwright install --with-deps chromium`.

---

## How a generation flows

1. **Ingestion.** `lib/unzipper.ts` reads the `.zip` in memory with `jszip`. It never writes to
   disk. `node_modules`, `.git`, `dist`, `.next`, build output and dotfiles are dropped. What
   remains is `README.md`, `package.json`, architecture docs and source files, merged into one
   Codebase Context String with descriptive files first so they survive the size cap.
2. **Analysis.** `lib/gemini.ts` sends that string to `gemini-2.5-flash` with a `responseSchema`.
   One call returns the caption, the chosen `template_key` and the slide by slide payload.
3. **Rendering.** `lib/render.ts` pulls the raw HTML for that key out of PocketBase and merges the
   payload in with Handlebars.
4. **Compilation.** `lib/chromium.ts` drives headless Chromium directly: `page.pdf()` at
   11.25in x 14.0625in for a carousel, `page.screenshot()` for an image post, plus a JPEG of
   slide one for the history cards. All three come from one browser launch.
5. **Persistence.** `lib/pocketbase.ts` writes the record with the binary attached, and the
   browser is sent to the finished post.

`lib/pipeline.ts` sequences all of it. If PocketBase is unreachable the four starter templates in
`templates/` are used instead, and a post that cannot be saved is handed to the browser directly
rather than lost.

---

## Why there is no Gotenberg

Gotenberg is a headless Chromium with an HTTP API in front of it. Driving Chromium directly gives
identical output with no second container to deploy and no network hop, which is what lets the
whole system run as one Coolify application. The trade is that a Chromium has to exist wherever
the app runs, which is why the Dockerfile installs one.

That Dockerfile also installs `fonts-liberation`, and that is not optional. The templates ask for
`"Helvetica Neue", Helvetica, Arial` and for `Georgia, "Times New Roman"`. Liberation Sans and
Liberation Serif are the metric-compatible stand-ins those resolve to on Linux. Measured on the
light template with a dense slide: Liberation renders it 1428px tall, DejaVu — Chromium's fallback
when Liberation is absent — renders the same slide 1648px tall. On a 1350px canvas that is the
difference between a slide that fits and one missing its last two bullets.

---

## Two safeguards worth knowing about

**Nothing is silently clipped.** Slide copy is written against a word budget, not a pixel budget,
so a long heading plus four bullets can overflow 1350px. The slide has `overflow: hidden`, which
means an overflow does not look broken — it looks like the last bullet was never written. Before
anything is captured, `lib/chromium.ts` shrinks any overflowing slide with `zoom` until it fits,
compensating the width and height so the rendered box stays exactly 1080 x 1350. If a slide still
does not fit at the smallest legible size, the post comes back with a warning naming that slide.

**No emojis, enforced twice.** The system prompt bans them, but a prompt is a request. Every
string that reaches a caption, a slide or the rendered HTML also passes through `lib/sanitize.ts`,
which strips pictographs, dingbats, keycaps, regional indicator flags and the zero width joiners
and variation selectors left behind.

---

## Layout

```
app/
  page.tsx                  front door, two buttons
  create/page.tsx           the generator
  posts/page.tsx            history grid
  posts/[id]/page.tsx       one post in full
  api/generate/route.ts     runs the pipeline
  api/posts/                list, read, and file streaming
  api/templates/route.ts    template list for the picker
  api/health/route.ts       readiness of Gemini, Chromium and PocketBase
components/
  GeneratorForm.tsx         mode toggle, drop zone, text input, template picker
  PostCard.tsx              one post in the history grid
  PdfViewer.tsx             react-pdf, one framed slide per page
  CopyButton.tsx            clipboard with an insecure-context fallback
  GeneratingLoader.tsx      the sweeping ring shown while working
  Background3D.tsx          the WebGL canvas, faster while generating
  HealthLine.tsx            speaks up only when something is actually wrong
lib/
  unzipper.ts               jszip extraction and filtering
  gemini.ts                 system prompt and structured output schema
  chromium.ts               PDF, PNG and thumbnail rendering, plus auto-fit
  pocketbase.ts             client, template reads, post saving, file records
  render.ts                 Handlebars merge
  sanitize.ts               emoji stripping
  pipeline.ts               end to end orchestration
  config.ts                 every environment variable, read in one place
templates/                  the four starter slide designs
scripts/seed-pocketbase.mjs collection creation, migration and template seeding
```

---

## Slide geometry

Every template declares:

```css
@page { size: 1080px 1350px; margin: 0; }
.slide { width: 1080px; height: 1350px; page-break-after: always; }
```

Chromium is also given the same page size explicitly, as `11.25in` by `14.0625in`, which is
1080 x 1350 at its 96 DPI. It writes the resulting page box as 810 x 1013 PDF points. That is the
4:5 ratio LinkedIn wants, within half a point.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dashboard on http://localhost:3001 |
| `npm run build` | Production build |
| `npm run seed` | Create or update collections and load the starter templates. Safe to rerun. |
| `npm run typecheck` | TypeScript, no emit |
| `docker compose up -d` | PocketBase and the app locally |
