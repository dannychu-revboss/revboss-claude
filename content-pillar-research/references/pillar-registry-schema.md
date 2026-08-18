# `pillars.json` — the pillar registry

The registry is the contract between this research agent and every other content skill. It is
human-approved, machine-read, and versioned. `linkedin-post-writer` reads `key_terms` and
`proof_assets`; `content-calendar-builder` reads `weight` to balance a calendar;
`pillar_coverage.py` reads `match` to tag content; the weekly monitor reads `buyer_questions` to
know what to search for. If a field is wrong here, it is wrong everywhere downstream.

Validate before every write:

```bash
python scripts/validate_pillars.py clients/<slug>/pillars.json
```

---

## Top level

| Field | Type | Required | Notes |
|---|---|---|---|
| `client` | string | ✅ | Airtable Clients record name, e.g. `"Teachable - Anna"` |
| `client_record_id` | string | ✅ | Airtable record ID — the stable join key |
| `slug` | string | ✅ | Directory name under `clients/`, lowercase-hyphen |
| `person` | object | ✅ | `{name, role, linkedin_url}` — whose profile these pillars publish from. Individual profiles are what get cited, so pillars belong to a person, not a logo. |
| `organization` | object | ✅ | `{name, website, category, icp_summary}` — the org-level context shared across seats |
| `version` | integer | ✅ | Bump on every approved change |
| `created_at` / `reviewed_at` | date `YYYY-MM-DD` | ✅ | `reviewed_at` drives the `pillars-stale` flag |
| `refresh_interval_days` | integer | — | Default 90 |
| `approved_by` | string | ✅ | Who signed off. An unapproved registry must not exist. |
| `cadence` | object | ✅ | `{posts_per_week, days, timezone}` — the assumed publishing rate the weights are computed against |
| `pillars` | array | ✅ | 1–5 with `tier: "primary"`, plus any number of `secondary` |
| `off_pillar_policy` | string | — | One line on what to do with strong off-pillar signals for this client |
| `notes` | string | — | Anything a human needs to know before editing |

## Each pillar

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✅ | Stable slug, e.g. `"creator-monetization"`. Never reuse an id for a different topic — coverage history keys on it. |
| `name` | string | ✅ | The client's language, not ours. This is what appears on a calendar and in a client conversation. |
| `tier` | `primary` \| `secondary` | ✅ | Only `primary` pillars carry weight; max 5 |
| `definition` | string | ✅ | A paragraph. What this pillar covers. |
| `in_scope` / `out_of_scope` | array[string] | ✅ | The boundaries. Without `out_of_scope` a pillar silently expands until it means nothing. |
| `why_now` | string | ✅ | The sourced reason this pillar matters to buyers *this quarter*. Goes verbatim into the client brief. |
| `buyer_questions` | array[string] | ✅ | Ids from `buyer-questions.json` this pillar answers. A pillar answering zero buyer questions is a hobby. |
| `key_terms` | array[string] | ✅ | The phrases to place in a post's first line. 3–6. What we want the model to associate with this person. |
| `proof_assets` | array[object] | ✅ | `{type, name, link, notes}` — case studies, webinars, data, customer stories, personal experience. A pillar with no proof produces generic content. |
| `incumbent` | object | — | `{who, where, cadence, strength, how_we_differ}` — who currently gets cited on this topic |
| `weight` | number | ✅ for primary | Share of the mix, 0–1. Primary weights sum to 1.0 (±0.01). Secondary = 0. |
| `formats` | array[string] | — | Preferred formats: `text-only`, `text + image`, `carousel`, `case study`, `repost + POV` |
| `match` | object | ✅ | Coverage tagging: `{terms: [...], negative_terms: [...]}`. Terms are lowercased substring matches against title + copy. `negative_terms` prevent a greedy pillar from stealing another's posts. |
| `search_queries` | array[string] | — | Seed queries for the weekly radar. 2–4 per pillar; the agent may adapt them. |
| `metrics` | object | — | `{target_share_of_voice, baseline_share_of_voice, first_measured}` — set from the answer-surface baseline |
| `status` | `active` \| `paused` \| `retired` | ✅ | Retired pillars stay in the file (history) with weight 0 |

## Example

See `templates/pillars.example.json` for a complete, valid file.

```json
{
  "client": "Example Co - Dana",
  "slug": "example-co-dana",
  "version": 1,
  "cadence": { "posts_per_week": 3, "days": ["Tue", "Wed", "Thu"], "timezone": "America/New_York" },
  "pillars": [
    {
      "id": "onboarding-drop-off",
      "name": "Why customers quit in week one",
      "tier": "primary",
      "weight": 0.4,
      "definition": "First-30-days retention: what actually causes new customers to disengage...",
      "in_scope": ["activation metrics", "week-one onboarding design", "churn post-mortems"],
      "out_of_scope": ["enterprise procurement", "pricing strategy"],
      "why_now": "Buyers ask AI 'why do new customers churn in the first month' and every answer today is a vendor blog — no practitioner is cited (baseline 2026-08-18).",
      "buyer_questions": ["q-03", "q-07"],
      "key_terms": ["first-30-days retention", "activation", "week-one churn"],
      "proof_assets": [
        { "type": "data", "name": "Cohort study across 40 accounts", "link": "https://...", "notes": "Dana can quote the 18% figure" }
      ],
      "match": { "terms": ["onboarding", "activation", "week one", "first 30 days", "churn"], "negative_terms": ["enterprise procurement"] },
      "search_queries": ["B2B SaaS week-one churn 2026", "activation metrics practitioner post"],
      "status": "active"
    }
  ]
}
```

## Editing rules

1. **Only a human approves a pillar change.** The agent proposes a diff (REFRESH); a person accepts.
2. **Bump `version` and `reviewed_at` on every approved edit**, and note what changed in `notes`.
3. **Never silently retune `weight`** to match what got posted. The weights are the plan; coverage
   drift is a finding to report, not a number to hide.
4. **Never delete a pillar** — set `status: "retired"`, `weight: 0`. Coverage history and the
   answer-surface trend both key on pillar `id`.
5. **Keep `match.terms` honest.** Overbroad terms inflate coverage and hide starvation, which is
   exactly the failure this system exists to catch. When a tag looks wrong in the coverage output,
   fix the terms, don't rationalize the number.
