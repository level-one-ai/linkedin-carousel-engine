# Automated AI LinkedIn Carousel and Content Generator Engine

Turns a project `.zip` or a plain text description into a publication ready LinkedIn post: a
written caption plus either a 1080 x 1350 PDF carousel it renders itself, or an image prompt you
run through Google Labs Flow and upload back. Every post is saved, so you can reopen one from six
weeks ago and get the same caption and the same file back.

No third party SaaS. Gemini writes the words, a headless Chromium renders the pixels, and a self
hosted PocketBase stores the slide designs and the history.

**Getting started:** [SETUP.md](SETUP.md) walks through every setting in plain language.
**Deploying:** [COOLIFY.md](COOLIFY.md). **Database layout:** [POCKETBASE.md](POCKETBASE.md).

---

## The screens that matter

The front door has two buttons.

- **Create New Post** takes a `.zip` or a description and a **Type**: Carousel or Single Image.
- **Previous Posts** is every post you have made, as cards. Click one and it opens as a four tab
  workspace, one per network.

### Four networks, four captions, four previews

One generation writes four captions — LinkedIn, X, Facebook, Instagram — each to that network's own
brief, because a LinkedIn post and an X post are different pieces of writing rather than one
truncated. Each tab draws the post inside that network's own chrome, with that network's truncation
and image treatment: LinkedIn as a document carousel, X at 16:9 with its 280 character count,
Instagram square-ish with the caption cut after one line, Facebook with a generous fold.

Each tab has an **approval checkbox** and a **Redo this post** button. Redo rewrites that one
caption and writes that one field — verified: with two networks approved, a redo of X changed
exactly one field of the whole record.

Each network also gets its own **post type** (Carousel, Single Image or Skip), its own **design**,
and an **account type** for the whole post — personal or business. A design declares its own page
size, so an Instagram square is a real square rather than a cropped portrait. Two networks on one
design share a single render, because two identical renders is two browser launches for one result.

**Publishing** goes direct to each network's own API: a LinkedIn personal profile (as a document
carousel), a Facebook Page, and an Instagram professional account. X and a LinkedIn **company page**
are never sent — X is pay-per-use and a company page needs an approval LinkedIn does not hand to a
self-serve app — so those two captions are copied and posted by hand. Every send writes a row to
`post_publications`, and a retry updates that row rather than adding a second. See `SETUP.md` for
where each token comes from.

### Making a new design

`/templates/new` takes a description and a piece of HTML to take the look from, and Gemini writes a
full eight slide design. It is **rendered before it is offered** — a design that cannot produce
eight pages is handed back with the reason rather than added to the picker, which is the failure
this system has already had. On success it is saved to PocketBase, so it is usable immediately, and
committed to `templates/` so it is in git.

### The two types

**Carousel.** Gemini picks one of your six carousel designs, writes eight slides against a fixed
blueprint, and Chromium renders them at the size that design declares. Caption and PDF are saved
together and the post opens straight away.

**Single Image.** The picture is made in Google Labs Flow, not here, so the engine writes the
caption **and the prompt that produces the picture**. Copy the prompt, generate the image, then
drop it onto the post. Until you do, the post is marked "Needs image" in the grid and the preview
shows an empty frame where the picture will go.

That split is deliberate. The app can render slides better than a diffusion model can, and a
diffusion model can make a photograph the app never could.

---

## Quick start

