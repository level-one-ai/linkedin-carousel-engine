# PocketBase Collection Reference

Three collections back this engine. `npm run seed` creates all three for you, so you only need this
page if you want to build them by hand in the admin UI at http://localhost:8090/_/ or change them
later.

A note on wording: PocketBase used to call the list of columns a "schema". Since version 0.23 it
calls the same thing "fields". They mean the same thing. The seed script sends the new shape first
and falls back to the old one, so it works on either version.

---

## Collection 1: `html_templates`

This is where your slide designs live. Each row is one complete HTML file with Handlebars
placeholders in it. This is the collection you will actually edit over time, because adding a new
row here is how you add a new carousel look.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `template_key` | text | yes | The short id the AI returns, for example `dark_technical`. Lowercase, no spaces. A unique index is set on this field so two rows cannot share a key. |
| `template_name` | text | yes | The friendly name shown in the dashboard dropdown, for example "Dark Technical Deep Dive". |
| `category` | text | yes | A plain sentence describing what this design is good for. **The AI reads this field to decide which template to pick**, so write it as a description, not as a one word label. |
| `raw_html` | editor | yes | The full HTML of the template, including its `<style>` block and its `@page` rule. |

**API rules:** `listRule` and `viewRule` are set to empty strings, which in PocketBase means "anyone
can read". The server reads templates on every generation, and this keeps it working even before
you add admin credentials. Create, update, and delete stay locked to the superuser.

**Why `template_key` needs the unique index:** the app looks templates up by key. Without the index
you could seed two rows with the same key and get an unpredictable one back.

### Adding your own template

1. Write your HTML with `@page { size: 1080px 1350px; margin: 0; }` and a `.slide` block that is
   exactly `1080px` by `1350px` with `page-break-after: always`.
2. Loop your slides with `{{#each slides}}`. Inside the loop you have `heading`, `body`, `bullets`,
   `kicker`, `number`, `isFirst`, and `isLast`. Reach outside the loop with `{{../title}}`,
   `{{../subtitle}}`, and `{{../totalLabel}}`.
3. Add a row in the admin UI, or drop the file in `templates/` and add it to `TEMPLATES` in
   `scripts/seed-pocketbase.mjs` and to `TEMPLATE_MANIFEST` in `lib/template-seed.ts`, then rerun
   `npm run seed`.

Templates whose key starts with `single_image` are offered only in Single Image Post mode. Every
other template is offered only in PDF Carousel mode.

---

## Collection 2: `generated_posts`

One row per successful generation. This is your history, so you can find a caption you wrote last
month without regenerating it.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `input_type` | text | yes | `zip` or `text`, depending on what you gave the engine. |
| `source_name` | text | no | The zip file name, or "Text description" when you typed the input. |
| `post_mode` | text | yes | `carousel` or `image`. |
| `caption_text` | text | yes | The finished caption, after emojis are stripped. Max length is raised to 6000 characters because a long carousel caption can run past the default. |
| `chosen_template_key` | text | yes | Which template was actually used. Useful for seeing which designs you reach for most. |

PocketBase adds `id`, `created`, and `updated` to every collection automatically, so there is no
need to define a timestamp field yourself.

**API rules:** none are opened. The server writes these rows while signed in as the superuser. If
the write fails, the generation still succeeds and a warning goes to the server console. Losing a
history row should never cost you a finished carousel.

---

## Collection 3: `error_logs`

Not in the original specification, but the spec asks PocketBase to store "execution error logs", and
a separate collection keeps failures out of your post history.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `stage` | text | yes | Where it broke: `generate`, `templates`, and so on. |
| `message` | text | yes | The error message, capped at 2000 characters. |
| `details` | text | no | The full error, capped at 5000 characters. |

**API rules:** none are opened, same reasoning as `generated_posts`.

---

## Creating the collections by hand

If you would rather not run the seed script:

1. Open http://localhost:8090/_/ and sign in with the admin account from Step 6 of `SETUP.md`.
2. Click **New collection**, choose **Base**, and name it `html_templates`.
3. Add the four fields from the table above. Use the **Plain text** type for the first three and
   **Rich editor** for `raw_html`.
4. Open the **Indexes** tab and add a unique index on `template_key`.
5. Open the **API Rules** tab and set **List** and **View** to the empty state that shows
   "Everyone", leaving the write rules locked.
6. Repeat for `generated_posts` and `error_logs`, leaving all their API rules locked.
7. Paste your template HTML into `html_templates` rows by hand, or run `npm run seed` just to load
   the templates into the collections you already made.
