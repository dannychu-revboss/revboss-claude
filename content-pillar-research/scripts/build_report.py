#!/usr/bin/env python3
"""Render the Topic Strategy Brief (BASELINE) or the weekly research report.

Both read a JSON input file whose shape is documented in references/outputs.md.
Output is one self-contained, printable HTML file — no external assets, safe to
publish as an Artifact or attach to an email.

  python build_report.py --kind brief  --input brief.json  --output brief.html
  python build_report.py --kind weekly --input weekly.json --output weekly.html

Missing optional sections are simply omitted; the script never invents content.
Anything it cannot render it lists in a "not supplied" note so gaps stay visible.
"""
import argparse
import html
import json
import sys

CSS = """
:root{--bg:#faf9f7;--panel:#fff;--ink:#1c1a17;--muted:#6b6560;--line:#e5e1db;
--accent:#1f4e5f;--accent-soft:#e8f0f2;--warn:#8a5a00;--warn-soft:#fdf3e0;
--bad:#8c2f21;--bad-soft:#fbeae7;--ok:#2f6b45;--ok-soft:#e9f3ec}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#161513;--panel:#1e1d1a;
--ink:#f2efe9;--muted:#a49d95;--line:#332f2b;--accent:#7fb3c4;--accent-soft:#1d2e34;
--warn:#e0b063;--warn-soft:#332a17;--bad:#e08a7a;--bad-soft:#331f1b;--ok:#8fc4a3;--ok-soft:#1b2a20}}
:root[data-theme=dark]{--bg:#161513;--panel:#1e1d1a;--ink:#f2efe9;--muted:#a49d95;--line:#332f2b;
--accent:#7fb3c4;--accent-soft:#1d2e34;--warn:#e0b063;--warn-soft:#332a17;--bad:#e08a7a;
--bad-soft:#331f1b;--ok:#8fc4a3;--ok-soft:#1b2a20}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:16px/1.6 ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:920px;margin:0 auto;padding:48px 24px 96px}
header.mast{border-bottom:3px solid var(--accent);padding-bottom:20px;margin-bottom:36px}
.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:650}
h1{font-size:31px;line-height:1.2;margin:10px 0 6px;letter-spacing:-.01em}
h2{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);
margin:44px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--line)}
h3{font-size:19px;margin:26px 0 6px}
p{margin:0 0 12px}
.sub{color:var(--muted);font-size:14px}
.lede{font-size:17px;background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--accent);
padding:18px 20px;border-radius:6px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:20px 22px;margin:0 0 16px}
.pillar{border-left:4px solid var(--accent)}
.grid{display:grid;gap:14px}
@media(min-width:680px){.grid.two{grid-template-columns:1fr 1fr}}
table{width:100%;border-collapse:collapse;font-size:14px}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);
padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
.tag{display:inline-block;font-size:11px;letter-spacing:.05em;text-transform:uppercase;font-weight:650;
padding:3px 8px;border-radius:99px;background:var(--accent-soft);color:var(--accent);white-space:nowrap}
.tag.ok{background:var(--ok-soft);color:var(--ok)}
.tag.warn{background:var(--warn-soft);color:var(--warn)}
.tag.bad{background:var(--bad-soft);color:var(--bad)}
.tag.pass{background:var(--line);color:var(--muted)}
.kv{font-size:14px;margin:0 0 8px}
.kv b{color:var(--muted);font-weight:650;font-size:11px;letter-spacing:.08em;text-transform:uppercase;
display:block;margin-bottom:1px}
ul,ol{margin:0 0 12px;padding-left:22px}
li{margin:0 0 5px}
a{color:var(--accent);text-decoration-thickness:1px;text-underline-offset:2px;word-break:break-word}
.bar{height:8px;border-radius:99px;background:var(--line);overflow:hidden;min-width:80px}
.bar span{display:block;height:100%;background:var(--accent)}
.bar.warn span{background:var(--warn)}.bar.bad span{background:var(--bad)}
.muted{color:var(--muted)}
.small{font-size:13px}
.limits{background:var(--warn-soft);border:1px solid var(--line);border-radius:6px;padding:14px 16px;font-size:14px}
.score{font-variant-numeric:tabular-nums;font-weight:650}
footer{margin-top:56px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
@media print{body{background:#fff}.wrap{padding:0}.card{break-inside:avoid}}
"""


def esc(value):
    return html.escape(str(value if value is not None else ""))


def link(url, text=None):
    if not url:
        return ""
    return f'<a href="{esc(url)}" target="_blank" rel="noopener">{esc(text or url)}</a>'


def paras(value):
    """Accept a string or list of strings; render as paragraphs."""
    if not value:
        return ""
    items = value if isinstance(value, list) else [value]
    return "".join(f"<p>{esc(p)}</p>" for p in items if p)