```bash
cp .env.example .env.local          # then fill in GEMINI_API_KEY, see SETUP.md
docker compose up -d pocketbase
docker compose exec pocketbase /usr/local/bin/pocketbase superuser upsert you@example.com YourPassword123
npm install
npm run seed                        # creates collections, loads the slide designs
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
   One call returns the caption and then, depending on the type, either the chosen `template_key`
   with eight role-tagged slides, or the Google Labs Flow prompt.
3. **Rendering.** Carousels only. `lib/render.ts` takes the raw HTML for that key — from the
   `templates/` folder, which is the source of truth — injects the logo and the wordmark, and merges
   the slide payload in with Handlebars.
4. **Compilation.** Carousels only. `lib/chromium.ts` drives headless Chromium directly:
   `page.pdf()` at 11.25in x 14.0625in, plus a JPEG of slide one for the history cards, both from
   one browser launch.
5. **Persistence.** `lib/pocketbase.ts` writes the record. A carousel arrives with its file; a
   single image post arrives without one and gets it later through `/api/posts/[id]/image`.

`lib/pipeline.ts` sequences all of it. The designs always come from `templates/`; PocketBase is
asked only for designs stored under a key that folder does not have, so one can be added without a
deploy but nothing in the database can break the five. A carousel that cannot be saved is handed to
the browser directly rather than lost.

---

## Why there is no Gotenberg

Gotenberg is a headless Chromium with an HTTP API in front of it. Driving Chromium directly gives
identical output with no second container to deploy and no network hop, which is what lets the
whole system run as one Coolify application. The trade is that a Chromium has to exist wherever
the app runs, which is why the Dockerfile installs one.

That Dockerfile also installs `fonts-liberation`, and that is not optional. The templates ask for
`"Helvetica Neue", Helvetica, Arial`, and Liberation Sans is the metric-compatible stand-in that
resolves to on Linux. Measured on a dense slide: Liberation renders it 1428px tall, DejaVu —
Chromium's fallback when Liberation is absent — renders the same slide 1648px tall. On a 1350px
canvas that is the difference between a slide that fits and one missing its last two bullets.

---

## The eight-slide blueprint

Every carousel is the same shape, and the model is told it slide by slide rather than asked for
"eight slides" and left to make them all rhyme:

| # | role | What goes on it |
| --- | --- | --- |
| 1 | `hook` | The cover that stops the scroll |
| 2 | `problem` | Why it matters, or the common mistake |
| 3-6 | `point` | One distinct idea, step or architecture point each |
| 7 | `summary` | A checklist recap |
| 8 | `cta` | Save, share, follow — and the comment ask |

Templates branch on that role, so a cover, a checklist and a sign off look nothing like the four
middle slides without the template needing eight hardcoded blocks. Every slide from 2 to 8 carries
two sentences of body copy **and** three bullets: the schema requires them and the blueprint says so
per role, because a heading with one line under it is a title, not a slide.

The sign-off slide carries one ask, in its own block: **comment a keyword and get the full project
outline and the Claude Code prompt to build your own.** The model writes that word from the project
itself — `CO-PILOT`, `OUTREACH`, `INGEST` — and puts the same word at the end of the caption, so the
slide and the post ask for the same thing. It is reduced to one printable uppercase word by
`commentKeyword()` in `lib/sanitize.ts`, both where the model's answer arrives and again where a
template renders it, because a reader has to type it back exactly.

Six carousel designs: `level_one_cream`, `noir`, `mist`, `sand`, `slate` and `portrait`. Each lays
its cover out differently — the mark centred and large, a lockup top left, a headline on a rule, the
mark bled off the right edge, a top bar — so the designs are told apart at a glance rather than by
colour alone. See [POCKETBASE.md](POCKETBASE.md).

And six single-image designs, `level_one_still_*`: a square (1080 x 1080) for Instagram and
Facebook, a tall one (1080 x 1350) for LinkedIn and a widescreen one (1600 x 900) for X, each in a
plain version and a version with the author photograph in the corner. They are **one page** — no
page counter, no swipe — because a single image has nothing to swipe to, and a carousel cover used
as one tells the reader to swipe to a page that is not there. The picker never mixes the two kinds:
a Single Image row is offered only the stills, a Carousel row only the carousels.

### The portrait design

`level_one_portrait` is built around a photograph of the author, standing in the bottom right corner
of a cream page and cut off by the bottom edge, with the words above. Two files go into
[`templates/assets/`](templates/assets/README.md): `portrait.png` in colour on the first slide, and
`background.png`, the same photograph in black and white, on the last. Both are supplied rather than
one being converted from the other, so the black and white is your own. Until both are there the
design is not offered at all, and `/api/templates` says which file it is waiting for.

**Remove the background from that photograph.** There is no frame around it: the cream it stands on
is the page. `lib/chromium.ts` carries the alpha channel through the redraw and keeps the file a PNG
for exactly this reason — painting a background behind it and saving as JPEG, which has no alpha at
all, would put you inside a coloured rectangle on a page of a different colour.

Both are redrawn at 640px, the widest any design draws a picture, before they reach a slide.
Chromium embeds an image at the resolution it is painted, so a photograph straight off a phone costs
the same either way, and a transparent cut-out has to be a lossless PNG on top of that.

---

## Two safeguards worth knowing about

**A carousel that is not a carousel does not get saved.** The page count is read off the finished
PDF, not taken from what the model intended. A slide design stored damaged — escaped into plain
text by the PocketBase admin editor, say — renders as one page of its own source code, and saving
that produces a post that says "Carousel, 1 slides" and looks like a result rather than a failure.
`lib/template-html.ts` unscrambles what it can on the way out of the database and saves the repair
back; `lib/pipeline.ts` swaps in the bundled design when it cannot, and refuses outright when the
PDF comes back with the wrong number of pages or too large for the 10MB file field.

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
  api/posts/                list, read, file streaming, and image upload
  api/templates/route.ts    template list for the picker
  api/health/route.ts       readiness of Gemini, Chromium and PocketBase
components/
  GeneratorForm.tsx         type toggle, drop zone, text input, design picker
  LinkedInPreview.tsx       the post as LinkedIn draws it, one slide at a time
  ImagePromptPanel.tsx      the Flow prompt, and the drop zone for the result
  PostCard.tsx              one post in the history grid
  PdfViewer.tsx             react-pdf, one framed slide per page
  CopyButton.tsx            clipboard with an insecure-context fallback
  GeneratingLoader.tsx      the sweeping ring shown while working
  Background3D.tsx          the WebGL canvas, faster while generating
  HealthLine.tsx            speaks up only when something is actually wrong
lib/
  unzipper.ts               jszip extraction and filtering
  gemini.ts                 system prompt, blueprint, and structured output schema
  brand.ts                  who posts, and the logo as a data URI
  chromium.ts               PDF and thumbnail rendering, plus slide auto-fit
  pocketbase.ts             client, template reads, post saving, file records
  render.ts                 Handlebars merge
  sanitize.ts               emoji stripping
  template-html.ts          un-escapes a mangled design, and rejects an unusable one
  template-assets.ts        images from templates/assets, as data URIs and in black and white
  pipeline.ts               end to end orchestration
  config.ts                 every environment variable, read in one place
templates/                  the slide designs themselves, and index.json describing them
templates/assets/           images a design uses, e.g. the portrait photograph
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
