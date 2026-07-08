#!/usr/bin/env node
// Renders state/*.json into dashboard/index.html — the human review UI for
// proposed post edits. Dependency-free; run with `node dashboard/generate.mjs`.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8'));

const states = readdirSync(join(root, 'state'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(root, 'state', f), 'utf8')));

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Word-level LCS diff. Tokens keep their trailing whitespace so joins are lossless.
function tokenize(s) {
  return s.match(/\S+\s*|\s+/g) ?? [];
}
function diffWords(before, after) {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i].trim() === b[j].trim()
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i].trim() === b[j].trim()) { ops.push(['same', a[i], b[j]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['del', a[i]]); i++; }
    else { ops.push(['ins', b[j]]); j++; }
  }
  while (i < n) ops.push(['del', a[i++]]);
  while (j < m) ops.push(['ins', b[j++]]);
  let beforeHtml = '', afterHtml = '';
  for (const [op, x, y] of ops) {
    if (op === 'same') { beforeHtml += esc(x); afterHtml += esc(y); }
    else if (op === 'del') beforeHtml += `<del>${esc(x)}</del>`;
    else afterHtml += `<ins>${esc(x)}</ins>`;
  }
  return { beforeHtml, afterHtml };
}

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York',
  }) + ' ET';
};

const CLASS_LABEL = {
  'clear-edit': 'Clear edit', ambiguous: 'Ambiguous', question: 'Question',
  praise: 'Praise', internal: 'Internal',
};

function proposalCard(p) {
  const { beforeHtml, afterHtml } = diffWords(p.before ?? '', p.after ?? '');
  const comments = (p.comments ?? []).map((c) => `
    <blockquote class="comment">
      <div class="comment-meta"><strong>${esc(c.author)}</strong> · ${esc(c.email)} · ${fmtDate(c.createdAt)}</div>
      <p>${esc(c.message)}</p>
    </blockquote>`).join('');
  return `
  <article class="card" id="${esc(p.id)}">
    <header class="card-head">
      <div>
        <h2>${esc(p.postTitle)}</h2>
        <div class="card-sub">${esc(p.workspace)} · ${esc(p.channel)} · publishes ${esc(p.publishDate ?? 'unscheduled')}</div>
      </div>
      <div class="chips">
        <span class="chip chip-${esc(p.classification)}">${esc(CLASS_LABEL[p.classification] ?? p.classification)}</span>
        <span class="chip chip-conf">confidence: ${esc(p.confidence)}</span>
      </div>
    </header>
    <section class="feedback">
      <h3>Client feedback</h3>
      ${comments}
    </section>
    <section class="diff">
      <div class="pane"><h3>Before</h3><pre>${beforeHtml}</pre></div>
      <div class="pane"><h3>After (proposed)</h3><pre>${afterHtml}</pre></div>
    </section>
    <section class="rationale"><h3>What changed &amp; why</h3><p>${esc(p.rationale)}</p></section>
    <footer class="card-foot">
      <code class="cmd" title="Reply with this in the Slack digest thread">approve ${esc(p.id)}</code>
      <code class="cmd cmd-reject" title="Reply with this in the Slack digest thread">reject ${esc(p.id)}</code>
      <a class="link" href="${esc(p.postUrl)}" target="_blank" rel="noopener">Open in Ordinal ↗</a>
    </footer>
  </article>`;
}

function historyRow(p) {
  const icon = p.status === 'applied' ? '✓' : '✕';
  return `<li class="hist hist-${esc(p.status)}"><span class="hist-icon">${icon}</span>
    <span class="hist-title">${esc(p.postTitle)}</span>
    <span class="hist-detail">${esc(p.id)} · ${esc(p.status)}${p.resolution && p.resolution !== p.status ? ` — ${esc(p.resolution)}` : ''} · ${fmtDate(p.resolvedAt)}</span></li>`;
}

const all = states.flatMap((s) => s.proposals ?? []);
const pending = all.filter((p) => p.status === 'pending' || p.status === 'approved');
const resolved = all.filter((p) => p.status === 'applied' || p.status === 'rejected')
  .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''));
