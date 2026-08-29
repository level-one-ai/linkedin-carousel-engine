# Setup Guide

This guide gets the engine running on your own computer for the first time. It is written in plain
language. You do not need to be an expert to follow it. Just do the steps in order.

Putting it on a server instead? See [COOLIFY.md](COOLIFY.md).

Plan on about 15 minutes.

---

## What you need before you start

1. **Docker Desktop.** This runs the database for you. Download it from
   [docker.com](https://www.docker.com/products/docker-desktop/) and install it. Open it once so it
   is running. You will see a small whale icon in your menu bar or task bar when it is on.
2. **Google Chrome.** You almost certainly already have it. The app uses it behind the scenes to
   turn your slides into a PDF. Any of Chrome, Chromium or Microsoft Edge will do.
3. **A Google account.** You need one to get a free Gemini key in Step 3.
4. **A terminal.** On a Mac this is called Terminal. On Windows it is called PowerShell. You type
   commands into it. Every command in this guide can be copied and pasted.

---

## Step 1: Open the project folder

Open your terminal and type this, then press Enter:

```bash
cd linkedin-carousel-engine
```

Every other command in this guide assumes you are here.

---

## Step 2: Make your settings file

The project ships with an example settings file. You will make your own copy and fill it in.

```bash
cp .env.example .env.local
```

Now open `.env.local` in any text editor. Notepad, TextEdit or VS Code all work fine. It has six
settings in it. The next steps explain what each one is and where to get it.

**Important:** `.env.local` holds your private keys. It is already listed in `.gitignore`, so it
will never be uploaded or shared. Do not paste its contents into a chat, an email or a screenshot.

---

## Step 3: Get your Gemini key (GEMINI_API_KEY)

**What it is:** A password that lets the app talk to Google's AI. The AI reads your project and
writes the post text.

**Is it required?** Yes. Nothing works without it.

**How to get it:**

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Sign in with your Google account.
3. The first time, it shows you the terms of service. Tick the box and click **Continue**.
4. Click the blue **Create API key** button.
5. If it asks which project to use, choose **Create API key in new project**.
6. A long string of letters and numbers appears. It starts with `AIza`. Click the copy button.
7. Open `.env.local` and paste it after the equals sign, like this:

```
GEMINI_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Do not put quotes or spaces around it. Just paste it right after the `=` sign.

**Keep it secret.** Anyone who has this key can spend money on your Google account. If you ever
paste it somewhere public by mistake, go back to that same page, delete the key, and make a new
one. It takes ten seconds.

**Does it cost money?** Google gives you a free allowance. The Flash models have a free daily
limit that is generous for writing a few posts a week.

---

## Step 4: Pick your model (GEMINI_MODEL)

**What it is:** The name of the AI model that writes your posts.

**Is it required?** No. It already has a good default.

Leave it as it is:

```
GEMINI_MODEL=gemini-2.5-flash
```

This model is fast and cheap. Because it is just a setting, you can switch to a newer one later by
editing this one word. The model dropdown at [aistudio.google.com](https://aistudio.google.com) is
the real list for your own key.

---

## Step 5: Set the database address (POCKETBASE_URL)

**What it is:** The address of the small database that stores your slide designs and every post you
have made.

**Is it required?** No, but the right value depends on how you run the app.

**If you run the app yourself with `npm run dev`** (which is what this guide does):

```
POCKETBASE_URL=http://127.0.0.1:8090
```

`127.0.0.1` is just a nickname for "this computer".

**If you run everything inside Docker instead**, the app reaches the database by its service name:

```
POCKETBASE_URL=http://pocketbase:8090
```

If you are not sure, use the first one. It is easier to see error messages that way.

> **Already running the CV system?** You can point this at the same PocketBase. The two apps use
> completely different collection names, so they share a database without ever touching each
> other's data. Note that the CV app calls this setting `NEXT_PUBLIC_POCKETBASE_URL` and this one
> calls it `POCKETBASE_URL`. That is deliberate. Both can hold the same address.

---

## Step 6: Make your database login (POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD)

**What they are:** A username and password for your own database. You are inventing these right
now. They are not an account you sign up for anywhere.

- The **email is only a username.** PocketBase never sends mail to it and never checks that it is
  real.
- The **password is one you invent right now.** It is not your email password. It is not your
  Google password. **Do not reuse a real password here.**

**Is it required?** Yes. Without it the app cannot save your posts, and Previous Posts stays empty.

**How to do it:**

First, start the database:

```bash
docker compose up -d pocketbase
```

Wait about 20 seconds for it to wake up.

Now create your admin account. Replace the email and password with your own. Pick a password that
is at least 10 characters long:

```bash
docker compose exec pocketbase /usr/local/bin/pocketbase superuser upsert you@example.com YourPassword123
```

You should see `Successfully saved superuser`.

Then put those exact same two values in `.env.local`:

```
POCKETBASE_ADMIN_EMAIL=you@example.com
POCKETBASE_ADMIN_PASSWORD=YourPassword123
```

They must match exactly, or the app cannot sign in to your database.

**Check it worked:** open http://127.0.0.1:8090/_/ in your browser and sign in with those two
things. If you get in, they are correct.

---

## Step 7: Where Chrome is (PDF_CHROMIUM_PATH)

**What it is:** Which copy of Chrome turns your slides into a PDF.

**Is it required?** No. **Leave it blank.** The app looks for one itself, in this order:

1. Any Chromium that Playwright has downloaded
2. Google Chrome, in the normal place for your Mac, Windows or Linux machine
3. Chromium
4. Microsoft Edge

```
PDF_CHROMIUM_PATH=
```

**Only if it cannot find one.** If you see *"Could not find a Chrome or Chromium"*, either point it
at a Chrome you already have:

```
# Mac
PDF_CHROMIUM_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
# Windows
PDF_CHROMIUM_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
# Linux
PDF_CHROMIUM_PATH=/usr/bin/chromium
```

Or install one, once:

```bash
npx playwright install --with-deps chromium
```

That downloads about 150MB and then you never think about it again.

> **Why do slides need a web browser?** Your carousel is built as a web page first, then printed to
> PDF. Chrome is what does the printing, which is why the PDF looks exactly like the design.

---

## Step 8: Set the upload limit (MAX_UPLOAD_MB)

**What it is:** The biggest project zip file the app will accept, in megabytes.

**Is it required?** No. The default is fine.

```
MAX_UPLOAD_MB=50
```

Most projects are far under 50 MB once you leave out the `node_modules` folder.

---

## Step 9: Create the database tables

This creates the tables the app saves your posts into. It also copies the slide designs into the
database, though the app no longer needs them there.

```bash
npm install
npm run seed
```

You should see lines like `Created collection generated_posts.` and `Added template level_one_cream.`

**The slide designs themselves live in the `templates/` folder in the repository, not in the
database.** They are read from there every time a carousel is made. That is deliberate: `raw_html`
is a rich text field, so a design pasted into the PocketBase admin screen comes back either turned
into plain visible text or stripped of its styling, and then a carousel renders as a page of its own
source code. A file in the repository cannot be damaged that way.

### Putting a design of your own into the database

You can still add a design without redeploying, under a **new** name that is not one of the five.
Write the file, add it to `templates/index.json`, and run the same command against your live
database:

```bash
POCKETBASE_URL=https://pb.levelone.digital \
POCKETBASE_ADMIN_EMAIL=you@example.com \
POCKETBASE_ADMIN_PASSWORD='your-password' \
npm run seed
```

Use this rather than pasting into the admin screen. It sends the file exactly as written, through
the API, where the rich text editor never touches it.

**It is safe to run this again at any time.** Collections that already exist are left alone, and if
a new version of the app needs an extra field, running it again adds just that field.

If you see an error about signing in, go back to Step 6 and check that your email and password
match in both places.

---

## Step 10: Start the app

```bash
npm run dev
```

Open your browser and go to **http://localhost:3001**

You should see the front door with two buttons: **Create New Post** and **Previous Posts**.

Click Create New Post. If anything is not set up, a yellow box under the Generate button tells you
exactly what. If there is no yellow box, everything is ready.

---

## Step 11: Connect your social accounts (only when you want auto-posting)

The app can post for you on **three** places: your LinkedIn personal profile, your Facebook Page,
and your Instagram professional account.

Two places it will **not** post, on purpose:

- **X.** Since February 2026 X charges for every post through its API. There is no free plan for a
  new developer account. So you copy the X caption and post it yourself.
- **Your LinkedIn company page.** LinkedIn only allows that with a special permission called
  Community Management, and they decide case by case whether to give it. So you post that one
  yourself too.

The app writes a caption for all four either way. The two above are just copy-and-paste.

### First, tell the app its own address

Facebook and Instagram do not let you hand them a picture. They come and **fetch** it. So they need
a web address they can reach.

In your `.env.local`:

```
PUBLIC_BASE_URL=https://media.levelone.digital
```

No slash on the end. If this is blank, or points at your own laptop, those two will fail and say so.

### Then, put each account in the database

The tokens are **not** kept in `.env.local`. They expire and get replaced, and a file you have to
redeploy to change is the wrong place for something that changes on its own. They go in the
`platform_connections` table instead.

Open http://localhost:8090/_/ , click **platform_connections**, and click **New record** for each
account. Here is what to put in, and where each piece comes from.

#### LinkedIn (your own profile)

| Field | What to put in |
| --- | --- |
| `platform` | `linkedin` |
| `account_type` | `personal` |
| `display_name` | Anything, e.g. `Dean on LinkedIn` |
| `account_id` | Your member id (see below) |
| `access_token` | Your token (see below) |
| `active` | ticked |

1. Go to **https://www.linkedin.com/developers/apps** and click **Create app**. It asks for a
   LinkedIn page to link the app to — your company page is fine, this does not give it posting
   rights.
2. Open the **Products** tab and add **Share on LinkedIn** and **Sign In with LinkedIn using
   OpenID Connect**. Both are free and switch on within a minute. You do **not** need
   "Community Management" — that is the one they review, and this system does not use it.
3. Open the **Auth** tab. Copy the **Client ID** and **Client Secret**, and add a redirect URL.
4. Sign in through that app once to get a token with the `w_member_social` and `openid profile`
   scopes. LinkedIn's own **OAuth token generator**, on the Auth tab, does this for you without
   writing any code.
5. With that token, open `https://api.linkedin.com/v2/userinfo`. The `sub` value it returns is your
   member id. Paste it into `account_id`.

#### Facebook Page

| Field | What to put in |
| --- | --- |
| `platform` | `facebook` |
| `account_type` | `business` |
| `account_id` | Your **Page** id, not your personal id |
| `access_token` | A long-lived **Page** token |

1. Go to **https://developers.facebook.com/apps** and create an app of type **Business**.
2. Add the **Facebook Login for Business** product.
3. Open the **Graph API Explorer** (Tools menu). Pick your app, then ask for the permissions
   `pages_manage_posts`, `pages_read_engagement` and `pages_show_list`.
4. Click **Generate Access Token** and choose your Page. The explorer shows your Page id beside it.
5. That token lasts about an hour. Paste it into the **Access Token Debugger**
   (https://developers.facebook.com/tools/debug/accesstoken/) and click **Extend Access Token** to
   get one that does not expire. Use the extended one.

#### Instagram

| Field | What to put in |
| --- | --- |
| `platform` | `instagram` |
| `account_type` | `business` |
| `account_id` | Your Instagram **user id** |
| `access_token` | The same Page token as above |

1. Your Instagram account has to be a **Professional** account (Business or Creator) and it has to
   be linked to the Facebook Page above. You do that in the Instagram app, under
   Settings, then Account type and tools.
2. Add the **Instagram** product to the same Meta app, with the permissions `instagram_basic` and
   `instagram_content_publish`.
3. In the Graph API Explorer, call `/<your-page-id>?fields=instagram_business_account`. The `id` it
   gives back is your Instagram user id.
4. Before this works for anyone other than you, Meta has to **review** the app. Until then it still
   works on your own account, which is all you need.

### What each key unlocks

| Key or token | Where it comes from | What stops working without it |
| --- | --- | --- |
| `GEMINI_API_KEY` | aistudio.google.com/apikey | Everything. This writes the post. |
| `POCKETBASE_ADMIN_EMAIL` / `PASSWORD` | You made them up in Step 6 | Nothing saves. |
| `GITHUB_TOKEN` | github.com/settings/personal-access-tokens, Contents: read and write | A new design is saved to the database but not committed to the repo. |
| `PUBLIC_BASE_URL` | Your own domain | Facebook and Instagram cannot fetch the pictures. |
| LinkedIn token | The app you make at linkedin.com/developers | LinkedIn posting. Everything else is fine. |
| Facebook Page token | Graph API Explorer, then extended | Facebook and Instagram posting. |
| Instagram user id | `/<page-id>?fields=instagram_business_account` | Instagram posting. |

### Sending a post

Open a finished post, tick **Approve** on the networks you want, and press **Publish**. Each network
is sent on its own, and you get a line back per network saying where it went or why it did not. One
network refusing does not stop the others. Pressing Publish again after fixing something updates the
same record rather than posting twice.

---

## Your settings at a glance

| Setting | Required? | What it does | Where the value comes from |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Lets the app use Google's AI to write your post | You copy it from aistudio.google.com/apikey |
| `GEMINI_MODEL` | No | Which AI model writes the post | Leave it as `gemini-2.5-flash` |
| `POCKETBASE_URL` | No | Where the database lives | `http://127.0.0.1:8090` locally, `http://pocketbase:8090` inside Docker |
| `POCKETBASE_ADMIN_EMAIL` | Yes | Your database username | You make it up in Step 6 |
| `POCKETBASE_ADMIN_PASSWORD` | Yes | Your database password | You make it up in Step 6 |
| `PDF_CHROMIUM_PATH` | No | Which Chrome makes the PDF | Leave blank; the app finds one |
| `MAX_UPLOAD_MB` | No | Largest zip file allowed | Leave it at `50` |
| `PUBLIC_BASE_URL` | Only for posting | The address Facebook and Instagram fetch pictures from | Your own domain, no trailing slash |
| `GITHUB_TOKEN` | No | Commits a new design back to the repo | github.com/settings/personal-access-tokens |
| `LINKEDIN_API_VERSION` | No | Which LinkedIn API version to use | Leave blank |
| `META_GRAPH_VERSION` | No | Which Facebook API version to use | Leave blank |

---

## When something goes wrong

**"GEMINI_API_KEY is not set."**
Your key is missing or misspelled. Open `.env.local` and check that `GEMINI_API_KEY=` has your key
right after it with no spaces and no quote marks. Then restart the app.

**"No Chrome or Chromium was found."**
See Step 7.

**"PocketBase is unreachable."**
The database is not running. Type `docker compose up -d pocketbase` and wait 20 seconds. If it is
running but still unreachable, check that `POCKETBASE_URL` matches your setup from Step 5.

**"PocketBase has no slide designs yet."**
You skipped Step 9, or it failed. Run `npm run seed` again and read the message it prints. This does
not stop carousels being made: the designs come from the `templates/` folder either way.

**The Portrait design is not in the list.**
It needs your photograph. Put a file called `portrait.jpg` in the `templates/assets/` folder in the
repository, commit it, and redeploy. Until then the design hides itself rather than offering an
empty frame. Open `/api/templates` and it will be listed under `waiting`, with the file it wants.

**I want to know whether my latest change is actually live.**
Open `/api/health` on the running app. `buildTime` is stamped when the app is built, so if it does
not move after a deploy, that deploy did not take. The same page reports how many designs came from
the folder and how many from the database.

**A post generates but does not appear under Previous Posts.**
The app will tell you this and offer the file for download so you do not lose it. It usually means
the admin email and password are wrong, or `npm run seed` has not been run against this database.

**I changed .env.local but nothing changed.**
Settings are only read when the app starts. Stop it with Ctrl+C and run `npm run dev` again. This
fixes more problems than anything else on this page.

**The app says my zip has no readable files.**
The zip needs to hold the actual project code. If you zipped a folder that only had images or a
build output in it, there is nothing for the AI to read. Zip the source folder instead.

---

## How to stop everything

```bash
docker compose down
```

Your database is saved in the `pocketbase/pb_data` folder on your computer, so nothing is lost when
you stop. Start it again any time with `docker compose up -d pocketbase`.
