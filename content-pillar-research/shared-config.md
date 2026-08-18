# Shared Config Layer

> **Bundled copy** — packaged with `content-pillar-research` on 2026-08-18 from `client-health-monitor`'s bundle (itself sourced from `CoS/config/`). If the workspace copy is readable and differs, **the workspace copy wins** and this bundle needs re-packaging.

**Single source of truth for every ID, channel, and roster value the CoS system references.**
All agents and skills read from this file. The Skill Dependency & Drift Detector (Phase 2) monitors it and flags stale references.

> Status: populated 2026-06-05 from live Airtable + Slack; remaining placeholders cleared 2026-06-13 (4 team-member record IDs filled; `#ops-digest` routed to `#activation-automated-updates`).

---

## Airtable

**Base:** `appVwdsrrutdDh24z` (RevBoss Client Portal)

| Table | Table ID | Used for |
|---|---|---|
| Clients | `tblKhLOUG8B2XtwNL` | Client roster, status, account owner |
| Projects | `tblr9ZvUVnFGCyrxD` | Campaign projects, Event field |
| Tasks | `tblpKDy8VdwqQCp8M` | Tasks: status, owner, due date, Strategy field |
| Subtasks | `tblxXvJiiVK5BHhNJ` | Subtasks: owner load, RB App Link field |
| Resources | `tblzrBGaSXlftvZBa` | ICP docs, founder profiles, messaging docs, last_reviewed_at |
| Call Transcripts | `tblLPiELBfXA2pGkb` | Secondary transcript source (Granola is primary) |
| Users | `tblgT2Jruw9aeWSIr` | Team member records |
| Ops Backlog | `tbl8ntYb3YWdHAO06` | Universal inbox for flagged-but-not-urgent items |
| Dashboard State | `tblfl5N3deLclgBuh` | Agent health + last-run status (orchestrator reads this) |
| Alfred Campaign State | `tblUmUR2HXW8Vp2AB` | **Alfred sensor output** — one row per campaign: run state, health, active leads, flags, last action. Rows churn daily; consumers key on **Client + Campaign name**, never record IDs. |
| Alfred Daily Sends | `tblKicvJeWTKa71tl` | **Alfred sensor output** — ⚠️ rows are **WEEKLY** despite both the name *and* the table's own "per day" description (key = `Client\|W\|<week-start>`; `weeklyBuckets_` in the .gs). Powers weekly/monthly volume + WoW flags. NOT the daily rate source. |
| Alfred Day Sends | `tblfJoQE6yQgZ68AV` | **Alfred sensor output — the TRUE daily table** (key = `Client\|D\|<date>`, one row per client per day, ~21 days kept). Written by `AlfredToAirtable-v2.gs` `upsertDailyByDay_` (in the *deployed* script — see staleness note). Powers the Alfred Attention Rollup's weekday view. **Use this for the watchdog's daily send-rate.** |
| Alfred Clients | `tblrr8gMZYHPSViQ5` | **Alfred sensor roster** — one row per client: `Client` (the canonical sensor client string), `Webhook Key`, **`Daily Cap`** (real configured send cap, e.g. 30/40 — a better runway input than estimating), `Alfred Workspace`, `Active`, `Last Synced`. Backfill source for the Clients-table `Alfred Client Key`. |

> **Provenance (traced 2026-06-21):** the three tables above (Alfred Clients / Campaign State / Daily Sends) are one coherent system — written by `sensors/alfred/AlfredToAirtable-v2.gs`, keyed on Client + Campaign Key. **`Alfred Daily Sends` is confirmed WEEKLY from the source** (`weeklyBuckets_()`, 16 weeks kept) despite its name. **Forward-provisioned (intentional, not yet populated):** Tasks `Pushed to Alfred` (`fldNYpgc0m5L6vCpu`) + `Daily Alfred Send Volume` (`fldSTbu7ivLGrgrnT`) were pre-created by Kerry + Giana for a planned future-state Alfred rollup artifact — confirmed effectively empty today, so not a usable input *yet*; coordinate when that artifact lands. **Content team's, not activation/CoS:** Projects `Audience Google Calendar` / `Event ID` track audience **interview sessions** (gcal → content workflow that turns interview transcripts into content). Not for the watchdog — but interview-session dates are a candidate **meeting-recency signal for a future client-relationship-health agent** (alongside client check-ins, email). See memory `audience-gcal-interview-signal`.
| CoS Plan | `tblBLWP8HNjIMfU49` | **Status SSOT** for the CoS build plan (one row per capability/agent + per phase). "What it does" field = `fld2grpY2Mr9ogp4t`. Companion to the Master Working Map doc. Lives in this base — *not* the separate "Herman — Chief of Staff" base (`appugdnKG7HBr9lzF`), which is Eric's unrelated build. |

