# Content Pillar Research Agent

An agent that decides **what each client should be talking about, and why** — then keeps that answer
current every week, and turns it into the raw material for a forward content calendar.

It exists to fix the order of operations. Today content gets created and then a plan gets built
around whatever exists. The plan should come first, but a plan needs an input source that doesn't
depend on the client sending us things unprompted. This agent is that source.

```
BASELINE (once per client, refreshed quarterly)
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. read the client        Resources · transcripts · site · past posts    │
│ 2. buyer question set     8–12 questions in the buyer's own words        │
│ 3. answer-surface baseline  ⛔ HUMAN runs the pack in ChatGPT/Claude →   │
│                             agent parses WHO gets named today            │
│ 4. who owns each topic    competitors, practitioners, incumbents         │
│ 5. score & pick 3–5       demand · credibility · differentiation ·       │
│                           sustainability · pipeline proximity            │
│ 6. write pillars.json  +  render the client-facing Topic Strategy Brief  │
│ 7. HUMAN APPROVAL ─────────────────────────────────────────────┐        │
└────────────────────────────────────────────────────────────────┼─────────┘
                                                                 ▼
WEEKLY MONITOR (scheduled, Monday morning)                 pillars.json
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. coverage read      Ordinal published + queued → per-pillar gaps       │
│ 2. topic radar        what's being talked about, per pillar, with dates  │
│ 3. score & cut        keep 5–8 signals, weighted toward starved pillars  │
│ 4. answer surface     agent builds a 2-question paste-ready pack for a   │
│                       human (full set monthly); tracks skips             │
│ 5. write idea seeds   → Ordinal as IDEAS ONLY, never scheduled           │
│ 6. ask list           the 1–3 things we need FROM the client this week   │
│ 7. report + Slack digest + Dashboard State receipt + state update        │
└──────────────────────────────────────────────────────────────────────────┘
        │                          │                        │
        ▼                          ▼                        ▼
 content-calendar-builder   linkedin-post-writer     weekly client email
 (dates the batch)          (writes the copy)        (pointed asks)
```

## Why pillars, and why only three to five

Buyers research with AI before they talk to anyone, AI cites LinkedIn above other domains for
professional questions, and roughly **75% of those LinkedIn citations come from individual profiles
rather than company pages**. So the unit that gets quoted is a *person's post* — and a model learns
who to trust on a topic from repetition. Repetition splits across topics, which is why the cap is
five and the discipline is narrowness.

Sources and numbers: `references/methodology.md`. Every figure is attributed; the agent is required
to quote the source alongside the number.

## What's in here

| Path | What it is |
|---|---|
| `SKILL.md` | The agent. Modes (BASELINE / WEEKLY / REFRESH), guardrails, the full run loop |
| `references/methodology.md` | The AI-search citation thesis with sources — the "why" a client reads |
| `references/pillar-registry-schema.md` | `pillars.json` schema and editing rules |
| `references/query-harness.md` | How to measure who the AI names, and how to describe that honestly |
| `references/weekly-monitor.md` | Weekly sources, signal record, scoring rubric, thresholds, digest shape |
| `references/outputs.md` | What each deliverable must contain + the report input JSON shapes |
| `scripts/pillar_coverage.py` | Coverage/gap math and the next-batch mix allocation |
| `scripts/validate_pillars.py` | Registry validation — run before any write |
| `scripts/build_report.py` | Renders the Topic Strategy Brief and the weekly report as self-contained HTML |
| `templates/` | Worked examples of every file, plus sample report inputs |
| `config.json` | Channels, thresholds, spend caps, schedule, pilot client list |
| `shared-config.md`, `run-receipts.md` | Bundled config layer (workspace copy wins if they differ) |
| `clients/<slug>/` | Per-client registry + agent state (see below) |

## Per-client files

```
clients/<slug>/
  pillars.json                  human-approved — the SSOT for what this client talks about
  buyer-questions.json          human-approved — the questions the answer surface is measured on
  answer-surface/<date>.json    agent — one dated observation per run, never overwritten
  radar-state.json              agent — seen-signal keys, starvation counters, rotation cursor
  weekly/<date>.json / .html    agent — the week's report input and rendered report
```

## Guardrails

1. **Never schedules anything.** Ordinal writes are ideas at `status: "ToDo"` only. Dating the
   calendar is `content-calendar-builder`'s job, after a human looks at the batch.
2. **Never contacts a client.** The ask list is a draft for a person to send.
3. **Pillar changes require human approval.** The agent proposes a diff; a person accepts it.
4. **Every claim carries a source URL and a date.** No unattributed statistics, ever.
5. **The answer-surface reading is human-run, and BASELINE blocks on it.** The agent builds a
   paste-ready query pack; a person runs it in ChatGPT and Claude. No client brief ships without a
   `human_check: true` observation. The agent's own search reading is corroboration only and is
   never described to a client as "what ChatGPT says."
6. **Bounded spend** per client per run (see `config.json`).

## Running it

```bash
# validate a registry (cross-check question ids while you're at it)
python scripts/validate_pillars.py clients/<slug>/pillars.json \
    --questions clients/<slug>/buyer-questions.json

# coverage + next-batch mix (content JSON is a normalized Ordinal dump)
python scripts/pillar_coverage.py --pillars clients/<slug>/pillars.json \
    --content /tmp/<slug>-content.json --radar-state clients/<slug>/radar-state.json \
    --next-batch 8

# render deliverables
python scripts/build_report.py --kind brief  --input brief.json  --output brief.html
python scripts/build_report.py --kind weekly --input weekly.json --output weekly.html
```

Everything is stdlib Python 3.9+ — no dependencies to install.

Try the worked example end to end:

```bash
python scripts/validate_pillars.py templates/pillars.example.json \
    --questions templates/buyer-questions.example.json
python scripts/pillar_coverage.py --pillars templates/pillars.example.json \
    --content templates/samples/content.example.json --next-batch 8 --today 2026-08-18
python scripts/build_report.py --kind weekly \
    --input templates/samples/weekly.example.json --output /tmp/weekly.html
```

## Weekly schedule

Runs Monday 7:00am CT so the asks land before the client's weekly email and before the team sync.
Setup: `SCHEDULED-RUN.md`.

## How it fits the rest of the stack

| Skill | Relationship |
|---|---|
| `client-voice-bundle` | Provides the styling guide / archetype this agent reads; run it first |
| `content-calendar-builder` | Consumes the idea seeds; dates and sequences them as To-Dos |
| `linkedin-post-writer` | Consumes `key_terms` + `proof_assets` to write copy on-pillar |
| `client-strategy-plan` | Cross-channel campaign plan; this agent owns the content-topic layer inside it |
| `linkedin-content-review` | Reviews drafts; can check on-pillar fit against the registry |
| `cos-daily-digest` | Reads this agent's Dashboard State receipt |

## Status

v1, not yet piloted. `config.json → pilot.clients` is empty on purpose — pick 2–3 clients who
already have a voice bundle and a live Ordinal queue, run BASELINE with a human on the call, and
only then arm the weekly schedule.
