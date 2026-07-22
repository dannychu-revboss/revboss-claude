# RevBoss Content Studio

An internal, Kleo-style content generation tool for the RevBoss content team.
Every client gets a workspace with their **knowledge base, identity, founder
archetype, voice guide, writing examples, and content preferences** built in —
so writers can generate on-brand LinkedIn content from a chat interface, then
polish it in a draft editor with a live LinkedIn preview.

## Features (v1)

| Area | What it does |
|---|---|
| **Client workspaces** | One workspace per client; all context is scoped to the client |
| **Create (chat)** | "What are we creating today?" chat with quick actions (post ideas, templates, write from draft, feedback, image ideas, repurpose). Streams responses from Claude. |
| **Knowledge base** | Tagged text/document cards (interview transcripts, styling guides, call notes). Search by title/content/tag. The most relevant items are automatically injected into every generation. |
| **Identity** | About, story, offers, and founder archetype — mirrors the Kleo identity page |
| **Writing style** | Voice guide, real writing examples the AI mimics, and hard content preference rules |
| **Drafts** | Posts generated in chat save straight to drafts; editor has a live LinkedIn-style preview, "hook only" feed-cutoff view, 3,000-char counter, autosave, and draft/approved/published status |
| **Auth** | Shared team password (set via env var) |

## How generation stays on-brand

Every chat request builds a system prompt from the client's workspace:
identity → story → offers → archetype → voice guide → preference rules →
writing examples → the most relevant knowledge-base items (keyword-ranked
against your message). The model is instructed to ground all factual claims
in the knowledge base and to wrap ready-to-publish copy in `<post>` tags,
which the UI turns into cards with **Copy** and **Save as draft** buttons.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind v4
- Prisma + SQLite (single-file DB on a mounted volume — right-sized for an internal tool)
- Anthropic API (`claude-sonnet-5` by default, configurable via `ANTHROPIC_MODEL`)
- Docker single-container deploy

## Environment variables

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | From https://console.anthropic.com/settings/keys |
| `ANTHROPIC_MODEL` | Optional, defaults to `claude-sonnet-5` |
| `APP_PASSWORD` | The shared password your team signs in with |
| `AUTH_SECRET` | Any long random string (signs the session cookie) |
| `DATABASE_URL` | SQLite path, e.g. `file:/data/studio.db` (set automatically in Docker) |

## Run locally

```bash
cd content-studio
npm install
cp .env.example .env        # fill in ANTHROPIC_API_KEY + APP_PASSWORD + AUTH_SECRET
npx prisma db push          # create the SQLite schema
npm run db:seed             # optional: demo client with sample knowledge
npm run dev                 # http://localhost:3000
```

## Deploy to the cloud (Railway — recommended, ~10 minutes)

Railway builds the included Dockerfile and gives the SQLite DB a persistent volume.

1. Push this repo to GitHub (already done if you're reading this on GitHub).
2. Go to https://railway.app → **New Project → Deploy from GitHub repo** and pick this repo.
3. In service **Settings → Root Directory**, set `content-studio` (so Railway finds the Dockerfile).
4. In **Variables**, add:
   - `ANTHROPIC_API_KEY` = your key
   - `APP_PASSWORD` = the team password
   - `AUTH_SECRET` = a long random string (`openssl rand -hex 32`)
5. Add a volume: right-click the service → **Attach Volume**, mount path `/data`.
6. **Settings → Networking → Generate Domain** to get your public URL.
7. Open the URL, sign in with the team password, create your first client workspace.

### Alternative: Fly.io

```bash
cd content-studio
fly launch --no-deploy            # accept the detected Dockerfile
fly volumes create data --size 1
# add to fly.toml:  [mounts]  source = "data"  destination = "/data"
fly secrets set ANTHROPIC_API_KEY=... APP_PASSWORD=... AUTH_SECRET=...
fly deploy
```

Render works the same way (Docker service + persistent disk mounted at `/data`).

## Onboarding a client (writer workflow)

1. **Create the workspace** from the home page.
2. **Identity** — paste their about, story, offers, and founder archetype.
3. **Writing style** — paste their styling guide as the voice guide, add 3–5 of
   their best real posts as writing examples, add hard rules as preferences
   ("never use emojis", "no hashtag walls").
4. **Knowledge base** — paste interview transcripts, call notes, and strategy
   docs with tags. More knowledge = more grounded content.
5. **Create** — use quick actions or free-form chat; save the good posts as
   drafts, polish in the editor, copy out to publish.

## v2 ideas (not in this build)

- File upload with automatic text extraction (PDF/DOCX) for the knowledge base
- Embedding-based retrieval instead of keyword ranking
- Per-user accounts and roles
- Direct publish/schedule integrations (e.g. Ordinal)
- "What's trending" and image generation quick actions
- Postgres for multi-instance scaling
