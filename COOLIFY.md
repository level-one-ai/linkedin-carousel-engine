# Putting this on Coolify

This guide puts the carousel engine on your server so it is always there, from
any device, instead of only when your laptop is on.

It is written in plain English. Every step is one small action.

**Time needed:** about 20 minutes, plus 10 minutes waiting for the first build.

---

## The short version

If you have done this before with the CV system, it is the same shape:

1. New Application, pointed at this repository.
2. **Build Pack: Dockerfile.** Not Nixpacks. This is the click that matters.
3. Ports Exposes: `3001`.
4. Six environment variables.
5. Deploy, then run the seed script once.

The rest of this page explains each of those.

---

## Before you start

You need three things.

**1. A server connected to Coolify.** The one you already use is fine.

**2. Your PocketBase, already running on Coolify.** This is the same PocketBase
the CV system uses. You do not need a second one. The carousel engine adds three
new collections next to your CV ones and never touches them:

| The CV system's collections | This app's collections |
| --- | --- |
| `cv_profile`, `cv_experience`, `cv_projects`, `cv_template`, `applications`, `scraped_jobs` | `html_templates`, `generated_posts`, `error_logs` |

None of the names clash, so both apps can share one database and one superuser
login.

> **Check one thing first.** Your PocketBase must have a storage volume mounted
> at `/pb_data`. If it does not, everything in it is wiped every time you
> redeploy — your CV, your applications, and now your posts too. In Coolify this
> is under **Storages** on the PocketBase resource. If you set this up for the CV
> system, it is already done.

**3. This repository pushed to GitHub.**

---

## Why the Build Pack matters

Your slides are turned into a PDF by **Chromium**. Not a copy somewhere on the
internet — a real one, on the same machine as the app.

Your laptop already has a Chrome. A fresh server does not. It is empty. So the
app would read your project, write the caption, choose a design, and then fail
at the very last moment with *"Could not find a Chrome or Chromium"*.

The fix is the **`Dockerfile`** already in this project. A Dockerfile is a
recipe. It tells the server: install Chromium, install the fonts, install the
app, then start it. You do not have to edit it or understand it. You just have
to tell Coolify to use it.

Nixpacks, which is Coolify's default, builds a server with no Chromium in it.

---

## Step A — Make the application

1. In Coolify, open your project and click **+ New**, then **Application**.
2. Pick this GitHub repository.
3. Choose the branch you want to deploy.

---

## Step B — Point it at the Dockerfile

In the application's settings:

1. Find **Build Pack**.
2. Change it from **Nixpacks** to **Dockerfile**.
3. Set **Ports Exposes** to `3001`.

If your PDFs do not work later, this is the first thing to check.

---

## Step C — Add your settings

Go to **Environment Variables** and add these. They are the same ones described
in `SETUP.md`, just typed into a web page instead of a file.

| Name | What to put | Secret? |
| --- | --- | --- |
| `GEMINI_API_KEY` | Your key from https://aistudio.google.com/apikey | Yes, tick it |
| `GEMINI_MODEL` | `gemini-2.5-flash` | No |
| `POCKETBASE_URL` | Your PocketBase address, like `https://pb.yoursite.com`. **No slash on the end.** | No |
| `POCKETBASE_ADMIN_EMAIL` | The PocketBase superuser you already made | No |
| `POCKETBASE_ADMIN_PASSWORD` | Its password | Yes, tick it |
| `MAX_UPLOAD_MB` | `50` | No |

The names must match exactly, capitals and all.

> **You do not need `PDF_CHROMIUM_PATH`.** The Dockerfile sets it already. This
> catches people out, so to be clear: that setting only says *where* Chromium is.
> It cannot install one. Adding it to a server with no Chromium changes the error
> message and nothing else.

> **A note if you are comparing with the CV system.** That app calls its database
> address `NEXT_PUBLIC_POCKETBASE_URL`. This one calls it `POCKETBASE_URL`, with
> no `NEXT_PUBLIC_` on the front. That is deliberate, not a typo. Anything named
> `NEXT_PUBLIC_` gets built into the code your browser downloads. Nothing in this
> app talks to PocketBase from the browser — every database call happens on the
> server — so there is no reason to publish the address. Use `POCKETBASE_URL`
> here and `NEXT_PUBLIC_POCKETBASE_URL` there. Both can hold the same value.

