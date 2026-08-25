# syntax=docker/dockerfile:1
#
# Automated AI LinkedIn Carousel and Content Generator Engine
#
# Why this file exists: the app turns slide HTML into a PDF by driving headless
# Chromium itself (lib/chromium.ts). That is the same engine Gotenberg wraps in
# a container, minus the container and the network hop — but it does mean a
# Chromium has to exist wherever the app runs. Your laptop already has one. A
# plain Node image does not, so without this Dockerfile a deployed copy gets all
# the way through Gemini and then fails on the last step.
#
# Build:  docker build -t carousel-engine .
# Run:    docker run -p 3001:3001 --env-file .env.local carousel-engine
#
# On Coolify: set the Build Pack to "Dockerfile" and Ports Exposes to 3001.
# See COOLIFY.md.

# --------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base

# playwright-core ships no browsers and downloads none. Stated anyway so a
# future dependency cannot start pulling 150MB during an image build.
ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# --------------------------------------------------------------------------
# Dependencies on their own layer, so editing a component does not throw away
# the npm cache and reinstall everything.
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# --------------------------------------------------------------------------
FROM base AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# --------------------------------------------------------------------------
FROM base AS runtime
WORKDIR /app

# chromium          — what actually renders the slides.
#
# fonts-liberation  — NOT optional. The slide templates ask for
#                     "Helvetica Neue", Helvetica, Arial and for
#                     Georgia, "Times New Roman". Liberation Sans and
#                     Liberation Serif are the metric-compatible stand-ins
#                     those resolve to on Linux. Without this package Chromium
#                     falls back to DejaVu, every glyph gets wider, and
#                     headings that fit the 1350px canvas today start
#                     overflowing it — silently, in the PDF only.
#
# fonts-dejavu-core — last-resort fallback for any glyph Liberation lacks.
#                     Small, and better than a row of blank boxes.
#
# ca-certificates   — HTTPS to PocketBase and to Gemini.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        fonts-dejavu-core \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# Strictly optional: /usr/bin/chromium is already in the auto-detect list in
# lib/chromium.ts. Set here so the choice is stated rather than guessed, and so
# a missing binary fails loudly instead of falling through to "none of the
# fifteen places I looked".
ENV PDF_CHROMIUM_PATH=/usr/bin/chromium

# Next.js standalone output: the server and only the dependencies it actually
# imports, which is a fraction of node_modules.
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# The starter templates are read from disk when PocketBase has none.
COPY --from=build --chown=node:node /app/templates ./templates

# Chromium normally needs root for its own sandbox. lib/chromium.ts launches
# with --no-sandbox, so the sandbox is off and root buys nothing — which means
# this can drop to the unprivileged user the Node image ships with.
USER node

EXPOSE 3001

CMD ["node", "server.js"]
