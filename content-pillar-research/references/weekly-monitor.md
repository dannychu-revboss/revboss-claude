# Weekly monitor — sources, scoring, thresholds

The weekly run has one job: convert "what happened in this client's market this week" into
**5–8 pillar-tagged idea seeds and a 1–3 item ask list**, with sources attached. Everything here
serves that conversion.

Budget per client per run: **≤ 6 pillar searches, ≤ 12 fetches, ≤ 2 answer-surface questions.**
Spend it unevenly on purpose — a starved pillar deserves three searches and a well-fed one deserves
zero.

---

## Reading the content first — enumerate every status

**Do not trust a default `ordinal_search_content` page.** Ordinal's default listing returns a
single page that can silently omit whole statuses — in the 2026-08-18 pilot dry run it returned only
`ToDo` and `Posted` items for two clients, hiding their `Scheduled` posts entirely and producing
false `pillar-starved` flags on pillars that were in fact fully covered for the next three weeks.

So: **query each status explicitly** and merge — `Posted`, `Scheduled`, `ToDo`, `ForReview`,
`Finalized`, `InProgress`, `Tentative`, `Blocked` — and page with `nextCursor` until `hasMore` is
false for the statuses that matter. Then dedupe by post id.

- `Posted` → trailing-window coverage.
- `Scheduled` + `ToDo` + `ForReview` + `Finalized` + `InProgress` + `Tentative` → forward coverage.
- `Blocked` → forward coverage, but flag it; a blocked post is not going out on its date.
- Filter per person on multi-seat workspaces (`linkedInProfileId`), or one seat's numbers absorb another's.

**Before reporting any starvation flag, confirm it against a full pull.** A false "starved" flag
sends the team chasing content a client already has, which is worse than no flag at all.

## Sources — sweep in this order

Ordered by how often they produce a postable, differentiated idea. Stop early when you've got
enough for the starved pillars; you don't need every class every week.

### 1. The client's own people and orbit (highest yield)
- The founder's/executive's recent LinkedIn activity and comments — what are they already arguing
  about in comment threads? Those arguments are unwritten posts.
- Their team's posts, their customers' posts, and posts they've engaged with.
- Client-side material that arrived this week: webinars, releases, decks, transcripts (Granola),
  Airtable Resources added since last run, anything in `#content-team-ops`.

> Some clients want a "repost / amplify people I respect" pillar. That needs a **named list** of
> people in `pillars.json` (`proof_assets` of type `person` or a `search_queries` entry naming
> them) — the agent cannot guess whose posts a founder respects. If a client has that pillar with
> no named list, raise it in the ask list rather than inventing one.

### 2. Peers and competitors on the pillar
- Who published on this pillar in the last 7–14 days, where, and how it landed.
- The `incumbent` named in the registry: did they get stronger this week?
- **What to extract:** not their idea to copy — the gap in their idea our client can attack.

### 3. Buyers talking out loud
- Community threads (Reddit, industry Slacks/forums, LinkedIn comment sections, Q&A sites) where
  the pillar's buyer questions are being asked by real people this month.
- These are gold for two reasons: they're the buyer's own phrasing (feeding
  `buyer-questions.json`), and a post that answers a question people are visibly asking is exactly
  the post an AI answer will cite.

### 4. Industry / trade news and market moves
- Funding, M&A, layoffs, pricing changes, new entrants, big-customer wins in the client's category.
- Regulatory, standards, or platform changes that force the buyer's hand — deadline-shaped news is
  the most postable news there is.
- Data drops: surveys, benchmark reports, analyst notes the client can react to with a real opinion.

### 5. Events and calendar hooks
- Conferences, webinars, awards, seasonal buying cycles in the next 30–60 days where the pillar's
  audience gathers. Cross-check Airtable Projects with `Strategy = Event` so content research and
  campaign work point at the same events instead of diverging.

### 6. The answer surface itself
- The 2 rotating buyer questions (see `query-harness.md`). A shift in who's cited is itself a
  signal — and occasionally a post: "I asked ChatGPT what our category's buyers ask. Here's what
  it said, and here's what it got wrong."

---

## Signal record

Every kept signal must have all of these. A missing field means it isn't ready to be an idea.

```json
{
  "key": "sha1-ish stable key for dedupe",
  "pillar_id": "onboarding-drop-off",
  "what": "One sentence: what actually happened or was said.",
  "source_url": "https://...",
  "source_type": "peer-post | news | community | data | client-material | event | answer-surface",
  "dated": "2026-08-14",
  "why_buyers_care": "The reason this matters to THIS client's ICP, not in general.",
  "our_angle": "What this client can say that nobody else in the thread can.",
  "proof": "Which proof asset or client experience backs the angle (or 'needs client input').",
  "evidence_strength": "strong | moderate | thin",
  "suggested_format": "text-only | text + image | carousel | case study | repost + POV",
  "score": 0.0
}
```

