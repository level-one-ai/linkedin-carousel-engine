# Setup Guide

This guide walks you through starting the engine for the first time. It is written in plain
language. You do not need to be an expert to follow it. Just do the steps in order.

Plan on about 15 minutes.

---

## What you need before you start

1. **Docker Desktop.** This runs the three parts of the system for you. Download it from
   [docker.com](https://www.docker.com/products/docker-desktop/) and install it. Open it once so it
   is running. You will see a small whale icon in your menu bar or task bar when it is on.
2. **A Google account.** You need one to get a free Gemini key in Step 2.
3. **A terminal.** On a Mac this is called Terminal. On Windows it is called PowerShell. You type
   commands into it. Every command in this guide can be copied and pasted.

---

## Step 1: Get the code and open the folder

Open your terminal and type this, then press Enter:

```bash
cd linkedin-carousel-engine
```

This moves you into the project folder. Every other command in this guide assumes you are here.

---

## Step 2: Make your settings file

The project ships with an example settings file. You will make your own copy and fill it in.

```bash
cp .env.example .env.local
```

Now open `.env.local` in any text editor. It has six settings in it. The next steps explain what
each one is and where to get it.

**Important:** `.env.local` holds your private keys. It is already listed in `.gitignore`, so it
will never be uploaded or shared. Do not paste its contents into a chat, an email, or a screenshot.

---

## Step 3: Get your Gemini key (GEMINI_API_KEY)

**What it is:** A password that lets the app talk to Google's AI. The AI reads your project and
writes the post text.

**Is it required?** Yes. Nothing works without it.

**How to get it:**

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Sign in with your Google account.
3. Click the blue **Create API key** button.
4. A long string of letters and numbers appears. It starts with `AIza`. Click the copy button next
   to it.
5. Open `.env.local` and paste it after the equals sign, like this:

```
GEMINI_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Do not put quotes or spaces around it. Just paste it right after the `=` sign.

**Keep it secret.** Anyone who has this key can spend money on your Google account. If you ever
paste it somewhere public by mistake, go back to that same page and delete the key, then make a new
one.

---

## Step 4: Pick your model (GEMINI_MODEL)

**What it is:** The name of the AI model that writes your posts.

**Is it required?** No. It already has a good default.

Leave it as it is:

```
GEMINI_MODEL=gemini-2.5-flash
```

This model is fast and cheap. Only change it if you know you want a different one.

---

## Step 5: Set the two addresses (GOTENBERG_URL and POCKETBASE_URL)

**What they are:** Street addresses for the two helper programs.

- **Gotenberg** is the program that turns your slides into a PDF file.
- **PocketBase** is the small database that stores your slide designs and your post history.

**Is it required?** No, but the right value depends on how you run the app. Pick one of the two
setups below.

**Setup A: everything in Docker (the easy way, and what most people should use).**
The three programs talk to each other by name. Use these values:

```
GOTENBERG_URL=http://gotenberg:3000
POCKETBASE_URL=http://pocketbase:8090
```

**Setup B: helpers in Docker, but you run the app yourself with `npm run dev`.**
Now the app is outside Docker, so it has to reach the helpers through your own computer. Use these
values instead:

```
GOTENBERG_URL=http://127.0.0.1:3000
POCKETBASE_URL=http://127.0.0.1:8090
```

`127.0.0.1` is just a nickname for "this computer."

If you are not sure, use Setup B while you are testing, because it is easier to see error messages
that way.

---

## Step 6: Make your database login (POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD)

**What they are:** A username and password for your own database. You are inventing these right
now. They are not an account you sign up for anywhere.

**Is it required?** Yes, if you want the app to save your slide designs and keep a history of your
posts. That is almost certainly what you want.

**How to do it:**

First, start the helper programs:

```bash
docker compose up -d gotenberg pocketbase
```

Wait about 20 seconds for them to wake up.

Now create your admin account. Replace the email and password with your own. Pick a password that
is at least 10 characters long:

```bash
docker compose exec pocketbase /usr/local/bin/pocketbase superuser upsert you@example.com YourPassword123
```

Then put those exact same two values in `.env.local`:

```
POCKETBASE_ADMIN_EMAIL=you@example.com
POCKETBASE_ADMIN_PASSWORD=YourPassword123
```

They must match exactly, or the app cannot sign in to your database.

---

## Step 7: Set the upload limit (MAX_UPLOAD_MB)

**What it is:** The biggest project zip file the app will accept, measured in megabytes.

**Is it required?** No. The default is fine.

```
MAX_UPLOAD_MB=50
```

If you have a very large project, raise this number. Most projects are far under 50 MB once you
leave out the `node_modules` folder.

---

## Step 8: Load the starter slide designs

This command creates the database tables and loads four ready made slide designs into them.

```bash
npm install
npm run seed
```

You should see lines like `Created collection html_templates.` and `Added template dark_technical.`

If you see an error about signing in, go back to Step 6 and check that your email and password
match in both places.

---

## Step 9: Start the app

**If you chose Setup A** (everything in Docker):

```bash
docker compose up -d
```

**If you chose Setup B** (you run the app yourself):

```bash
npm run dev
```

Either way, open your browser and go to **http://localhost:3001**

At the top of the page you will see three status lights. All three should be green check marks. If
one is a red X, the table below tells you what to fix.

---

## Your settings at a glance

| Setting | Required? | What it does | Where the value comes from |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Lets the app use Google's AI to write your post | You copy it from aistudio.google.com/apikey |
| `GEMINI_MODEL` | No | Which AI model writes the post | Leave it as `gemini-2.5-flash` |
| `GOTENBERG_URL` | No | Where the PDF maker lives | `http://gotenberg:3000` in Docker, `http://127.0.0.1:3000` outside it |
| `POCKETBASE_URL` | No | Where the database lives | `http://pocketbase:8090` in Docker, `http://127.0.0.1:8090` outside it |
| `POCKETBASE_ADMIN_EMAIL` | Yes | Your database username | You make it up in Step 6 |
| `POCKETBASE_ADMIN_PASSWORD` | Yes | Your database password | You make it up in Step 6 |
| `MAX_UPLOAD_MB` | No | Largest zip file allowed | Leave it at `50` |

---

## When something goes wrong

**The Gemini light is red.**
Your key is missing or misspelled. Open `.env.local` and check that `GEMINI_API_KEY=` has your key
right after it with no spaces and no quote marks. Then restart the app.

**The Gotenberg light is red.**
The PDF maker is not running. Type `docker compose up -d gotenberg` and wait 20 seconds. Then click
**Recheck** on the web page.

**The PocketBase light is red.**
The database is not running. Type `docker compose up -d pocketbase` and wait 20 seconds. If it is
running but still red, check that `POCKETBASE_URL` matches your setup from Step 5.

**It says 0 templates.**
You skipped Step 8, or it failed. Run `npm run seed` again and read the message it prints.

**I changed .env.local but nothing changed.**
Settings are only read when the app starts. Stop it and start it again. In Docker that is
`docker compose restart app`. If you used `npm run dev`, press Ctrl+C and run it again.

**The app says my zip has no readable files.**
The zip needs to hold the actual project code. If you zipped a folder that only had images or a
build output in it, there is nothing for the AI to read. Zip the source folder instead.

---

## How to stop everything

```bash
docker compose down
```

Your database is saved in the `pocketbase/pb_data` folder on your computer, so nothing is lost when
you stop. Start it again any time with `docker compose up -d`.
