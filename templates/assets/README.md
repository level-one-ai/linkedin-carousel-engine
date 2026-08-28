# Images for the slide designs

Drop image files in this folder and a slide design can use them. The Portrait
design needs one; nothing else here does yet.

## What to put here

| File | Used by | What it should be |
| --- | --- | --- |
| `portrait.png` | Level One Portrait, first slide | A photograph of you, in colour, **with the background removed**. |
| `background.png` | Level One Portrait, last slide | The same photograph in black and white, background removed. |

Two files, not one. The black and white version is yours to make rather than
something converted here, so it is your own conversion that goes on the slide.

`.png`, `.webp`, `.jpg` and `.avif` all work. The name before the dot is what the
design asks for, so the file must be called `portrait`, not `portrait-final-2`.

## Remove the background

This matters more than anything else here. The Portrait design puts you in the
bottom right corner of a cream page, cut off by the bottom edge, with the words
above you. There is no frame and no panel: the cream you are standing on is the
page itself. A photograph with its own background still attached appears as a
rectangle of some other colour sitting on the page.

So save it as a **PNG with a transparent background**. Any background remover
will do it. Transparency is carried all the way through — the file is redrawn
before it reaches the slide, and that redraw keeps the alpha channel and stays a
PNG rather than flattening it onto a colour.

A head and shoulders shot works best, since only the top two thirds of you is
visible above the bottom edge of the page.

## Size

Anything up to 12MB is read. You do not need to shrink it yourself: every image
is redrawn at 640 pixels wide, which is the widest a slide draws one, before it
is used. Measured on a heavily detailed cut-out of 1.5MB, the finished eight
slide carousel came to 1.3MB against a 10MB limit.

## Until you add them

The Portrait design does not appear in the picker at all until **both** files are
in this folder. That is deliberate: a design built around a photograph should not
offer itself with an empty space where the photograph goes. `/api/templates` says
which file it is waiting for.

## How it gets into the PDF

Not by path. A slide design is handed to the browser with no address of its own,
so `/portrait.png` would point at nothing and the pictures would silently vanish
from the PDF. The file is read and embedded instead, which is why it lives here
in the repository rather than being uploaded somewhere. Add the file, commit it,
redeploy.
