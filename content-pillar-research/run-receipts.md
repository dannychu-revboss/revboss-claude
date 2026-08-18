# Run-Receipt Protocol v1 (2026-07-20)

> **Bundled copy** — packaged with `content-pillar-research` on 2026-08-18 from `client-health-monitor`'s bundle (itself sourced from `CoS/config/`). If the workspace copy is readable and differs, **the workspace copy wins** and this bundle needs re-packaging.

> New config layer — ADDS to `shared-config.md`, does not modify it. Loaded by cos-daily-digest and every registered sensor/agent.
>
> **The bug this fixes (Mon 7/20):** event-milestone-watchdog ran at 8:30a but wrote no Dashboard State row (steady-state = silent), and client-deep-audit-lite wrote its row at 8:52a — after the digest had already done its reads. The 9:00a digest reported both as "not run," contradicting the routines calendar and making the digest untrustworthy. Slack-silence on clean runs is correct; **receipt-silence is the bug.**

## The rule

Every registered agent writes **exactly one row to Dashboard State (`tblfl5N3deLclgBuh`) at the END of every run — no exceptions, including clean/steady-state runs.** A run with nothing to report still writes its receipt; it just doesn't post to Slack.

## Receipt format

| Field | Value |
|---|---|
| Section Key (`fldWNfLuZ7xtPEUNG`) | The agent's **canonical key** from the registry below. Never invent a variant. |
| Source Skill (`fldV1FzlI6ibOHQms`) | The matching select option. If no option exists yet, leave blank and note it in Error Notes (UI fix pending — options can't be added via API). |
| Run ID (`fldlVyN3MeJSbVCir`) | `<canonical-key>-YYYY-MM-DD` (CT date). Rerun same day → append `-b`, `-c`. |
| Run Timestamp (`fldEYCxfoFAes7t0U`) | Run END time. |
| Status (`fldP5KQaFHykiWSQK`) | `success` / `partial` / `failed`. A clean steady-state run is `success`. |
| Summary (`fldst5dwj9AOpbAkA`) | MUST start with one of: `CLEAN —` (nothing to report), `FLAGS(n) —` (n actionable items), `FAILED —`. Then ≤1 line of context. |
| Payload (`fldKxLjr4BwUPs7Q5`) | Full detail (what was scanned, flags, links). |

The machine-readable Summary prefix is what lets the digest report run-state without parsing prose.

## Registry — canonical keys and cadence

| Agent | Canonical Section Key | Legacy aliases (read-only back-compat) | Expected cadence (CT) |
|---|---|---|---|
| client-health-monitor | `client-health-run` | `client-health` | weekdays ~8:30a |
| data-integrity-sentinel | `data-integrity-sentinel-run` | `data_integrity_sentinel` | weekdays ~8:30a (Group A daily; B/C Mondays) |
| event-milestone-watchdog | `event-milestone-watchdog-run` | `event-watchdog-run`, `event_milestone_watchdog` | weekdays ~8:30a |
| client-deep-audit-lite | `client-deep-audit-lite` | — | Mon + Thu morning |
| leads-dispatcher | `leads-dispatcher-run` | — | weekdays ~8:15a |
| messaging-dispatcher | `messaging-dispatcher-run` | — | weekdays ~8:15a |
| post-call-qa-verifier | `post-call-qa-run` | — | weekdays |
| extract-gmail-tasks | `extracted_tasks` | — | daily (scheduled) |
| cos-daily-digest | `cos-digest-run` | — | weekdays 9:45a |
| eod-agenda-run | `eod-agenda-run` | — | weekdays 4:20p |
| idea-miner | `idea-miner-run` | — | daily EOD |
| content-pillar-research | `content-pillar-research-run` | — | Mondays ~7:00a (weekly; one receipt per run covering all clients in the run) |

Writers use the canonical key from their next run onward. Readers (digest, cockpit) match canonical first, then aliases, and take the latest row across both.

## Reader rules (digest / cockpit)

1. For each registry agent due today (per cadence), find the latest receipt (canonical + aliases).
2. Classify: **✅ ran** (receipt today, `success`) · **🟡 partial/failed** (receipt today, other status) · **⚠️ NO RECEIPT** (due today, none found → report as "no receipt — treat as not run", flag for follow-up) · **⏸ not due** (e.g. deep-audit-lite on a Tuesday).
3. **Late-read rule:** re-read Dashboard State as the LAST step before composing, and stamp the read time in the digest's own receipt Payload. (The 7/20 digest missed deep-audit-lite's 8:52a row by reading early.)
4. Never infer run-state from the presence/absence of Slack posts. Receipts are the only run-state source. (Exception-only Slack posting makes Slack-absence meaningless by design.)

## Cutover switch (moved here 2026-07-21 — Block 1 Decision 5)

**`artifactAuthoritative: false`**

This flag lived in the retired `notification-router`; cos-daily-digest inherited the router's duties, so its config layer now owns the switch. Semantics unchanged from `notification-router/SKILL.md` / `shared-config.md`:
- **false** (current): sensors keep their standalone posting (now exception-only per the 7/21 rein-in), digest posts in parallel — no information gap.
- **true**: sensors' standalone Slack digests are fully suppressed ("view in cockpit"); Slack keeps only real-time P1 + spend-approval pushes and the daily digest.
- Flip ONLY at the gated cutover: **5 consecutive clean mornings** per the digest's clean-morning counter AND the cockpit artifact reliably carrying the dispatcher rollups. One flag, one place, reversible.

## Paste-ready receipt block for sensor SKILL.md files

Append verbatim (swap in the agent's canonical key):

```
## Run receipt (required — every run)

As the FINAL step of every run — including clean/steady-state runs where nothing
is posted to Slack — write one row to Dashboard State (`tblfl5N3deLclgBuh`):
- Section Key: `<canonical-key>` (exactly this — never a variant)
- Run ID: `<canonical-key>-YYYY-MM-DD` (CT date; rerun → `-b`, `-c`)
- Run Timestamp: now (run end)
- Status: success | partial | failed
- Summary: start with `CLEAN —` or `FLAGS(n) —` or `FAILED —`, then ≤1 line
- Payload: full run detail
Skipping the receipt on a clean run is a bug: the digest reads receipts (not
Slack) for run-state, and a missing receipt reads as "agent didn't run."
See `config/run-receipts.md`.
```