`our_angle` is the field that separates this agent from a news alert. If you can't fill it, the
signal is context, not content — put it in the report's context section and move on.

## Scoring

Score 0–5 on each, then weight:

| Factor | Weight | What a 5 looks like |
|---|---|---|
| **Pillar fit** | 0.25 | Squarely inside one pillar's `in_scope`; not a stretch |
| **Buyer proximity** | 0.25 | Maps to a real buyer question; a buyer would search this |
| **Differentiated angle** | 0.20 | Our client has standing and specifics nobody else has |
| **Timeliness** | 0.15 | Dated this week, or a deadline is coming; still fresh in 5 days |
| **Evidence strength** | 0.15 | Primary source, named, dated, verifiable |

`score = Σ(factor × weight) / 5` → 0–1. Then:

- **Starvation boost:** `+0.10` per consecutive week the signal's pillar has had zero forward
  coverage (cap `+0.20`). The plan wins ties over novelty.
- **Cut line:** drop anything under **0.45**. Keep 5–8. If a week genuinely produces fewer than 3
  scoring signals, **report the thin week honestly** — do not pad it with generic evergreen ideas.
  A thin week is itself information (the market went quiet, or the pillar is drifting).

## Thresholds and defaults

| Setting | Default | Notes |
|---|---|---|
| `coverage_window_days` | 30 | Trailing window for "published" counts |
| `forward_window_days` | 21 | How far ahead queued content counts as coverage |
| `ideas_per_week` | 5–8 | Per client; weighted to deficits |
| `starved_weeks_flag` | 3 | Consecutive weeks at zero forward coverage → `pillar-starved` |
| `no_signal_weeks_flag` | 2 | Consecutive weeks with no credible pillar signal → `pillar-drifting` |
| `no_client_input_weeks` | 3 | → `no-client-input`, escalate to account owner |
| `refresh_interval_days` | 90 | → `pillars-stale` |
| `judgment_floor_days` | 30 | Never call a pillar failed before this (methodology §4) |
| `dedupe_ttl_days` | 45 | How long a seen-signal key suppresses a repeat |

## Dedupe

`radar-state.json` keeps:

```json
{
  "slug": "example-co-dana",
  "last_run": "2026-08-18",
  "seen": { "<signal-key>": "2026-08-18" },
  "starved_weeks": { "onboarding-drop-off": 0, "pricing-honesty": 2 },
  "no_signal_weeks": { "pricing-honesty": 1 },
  "question_cursor": 4,
  "last_client_input": "2026-08-05",
  "last_full_answer_surface": "2026-08-01"
}
```

Signal keys should be stable across weeks for the same underlying story — key on the canonical URL
plus a normalized title, not on the wording of your summary. A developing story may legitimately
re-enter with `"update": true` and a note on what's new; a story that's just still true may not.

## Writing seeds to Ordinal

One idea per kept signal, via `ordinal_create_idea` (or `ordinal_manage_idea`). Body should carry:

```
PILLAR: Why customers quit in week one
ANGLE: <our_angle>
WHY NOW: <what happened> (<source_url>, 2026-08-14)
PROOF: <proof asset or "needs client input: ...">
FORMAT: text-only
KEY TERMS (first line): first-30-days retention, activation
— Seed from content-pillar-research 2026-08-18. Copy not yet written.
```

Then: label it with the pillar, confirm the response is `status: "ToDo"`, and **never** date it or
flip it to `Scheduled`. If a client's workspace uses `HOLD` / `rejected` / `edits required`,
respect those exactly as `content-calendar-builder` does.

## The ask list

Derived from deficits the research cannot fill alone. Each item:

- **What we need** — concrete and small ("the name of the partner from the Q2 webinar", "permission
  to publish the 18% retention number").
- **Which pillar** it feeds and **which post** it unblocks.
- **Why now** — the calendar consequence if we don't get it this week.

Max 3. A long list gets ignored; three specific asks get answered. This is what should populate the
client's weekly email or interview questions instead of "anything to share this week?"

## Digest shape (`#content-team-ops`)

```
📚 Pillar research — <Client> — week of Mon 8/18
Coverage: ▓▓▓ Week-one churn 3/3 · ▓ Pricing honesty 1/3 ⚠️ starved 2w · ░ Partner proof 0/2 ⚠️
Top signals
 1. <what> — <why it matters> — <link>
 2. …
Ideas written: 6 (all ToDo, unscheduled) — <titles>
Ask <Client> this week:
 • <ask 1 — unblocks "Partner proof" post>
Flags: pillar-starved (pricing-honesty, 2w)
Full report: <artifact/file link>
```

Keep it scannable. One block per client; detail lives in the report. Post nothing to Slack on a
failed run — write the receipt with `FAILED —` and alert `#activation-automated-updates` instead.