### Known Clients-table field IDs (discovered)

| Field | Field ID | Notes |
|---|---|---|
| Client name | `fldM5KT51t2DMoZJV` | e.g. "McorpCX - Michael" |
| Status | `fldVQ5RXXvc4wu7tE` | singleSelect — `Active`=`sel6DsbMFc6R8Zdl5`, `Canceled`=`selTOyMzUmeH3StA2` |
| Account owner | `fldMTszT08XFBIQYN` | linked to Users/Team records |
| Alfred Client Key | `fldopMSk2UFLzfzCf` | singleLineText — the exact Alfred sensor client string (matches `Alfred Clients.Client` / sensor `Client`). Stable join key; team backfills from the Alfred Clients roster. Added 2026-06-21. **Backfilled for all 25 active clients 2026-07-01.** **EXEMPT convention: a value of exactly `N/A` = client intentionally has no Alfred account** (e.g. Holzman) — data-integrity-sentinel skips the key check and client-health-monitor skips send-gap detection for these. Do NOT put the Alfred *webhook/API key* here — that's a secret held in the Alfred Clients roster (`fld6dCMKzpaJr1NFQ`); this field is the plain client *name* string only. |

### Resources field IDs (`tblzrBGaSXlftvZBa`)

VERIFIED 2026-06-22 (added so `prospecting-net-new` writes the Source List + Output rows by ID, not name — see SKILL.md §1). singleSelect choice IDs in the last column.

| Field | Field ID | Type | Notes / choice IDs |
|---|---|---|---|
| Name | `fldti4XP8g0ewyQat` | singleLineText | `<Client> — <Event/Campaign> — <Type>` |
| Description | `fldLCpM9WFMczFVeT` | multilineText | |
| Resource Link | `fldyI9qEeDMrhMwKX` | url | the native Google Sheet link |
| Google Drive Folder | `fldA4A6qp35sdBK5V` | url | client/source folder |
| Google Drive File ID | `fldAex1r8XwvI0u8v` | singleLineText | |
| Notes | `fldupojTrUlZ8PuT8` | multilineText | counts / partial-state |
| Date Added | `fldXSjDCRh86TrXZi` | date | |
| Client | `fldByoSTUsZ75YqAK` | link → Clients | |
| Source Task | `fldNBnzd1NJhtP5DQ` | link → Tasks | |
| Source Subtask | `fldBYFxu9Vmzg86n0` | link → Subtasks | |
| Source Project | `fldRb3yMRp9C05fAc` | link → Projects | |
| Resource Type | `fldE47meYRxljmpHC` | singleSelect | `Prospecting & Lists`=`selSv8i3UnRta0ktl` |
| Source | `fld4XIAdgsLbhofiy` | singleSelect | `Client Provided`=`selgYp69V5nyLPTEe`, `Skill Generated`=`selETBSkJv7WP0kgp` |
| Created By Skill | `fldQrWaMhNNPaLOwQ` | singleSelect | `prospecting-net-new`=`selGFBTm8aON3tedq` |
| Status | `fldnGoIggaQykc6o1` | singleSelect | `Needs Enrichment`=`seljaa2Qp9ZTF5lJI`, `In Use`=`sel2X8GjpTgGh6UPt`, `Current`=`selwZ94wB5hDqGBQZ` |
| Resource Subtype | `fldozLrK2kRfwq4My` | singleSelect | `Client: Event Attendee List`=`selTA3q2YQuVZ7ZGX`, `Enriched Prospect List`=`selWpE4DsuTOylv46`, `Leads List`=`seliEdaJMwF9h1UtK` (~70 choices total — fetch schema for others) |