---

## Step D — Deploy

Click **Deploy** and watch the log.

The first build is slow. Five to ten minutes is normal, because it is
downloading Chromium and the fonts. Later builds are much faster.

---

## Step E — Create the collections

The app needs its three collections before it can save anything. This is one
command, run once.

From your own computer, in the project folder:

```bash
POCKETBASE_URL=https://pb.yoursite.com \
POCKETBASE_ADMIN_EMAIL=you@example.com \
POCKETBASE_ADMIN_PASSWORD=YourPassword \
npm run seed
```

Put your real address, email and password in. You should see:

```
Created collection html_templates.
Created collection generated_posts.
Created collection error_logs.
Added template dark_technical.
...
Done. PocketBase is ready.
```

**It is safe to run this again.** Collections that already exist are left alone,
and if a later version of the app adds a field, running it again adds just that
field without touching anything else.

---

## Step F — Check it actually worked

Do not trust a green tick. Open the app and make a real post.

- **You get a carousel** — you are finished.
- **"Could not find a Chrome or Chromium"** — the Build Pack is still set to
  Nixpacks. Go back to Step B, change it, and deploy again.
- **A yellow box saying PocketBase is unreachable** — the address is wrong, or
  it is not running. Open that address in your browser and see.
- **A yellow box saying there are no slide designs** — you have not run Step E.
- **"GEMINI_API_KEY is not set"** — it is missing, or you have not redeployed
  since adding it.

---

## Bad gateway

A 502 or "Bad Gateway" means Coolify's proxy reached your server but got nothing
back from the container. Work through these in order.

**1. Is Ports Exposes set to 3001?** This is the usual cause. The Dockerfile
starts the app on port 3001, not the 3000 most Node apps use. If Coolify is set
to 3000 it forwards traffic to a port nothing is listening on, and you get a
bad gateway with a perfectly healthy container. Application settings, **Ports
Exposes**, `3001`.

**2. Is the Build Pack set to Dockerfile?** On Nixpacks the image has no
Chromium and no start command that matches this project.

**3. Is the container actually running?** Open the application in Coolify and
look at **Logs**. A container that started and exited leaves the proxy with
nothing to talk to. You are looking for a line like
`Network: http://0.0.0.0:3001`, which means the server came up.

**4. Did the deploy actually finish?** A build still in progress serves a bad
gateway until it swaps over. The first build takes five to ten minutes because
it downloads Chromium.

**5. Is the domain pointed at the right application?** If `media.levelone.digital`
is set on a different resource, or set on both this app and another one, the
proxy has no clean route. One domain, one application.

Once the page loads, check **/api/health** in the browser. It returns JSON
saying whether Gemini, the renderer and PocketBase are each reachable, which
tells you what to fix next without generating anything.

---

## Things that go wrong later

**I changed a setting and nothing happened.**
Settings are only read when the app starts. In Coolify, press **Redeploy**.

**Posts save but have no slides attached.**
Your `generated_posts` collection is from an older version and has no `asset`
field. PocketBase throws away a field it does not know about without saying so.
Run Step E again and it will add the missing fields.

**Everything disappeared after a redeploy.**
Your PocketBase has no volume at `/pb_data`. Add one under **Storages** on the
PocketBase resource. Anything already lost cannot be recovered.

**PDFs are slower than on my laptop.**
Each post starts a Chromium, renders, and shuts it down. On a small server that
is a few seconds. If it times out, the server is likely short of memory —
Chromium wants roughly 512MB free while it runs.

**The build fails saying it ran out of space.**
Chromium and the fonts are about 400MB. Clear old Docker images in Coolify under
**Server → Cleanup**.

---

## Keeping your keys safe

- Tick **secret** on `GEMINI_API_KEY` and `POCKETBASE_ADMIN_PASSWORD` so they are
  hidden in the Coolify interface.
- Never commit `.env.local`. The project already ignores it.
- If a key leaks, replace it. Deleting a Gemini key and making a new one takes
  ten seconds.