const lastSweep = states.map((s) => s.lastSweepAt).filter(Boolean).sort().at(-1);
const applied = all.filter((p) => p.status === 'applied').length;
const workspaces = config.pilot.workspaces.join(', ');

const html = `<title>Ordinal Feedback Review</title>
<style>
:root {
  --bg: #f6f7f5; --surface: #ffffff; --ink: #1c2320; --ink-soft: #5b665f;
  --line: #dde3de; --accent: #0e7369; --accent-ink: #ffffff;
  --del-ink: #b4233c; --del-bg: #fbe9ec; --ins-ink: #1a7f37; --ins-bg: #e6f4ea;
  --warn-ink: #8a5a00; --warn-bg: #fdf3df; --chip-bg: #eceeeb;
}
@media (prefers-color-scheme: dark) { :root {
  --bg: #171b19; --surface: #202623; --ink: #e8ece9; --ink-soft: #9aa69e;
  --line: #333b36; --accent: #4cc4b6; --accent-ink: #10201d;
  --del-ink: #ff9aa8; --del-bg: #46232a; --ins-ink: #8fd9a0; --ins-bg: #1e3a28;
  --warn-ink: #eec577; --warn-bg: #3a2f1a; --chip-bg: #2a312d;
}}
:root[data-theme="light"] {
  --bg: #f6f7f5; --surface: #ffffff; --ink: #1c2320; --ink-soft: #5b665f;
  --line: #dde3de; --accent: #0e7369; --accent-ink: #ffffff;
  --del-ink: #b4233c; --del-bg: #fbe9ec; --ins-ink: #1a7f37; --ins-bg: #e6f4ea;
  --warn-ink: #8a5a00; --warn-bg: #fdf3df; --chip-bg: #eceeeb;
}
:root[data-theme="dark"] {
  --bg: #171b19; --surface: #202623; --ink: #e8ece9; --ink-soft: #9aa69e;
  --line: #333b36; --accent: #4cc4b6; --accent-ink: #10201d;
  --del-ink: #ff9aa8; --del-bg: #46232a; --ins-ink: #8fd9a0; --ins-bg: #1e3a28;
  --warn-ink: #eec577; --warn-bg: #3a2f1a; --chip-bg: #2a312d;
}
body { background: var(--bg); color: var(--ink); margin: 0;
  font-family: Seravek, 'Avenir Next', 'Segoe UI', ui-sans-serif, system-ui, sans-serif;
  line-height: 1.5; }
main { max-width: 76rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
header.top { display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem 1rem;
  border-bottom: 2px solid var(--accent); padding-bottom: 1rem; margin-bottom: 1.25rem; }
header.top h1 { font-size: 1.35rem; margin: 0; letter-spacing: -.01em; }
header.top .meta { color: var(--ink-soft); font-size: .85rem; }
.stats { display: flex; gap: .75rem; flex-wrap: wrap; margin-bottom: 1.75rem; }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: .4rem;
  padding: .55rem 1rem; min-width: 7.5rem; }
.stat b { display: block; font-size: 1.45rem; font-variant-numeric: tabular-nums; }
.stat span { color: var(--ink-soft); font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: .5rem;
  padding: 1.25rem 1.4rem; margin-bottom: 1.5rem; }
.card-head { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.card h2 { margin: 0 0 .15rem; font-size: 1.08rem; text-wrap: balance; }
.card-sub { color: var(--ink-soft); font-size: .82rem; }
.chips { display: flex; gap: .4rem; align-items: flex-start; flex-wrap: wrap; }
.chip { font-size: .72rem; padding: .18rem .55rem; border-radius: 999px;
  background: var(--chip-bg); color: var(--ink-soft); white-space: nowrap; }
.chip-clear-edit { background: var(--ins-bg); color: var(--ins-ink); }
.chip-ambiguous { background: var(--warn-bg); color: var(--warn-ink); }
.chip-question { background: var(--chip-bg); color: var(--ink); }
h3 { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em;
  color: var(--ink-soft); margin: 1.1rem 0 .45rem; }
.comment { margin: 0 0 .6rem; padding: .6rem .9rem; border-left: 3px solid var(--accent);
  background: var(--bg); border-radius: 0 .35rem .35rem 0; }
.comment p { margin: .25rem 0 0; }
.comment-meta { font-size: .78rem; color: var(--ink-soft); }
.diff { display: grid; grid-template-columns: 1fr 1fr; gap: .9rem; }
@media (max-width: 46rem) { .diff { grid-template-columns: 1fr; } }
.pane pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .82rem;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; line-height: 1.55;
  background: var(--bg); border: 1px solid var(--line); border-radius: .4rem;
  padding: .8rem .9rem; max-height: 30rem; overflow-y: auto; }
del { background: var(--del-bg); color: var(--del-ink); text-decoration: line-through; border-radius: .15rem; }
ins { background: var(--ins-bg); color: var(--ins-ink); text-decoration: none; border-radius: .15rem; }
.rationale p { margin: 0; font-size: .9rem; }
.card-foot { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap;
  margin-top: 1.1rem; padding-top: .9rem; border-top: 1px solid var(--line); }
.cmd { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: .8rem;
  background: var(--accent); color: var(--accent-ink); padding: .3rem .7rem;
  border-radius: .35rem; cursor: copy; }
.cmd-reject { background: var(--chip-bg); color: var(--ink); }
.link { margin-left: auto; color: var(--accent); font-size: .85rem; text-decoration: none; }
.link:hover, .link:focus-visible { text-decoration: underline; }
.empty { background: var(--surface); border: 1px dashed var(--line); border-radius: .5rem;
  padding: 2.5rem 1rem; text-align: center; color: var(--ink-soft); }
.hist-list { list-style: none; padding: 0; margin: 0; }
.hist { display: flex; gap: .6rem; align-items: baseline; padding: .45rem 0;
  border-bottom: 1px solid var(--line); font-size: .85rem; }
.hist-icon { font-weight: 700; }
.hist-applied .hist-icon { color: var(--ins-ink); }
.hist-rejected .hist-icon { color: var(--del-ink); }
.hist-detail { color: var(--ink-soft); margin-left: auto; text-align: right; }
.howto { color: var(--ink-soft); font-size: .85rem; margin: 0 0 1.5rem; }
.howto code { background: var(--chip-bg); padding: .05rem .35rem; border-radius: .25rem;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
</style>
<main>
  <header class="top">
    <h1>Ordinal Feedback Review</h1>
    <span class="meta">pilot: ${esc(workspaces)} · last sweep ${fmtDate(lastSweep)}</span>
  </header>
  <div class="stats">
    <div class="stat"><b>${pending.length}</b><span>pending review</span></div>
    <div class="stat"><b>${applied}</b><span>applied</span></div>
    <div class="stat"><b>${all.length}</b><span>total proposals</span></div>
  </div>
  <p class="howto">To act on a proposal, reply <code>approve prop-xxxxxx</code> or
  <code>reject prop-xxxxxx: reason</code> in the #ordinal-feedback digest thread —
  the agent picks it up on its next sweep. For instant action, send the same command
  to the Claude session.</p>
  ${pending.length
    ? pending.map(proposalCard).join('\n')
    : '<div class="empty">No proposals waiting for review. New client feedback is checked hourly.</div>'}
  ${resolved.length ? `<h3>Recent activity</h3><ul class="hist-list">${resolved.slice(0, 20).map(historyRow).join('')}</ul>` : ''}
</main>
<script>
document.querySelectorAll('.cmd').forEach((el) => {
  el.addEventListener('click', () => {
    navigator.clipboard.writeText(el.textContent).then(() => {
      const t = el.textContent; el.textContent = 'copied!';
      setTimeout(() => { el.textContent = t; }, 900);
    });
  });
});
</script>
`;

writeFileSync(join(root, 'dashboard', 'index.html'), html);
console.log(`dashboard/index.html written — ${pending.length} pending, ${resolved.length} resolved.`);
