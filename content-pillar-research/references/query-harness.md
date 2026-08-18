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

## 2. Running an observation — the human gate (REQUIRED)

**The agent does not produce the answer-surface reading on its own.** The primary observation comes
from a person running the questions in the real assistants and handing back what they saw. The
agent's own search-tool reading is a *secondary* corroboration, clearly labeled as such.

This is a deliberate design decision, not a limitation to work around. The agent cannot see what
ChatGPT tells a buyer — different retrieval, different personalization, different day. A screenshot
of the real thing is the only version that survives a client asking "is that actually what it says?"

### The gate

```
agent builds QUERY PACK  →  HUMAN runs it in ChatGPT + Claude  →  human pastes answers back
        │                                                                    │
        │                                                                    ▼
        └──────────── agent parses into answer-surface/<date>.json ──────────┘
                                        │
                    BASELINE cannot be delivered without this step.
                    WEEKLY continues without it, marked `human_check: skipped`.
```

**BASELINE: blocking.** No brief goes to a client without a human-run observation. If the pack
comes back empty, stop and say the brief is waiting on it — do not substitute the agent's own
search reading and call it the baseline.

**WEEKLY: non-blocking but tracked.** The weekly run posts the pack in the digest and continues.
Every skipped week increments `human_checks_skipped` in `radar-state.json`; at **4** consecutive
skips the run raises `answer-surface-blind` — at that point nobody has looked at the answer surface
in a month and the share-of-voice trend is fiction.

### The query pack

Generate it paste-ready — the whole point is that it costs the human two minutes, not twenty.
Write it to `clients/<slug>/query-pack-<date>.md`, post it in the digest, and include:

```markdown
## Answer-surface check — Dana Reyes / Example Co — 2026-08-18
Run each in **ChatGPT** and **Claude** (new chat each time, web search on).
Paste the answer back, or screenshot it. Two minutes total.

1. why do new b2b saas customers churn in the first month
2. should b2b saas companies publish pricing on their website

For each, what I need back (or just paste the whole answer and I'll pull it out):
- who got named — companies and people
- were you / Example Co named at all?
- was any individual's LinkedIn post cited, or all vendor pages?
```

Rules for the pack:

- **Verbatim questions**, exactly as they appear in `buyer-questions.json`. Reworded questions make
  the month-over-month comparison meaningless.
- **Weekly: 2 questions. Monthly/BASELINE: the full set.** Never more — a pack that takes 20
  minutes gets skipped, and a skipped check is worth nothing.
- **New chat per question, web search on**, and say so. Prior context in a thread contaminates it.
- **Both assistants where practical.** They retrieve differently; a name in both is a stronger
  finding than a name in one, and that difference is worth reporting.
- **Ask for the raw paste as the default.** Parsing is the agent's job. Making the human summarize
  is how the step stops happening.

### Parsing what comes back

From each pasted answer record only what is actually there: named companies, named individuals,
the sources cited, whether the client appeared, whether any individual's post was cited, and the
source mix. Set `method` to name the assistant and who ran it (e.g.
`"ChatGPT + Claude, web search on, run by Danny 2026-08-18"`), and `human_check: true`.

If the human pastes a partial answer, record the part you got and mark the rest
`"not_captured"`. Never fill a gap with your own search result inside a `human_check: true`
observation — mixing the two destroys the one artifact whose credibility is the point.

### The agent's own reading (secondary)

The agent may run the same questions through its search tools to corroborate, stored in the same
file under `agent_observations` with `method` naming it a proxy. Useful for spotting movement
between human checks. **Never presented to a client as "what ChatGPT says."**

## 3. Observation file shape

```json
{
  "slug": "example-co-dana",
  "observed_at": "2026-08-18",
  "human_check": true,
  "method": "ChatGPT + Claude, new chat each, web search on — run by Danny 2026-08-18",
  "assistants": ["ChatGPT", "Claude"],
  "raw_paste_archived": "clients/example-co-dana/answer-surface/2026-08-18-raw.md",
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
  ],
  "agent_observations": [
    {
      "question_id": "q-03",
      "method": "WebSearch proxy via Claude Code — corroboration only, never client-facing",
      "named_companies": ["Vendor A", "Vendor D"],
      "notes": "Broadly agrees with the human check; Vendor D appears here but not in ChatGPT."
    }
  ]
}
```

`human_check: true` is what makes an observation quotable to a client. An observation with
`human_check: false` is internal corroboration and must be labeled that way wherever it appears.

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

- **Say which kind of observation it is.** A `human_check: true` reading is what ChatGPT/Claude
  actually said, on a date, to a person. An agent reading is a proxy for the retrievable surface —
  the assistants retrieve differently and personalize, so it will not match. Never blur the two.
- **Answers are non-deterministic and drift.** The same question can name different sources an hour
  later. One observation is a data point, not a fact about the world.
- **Never present it as a leaderboard or a ranking.** The honest framing: *"On 2026-08-18 we asked
  the five questions your buyers ask. Here's who the answers named. You weren't among them."*
- **Never fabricate a citation or a named entity.** If you couldn't determine who was named, record
  `"named_companies": []` with a note — an empty observation is data; an invented one is a lie that
  will surface on a client call.
- **Get the client to run it too.** The team's human check is the baseline; the *client* running
  the same questions is the moment the strategy becomes their idea. It takes them two minutes.
  Put the same pack in the brief's "what we need from you."

## 6. Cadence

| Run | Scope | Who runs it | Blocking? |
|---|---|---|---|
| Weekly | 2 rotating `priority: 1` questions (cursor in `radar-state.json`) | human, pack in the digest | no — tracked, 4 skips → `answer-surface-blind` |
| Monthly | Full question set | human | no, but it is the trend measurement — chase it |
| BASELINE | Full set, plus source-mix and incumbent analysis per question | human, with the agent parsing | **yes — no brief without it** |

Compare each observation to the **baseline** and the **previous month**, not to the previous week —
week-over-week movement is mostly drift. And respect the timing curve from `methodology.md` §4:
a new pillar gets 30 days before any judgment.