> Tasks/Subtasks/sensor field IDs are populated below (added 2026-06-21 for the Event & Milestone Watchdog).

### Tasks field IDs (`tblpKDy8VdwqQCp8M`)

| Field | Field ID | Type | Notes |
|---|---|---|---|
| Task Name | `fldr0ueXmf1WcqkOk` | singleLineText | |
| Task Status | `fldXNPnCSSo0ToBGu` | singleSelect | Choices incl. `TO DO`, `IN PROGRESS`, `RUNNING / ONGOING`, `READY, NOT ACTIVE`, `DONE`, `ON PAUSE`, `FUTURE / HOLDING` |
| Task Type | `fldR04IK3mZsKHc2g` | singleSelect | `LI - Leads`, `LI - Messaging`, `LI - Setup`, etc. |
| Client | `fldRe9FN53CFZVx0R` | link → Clients | |
| Due Date | `fldMetOOBrPStMh6f` | date | |
| Event | `fldTzJ7IYRPTgWzUI` | singleSelect | Single choice `Event`. Declared in the artifact but **unused** by it. |
| **Strategy** | `fld7ofBS7JR1LKKHF` | singleSelect | `Event` / `Evergreen` / `Net New Always On`. **Set by `process-call`** at task creation (and on the parent Project, `fldW5y4rlnj1fMcyG`); checked by `post-call-qa-verifier`. The correct event trigger — but coverage = process-call's coverage (manual/Gmail/Slack tasks may lack it). `Evergreen` + `Net New Always On` = always-on campaigns to pause for event bandwidth. |
| Alfred Campaign Link (from Subtasks) | `fldahagaCa2ACX31T` | lookup | Task-level rollup of the child Setup-Alfred subtask's Alfred link — parse `…/overview/<ID>` for the campaign-ID join (no subtask traversal needed). |
| Team Review | `fldsDLV4cwhrUoAQu` | singleSelect | Choice `Needs review` (`sely5BO2SdxfqLDaX`). process-call sets this when it can't determine an event's `Event Date` from the call (human fills it). The watchdog's coverage check can also surface it. (Subtasks has its own `Team Review` `fldnstJDaB1KfnUaL`.) |
| Event Date | `fldsW4py80Wj3QLQ4` | date | **Watchdog entry condition** — only tasks with this set are watched |
| Watchdog Nudge State | `fldbjZQ1OqNH8pEwA` | singleSelect | Set by `event-milestone-watchdog` — highest nudge tier last sent, for dedupe. Choices: `none`, `prep-at-risk`, `start-soon`, `prep-urgent`, `runway-behind`, `resolved`. Agent-owned; do not hand-edit. |
| Watchdog Last Nudge | `fldZkCLRWZk67R4Ic` | date (ISO) | Set by `event-milestone-watchdog` — date of last nudge. Paired with Nudge State for dedupe. Agent-owned. |
| Event Phase | `flduq3M9AT41tEGbo` | singleSelect | `Pre-Event` / `Post-Event` / `Milestone (no campaign)`. Drives watchdog timing (pre = finish before date; post = run from date forward; milestone = Track B content heads-up). If blank, agent infers from task name. |
| Alfred Campaign Name | `fldWkwdIvt3iOKsCt` | singleLineText | Optional manual campaign-match override. Fill only when auto-match is wrong. Stores the exact sensor Campaign name (**not** a record link — sensor rows churn daily). |

### Subtasks field IDs (`tblxXvJiiVK5BHhNJ`)

