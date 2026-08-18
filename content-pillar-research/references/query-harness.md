# Answer-surface harness — measuring who the AI names

The most persuasive research artifact this agent produces is also the simplest: ask the questions a
client's buyers ask, and write down who the answer named. Do it on a date, with a stated method,
and repeat it monthly so there's a trend instead of an anecdote.

This is the measurement layer for `methodology.md` §5 (citation frequency, share of voice,
sentiment). It is **not** a ranking system, and how you describe it to a client matters as much as
how you run it.

---

## 1. The question set (`buyer-questions.json`)

```json
{
  "client": "Example Co - Dana",
  "slug": "example-co-dana",
  "version": 2,
  "reviewed_at": "2026-08-18",
  "questions": [
    {
      "id": "q-03",
      "text": "why do new B2B SaaS customers churn in the first month",
      "stage": "problem",
      "source": "sales call 2026-07-22 — buyer's own phrasing",
      "pillars": ["onboarding-drop-off"],
      "priority": 1
    }
  ]
}
```

| Field | Notes |
|---|---|
| `text` | Written the way a buyer would type it — lowercase, imperfect, no marketing vocabulary |
| `stage` | `problem` \| `compare` \| `evaluate` \| `implement` — keep the set spread across all four |
| `source` | Where the phrasing came from: a transcript, a support ticket, a sales call, a community thread. Invented questions produce invented findings. |
| `pillars` | Which pillar(s) should be the answer to this. A question no pillar answers is either a missing pillar or a question we don't care about. |
| `priority` | 1 = in the weekly rotation, 2 = monthly full sweep only |

**8–12 questions.** Fewer and the baseline is noise; more and the monthly sweep gets expensive and
stops happening. Get the set reviewed by whoever runs the client relationship — they know which
questions actually come up on calls.

## 2. Running an observation

For each question in scope for this run:

1. **Run the question as a buyer would ask it**, using the search tools available (`WebSearch` /
   `WebFetch`). You are looking at the retrievable answer surface: which sources come back, which
   get quoted, and who is named as authoritative.
2. **Record what you actually observed** — no inference:
   - the exact question string,
   - the method and date,
   - which sources/domains the answer leaned on (URL + type),
   - **who was named** (companies and individuals, separately),
   - whether LinkedIn appeared at all, and whether any *individual's* post did,
   - whether the client or the client's people appeared,
   - the character of the winning sources: vendor page, listicle/SEO farm, practitioner post,
     community thread, analyst, news.
3. **Classify sentiment** where the client or a competitor is named: `positive` / `neutral` /
   `cautionary`.
4. **Write it to** `clients/<slug>/answer-surface/<YYYY-MM-DD>.json`.

## 3. Observation file shape

```json
{
  "slug": "example-co-dana",
  "observed_at": "2026-08-18",
  "method": "WebSearch + source read via Claude Code; retrievable-surface proxy",
  "observations": [
    {
      "question_id": "q-03",
      "question": "why do new B2B SaaS customers churn in the first month",
      "pillars": ["onboarding-drop-off"],
      "named_companies": ["Vendor A", "Vendor B"],
      "named_individuals": [],
      "client_present": false,
      "linkedin_present": false,
      "individual_post_cited": false,
      "sources": [
        { "url": "https://vendor-a.com/blog/churn", "type": "vendor-page", "note": "top of answer" }
      ],
      "source_mix": { "vendor-page": 3, "listicle": 1, "practitioner-post": 0, "community": 0 },
      "sentiment": { "Vendor A": "positive" },
      "notes": "Every source is vendor-owned; no practitioner voice in the answer at all."
    }
  ]
}
```

## 4. Share of voice

Per pillar, over the questions mapped to it:

```
share_of_voice(entity) = questions where entity was named / questions measured
```

Compute it for the client, for each named competitor, and for "any individual practitioner" as a
category. That last one is the opportunity signal: **if no individual is being cited on a pillar,
the pillar is cheap to win.** If a named individual already appears in most answers, the pillar is
expensive and the brief should say so plainly.

Set `metrics.baseline_share_of_voice` on each pillar from the first full sweep, and
`target_share_of_voice` from what's realistic given the incumbent — not from 100%.

## 5. Limits — state these every time you report a result

Be scrupulous here. Overstating this measurement is the easiest way for the whole brief to lose
credibility on a client call.

- **This is a proxy, not ChatGPT's output.** The agent measures the *retrievable answer surface*
  through the search tools it has. ChatGPT, Gemini, Perplexity, and Copilot each retrieve
  differently and personalize; their answers will not match this exactly.
- **Answers are non-deterministic and drift.** The same question can name different sources an hour
  later. One observation is a data point, not a fact about the world.
- **Never present it as a leaderboard or a ranking.** The honest framing: *"On 2026-08-18 we asked
  the five questions your buyers ask. Here's who the answers named. You weren't among them."*
- **Never fabricate a citation or a named entity.** If you couldn't determine who was named, record
  `"named_companies": []` with a note — an empty observation is data; an invented one is a lie that
  will surface on a client call.
- **Ground truth beats the proxy.** The client asking ChatGPT/Claude themselves and screenshotting
  the result is stronger evidence than anything the agent produces. Recommend it in every brief —
  it takes them two minutes, and it's the moment the strategy becomes their idea.

## 6. Cadence

| Run | Scope | Cost |
|---|---|---|
| Weekly | 2 rotating `priority: 1` questions (cursor in `radar-state.json`) | cheap |
| Monthly | Full question set | the trend measurement |
| BASELINE | Full set, plus source-mix and incumbent analysis per question | the brief's centerpiece |

Compare each observation to the **baseline** and the **previous month**, not to the previous week —
week-over-week movement is mostly drift. And respect the timing curve from `methodology.md` §4:
a new pillar gets 30 days before any judgment.
