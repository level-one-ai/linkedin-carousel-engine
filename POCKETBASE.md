# PocketBase Collection Reference

Three collections back this engine. `npm run seed` creates all three for you and keeps them up to
date, so you only need this page if you want to build them by hand in the admin UI at
http://localhost:8090/_/ or change them later.

**Sharing a database with the CV system is fine.** These three names do not collide with
`cv_profile`, `cv_experience`, `cv_projects`, `cv_template`, `applications` or `scraped_jobs`. One
PocketBase, one superuser, one volume, both apps.

A note on wording: PocketBase used to call the list of columns a "schema". Since version 0.23 it
calls the same thing "fields". They mean the same thing. The seed script sends the new shape first
and falls back to the old one, so it works on either version.

---

## Collection 1: `html_templates`

**Read this first: the app does not get its slide designs from here.** They are read from the
`templates/` folder in the repository, which is the source of truth. This collection holds a copy,
plus any design you add under a key the folder does not have — those *are* read, so a new design can
still be added without a deploy.

The split exists because `raw_html` is an `editor` field, and the admin UI puts a rich text editor in
front of it. A template pasted in there comes back escaped into visible text or stripped of its
`<style>` block, and a carousel then renders as a page of its own source code, saved as one slide.
Files in git cannot be damaged that way, so the five designs that matter were moved out of reach.

Each row is one complete HTML file with Handlebars placeholders in it.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `template_key` | text | yes | The short id the AI returns, for example `level_one_noir`. Lowercase, no spaces. A unique index is set on this field. |
| `template_name` | text | yes | The friendly name shown in the dashboard dropdown. |
| `category` | text | yes | A plain sentence describing what this design is good for. **The AI reads this field to decide which template to pick**, so write it as a description, not a one word label. |
| `raw_html` | editor | yes | The full HTML of the template, including its `<style>` block and its `@page` rule. |

**API rules:** `listRule` and `viewRule` are empty strings, which in PocketBase means "anyone can
read". The server reads templates on every generation and this keeps it working even before admin
credentials are set. Create, update and delete stay locked to the superuser.

### The eight-slide blueprint

Every carousel follows the same shape, and the model is told it slide by slide.
Each slide carries a `role` that the template styles on:

| # | role | What goes on it |
| --- | --- | --- |
| 1 | `hook` | The cover. Logo, LEVEL ONE wordmark, the headline that stops the scroll, a one line benefit, the counter and a swipe pill. |
| 2 | `problem` | Why this matters, or the mistake people make. |
| 3-6 | `point` | One distinct idea, step or architecture point each. |
| 7 | `summary` | A checklist recap of slides 3 to 6. |
| 8 | `cta` | Save, comment, follow. No new information. |

A template does not need eight hardcoded blocks. It loops `{{#each slides}}` and
branches on `{{#if isHook}}`, `{{#if isSummary}}`, `{{#if isCta}}` and so on, so
the cover, the checklist and the sign off each look different from the four
middle slides.

### The five designs

| Key | Look | Reaches for |
| --- | --- | --- |
| `level_one_cream` | Flat cream, no texture | Step by step walkthroughs |
| `level_one_noir` | Near black with smoke | Myth busting, hard truths |
| `level_one_mist` | White with pale smoke | Tool stacks, architecture |
| `level_one_sand` | Flat warm beige | Business outcomes, results |
| `level_one_slate` | Grey with heavy smoke | Mistakes, risk, warnings |

The smoke is a JPEG baked into the template as a data URI, so a design is still
one self-contained file with nothing to fetch. It started as an inline SVG
turbulence filter, which does not survive being printed: Chromium cannot express
a filter in a PDF, so it rasterises one at the size the element is *painted* —
1080 x 1350, once per slide. Measured on eight slides that came to 9.8MB for
noir, 23.3MB for mist and 9.5MB for slate, against a 10MB `asset` field. Mist
could never have been saved.

`scripts/bake-smoke.mjs` runs each filter once, composited onto that design's own
background, and writes the result in. About 30KB each, and the PDFs land under
100KB. Compositing is what makes it small, because an alpha channel is most of a
PNG of soft grey noise. Rerun it only if the smoke itself is being redesigned.

The logo is injected by the renderer as `{{logoDataUri}}` rather than pasted
into each file. Templates are handed to Chromium through `setContent`, which
gives the page no origin, so `/logo-mark.png` would resolve to nothing and the
mark would silently vanish from every carousel.

### Adding your own design

Put the file in `templates/` and add an entry to `templates/index.json` — key, name, file and the
`category` sentence the model reads to choose between designs. A `.html` with no entry still works;
it just gets its name from the filename and a generic description.

To add one to a live database without redeploying, use the same key rules and run `npm run seed`
against it (see `SETUP.md`). Never paste a template into the admin UI.

1. Write your HTML with `@page { size: 1080px 1350px; margin: 0; }` and a `.slide` block that is
   exactly `1080px` by `1350px` with `page-break-after: always`.
2. Loop your slides with `{{#each slides}}`. Inside the loop you have `heading`, `body`, `bullets`,
   `kicker`, `role`, `number`, `isFirst`, `isLast` and one boolean per role: `isHook`, `isProblem`,
   `isPoint`, `isSummary`, `isCta`. Reach outside the loop with `{{../title}}`, `{{../subtitle}}`,
   `{{../totalLabel}}`, `{{../wordmark}}` and `{{../logoDataUri}}`.
3. Add a row in the admin UI, or drop the file in `templates/`, add it to `TEMPLATES` in
   `scripts/seed-pocketbase.mjs` and `TEMPLATE_MANIFEST` in `lib/template-seed.ts`, then rerun
   `npm run seed`.

