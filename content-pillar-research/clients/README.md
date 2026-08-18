# Per-client research state

One directory per client (or per posting individual on a multi-seat account), named with the
client's slug — e.g. `teachable-anna/`, `agp-whitney/`.

```
clients/<slug>/
  pillars.json                  human-approved · the SSOT for what this client talks about
  buyer-questions.json          human-approved · what the answer surface is measured on
  answer-surface/<date>.json    agent · one dated observation per run — never overwrite a prior date
  radar-state.json              agent · seen-signal keys, starvation counters, rotation cursor
  weekly/<date>.json / .html    agent · the week's report input and rendered report
```

Start from `templates/pillars.example.json`, `templates/buyer-questions.example.json`, and
`templates/radar-state.example.json`. Schema and editing rules:
`references/pillar-registry-schema.md`.

Two rules that matter more than the rest:

- **`pillars.json` and `buyer-questions.json` are human-approved.** The agent proposes changes as a
  diff (REFRESH mode); a person accepts them and bumps `version` + `reviewed_at`.
- **Never delete a pillar** — set `status: "retired"` and `weight: 0`. Coverage history and the
  answer-surface trend both key on the pillar `id`.

Multi-seat accounts (AGP's six seats, ShyftOff's two): do the market/competitor/answer-surface
research **once at the organization level** and give each person a subset of pillars they personally
have standing to say. Cross-reference the shared research from each person's file instead of
repeating it, so two seats don't post the same idea in the same week.
