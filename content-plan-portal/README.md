# RevBoss Content Plan Portal

An interactive, live version of the monthly client content plan PDF. Each client gets a private link to their month:

- **The plan:** waiting-on-you asks, the angle/pillar budget, and every post as a list or a calendar. All 19 October plans are imported from the PDFs.
- **Live status:** statuses come from Ordinal, including approvals. When a post is approved, every open copy of the page updates at once.
- **Metrics:** LinkedIn impressions and engagement per post, plus month totals, from Ordinal analytics.
- **Chat:** Claude answers from the live plan ("what's waiting on me?", "how did last week's posts do?"). It also passes change requests to the team.
- **Feedback:** whatever a client sends from a post, or through the chat, is added as a comment on that Ordinal post. The existing comment agent (`../playbooks/sweep.md`) picks it up from there.

A team dashboard lists every plan with its status mix and open feedback. It also builds next month's plan from the Ordinal calendar.

It runs with **no keys at all**. In that case it uses demo data and the chat answers a few questions offline, so you can click through it before connecting anything.

## Run it on Replit

1. Create a Repl from this folder: import the GitHub repo and set the root to `content-plan-portal`, or upload the folder.
2. Press **Run**. Replit installs dependencies from `package.json` and starts `npm start` on port 3000.
3. Open the webview. You land on the team dashboard; click **Open** on a plan, or **Copy client link** for the client view.
4. Add secrets under **Tools → Secrets** (all optional, see `.env.example`):

| Secret | What it turns on |
|---|---|
| `ADMIN_PASSWORD` | Locks the team dashboard behind basic auth (any username). **Set this before sharing the URL.** Without it, anyone with the base URL sees every plan. |
| `ANTHROPIC_API_KEY` | The full Claude chat. Default model `claude-opus-5-5` at low effort (`CHAT_MODEL`, `CHAT_EFFORT` override them). |
| `ORDINAL_MCP_URL`, `ORDINAL_API_KEY` | Live Ordinal: status, approvals, copy and LinkedIn metrics. The token is sent as `Authorization: Bearer …`. |

5. To deploy, choose a **Reserved VM**. Live updates, the sync timer and the file store need one process that stays up; Autoscale would break them.

Locally it's `npm install && npm start`, then open http://localhost:3000. Run `npm test` for the tests.

## How it fits together

```
 Ordinal ──(MCP: search_content, list_approvals,      ┌──────────────┐
           get_analytics, manage_comments)──────────▶ │ server/sync  │ every 15 min + "Sync now"
                                                      └──────┬───────┘
                                                             ▼
 PDF import (one-time) ─▶ data/seed ─▶ data/store/plans/*.json  ◀── team edits, client asks/feedback
                                                             │
                                  change events ─────────────┤
                                                             ▼
          /p/:id?k=token  (client)        SSE /api/plans/:id/stream  →  every open page re-renders
          /team/p/:id     (team)          POST /api/plans/:id/chat   →  Claude + plan tools (streamed)
          /               (dashboard)     POST /api/plans/generate   →  next month from Ordinal
```

| Path | What it is |
|---|---|
| `server/index.js` | Express app: pages, API, access control, SSE |
| `server/store.js` | File-backed plan store with change events. Swap for Replit DB or Postgres to run more than one instance. |
| `server/plans.js` | Status vocabulary, summaries, overdue logic |
| `server/ordinal/live.js` | Ordinal adapter over its MCP server |
| `server/ordinal/demo.js` | Same interface, backed by the imported plans and sample metrics |
| `server/sync.js` | Pulls status, approvals and metrics into each plan |
| `server/generator.js` | Builds a month's plan from Ordinal posts in that month, with `Pillar: X` labels giving the angle |
| `server/chat/agent.js` | Claude tool-use loop (streaming), plus the offline fallback |
| `server/chat/tools.js` | The chat's tools: overview, list/get posts, performance, leave feedback, complete an ask |
| `public/` | No-build front end: `plan.html`/`plan.js` (client + team view), `index.html`/`admin.js` (dashboard) |
| `scripts/import_pdfs.py` | One-time import of existing plan PDFs, including the Ordinal post links embedded in their titles |
| `data/seed/` | The 19 October plans imported from the PDFs (215 posts, all linked to Ordinal) |

## Access model

- **Client link:** `/p/<plan-id>?k=<shareToken>`. The token is random per plan and only opens that one plan. With it, a client can view the plan, tick asks, leave feedback and chat. It can't edit the plan, change statuses, or see other plans.
- **Team:** everything under `/` and `/team/…`, behind `ADMIN_PASSWORD`. Team members can edit the intro and asks inline, publish a draft, sync, and resolve feedback.
- **Approvals stay in Ordinal.** The page links each waiting post to Ordinal for sign-off rather than approving it itself, so there's one source of truth. Nothing in this app schedules, publishes or edits post copy.

## Status mapping (Ordinal → plan)

| Ordinal | Plan status |
|---|---|
| `Posted` | Posted |
| any status with an approval in `Requested` | Approval waiting (Approval overdue once its date passes) |
| `Scheduled` / `Finalized`, or every approval `Approved` | Scheduled |
| anything else (`ToDo`, `InProgress`, `ForReview` with no request…) | Approval not yet sent |

## Monthly workflow

1. Map next month onto the Ordinal calendar as usual, with each post labelled with the person (e.g. `Whitney`) and `Pillar: <angle>`.
2. On the dashboard, click **Build November** on a plan. The generator pulls that person's November posts, angles, statuses and approvals. It drafts the asks from posts waiting on approval and carries over the angle descriptions and booking link.
3. Edit the intro and asks in the team view, then **Publish to client** and send the client link.
4. From then on it stays current by itself. Sync runs every 15 minutes, and any status change, approval or new metric shows up on the client's page as it happens.

## Before going live: what still needs checking

- **Ordinal endpoint and auth.** `server/ordinal/live.js` calls the same Ordinal tools RevBoss already uses through Claude, and their response shapes were checked against real AGP data. What I could not confirm is the MCP server URL and whether Ordinal accepts a bearer token there or only OAuth. Get both from Ordinal. If they offer a REST API instead, re-implement the five methods in `live.js` against it; nothing else changes.
- **Claude chat with a real key.** The tool schemas build and the request reaches the API. It hasn't been run end to end with a real key.
- **Storage.** The JSON file store is fine for one Reserved VM. For several instances, or if you want history and backups, move `server/store.js` to Postgres. Its six functions are the only place data is read or written.
- **Narrative fields.** "Why this number", the angle descriptions and the campaign sections (e.g. JustFund's "What October is working on") come from the PDFs for October. For new months they start blank or carried over, so a team member, or a later "draft the narrative with Claude" step, still has to fill them in.
- **Demo-only pieces.** "Simulate client approval" and the sample metrics exist only in demo mode, to show live updates without Ordinal.
