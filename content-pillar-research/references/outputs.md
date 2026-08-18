# Outputs — what each deliverable must contain

Three artifacts matter: the **Topic Strategy Brief** (client-facing, from BASELINE), the **weekly
report** (internal + shareable), and the **Slack digest**. Plus the machine outputs: idea seeds,
the registry, receipts.

Both HTML documents render from JSON via:

```bash
python scripts/build_report.py --kind brief  --input <in>.json --output <out>.html
python scripts/build_report.py --kind weekly --input <in>.json --output <out>.html
```

---

## 1. Topic Strategy Brief (BASELINE)

A client reads this and should conclude: *these five topics, for these reasons, and here's what
happens if we don't.* Written in their language. Every claim sourced.

Required sections, in this order — the order is the argument:

1. **What your buyers are actually asking.** The buyer question set, with where each question's
   phrasing came from (their sales calls, not our imagination).
2. **Who the AI names today.** The dated answer-surface baseline. Which questions, which sources
   won, who was named, and whether the client appeared. Include the method and its limits
   (`query-harness.md` §5) — verbatim honesty here is what makes the rest credible.
3. **Why individual profiles are the lever.** The short version of `methodology.md` §1–3 with
   attributed numbers. Two paragraphs, not a lecture.
4. **What you can own — and why you specifically.** Per candidate pillar: buyer demand, the client's
   credibility and proof, who the incumbent is, and where the gap is. Include the topics you
   *rejected* and why — a client trusts a recommendation more when they can see what lost.
5. **The pillars.** 3–5, each with: name, definition, in/out of scope, why now, the buyer questions
   it answers, key terms for the first line, proof assets we already have, gaps we need from them,
   and its share of the mix.
6. **The cadence and the mix.** Posts per week, which pillar gets what share, and what a month
   looks like. Concrete: "3 posts/week × 4 weeks = 12 posts; 5 week-one-churn, 4 pricing, 3 partner
   proof."
7. **How we'll know it's working.** Citation frequency, share of voice vs. named competitors,
   sentiment, self-reported attribution. State the **30-day judgment floor** explicitly and why
   (median ~6.81 days to first citation, 90% by ~37 days). This paragraph prevents the day-14
   "is this working?" conversation.
8. **What we need from you.** The standing asks: which proof assets to unlock, which numbers we can
   publish, who to repost, and the interview/question cadence. Small, specific, and few.
9. **Sources.** Every URL with its date.

### Brief input JSON

```json
{
  "kind": "brief",
  "client": "Example Co - Dana",
  "person": { "name": "Dana Reyes", "role": "CEO", "linkedin_url": "https://..." },
  "organization": { "name": "Example Co", "website": "https://...", "category": "..." },
  "prepared_at": "2026-08-18",
  "prepared_by": "RevBoss — content-pillar-research",
  "summary": "One paragraph a client could read alone and get the point.",
  "buyer_questions": [
    { "id": "q-03", "text": "...", "stage": "problem", "source": "sales call 2026-07-22" }
  ],
  "answer_surface": {
    "observed_at": "2026-08-18",
    "method": "...",
    "limits": "...",
    "rows": [
      { "question": "...", "named": ["Vendor A"], "client_present": false,
        "individual_post_cited": false, "note": "all vendor pages" }
    ]
  },
  "why_individuals": ["para 1", "para 2"],
  "candidates": [
    { "name": "...", "chosen": true, "scores": { "buyer_demand": 5, "credibility": 4,
      "differentiation": 5, "sustainability": 4, "pipeline_proximity": 3 },
      "reasoning": "...", "incumbent": "..." },
    { "name": "...", "chosen": false, "reasoning": "Rejected because ..." }
  ],
  "pillars": [
    { "id": "onboarding-drop-off", "name": "...", "definition": "...", "why_now": "...",
      "in_scope": ["..."], "out_of_scope": ["..."], "buyer_questions": ["q-03"],
      "key_terms": ["..."], "proof_assets": [{ "name": "...", "link": "..." }],
      "gaps": ["..."], "weight": 0.4, "incumbent": "..." }
  ],
  "cadence": { "posts_per_week": 3, "days": ["Tue","Wed","Thu"], "month_example": "..." },
  "measurement": { "metrics": ["..."], "judgment_floor": "30 days — median 6.81 days to first citation (Profound)" },
  "asks": [ { "what": "...", "pillar": "...", "why_now": "..." } ],
  "sources": [ { "title": "...", "url": "...", "dated": "2026-08-18" } ]
}
```

---

## 2. Weekly report

