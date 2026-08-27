# Images for the slide designs

Drop image files in this folder and a slide design can use them. The Portrait
design needs one; nothing else here does yet.

## What to put here

| File | Used by | What it should be |
| --- | --- | --- |
| `portrait.jpg` | Level One Portrait | A photograph of you. It fills the whole first slide and the whole last slide, so a head and shoulders shot with room around you works best. |
| `background.jpg` | optional, nothing yet | A background image, if you ever want one instead of the built in gradient. |

`.jpg`, `.jpeg`, `.png`, `.webp` and `.avif` all work. The name before the dot
is what the design asks for, so the file must be called `portrait`, not
`portrait-final-2`.

## Size

**Keep it under 4MB**, and 1080 pixels wide is all a slide can show — anything
larger is thrown away by the renderer at that width anyway. A file over 4MB is
skipped with a note in the server log, because eight slides have to fit inside
a 10MB limit between them.

## Until you add one

The Portrait design does not appear in the picker at all until `portrait.*` is
in this folder. That is deliberate: a design built around a photograph should
not offer itself with an empty frame where the photograph goes. `/api/templates`
says which file it is waiting for.

## How it gets into the PDF

Not by path. A slide design is handed to the browser with no address of its
own, so `/portrait.jpg` would point at nothing and the picture would silently
vanish from the PDF. The file is read and embedded instead, which is why it
lives here in the repository rather than being uploaded somewhere. Add the
file, commit it, redeploy.
