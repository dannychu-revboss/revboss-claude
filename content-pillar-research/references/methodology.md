# Methodology — why topic ownership is the strategy

This file is the "why" the agent hands a client. Read it before your first BASELINE run, and cite
from it rather than paraphrasing from memory. Every number below has a named source; if you quote
one to a client, quote the source with it.

Primary source for this framing: **"AI quotes your personal LinkedIn posts, not your company
website"** — Jeffrey Zhao, co-founder of Ordinal, *Social Systems* issue 3, Aug 18 2026.
<https://ordinal.beehiiv.com/p/ai-quotes-your-personal-linkedin-posts-not-your-company-website>

---

## 1. The buying process now runs through a model

- **94%** of B2B buyers use tools like ChatGPT somewhere in their buying process — 6sense survey of
  ~4,000 B2B buyers (2025).
- An AI answer is not a search results page. It surfaces a handful of pages and cites only a few:
  **~3.86 citations per response** for ChatGPT across 118,000 answers (Qwairy).

So the competitive question changed. It is no longer "do we rank on page one for this term" — it is
**"are we one of the three or four sources the model chose to name."** Being source #7 is being
invisible.

## 2. For professional questions, LinkedIn is the most-cited domain

- **Profound** found LinkedIn is the single most-cited domain for professional queries — ahead of
  every other site — across ChatGPT, Gemini, Google AI Overviews and AI Mode, Copilot, and
  Perplexity. (For everyday questions the leaders are Reddit, YouTube, and Wikipedia; the B2B
  subset shifts to LinkedIn.)
- **Meltwater** found **75%** of those LinkedIn citations come from **individual member profiles**,
  not company pages.

This is the load-bearing fact for how RevBoss works. The asset that gets cited is a *person's*
posts. A company page is not the artifact; an executive's profile is. A dormant executive profile
is an empty result on the day a buyer asks their question.

## 3. Credibility travels through people, and the reach math agrees

- **9 in 10** decision-makers say they're more receptive to a company after strong thought
  leadership (LinkedIn).
- Employees collectively reach roughly **12×** the company's own follower base (LinkedIn).
- Worked examples: Clay grew ~8,000 → ~120,000 followers in about a year; Zapier tracked **$1.4M**
  in pipeline in one half — in both cases because their *people* were publishing.

## 4. The publishing pattern that earns citations

From the source playbook — this is what the pillar system operationalizes:

1. **Pick 3 to 5 topics you want to own.** Not ten. The model learns who to trust on a topic from
   repetition, and repetition splits across topics.
2. **Have execs and employees post on them 2–3× per week.**
3. **Keep posts 200–300 words with the key term in the first line.** (This is why every pillar in
   the registry carries explicit `key_terms` — they belong in the opening line, not buried.)
4. **Amplify each post in its first hour**, so it earns the engagement that signals the post is
   worth citing.
5. **Give it 30 days before judging.** New posts take a median of **6.81 days** to get cited, and
   **90% are cited within 37 days** (Profound).

Point 5 is a governance rule for this agent, not trivia: a pillar with three weeks of posts and no
citations is *on schedule*, not failing. Do not let a client (or a teammate) kill a pillar at day
14 — say what the timing curve looks like and re-measure at day 30.

## 5. Measurement is not SEO measurement

Keyword rankings will not show any of this. Track instead:

- **Citation frequency** — how often the client or their people get named/cited in AI answers to
  their buyers' questions.
- **Share of voice inside AI answers** — their appearances vs. named competitors, per pillar.
- **Sentiment of those mentions** — named favorably, named neutrally, or named as the cautionary tale.
- **Self-reported attribution** — asking new customers how they found you remains the cheapest
  ground truth, and it's the one a client believes.

The agent's `answer-surface/*.json` observations are how the first three get measured over time.
Read `query-harness.md` for the method and, importantly, its limits.

## 6. It compounds, and it rewards whoever starts first

Models learn who to trust from what is already published. That means the payoff curve is slow at
the front and steepening later, and the client who starts a quarter earlier is structurally ahead
on that topic. Two consequences for how we advise:

- **Narrow and boring beats broad and clever.** Consistency on a small topic set is the mechanism.
- **Switching pillars has a real cost** — you restart the clock. That is why `REFRESH` requires
  evidence and an explicit statement of what the change costs.

---

## How this converts into the agent's logic

| Methodology fact | What the agent does about it |
|---|---|
| Models cite 3–4 sources | Answer-surface harness records *who those sources were*, per buyer question |
| LinkedIn dominates professional queries | Research targets the LinkedIn posting surface, not the client's blog |
| 75% of citations are individual profiles | Pillars are assigned to **people**, and must be things that person can credibly say |
| 3–5 topics, 2–3×/week | Registry caps primary pillars at 5; target weights sum to 1.0; coverage math enforces the mix |
| Key term in the first line | Every pillar carries `key_terms` that the writer skill must place in the opening line |
| Median 6.81 days / 90% by 37 days to citation | 30-day judgment floor before calling a pillar failed |
| Share of voice + sentiment, not rankings | Weekly rotating spot check; monthly full re-measure vs. the dated baseline |
| First mover compounds | REFRESH must state the restart cost; stability is the default |

## A caution on the numbers

These figures come from vendor research (Profound, Meltwater, Qwairy, 6sense, LinkedIn) published
in 2025–2026, summarized in a vendor newsletter. They are directionally strong and useful for
explaining *why* to a client, but they are not peer-reviewed and the AI answer surface is changing
fast. Two rules:

- **Attribute, don't assert.** "Meltwater found 75%…" not "75% of citations are…".
- **The client's own baseline beats any industry stat.** Their answer-surface observation — the
  actual questions their buyers ask, and who the model actually named last Tuesday — is more
  persuasive and more defensible than any number in this file. Lead with theirs.