| Field | Field ID | Type | Notes |
|---|---|---|---|
| Subtask Name | `fldQtp7yYDa0M7Ux5` | singleLineText | |
| Task | `fldrq4k4JBAx68tCH` | link → Tasks | Parent task (links a prep subtask back to its event) |
| Subtask Type | `fldPAsNMBWaxA7JDt` | singleSelect | Prep types: `Leads`, `Messaging`, `Setup - App`, `Setup - Alfred` (+ `Launched`, `Client`, `Admin`, `Setup`) |
| Subtask Status | `fld18J2vrg52rVoHD` | singleSelect | Incl. `TO DO`, `IN PROGRESS`, `READY TO IMPORT`, `RUNNING / ONGOING`, `READY, NOT ACTIVE`, `DONE`, `SPEND APPROVED`. (`READY TO IMPORT` = Handoff & Routing v1 trigger.) |
| Clients | `fldhuKcVJ6cF5bPer` | link → Clients | |
| Due Date | `fldSAkobqBHzDHlx9` | date | |
| Description / Notes | `fldmij3crkeI4KhyK` | richText | On `Setup - Alfred` subtasks, opens with `**Campaign Name (use for Alfred and RB App campaigns):** <name>` — the canonical campaign name (watchdog match tier 3). |
| Alfred Campaign Link | `fldGx6Q7YfOi6Xsux` | url | `https://app.meetalfred.com/campaign/details/overview/<ID>` — the `<ID>` is the **Alfred campaign ID** (watchdog match tier 1, the strongest join if the sensor exposes the ID). |
| RB App Campaign Link | `fldxIbyvVJsn6TeTt` | url | `https://revboss.co/campaigns/<ID>` — RB App campaign ID. |
| Handoff State | `fldtMhPPgdlEkUPKx` | singleSelect | Set by `handoff-router` — the handoff's own lifecycle + atomic-claim marker, **distinct from `Subtask Status`** (the skill never writes Status). Choices: `UNROUTED` `sels0Ihgo43kWAK5Z` · `ROUTING` `selnlnP5alVi54BiR` · `ROUTED` `selVdbI4C4327NHWS` · `BLOCKED` `selD7ocvxj3LOYmF1`. ⚠️ **No field default enforced** (connector couldn't set one) — `UNROUTED` is the first choice but blank means unrouted; the skill writes `UNROUTED` explicitly, never assumes a default. Agent-owned; do not hand-edit. |
| Handoff Routed At | `fldgZJnqzHfFECTxf` | dateTime | Set by `handoff-router` — timestamp of the `ROUTED` transition. Powers the stuck-detector + audit. Agent-owned. |
| Handoff Version | `fldr7OLX0a6t3rnhf` | singleLineText | Set by `handoff-router` — content-version key (linked Resources row's Last-Modified / run id at route time) so a genuine update re-briefs but an unchanged item doesn't double-ping. Agent-owned. |

### Projects field IDs (`tblr9ZvUVnFGCyrxD`) — the event backbone (watchdog v2)

| Field | Field ID | Type | Notes |
|---|---|---|---|
| Project name | `fldhUfV21W1Q58C3c` | multilineText | Event name |
| Client | `fldIjZJVR6ez9y84i` | link → Clients | |
| Strategy | `fldW5y4rlnj1fMcyG` | singleSelect | `Event` (`sel0wK6hcsz6HTTO4`) marks an event Project — **the watchdog's primary trigger**. Set by process-call. |
| Project Type | `fld7pvl3U0MXg9cte` | singleSelect | `Activation` for activation events |
| Tasks | `fldfk8KMWInjvQK7e` | link → Tasks | the event's campaign Tasks (Pre/Post) |
| Event Website | `fld2rUCCU0vCCe8d7` | url | Optional; opportunistic/manual; not agent-searched. Added 2026-06-21. |
| No Campaign (Intentional) | `fldpcrDzET15EgT7Z` | checkbox | Marks a true Track-B milestone (no campaign by design). Added 2026-06-21. |
| Watchdog Event State | `fldbWOL3wx2yNrN86` | singleSelect | Event-level nudge dedup (highest tier last sent). Agent-owned. Added 2026-06-21. |
| Watchdog Last Nudge | `fldKQDRVuz8hzeBDb` | date (ISO) | Event-level last-nudge date. Agent-owned. Added 2026-06-21. |
| Event Date Rollup | `fldcbtNTMMvyY60GE` | rollup | MIN of linked Tasks' `Event Date` — **the agent reads this for the event date.** Created in UI 2026-06-21. (Companion lookup `Event Date` `fldQzj7KzBBU8sA3D` shows all child dates.) |
| Content Coverage | ⏳ **blocked** | rollup | Intended rollup over the event's Rachel content task — but process-call puts that task on the *Admin* project, not the event Project. Needs process-call to link it to the event Project first (FOUNDATION-SPEC §10). Until then the agent matches the content task heuristically. |

### Alfred Campaign State field IDs (`tblUmUR2HXW8Vp2AB`) — sensor output

| Field | Field ID | Type | Notes |
|---|---|---|---|
| Campaign | `fld5EM1jeWHP2X0CT` | singleLineText | Campaign name (drifts vs the planned name). |
| **Campaign Key** | `fldQc3QT4krRVn5Sa` | number | **The Alfred campaign ID** (e.g. `1519235`) — the stable, rename-proof join key. Match the ID parsed from a Task's `Alfred Campaign Link` against this. **This already exists** — no sensor change needed for the ID join. |
| Synced At | `fldVWFREmVp6pyoYT` | dateTime | Sensor freshness for this row — use for staleness detection. |
| Client | `fldHOkToC74bkxOp6` | singleLineText | Plain text, not a link — match by name |
| Run State | `fld1nreNw1fC55sjE` | singleSelect | `running`, `paused`, `unknown` |
| Health | `fldvi9JmaXFORdjBC` | singleSelect | `sending`, `no sends today`, `paused`, `not live`, `out of leads`, `ignored review` |
| Flags | `fldkxiww9lL7OGRUL` | multilineText | |
| Active Leads | `fld1WQ6R0zvKiao3b` | number | Remaining lead pool — runway numerator |
| Invites | `fldOeE0PhQzTDu2PK` | number | |
| Last Action At | `fldxMjgZWq5Yx7ejJ` | dateTime | America/Chicago |

### Alfred Daily Sends field IDs (`tblKicvJeWTKa71tl`) — sensor output, **WEEKLY** rows

| Field | Field ID | Type | Notes |
|---|---|---|---|
| Client | `fld9LyYzt1aWKbcyO` | singleLineText | Match by name |
| Date | `fldD3zivymj8mCoih` | date | **Week-start** (Monday), not a day |
| Invites | `fldcIFmhapWcWLuft` | number | Invites for that **week** |

### Alfred Day Sends field IDs (`tblfJoQE6yQgZ68AV`) — sensor output, **DAILY** rows (runway rate source)

| Field | Field ID | Type | Notes |
|---|---|---|---|
| Key | `fld9EIKRTkU0jHNp1` | singleLineText | `Client\|D\|YYYY-MM-DD` |
| Client | `fldGhWNJzK1ehsr5C` | singleLineText | Match by name |
| Date | `fldyQSLYEZzwO1zJH` | date | The actual day |
| Invites | `fldvJiGp5KID5GoVC` | number | Invites **that day** — sum over last N days ÷ N for the rate |
| Accepted | `fldc7Pm9IC1TOGh3l` | number | |
| Messages | `fldejcPtW4wXw14tx` | number | |
| Replies | `fldlBeYv7DpOrn2WK` | number | |

> ⚠️ **Runway rate — use `Alfred Day Sends` (the TRUE daily table), VERIFIED 2026-06-21.** There are two send tables and the names are misleading: `Alfred Daily Sends` (`tblKicvJeWTKa71tl`) is **weekly** (`|W|` keys); `Alfred Day Sends` (`tblfJoQE6yQgZ68AV`) is **daily** (`|D|` keys, ~21 days kept). For the watchdog daily send-rate, query **Day Sends**: `rate = sum(Invites for this client's rows with Date ≥ today − RATE_DAYS) ÷ RATE_DAYS` (default 14, within the ~21-day retention), min 1. Each row is genuinely one day, so no ÷7 ambiguity. (The artifact used Daily/weekly — Day Sends is more accurate.) The configured **`Daily Cap`** in `Alfred Clients` (30/40) is a useful sanity bound on the rate.
>
> **Sensor / artifact source-of-truth = iCloud `Claude Work/CoS`** (the Cowork artifact session owns it). The repo's `sensors/alfred/AlfredToAirtable-v2.gs` + `artifact-sources/alfred-attention-rollup.html` were **re-synced from canonical 2026-06-21** and now include the daily write (`upsertDays_` + `TBL_DAYS` → Alfred Day Sends) and the 3-view rollup. Note: the daily-write function is **`upsertDays_`** (the Airtable table description's `upsertDailyByDay_` is wrong). **Repo sync ≠ deploy** — pasting the `.gs` into the live Apps Script is a separate action the artifact session owns. When unsure, verify sensor behavior against **live Airtable**, not a possibly-lagging repo copy.