def bullets(items, render=esc):
    if not items:
        return ""
    return "<ul>" + "".join(f"<li>{render(i)}</li>" for i in items) + "</ul>"


def kv(label, value, raw=False):
    if value in (None, "", [], {}):
        return ""
    body = value if raw else esc(value)
    return f'<div class="kv"><b>{esc(label)}</b>{body}</div>'


def table(headers, rows):
    head = "".join(f"<th>{esc(h)}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>" for row in rows)
    return f'<div class="scroll"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


def section(title, body):
    if not body or not body.strip():
        return ""
    return f"<h2>{esc(title)}</h2>{body}"


def shell(title, body):
    return (f"<title>{esc(title)}</title>\n<style>{CSS}</style>\n"
            f'<div class="wrap">{body}</div>\n')


def bar(value, total, tone=""):
    pct = 0 if not total else max(0, min(100, round(100 * value / total)))
    cls = f"bar {tone}".strip()
    return f'<div class="{cls}"><span style="width:{pct}%"></span></div>'


# ---------------------------------------------------------------- brief


def render_brief(d):
    person = d.get("person") or {}
    org = d.get("organization") or {}
    who = " · ".join(filter(None, [person.get("name"), person.get("role"), org.get("name")]))
    parts = [
        '<header class="mast">',
        '<div class="eyebrow">Topic Strategy Brief</div>',
        f'<h1>What {esc(person.get("name") or d.get("client"))} should be talking about — and why</h1>',
        f'<p class="sub">{esc(who)}</p>',
        f'<p class="sub">Prepared {esc(d.get("prepared_at"))}'
        + (f' · {esc(d.get("prepared_by"))}' if d.get("prepared_by") else "") + "</p>",
        "</header>",
    ]
    if d.get("summary"):
        parts.append(f'<div class="lede">{esc(d["summary"])}</div>')

    # 1. buyer questions
    rows = [[esc(q.get("text")), f'<span class="tag">{esc(q.get("stage"))}</span>',
             f'<span class="small muted">{esc(q.get("source"))}</span>']
            for q in d.get("buyer_questions") or []]
    parts.append(section("What your buyers are actually asking",
                         (table(["Question", "Stage", "Where the phrasing came from"], rows)
                          + '<p class="small muted">These are your buyers\' words, taken from calls '
                            'and threads — not our vocabulary. They are what gets typed into an AI.</p>')
                         if rows else ""))

    # 2. answer surface
    surface = d.get("answer_surface") or {}
    if surface.get("rows"):
        srows = []
        for row in surface["rows"]:
            named = ", ".join(row.get("named") or []) or "—"
            present = ('<span class="tag ok">present</span>' if row.get("client_present")
                       else '<span class="tag bad">absent</span>')
            indiv = ("yes" if row.get("individual_post_cited") else "no")
            srows.append([esc(row.get("question")), esc(named), present, esc(indiv),
                          f'<span class="small muted">{esc(row.get("note"))}</span>'])
        body = (f'<p class="small muted">Observed {esc(surface.get("observed_at"))} · '
                f'method: {esc(surface.get("method"))}</p>'
                + table(["Question", "Who the answer named", "You", "Any individual cited?", "Note"], srows))
        if surface.get("limits"):
            body += f'<div class="limits"><b>How to read this:</b> {esc(surface["limits"])}</div>'
        parts.append(section("Who the AI names today", body))

    # 3. why individuals
    parts.append(section("Why individual profiles are the lever", paras(d.get("why_individuals"))))

    # 4. candidates
    cands = d.get("candidates") or []
    if cands:
        crows = []
        for c in cands:
            scores = c.get("scores") or {}
            total = sum(v for v in scores.values() if isinstance(v, (int, float)))
            chosen = ('<span class="tag ok">chosen</span>' if c.get("chosen")
                      else '<span class="tag pass">passed</span>')
            detail = " · ".join(f"{k.replace('_', ' ')} {v}" for k, v in scores.items())
            crows.append([f"<b>{esc(c.get('name'))}</b>", chosen,
                          f'<span class="score">{total or "—"}</span>',
                          f'{esc(c.get("reasoning"))}<br><span class="small muted">{esc(detail)}</span>'
                          + (f'<br><span class="small muted">Incumbent: {esc(c.get("incumbent"))}</span>'
                             if c.get("incumbent") else "")])
        parts.append(section("What you can own — and what we passed on",
                             table(["Topic", "", "Score", "Reasoning"], crows)))

    # 5. pillars
    pillar_cards = []
    for p in d.get("pillars") or []:
        weight = p.get("weight")
        card = [f'<div class="card pillar"><h3>{esc(p.get("name"))}</h3>']
        if weight is not None:
            card.append(f'<p class="sub"><span class="tag">{round(float(weight) * 100)}% of the mix</span></p>')
        card.append(paras(p.get("definition")))
        card.append(kv("Why now", p.get("why_now")))
        card.append(kv("In scope", ", ".join(p.get("in_scope") or [])))
        card.append(kv("Out of scope", ", ".join(p.get("out_of_scope") or [])))
        card.append(kv("Answers", ", ".join(p.get("buyer_questions") or [])))
        card.append(kv("Key terms for the first line", ", ".join(p.get("key_terms") or [])))
        assets = p.get("proof_assets") or []
        if assets:
            card.append(kv("Proof we already have", bullets(
                assets, lambda a: link(a.get("link"), a.get("name")) or esc(a.get("name"))), raw=True))
        if p.get("gaps"):
            card.append(kv("What we still need", bullets(p["gaps"]), raw=True))
        if p.get("incumbent"):
            card.append(kv("Who we're up against", p.get("incumbent")))
        card.append("</div>")
        pillar_cards.append("".join(card))
    parts.append(section("Your pillars", "".join(pillar_cards)))

    # 6. cadence
    cadence = d.get("cadence") or {}
    if cadence:
        body = kv("Cadence", f'{cadence.get("posts_per_week")} posts/week'
                  + (f' · {", ".join(cadence.get("days") or [])}' if cadence.get("days") else ""))
        body += paras(cadence.get("month_example"))
        parts.append(section("Cadence and the mix", body))

    # 7. measurement
    m = d.get("measurement") or {}
    if m:
        body = bullets(m.get("metrics") or [])
        if m.get("judgment_floor"):
            body += f'<div class="limits"><b>Give it 30 days.</b> {esc(m["judgment_floor"])}</div>'
        parts.append(section("How we'll know it's working", body))

    # 8. asks
    asks = d.get("asks") or []
    if asks:
        parts.append(section("What we need from you", table(
            ["What", "Pillar it feeds", "Why now"],
            [[esc(a.get("what")), esc(a.get("pillar")), esc(a.get("why_now"))] for a in asks])))

    # 9. sources
    sources = d.get("sources") or []
    if sources:
        parts.append(section("Sources", bullets(
            sources,
            lambda s: (link(s.get("url"), s.get("title")) or esc(s.get("title")))
            + (f' <span class="small muted">({esc(s.get("dated"))})</span>' if s.get("dated") else ""))))

    parts.append(f'<footer>{esc(d.get("client"))} · Topic Strategy Brief · '
                 f'{esc(d.get("prepared_at"))} · pillars are reviewed quarterly</footer>')
    return shell(f'{d.get("client")} — Topic Strategy', "".join(parts))


