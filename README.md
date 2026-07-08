# Ordinal Comment Agent

An agent that watches client feedback comments on Ordinal posts, drafts proposed
revisions, and routes them through a human review flow before anything changes.

RevBoss publishes LinkedIn content for clients via [Ordinal](https://app.tryordinal.com).
Clients leave feedback as comments on posts. This system turns each piece of
feedback into a reviewable **proposal** (before/after diff) instead of requiring a
team member to parse the comment and hand-edit the post.

## How it works

```
                    ┌────────────────────────────────────────────┐
 every hour         │ SWEEP (playbooks/sweep.md)                 │
 (Claude Routine) ─►│ 1. read config.json + state/<ws>.json      │
                    │ 2. find unpublished posts w/ new client    │
                    │    comments (email domain ≠ revboss.com)   │
                    │ 3. draft proposed revision per feedback    │
                    │ 4. write proposals to state, commit, push  │
                    │ 5. re-render + publish review dashboard    │
                    │ 6. post digest to #ordinal-feedback        │
                    │ 7. check Slack thread for approvals ───────┼──┐
                    └────────────────────────────────────────────┘  │
                                                                    ▼
                    ┌────────────────────────────────────────────┐
 human approves ───►│ APPLY (playbooks/apply.md)                 │
 (Slack reply or    │ 1. update post copy in Ordinal             │
  message to the    │ 2. reply to the client's comment           │
  Claude session)   │ 3. set post status → ForReview             │
                    │ 4. mark proposal applied, refresh dashboard│
                    └────────────────────────────────────────────┘
```

The "agent" is a Claude Code session woken hourly by a scheduled Routine. There is
no server to deploy — Ordinal and Slack are reached through MCP tools, and this
repo holds the agent's instructions (playbooks), configuration, and memory (state).

## Repo layout

| Path | Purpose |
|---|---|
| `config.json` | Pilot workspaces, client email domains, Slack channel, autonomy mode |
| `playbooks/sweep.md` | Instructions the agent follows on each hourly sweep |
| `playbooks/apply.md` | Instructions for applying an approved proposal |
| `state/<workspace>.json` | Agent memory: processed comment IDs + proposal queue |
| `dashboard/generate.mjs` | Renders `state/*.json` into `dashboard/index.html` (the review UI) |

## Reviewing and approving proposals

Each sweep publishes a dashboard (Artifact link is posted in `#ordinal-feedback`)
showing every pending proposal with a side-by-side before/after diff. To act on one:

- Reply in the Slack digest thread: `approve prop-abc123`, `reject prop-abc123`,
  or `reject prop-abc123: <reason>` — picked up on the next sweep, or
- Tell the Claude session directly ("approve prop-abc123") for immediate action.

## Guardrails

- **Propose-only**: the agent never edits a post without an explicit human approval.
- **Published posts are never touched** (Ordinal locks their content anyway).
- Client-facing comment replies happen only *after* an approved edit is applied.
- Pilot scope is limited to the workspaces in `config.json`.

## Current pilot

Workspace: **Teachable** · Slack: `#ordinal-feedback` · Cadence: hourly