Internal-first, but written so it can be forwarded to a client without editing. Sections:

1. **Header** — client, person, week-of date, run id.
2. **Coverage** — per pillar: target share, published in window, queued forward, days since last
   post, weeks starved, deficit. This table is the reason the rest of the report exists.
3. **This week's signals** — the kept signals, grouped by pillar, each with what happened, the
   source link and date, why buyers care, and our angle.
4. **Ideas written** — titles, pillar, format, and confirmation they're unscheduled `ToDo` ideas.
5. **Recommended next-batch mix** — from `pillar_coverage.py`: "next 8 posts: 4 / 3 / 1".
6. **Ask list** — max 3, each tied to a pillar and the post it unblocks.
7. **Answer-surface check** — the 2 rotating questions: who was named, movement vs. baseline.
8. **Flags** — with the condition that tripped and the recommended action.
9. **Off-pillar** — strong signals that fit no pillar, one line each. Watch for a drumbeat here;
   three weeks of the same off-pillar theme is REFRESH evidence.
10. **Thin-week note** (when applicable) — say so plainly rather than padding.

### Weekly input JSON

```json
{
  "kind": "weekly",
  "client": "Example Co - Dana",
  "person": { "name": "Dana Reyes", "role": "CEO" },
  "week_of": "2026-08-17",
  "run_id": "content-pillar-research-2026-08-18",
  "coverage": {
    "window_days": 30, "forward_window_days": 21,
    "rows": [
      { "pillar": "Why customers quit in week one", "pillar_id": "onboarding-drop-off",
        "weight": 0.4, "published": 4, "forward": 3, "days_since_last": 3,
        "weeks_starved": 0, "deficit": 0, "status": "ok" }
    ],
    "next_batch": { "size": 8, "allocation": { "onboarding-drop-off": 4, "pricing-honesty": 3, "partner-proof": 1 } }
  },
  "signals": [
    { "pillar": "...", "pillar_id": "...", "what": "...", "source_url": "...", "dated": "2026-08-14",
      "source_type": "news", "why_buyers_care": "...", "our_angle": "...", "proof": "...",
      "evidence_strength": "strong", "score": 0.72, "suggested_format": "text-only" }
  ],
  "ideas_written": [
    { "title": "...", "pillar": "...", "format": "text-only", "ordinal_status": "ToDo", "idea_id": "..." }
  ],
  "asks": [ { "what": "...", "pillar": "...", "unblocks": "...", "why_now": "..." } ],
  "answer_surface": { "observed_at": "2026-08-18", "checked": [
      { "question": "...", "named": ["Vendor A"], "client_present": false, "vs_baseline": "unchanged" } ] },
  "flags": [ { "flag": "pillar-starved", "detail": "pricing-honesty, 2 weeks", "action": "..." } ],
  "off_pillar": [ { "what": "...", "source_url": "...", "note": "..." } ],
  "notes": "Thin week on partner proof — two searches returned nothing dated inside 14 days."
}
```

---

## 3. Slack digest

Shape is in `weekly-monitor.md` §Digest shape. Rules:

- One block per client, scannable in five seconds, detail behind a link.
- Never post on a failed run — receipt + `#activation-automated-updates` instead.
- Never paste a full report into Slack.

## 4. Machine outputs

| Output | Where | Rule |
|---|---|---|
| Idea seeds | Ordinal | `status: "ToDo"` confirmed on every write; pillar label attached; never dated, never `Scheduled` |
| `pillars.json` | `clients/<slug>/` | Human-approved only; validated before write; `version` bumped |
| Answer-surface observation | `clients/<slug>/answer-surface/<date>.json` | One file per run; never overwrite a prior date |
| `radar-state.json` | `clients/<slug>/` | Agent-owned; updated at end of every run |
| Run receipt | Airtable Dashboard State | Every run, including clean ones. `content-pillar-research-run` |
| Flags | Airtable Ops Backlog | One row per flag, deduped by flag + pillar + week |
| Brief / report | Airtable Resources | `Source = Skill Generated`, `Created By Skill = content-pillar-research`, linked to the Client |

## Tone rules for anything client-facing

- **Sourced or silent.** No unattributed statistics, no "studies show."
- **Their words.** Pillar names and definitions in the client's vocabulary, not ours.
- **Say the cost.** If a pillar is expensive to win, or a topic is already owned, write that down.
  The brief's value is that it's honest enough to argue with.
- **No hedging where we do know.** If the answer surface named three vendors and not the client,
  write exactly that. It's the most useful sentence in the document.
