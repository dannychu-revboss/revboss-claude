# Content Plan Portal: Replit handoff

The monthly client content plan as an interactive page instead of a PDF. It shows live status from Ordinal, LinkedIn numbers, a list, board and calendar of posts, client feedback and angle-change requests, and a Claude chat that answers questions about the plan.

## What's in this package

| File | What it is |
|---|---|
| `dist/content-plan-demo.html` | **Open this first.** One file that runs in any browser with no install. It has all 19 October plans, a Client/Team toggle, and live sync if you open it in two tabs. Use it to see the product, and as the visual reference if you rebuild. |
| `content-plan-portal/` (the code) | The working app: Node + Express, no build step. Import it into Replit (Option A). |
| This file | Copy-paste prompts for Replit Agent. |
| `README.md` | Architecture, access model, status mapping, open items. |

Pick **Option A** to run the code that already exists (recommended: faster, and it's tested). Pick **Option B** only if you'd rather have Replit Agent generate its own version from the spec.

---

## Option A: import the existing code (recommended)

1. In Replit: **Create Repl → Import from GitHub →** `dannychu-revboss/revboss-claude`, then switch to branch `claude/cool-heisenberg-eaj5on` in the Git pane. Or upload the `content-plan-portal` folder as a zip.
2. Open Replit Agent and paste **Prompt A1**.

### Prompt A1: get it running

```
This Repl contains a working Node.js app in the folder content-plan-portal/ (Express, ES modules, no
front-end build step). Please get it running without rewriting it:

1. Make content-plan-portal the project root for running: the run command is `npm start` from that
   folder (see its .replit and package.json). Node 20+. Install dependencies with npm.
2. Start it and open the webview on port 3000. The home page is the team dashboard listing 19 client
   plans. Confirm /api/health returns {"ok":true,...}.
3. Run `npm test` and show me the result (8 tests should pass).
4. Don't change application code unless something fails to start; if it does, explain the error
   and the smallest fix before applying it.

Then tell me:
- the URL of the team dashboard,
- the client link for "AGP · Whitney Norman" (click "Copy client link" or read it from /api/plans),
- which secrets I can add (see .env.example): ADMIN_PASSWORD, ANTHROPIC_API_KEY, ORDINAL_MCP_URL,
  ORDINAL_API_KEY.
```

### Prompt A2: lock it down and deploy

```
In content-plan-portal:
1. I've added ADMIN_PASSWORD in Secrets. Restart and confirm the dashboard (/) now asks for a login,
   while a client link (/p/<plan-id>?k=<token>) still opens without one and can't call team-only
   endpoints (PATCH /api/plans/:id should return 401 with only the client key).
2. Deploy as a Reserved VM (not Autoscale): the app holds Server-Sent Event connections, runs a sync
   timer and stores plans on disk, so it needs one always-on process. Use `npm start`.
3. Give me the deployed URL and one working client link.
```

### Prompt A3: turn on the Claude chat

```
I've added ANTHROPIC_API_KEY to Secrets. In content-plan-portal:
1. Restart and confirm /api/health shows "chat":"claude".
2. Open a client link and ask the chat "What's waiting on me?" and "How are my posts doing?". The
   answers must come from the tools in server/chat/tools.js (they read the live plan), not invented.
3. If the request fails, show me the exact API error. The code uses the official @anthropic-ai/sdk
   tool runner with model claude-opus-5-5 (server/chat/agent.js). Don't switch SDKs or models
   without asking me.
```

### Prompt A4: connect Ordinal

```
In content-plan-portal, Ordinal access lives entirely in server/ordinal/live.js. It is chosen when
ORDINAL_MCP_URL is set; otherwise server/ordinal/demo.js serves sample data.

I've added ORDINAL_MCP_URL and ORDINAL_API_KEY (sent as "Authorization: Bearer <key>").
1. Restart, then POST /api/plans/agp-whitney-norman-2026-10/sync and show me the JSON report
   (adapter should be "live", with any status changes and errors).
2. If the connection or auth fails, show the error. If Ordinal only offers a REST API (not MCP) or
   needs OAuth, re-implement the same six methods in live.js (getPost, listApprovals, listPosts,
   getLabels, getPostMetrics, addComment) against what Ordinal provides, keeping their return shapes
   identical, and change nothing else.
3. Confirm the status mapping in server/ordinal/index.js (planStatus) still matches what we see:
   Posted → posted; any approval "Requested" → approval_waiting; Scheduled/Finalized or all approvals
   "Approved" → scheduled; otherwise approval_not_sent.
```

### Prompt A5 (optional): move storage to Postgres

```
In content-plan-portal, all reads/writes go through server/store.js (init, listPlans, getPlan,
savePlan, updatePlan, createPlan, plus the `changes` EventEmitter). Replace the JSON-file storage
with Replit's PostgreSQL, keeping those function names and behaviour:
- one table `plans (id text primary key, doc jsonb not null, updated_at timestamptz)`;
- on first boot, seed from data/seed/*.json exactly as init() does now, including a random
  shareToken per plan;
- keep the in-memory cache and the `changes.emit("change", ...)` call in savePlan so live updates
  keep working.
Make the functions async only if you also update every caller, and run `npm test` after.
```

---

## Option B: rebuild from scratch with Replit Agent

Attach `dist/content-plan-demo.html` to the chat (or paste its contents) as the visual reference, then paste **Prompt B1**. Expect to iterate. Option A already does all of this.

### Prompt B1: full spec

```
Build a web app: "RevBoss Content Plan Portal". It replaces a monthly PDF content plan that a
LinkedIn ghostwriting agency (RevBoss) sends each client. The attached content-plan-demo.html is the
exact look and behaviour to match. Open it, click through Client view and Team view, and copy its
layout, colours (navy #071744, blue #1545cd, orange #ff920a, cream #faf3e7, font Commissioner) and
interactions.

Stack: Node 20 + Express, plain HTML/CSS/JS front end (no framework, no build step), JSON storage on
disk behind a small store module (so it can move to Postgres later), Server-Sent Events for live
updates. Deploy target: Replit Reserved VM.

Data model (one document per client per month):
plan { id, client, person, month "YYYY-MM", framework ("The Four Angles": Playbook/Proof/Stance/Human,
or "The Five Pillars"), angleWord ("Angle"|"Pillar"), periodLabel, preparedOn, intro,
waitingOn[{when, ask, done}], angles[{name, target, why, description, forYou}],
posts[{id, date, angle, topicTag, title, type (Text|Image|Carousel|Video), channels, account?,
status, ordinalUrl, ordinalPostId, metrics?{impressions, reactions, comments, reposts, profileViews,
engagementRate}}], sections[{title, body}], cta, bookingUrl, ordinalWorkspace, shareToken,
feedback[], angleRequests[], draft }
Statuses: posted, scheduled, approval_waiting, approval_not_sent, todo. A post still in
approval_waiting after its date displays as "Approval overdue".
Seed data: extract the 19 plans embedded in the demo HTML (the SEED array) into data/seed/*.json.

Pages:
1. Client view /p/:planId?k=<shareToken>. The token only opens that plan. Sections, top to bottom:
   header (client · period · prepared date; "<Person> / <Month> content plan"; intro); "Waiting on
   you" checklist (clients can tick items); KPI tiles (posts, published, approved & scheduled, need
   your approval, impressions so far, engagement rate); angle budget bars (planned vs published,
   scaled to the largest angle); "The plan" with filters (angle, status, account) and three views:
     - List: table of date, angle chip, topic tag, title, type, status pill, reach.
     - Board (kanban): group by Status (Not sent yet [hidden when empty], Waiting on you, Scheduled,
       Posted) or by Angle. Cards show date, title, angle or status, type/tag, metrics, and an
       "Approve in Ordinal" link when waiting.
     - Calendar: Monday-start month grid.
   Then campaign/notes sections, client feedback, and a booking CTA. A right-hand chat panel (a bottom
   sheet on mobile). Clicking any post opens a side drawer: status explanation, "Review & approve in
   Ordinal" button, metrics, copy, feedback form, and a "move to another angle" select.
2. Team view /team/p/:planId behind HTTP basic auth (ADMIN_PASSWORD). Same page plus a top bar: Sync
   with Ordinal, Copy client link, Publish to client (for drafts), and Simulate client approval (demo
   mode only). Intro and asks are editable inline.
3. Team dashboard / (basic auth): plans grouped by client, each with a stacked status bar, open
   feedback count, last sync, Open, Copy client link, and "Build <next month>".

Angle changes:
- Team: drag a card between angle columns (or use the drawer select) and it moves immediately.
- Client: the same drag (or the drawer select) opens a confirm dialog with an optional note and
  sends a REQUEST. Nothing moves. The request is saved, logged as feedback, posted as a comment on
  the Ordinal post, and shown as a dashed "waiting on RevBoss" ghost card in the target column. The
  team sees "<Client> asked to move this to X" with "Move it" / "Keep" buttons. Both outcomes update
  every open page live, with a toast.

Live updates: every change (status sync, ask ticked, feedback, angle request/decision, edit) is
pushed over SSE (/api/plans/:id/stream) to every open copy of that plan, which re-renders, flashes
changed rows and shows a toast.

Integrations, behind adapters with a demo fallback so the app runs with no keys:
- Ordinal (social scheduling tool): post status + approval requests, post copy, LinkedIn post
  analytics, and adding comments. Sync every 15 minutes and on demand. Approvals stay in Ordinal;
  this app never approves, schedules, publishes or edits post copy.
- Claude chat via the official @anthropic-ai/sdk, model "claude-opus-5-5", streaming, with tools:
  get_plan_overview, list_posts, get_post, get_performance, leave_feedback, request_angle_change,
  complete_ask. Answers must come from tool results. Without ANTHROPIC_API_KEY, answer common
  questions (what's waiting on me / how are posts doing / what's next) from the data directly.
- Monthly generator: "Build <next month>" creates a draft plan from the Ordinal posts publishing in
  that month for that person (filtered by their Ordinal label, angle taken from "Pillar: X"
  labels), drafting the asks from posts waiting on approval.

Acceptance checks: the client link can't call team endpoints (401) and a wrong token gets 403;
Whitney Norman's October plan shows 12 posts (1 posted, 8 scheduled, 3 waiting); a client drag
creates a pending request and moves nothing; a team "Move it" moves the card for both open pages;
it works at 390px wide.
```

---

## Follow-up prompts (either option)

**Add a feature without breaking the rest**
```
In content-plan-portal, add <feature>. Constraints: keep the no-build front end (public/plan.js,
public/app.css), route all data changes through server/store.js so the SSE live updates fire, add
a test in test/plans.test.js for any new server logic, and run `npm test` before finishing. Show me
the diff summary and a screenshot of the client view at 1440px and 390px.
```

**Draft the narrative for a new month with Claude**
```
In content-plan-portal, after "Build <month>" creates a draft plan, add a team-only button "Draft
narrative" that sends the plan (posts, angles, last month's plan) to Claude (claude-opus-5-5 via
@anthropic-ai/sdk, structured output) and fills intro, each angle's "why", and 2–4 "waiting on you"
asks, as a suggestion the team can edit before publishing. Never publish automatically.
```