### Sensor ↔ Client name mapping (for the watchdog campaign match)

The Alfred sensor stores `Client` as **free text** (e.g. `MCorpCX`, `Korbyt`, `Amoeba`) that does **not** equal the Clients-table record name (`McorpCX - Michael`, `Korbyt - Trevor`, `Amoeba - Tooba`). Match in two steps:

1. **Normalize both sides:** lowercase, trim, collapse whitespace, and strip a trailing ` - <contact>` suffix from the Client record name. Handles the systematic casing/suffix pattern (most clients).
2. **Alias overrides** (sensor name → Client record name) for genuine divergences normalization can't bridge:

| Sensor `Client` text | Clients-table record | Note |
|---|---|---|
| `Atlas Dev Shop` | `Atlas - Job` | ✓ Confirmed (Kerry 2026-06-21) — company name ≠ client-record root |

> Seeded 2026-06-21 from live data; extend as new mismatches surface. Verified to normalize cleanly (no alias needed): MCorpCX, Korbyt, DaVinci Direct, Stable Kernel, Amoeba, Teachable, Razor Tracking, Sequence Consulting, David Rosenheim Executive Coaching, Charlton Marketing, Innovation Challenge, Naya Software, Huntress, Wrangle, ShyftOff, and all `AGP - *` seats (exact). Unmatched sensor clients → log, don't crash.
>
> **Scope note (after the subtask-anchored match revision):** client-name matching is now needed **only** for the Daily-Sends rate and "other always-on campaigns for this client" — the per-campaign runway join is done by campaign (via the `Setup - Alfred` subtask's Alfred ID / canonical name), not by client name. So a mismatch no longer silently kills runway for a whole client; it only degrades the secondary signals.
>
> **Stronger solution — now in place (2026-06-21):** the stable join key exists — **`Alfred Client Key`** (`fldopMSk2UFLzfzCf`) on the Clients table, holding the exact sensor `Client` string; team backfills from the `Alfred Clients` roster. Match becomes an exact key join; a new client with an unset key surfaces **loudly** (flaggable) instead of silently mismatching. The normalize+alias map above is now the *fallback* for un-backfilled rows. The campaign-level join is likewise solved by the existing **`Campaign Key`** (Alfred campaign ID) on Alfred Campaign State — no sensor change needed (see foundation review §3).

---

## Slack channels

> **Heads-up:** several alert channels named in the architecture doc **do not exist yet** in the RevBoss workspace. Two options: create them, or (recommended for now, per Kerry's 6/4 call about consolidating) route autonomous-agent alerts into the existing **#activation-automated-updates** and split them out later if the volume warrants.

**Exist today:**

| Channel | ID | Purpose |
|---|---|---|
| `#activation-ops-digest` | `C0BE67NH5EZ` | **CoS daily synthesis** — the ONE place Kerry looks; cos-daily-digest posts here only (created 2026-06-30) |
| `#post-call-task-summary` | `C0AEH0UQ1TR` | Call Processing Agent |
| `#follow-up-email-drafts` | `C0BAWU2GPNZ` | process-call Step 7 — follow-up email draft (replaced Gmail draft 2026-06-17) |
| `#pre-call-client-agendas` | `C0AGM90LZN2` | eod-agenda-run |
| `#claude-skill-updates` | `C0ASP30ET71` | Drift Detector + skill-update-poster |
| `#activation-automated-updates` | `C0B52B5AZCM` | Team operational alerts — NEEDS-ASSET blocks, process-call gaps, urgent event flags. Routine status → Ops Backlog instead. |
| `#activation-automated-approvals` | `C0ASVJ837EW` | Semi-autonomous approvals (Decision Router candidate) |
| `#activation-team` | `C0AKBJN1XEH` | Team Capacity Coordinator / team ops |
| `#content-team-ops` | `C09E1RLEGRF` | Content-side ops |

**Don't exist yet (create or remap):**

| Channel (doc) | Recommendation |
|---|---|
| `#ops-alerts` | Remap → `#activation-automated-updates`. |
| `#client-health-alerts` | Remap → `#activation-automated-updates` (or create). |
| `#client-intel-alerts` | Remap → `#activation-automated-updates` (Phase 2). |
| `#team-ops` | Remap → `#activation-team` (`C0AKBJN1XEH`). |

---

## People (roster)

| Name | Airtable record ID | Slack user ID | Role |
|---|---|---|---|
| Kerry Doyle | `rec3i4C5J2DWU5J03` | `U02TQ6C4B25` | Owner / decision-maker (digest + decisions route here) |
| Giana Reno | `recFKif8GWBsUUDoF` | `U0B1LCWSZ9A` | Strategy |
| Chris Blackwell | `rechAGIPuzbhynpBL` | `U01850K6VE2` | ⚠️ DEPARTED (2026-06-09, MASTER map §0.5) — do NOT assign; Messaging default owner = **Giana** |
| Roanne Jaype | `recwoU1p6jJePSlZj` | `U09KMU5SJ5P` | Execution / activation |
| Kesar Rana | `recVyr1vdLfD5nNGq` | `U09CXKMDN87` | Execution / activation |
| Rachel Velasquez | `recvrPGysmnLRNnoh` | `U01R5N4U4TF` | Content (Marketing Manager) |
| Danny Chu | `recrqNhsyK78rkJex` | `U06V02GCKTR` | Account owner |
| Eric Boggs | `recZcnTujAcPQE02E` | `U03ANP43B` | Founder / CEO |

> The 4 team-member record IDs (Giana, Roanne, Kesar, Rachel) were filled 2026-06-13, resolved by exact name-match against the Users table (`tblgT2Jruw9aeWSIr`). They're used by the Team Capacity Coordinator (Phase 3).

---

## Client roster — 26 active (as of 2026-06-05)

| Client | Record ID | Owner |
|---|---|---|
| McorpCX - Michael | `rec0MgkwL3kuJO5JI` | Danny |
| AGP - Ryan | `rec6uANTpYfDsHMSV` | Danny |
| Korbyt - Trevor | `rec8Tnj50lSSNUzY5` | Kerry |
| LoanWell - Bernard | `rec8ouOwb1MU2SuZw` | Kerry |
| ShyftOff - Tyana (renamed from "ShyftOff" 7/17/26; two-seat split) | `recFhumwm9hWV63Mi` | Danny |
| ShyftOff - Trevor (created 7/17/26; Alfred WS "Trevor Clark - ShyftOff", LinkedIn not yet connected; sensor key `ShyftOff - Trevor`) | `recYzt0ukaSghi16F` | Danny |
| David Rosenheim Executive Coaching - David | `recH7oWylgHzQB2l5` | Kerry |
| Razor Tracking - Eric | `recIrWa5Na1ctO638` | Danny |
| Amoeba - Tooba | `recIte7W1fUBmHkAh` | Kerry |
| AGP - Liz | `recOJS2GgJs3Secpx` | Danny |
| Sequence Consulting - Chris | `recOemOIb25mNq5DO` | Danny |
| Huntress - Brandi | `recQsuee4rFRRK4BM` | Kerry |
| Stable Kernel - Jay | `recQzv05cyVpr8aA0` | Kerry |
| Charlton Marketing - Sara | `recVV7Y01o5RKwLwB` | Kerry |
| AGP - Whitney | `recXgEzUEydTFIuBi` | Danny |
| Naya Software - Matthew | `recfyct3Ui2Ktk9jD` | Kerry |
| Innovation Challenge - Anil | `recgAlHQIBuWXieP5` | Kerry |
| Teachable - Anna | `recgNkK05fNs2og2T` | Kerry |
| Atlas - Job | `rechLtr7R4ogC5fNk` | Kerry |
| The Fix Group - Martin | `recjUqfUe0nu9tb0t` | Kerry |
| AGP - Debbie | `reckkJxMias00eC3L` | Danny |
| Wrangle - Adam | `recnnC0BHvFSHSDbi` | Eric |
| DaVinci Direct - Steve | `recobHmYioCR1ruTg` | Kerry |
| Holzman | `recpdoyt7U5XaIKxo` | Eric |
| Ramirez Hospitality - Adam | `recrmgBIa3d2OSg5G` | (unassigned) |
| AGP - Trent | `recsgHKh04WDHpYT9` | Danny |
| AGP - Alyssa | `recz3HZXvkhsv2LvR` | Danny |

> Note: "AGP" spans 6 records (Ryan, Liz, Whitney, Debbie, Trent, Alyssa) — these are seats/contacts under the AGP account, your biggest client. The Client Strategy Agent should treat them as one account with multiple stakeholders. Ramirez Hospitality has no account owner set — flag for the Data Integrity Sentinel.
>
> This roster is a point-in-time snapshot. The orchestrator/Health Monitor should treat the live Clients table (filter Status = Active) as authoritative and refresh from it, not hardcode against this list. The Drift Detector compares this list to clients referenced in skill configs to catch new clients missing from configs.

---

## Notification-router routing policy (7.C) — read at run time

**Consumed by `notification-router/live/config-source.js`.** Roster names/Slack IDs and channel IDs are parsed from the People and Slack-channels tables above — this section holds only the router-specific policy so nothing is duplicated (Stage-2 §5 item 6: never re-hardcode). People marked DEPARTED in the roster table are tombstoned: they are never valid recipients; alerts owned by them fall back to `fallbackOwner` with a warning.

- **pushTiers:** `P1`
- **artifactAuthoritative:** MOVED 2026-07-21 → `config/run-receipts.md` now owns this flag (still `false`; cos-daily-digest inherited the router's duties at the 7/16 retirement, so its config layer holds the switch). Same gate: flip ONLY at 5 consecutive clean mornings per the digest's counter. Do not set it here.
- **digestChannel:** `#activation-automated-updates`
- **fallbackOwner:** `kerry`
- **dedupeLedgerTable:** `Router Dedupe Ledger` `tblJJKJHnufvkQI6U` (created 2026-07-06, schema approved). Field IDs: Alert Key `fldyxE97rAXNrf0g3` · Version `fldghjbmVi1D396qu` · Delivered At `fldSiB1mMIelfgksu` · Tier `fld1xt6J0CLvagwGf` · Kind `fldhtUPUCfygilRtc` · Client `fldRUr8pA7bB6wGMa` · Summary `fldon7QWHF4zWBHD3` · Delivered To `fldyTy16SAs1bdl97` · Re-Push Count `fldIpW2vPSOUcvkSu`. One row per alert key; written ONLY after a successful Slack push. Agent-owned.
- **schedule (added 2026-07-07, Kerry-approved):** local scheduled task `cos-notification-router-morning`, weekdays 8:00am CT (runs while the Claude app is open; runbook: `notification-router/live/SCHEDULED-RUN.md`). P1 + spend only; ledger-deduped; digest keeps posting in parallel until cutover.
- **event version rule (2026-07-07):** run-router.js strips day counts ("in 2d") from event-item dedupe versions on BOTH feed and loaded-ledger sides — a stalled event re-pushes on state change, not daily.

| Alert kind | Recipients (roster keys) |
|---|---|
| `spend-approval` | kerry, giana |
| `call-not-processed` | kerry |
| `campaign-never-built` | kerry, roanne |
| `event-prep-urgent` | kerry |
| `event-runway-urgent` | kerry |

---

## Conventions referenced by agents

- **Task naming convention:** observed pattern uses prefixes like `Leads - `, `Messaging - `, `Setup - App - `, `Setup - Alfred - `, `Admin - `, `Client - ` + campaign name. Document the canonical format from the `process-call` skill here.
- **Task description template:** see `process-call` skill — descriptions must be non-light and include the source transcript link and campaign reference.
- **"Client call" detection logic:** as implemented in `eod-agenda-run` / `daily-task-tracker` — reused by Event & Milestone Watchdog and Call Processing Agent.