Single image posts use no template at all. They are stored with
`chosen_template_key` set to `user_image`, because the field is required and
there is no design behind them: the picture comes from Google Labs Flow.

You do not have to be precious about fitting the text exactly. Before anything is captured, the
renderer shrinks any slide whose content overruns the canvas until it fits, so a slightly long
heading degrades into slightly smaller type rather than a clipped bullet.

---

## Collection 2: `generated_posts`

One row per post, **including the file itself**. This is what Previous Posts reads, and what makes
a post from six weeks ago openable rather than gone.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `input_type` | text | yes | `zip` or `text`. |
| `source_name` | text | no | The zip file name, or "Text description". |
| `post_mode` | text | yes | `carousel` or `image`. |
| `caption_text` | text | yes | The finished caption. **Max is set to 6000 explicitly.** A blank max on a PocketBase text field does not mean unlimited: it means 5000, and a long carousel caption goes past that. |
| `chosen_template_key` | text | yes | Which design was used. |
| `template_name` | text | no | Its friendly name, shown on the card. |
| `project_title` | text | no | The card heading and the download filename. |
| `slide_count` | number | no | Counted from the real PDF, not from what the model intended. |
| `mime_type` | text | no | `application/pdf` or `image/png`. |
| `file_name` | text | no | The name downloads are saved under. |
| `hashtags` | json | no | Rendered as pills on the detail screen. |
| `image_prompt` | text (max 4000) | no | Single image posts: the Google Labs Flow prompt. Kept on the record so it can be re-run months later without regenerating the post. |
| `asset` | file, protected | no | **The carousel PDF, or the picture you upload onto a single image post.** maxSelect 1, max 10MB. Empty on an image post until you add the picture. |
| `thumbnail` | file, protected | no | Slide one as a JPEG, max 2MB, for the history grid. |
| `created` / `updated` | autodate | — | **Must exist.** The grid sorts on `created`, and sorting on a field PocketBase does not have is a 400 on the listing, not an empty page. |

**Why the files are `protected`:** a protected file cannot be fetched without a token.
`app/api/posts/[id]/file/route.ts` mints one per request with `pb.files.getToken()`, so the bytes
are served from your own origin and no PocketBase session is ever exposed to the browser.

**Why the thumbnail is JPEG:** slide one is a full 1080 x 1350 frame, and as a PNG a smoke design
runs past 600KB because soft gradients are the worst case for lossless compression. The same frame
at quality 72 is around 60KB, and the grid loads one per card. An uploaded picture is scaled down
the same way before it is stored.

**API rules:** none are opened. The server reads and writes these while signed in as the superuser.

**A single image post starts with no `asset`.** That is normal, not a failure: the caption and the
prompt are saved first, and the picture arrives later through the upload panel on the post. The
grid marks those posts "Needs image" until it does.

**If `asset` is missing from your collection,** PocketBase discards the file on create *without
complaining* — the caption saves and the carousel silently vanishes. The app logs a warning when it
notices, and `npm run seed` adds the field. This is exactly what the migration path below is for.

---

## Collection 3: `error_logs`

Not in the original specification, but the spec asks PocketBase to store "execution error logs",
and a separate collection keeps failures out of your post history.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `stage` | text | yes | Where it broke: `generate`, `templates`, `save-post`. |
| `message` | text | yes | The error message, capped at 2000 characters. |
| `details` | text | no | The full error, capped at 5000 characters. |

**API rules:** none are opened, same reasoning as `generated_posts`.

---

## Updating an existing database

`npm run seed` is safe to run as many times as you like:

- A collection that does not exist is created.
- A collection that exists keeps every field it already has, and only **missing** fields are added.
  A max length or an API rule you changed by hand in the admin UI survives a reseed.
- Templates are matched on `template_key`, so an existing row is updated rather than duplicated.

That last point matters if you seeded before file storage existed. Running the script again prints
something like:

```
Updated generated_posts: added template_name, project_title, slide_count, mime_type,
file_name, hashtags, asset, thumbnail, created, updated.
```

and your history starts keeping files from the next post onwards. Posts saved before that keep
their caption and show a note on the detail screen explaining the file was not stored.

---

## Creating the collections by hand

If you would rather not run the seed script:

1. Open http://localhost:8090/_/ and sign in with the admin account from Step 6 of `SETUP.md`.
2. Click **New collection**, choose **Base**, and name it `html_templates`.
3. Add the four fields from the table above. Use **Plain text** for the first three and
   **Rich editor** for `raw_html`.
4. Open the **Indexes** tab and add a unique index on `template_key`.
5. Open the **API Rules** tab and set **List** and **View** to the state that shows "Everyone",
   leaving the write rules locked.
6. Repeat for `generated_posts` and `error_logs`, leaving all their API rules locked. On the two
   file fields, tick **Protected**. Add the `created` and `updated` autodate fields explicitly.
7. Run `npm run seed` to load the templates. **Do not paste them into the admin UI by hand.**
   `raw_html` is an `editor` field, so PocketBase puts a rich text editor in front of it, and a
   rich text editor assumes you are writing prose. A pasted template comes back either escaped
   into visible text or stripped of its `<style>` block. Neither looks like a failure, and both
   render as a page of HTML source code saved as a one slide carousel.

   The app defends itself against this: a design stored as escaped text is unscrambled on the way
   out of the database and saved back properly, and one damaged past repair is replaced with the
   built in copy of the same key. Both say so in the warnings under the post, and
   **/api/templates** reports `ok` and `problem` per design so you can check without generating
   anything. That is a safety net, not a licence — seed them.