# ---------------------------------------------------------------- weekly


COVERAGE_TONE = {"ok": ("ok", ""), "behind": ("warn", "warn"), "starved": ("bad", "bad"),
                 "empty": ("bad", "bad"), "secondary": ("", "")}


def render_weekly(d):
    person = d.get("person") or {}
    parts = [
        '<header class="mast">',
        '<div class="eyebrow">Weekly Content Research</div>',
        f'<h1>{esc(d.get("client"))} — week of {esc(d.get("week_of"))}</h1>',
        f'<p class="sub">' + esc(" · ".join(filter(None, [person.get("name"), person.get("role")])))
        + (f' · run {esc(d.get("run_id"))}' if d.get("run_id") else "") + "</p>",
        "</header>",
    ]
    if d.get("summary"):
        parts.append(f'<div class="lede">{esc(d["summary"])}</div>')

    # coverage
    cov = d.get("coverage") or {}
    if cov.get("rows"):
        maxi = max([(r.get("published") or 0) + (r.get("forward") or 0) for r in cov["rows"]] + [1])
        rows = []
        for r in cov["rows"]:
            tag_cls, bar_cls = COVERAGE_TONE.get(r.get("status", ""), ("", ""))
            status = (f'<span class="tag {tag_cls}">{esc(r.get("status"))}</span>'
                      if r.get("status") else "")
            starved = r.get("weeks_starved") or 0
            if starved:
                status += f' <span class="small muted">{starved}w</span>'
            since = r.get("days_since_last")
            rows.append([
                f'<b>{esc(r.get("pillar"))}</b>',
                f'{round(float(r.get("weight") or 0) * 100)}%',
                str(r.get("published", 0)),
                str(r.get("forward", 0)),
                (f"{since}d" if since is not None else "—"),
                bar((r.get("published") or 0) + (r.get("forward") or 0), maxi, bar_cls),
                status,
            ])
        body = (f'<p class="small muted">Published in the last {esc(cov.get("window_days"))} days; '
                f'queued within {esc(cov.get("forward_window_days"))} days.</p>'
                + table(["Pillar", "Target", "Published", "Queued", "Since last", "", "Status"], rows))
        batch = cov.get("next_batch") or {}
        if batch.get("allocation"):
            alloc = " · ".join(f"{k}: {v}" for k, v in batch["allocation"].items() if v)
            body += kv(f'Recommended split for the next {batch.get("size")} posts', alloc)
        parts.append(section("Pillar coverage", body))

    # signals
    signals = d.get("signals") or []
    if signals:
        by_pillar = {}
        for s in signals:
            by_pillar.setdefault(s.get("pillar") or s.get("pillar_id") or "Unassigned", []).append(s)
        chunks = []
        for pillar, group in by_pillar.items():
            chunks.append(f"<h3>{esc(pillar)}</h3>")
            for s in sorted(group, key=lambda x: -(x.get("score") or 0)):
                meta = " · ".join(filter(None, [esc(s.get("source_type")), esc(s.get("dated")),
                                                (f'score {s["score"]:.2f}' if isinstance(s.get("score"), (int, float)) else "")]))
                chunks.append(
                    '<div class="card">'
                    f'<p><b>{esc(s.get("what"))}</b></p>'
                    + kv("Why buyers care", s.get("why_buyers_care"))
                    + kv("Our angle", s.get("our_angle"))
                    + kv("Proof", s.get("proof"))
                    + kv("Source", link(s.get("source_url")), raw=True)
                    + f'<p class="small muted">{meta}</p>'
                    "</div>")
        parts.append(section("What's being talked about", "".join(chunks)))

    # ideas
    ideas = d.get("ideas_written") or []
    if ideas:
        rows = [[esc(i.get("title")), esc(i.get("pillar")), esc(i.get("format")),
                 (f'<span class="tag ok">{esc(i.get("ordinal_status"))}</span>'
                  if i.get("ordinal_status") == "ToDo"
                  else f'<span class="tag bad">{esc(i.get("ordinal_status"))}</span>')]
                for i in ideas]
        parts.append(section("Ideas written to Ordinal",
                             table(["Title", "Pillar", "Format", "Status"], rows)
                             + '<p class="small muted">Seeds only — unscheduled To-Dos with no copy '
                               'written yet. Nothing here publishes on its own.</p>'))

    # asks
    asks = d.get("asks") or []
    if asks:
        parts.append(section("Ask the client this week", table(
            ["What we need", "Pillar", "Unblocks", "Why now"],
            [[esc(a.get("what")), esc(a.get("pillar")), esc(a.get("unblocks")), esc(a.get("why_now"))]
             for a in asks])))

    # answer surface
    surface = d.get("answer_surface") or {}
    if surface.get("checked"):
        rows = [[esc(c.get("question")), esc(", ".join(c.get("named") or []) or "—"),
                 ('<span class="tag ok">present</span>' if c.get("client_present")
                  else '<span class="tag bad">absent</span>'),
                 esc(c.get("vs_baseline"))]
                for c in surface["checked"]]
        parts.append(section("Answer-surface spot check",
                             f'<p class="small muted">Observed {esc(surface.get("observed_at"))}</p>'
                             + table(["Question", "Who was named", "You", "vs. baseline"], rows)))

    # flags
    flags = d.get("flags") or []
    if flags:
        rows = [[f'<span class="tag warn">{esc(f.get("flag"))}</span>', esc(f.get("detail")),
                 esc(f.get("action"))] for f in flags]
        parts.append(section("Flags", table(["Flag", "Detail", "Recommended action"], rows)))

    off = d.get("off_pillar") or []
    if off:
        parts.append(section("Off-pillar (not turned into ideas)", bullets(
            off, lambda o: f'{esc(o.get("what"))} — {link(o.get("source_url"))} '
                           f'<span class="small muted">{esc(o.get("note"))}</span>')))

    if d.get("notes"):
        parts.append(section("Notes", f'<div class="limits">{esc(d["notes"])}</div>'))

    parts.append(f'<footer>{esc(d.get("client"))} · weekly pillar research · '
                 f'{esc(d.get("week_of"))} · research and proposals only — nothing scheduled</footer>')
    return shell(f'{d.get("client")} — week of {d.get("week_of")}', "".join(parts))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kind", required=True, choices=["brief", "weekly"])
    ap.add_argument("--input", required=True, help="input JSON (see references/outputs.md)")
    ap.add_argument("--output", required=True, help="path to write HTML")
    args = ap.parse_args(argv)

    try:
        with open(args.input, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"error: cannot read {args.input}: {exc}", file=sys.stderr)
        return 2

    if data.get("kind") and data["kind"] != args.kind:
        print(f"warning: input says kind='{data['kind']}' but --kind={args.kind}", file=sys.stderr)

    if not data.get("client"):
        print("error: input is missing 'client'", file=sys.stderr)
        return 2

    html_out = render_brief(data) if args.kind == "brief" else render_weekly(data)
    with open(args.output, "w", encoding="utf-8") as fh:
        fh.write(html_out)
    print(f"wrote {args.output} ({len(html_out)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
