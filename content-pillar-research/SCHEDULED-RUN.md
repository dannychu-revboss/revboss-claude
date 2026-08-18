# Scheduled run — arming the weekly monitor

The agent is a Claude session woken on a schedule. There is nothing to deploy; the schedule is a
Routine (scheduled trigger) that fires a prompt into a fresh session, which loads this skill and
runs the WEEKLY MONITOR loop for each pilot client.

## Before arming

1. **Pillars exist and are approved** for every client in `config.json → pilot.clients`.
   `python scripts/validate_pillars.py clients/<slug>/pillars.json` must exit 0.
2. **A human has run BASELINE with the client**, and the client has signed off on the pillar names,
   definitions, and weights. An unapproved registry silently becomes the strategy.
3. **A dry run has been done manually** for at least one client: run the loop, look at the report,
   look at the ideas *before* they're written, and confirm the digest reads the way you'd want it to
   land in `#content-team-ops`.
4. **Someone owns the weekly two-minute query pack.** The answer-surface reading is human-run by
   design (`references/query-harness.md` §2) — name that person before arming, or the trend metric
   will quietly become fiction. Default: Danny.
5. **`run-receipts.md` in the canonical workspace copy** (`CoS/config/run-receipts.md`) has the
   `content-pillar-research-run` registry row, so `cos-daily-digest` knows to expect a Monday
   receipt and doesn't report the agent as "not run." The bundled copy here already has it.

## The schedule

| | |
|---|---|
| Cadence | Weekly, Monday |
| Local time | 07:00 `America/Chicago` |
| Cron (UTC, CDT) | `0 12 * * 1` |
| Cron (UTC, CST) | `0 13 * * 1` — update when DST ends |
| Mode | Fresh session per firing |

Monday 7:00am puts the ask list in a human's hands before the weekly client email goes out and
before the team sync, which is the whole point of the timing. If the weekly client email moves, move
this with it.

## Arming it

Create a Routine that fires a fresh session weekly with a standalone prompt (a fresh session has no
prior context, so the prompt has to carry everything):

```
Run the content-pillar-research WEEKLY MONITOR.

For each client listed in config.json → pilot.clients:
  1. Load clients/<slug>/pillars.json and radar-state.json. If a client has no pillars.json,
     skip that client and flag it — do NOT invent pillars.
  2. Follow the WEEKLY MONITOR loop in SKILL.md, honoring the spend caps in config.json.
  3. Write idea seeds to Ordinal as IDEAS ONLY. Confirm every write returns status "ToDo".
     Never schedule, never date, never flip a post to Scheduled.
  4. Build the 2-question answer-surface query pack (rotating cursor) and put it at the TOP of
     that client's digest block, paste-ready. Do NOT run it yourself as the reading — a human runs
     it in ChatGPT/Claude. If last week's pack came back unrun, increment human_checks_skipped;
     at 4 consecutive skips raise answer-surface-blind.
  5. Render the weekly report and post the digest to #content-team-ops.
  6. Update radar-state.json.

Then write ONE Dashboard State receipt for the run (Section Key: content-pillar-research-run),
Summary prefixed CLEAN — / FLAGS(n) — / FAILED —, and write any flags to the Ops Backlog.

Do not contact any client. Do not change any pillars.json. If a run fails, write the FAILED
receipt and alert #activation-automated-updates instead of posting to #content-team-ops.
```

Use whichever scheduler the team standardizes on for autonomous agents (the CoS agents use
Routines/scheduled triggers; `create_trigger` with `create_new_session_on_fire: true` and the cron
above). Record the trigger id here once armed:

```
trigger_id: <fill in when armed>
armed_at:   <date>
armed_by:   <who>
```

## First four weeks

Treat the first month as supervised rollout, not steady state:

| Week | What to watch |
|---|---|
| 1 | Do the ideas actually read as postable? Is the coverage math tagging content to the right pillars? Fix `match.terms` where it isn't. |
| 2 | Is the ask list specific enough that a client can answer it in two minutes? Is the digest too long? |
| 3 | Is dedupe working — are last week's signals staying out of this week's report? |
| 4 | Run the **full** answer-surface sweep yourself in ChatGPT/Claude and paste it back — this is the monthly one that matters. First honest read on whether the pillars are landing (day 30 is the judgment floor, per `references/methodology.md` §4). |

Widen the pilot only after a month where the team used the output without rewriting it.

## Turning it off / narrowing it

- Remove a client from `config.json → pilot.clients` to stop researching them without touching the
  schedule.
- Disable the Routine to stop all runs. State files stay valid; the next run picks up where it left
  off (starvation counters will read as one week behind, which is harmless).

## Failure modes to expect

| Symptom | Likely cause | Fix |
|---|---|---|
| Coverage says a pillar is starved but the queue looks full | `match.terms` too narrow, or ideas aren't labeled with their pillar | Fix terms; make sure idea writes attach the pillar label |
| Every pillar reads "ok" and nothing is ever flagged | `match.terms` too broad — one pillar is absorbing everything | Tighten terms, add `negative_terms` |
| Same signals every week | `radar-state.json` not being written, or seen keys built from your summary wording instead of canonical URL + title | Check the state write; re-key |
| Thin reports week after week | Pillars too narrow, or the client's market genuinely quiet | Two thin weeks on one pillar is `pillar-drifting` → REFRESH |
| A pillar produces nothing ever | Missing input (e.g. a repost pillar with no named-person list) | It's an ask, not a research failure — escalate to the account owner |
| Digest reads like a news alert | Signals kept without an `our_angle` | Enforce the field: no angle, no idea |
| Share-of-voice trend looks made up | Nobody has run a query pack in weeks | Check `human_checks_skipped`; the flag fires at 4. Two questions, two minutes — or drop the metric rather than reporting fiction |
