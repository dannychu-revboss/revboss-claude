"""Import existing RevBoss content-plan PDFs into portal seed data (data/seed/*.json).

One-time migration helper: reads each PDF's tables, angle budget, "waiting on you"
items and the Ordinal post links embedded in the titles. Requires: pip install pdfplumber

Usage: python3 scripts/import_pdfs.py <pdf_dir> data/seed
"""
import json, re, sys, pathlib
import pdfplumber

DAYS = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
MONTHS = {m: i + 1 for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}
STATUS_MAP = {
    "posted": "posted",
    "scheduled": "scheduled",
    "approval waiting": "approval_waiting",
    "approval overdue": "approval_overdue",
    "approval not yet sent": "approval_not_sent",
    "to do": "todo",
    "to write": "todo",
    "for review": "approval_waiting",
}


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def lines_of(words, tol=2.5):
    """Group words into visual lines (sorted top→bottom, left→right)."""
    rows = []
    for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
        if rows and abs(rows[-1][0]["top"] - w["top"]) <= tol:
            rows[-1].append(w)
        else:
            rows.append([w])
    return [sorted(r, key=lambda w: w["x0"]) for r in rows]


def text(ws):
    return " ".join(w["text"] for w in ws).strip()


def is_bold(w):
    return "Bold" in w["fontname"] or "ExtraBold" in w["fontname"]


def parse_date(s, year):
    m = re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})", s)
    if not m:
        return None
    return f"{year}-{MONTHS[m.group(1)]:02d}-{int(m.group(2)):02d}"


def parse_pdf(path):
    pdf = pdfplumber.open(path)
    name = pathlib.Path(path).stem
    name = re.sub(r"(_\d+)?( copy)?$", "", name)
    client, person = [x.strip() for x in name.split(" - ")[:2]]

    all_lines = []  # (page_no, line_words)
    links = []  # (page_no, top, bottom, uri)
    for pi, page in enumerate(pdf.pages):
        words = page.extract_words(extra_attrs=["fontname", "size"])
        # drop running header/footer
        words = [w for w in words if 40 < w["top"] < 735]
        for ln in lines_of(words):
            all_lines.append((pi, ln))
        for h in page.hyperlinks:
            links.append((pi, h["top"], h["bottom"], h["uri"]))

    full = "\n".join(text(l) for _, l in all_lines)
    framework = "The Five Pillars" if "PILLARS" in pdf.pages[0].extract_text()[:200] else "The Four Angles"
    angle_word = "Pillar" if framework == "The Five Pillars" else "Angle"

    meta = re.search(r"^(.+?) · (\d+) DAYS · (\d+ \w{3}) – (\d+ \w{3}) (\d{4}) · PREPARED (\w+ \d+, \d{4})", full, re.M)
    year = int(meta.group(5)) if meta else 2026
    plan = {
        "id": slugify(f"{client}-{person}-2026-10"),
        "client": client,
        "person": person,
        "month": "2026-10",
        "framework": framework,
        "angleWord": angle_word,
        "periodLabel": f"{meta.group(3)} – {meta.group(4)} {year}" if meta else "",
        "preparedOn": meta.group(6) if meta else "",
        "intro": "",
        "waitingOn": [],
        "angles": [],
        "accounts": [],
        "posts": [],
        "sections": [],
        "cta": "",
        "bookingUrl": "",
        "ordinalWorkspace": None,
    }

    m = re.search(r"(https://calendly\.com/\S+)", full)
    plan["bookingUrl"] = m.group(1) if m else ""
    for _, _, _, uri in links:
        mm = re.match(r"https://app\.tryordinal\.com/([^/]+)/posts/", uri)
        if mm:
            plan["ordinalWorkspace"] = mm.group(1)
            break

    # ---- intro: lines after title until WAITING/PENDING
    idx = next(i for i, (pg, l) in enumerate(all_lines) if pg == 0 and " / " in text(l) and "content" in text(l))
    if text(all_lines[idx][1]).endswith("content"):
        idx += 1
    intro = []
    j = idx + 1
    while j < len(all_lines) and not re.match(r"^(WAITING ON YOU|PENDING YOUR FEEDBACK|VOLUME|ANGLES|Angle |Pillar )", text(all_lines[j][1])):
        intro.append(text(all_lines[j][1]))
        j += 1
    plan["intro"] = " ".join(intro).strip()

    # ---- waiting-on bullets
    if j < len(all_lines) and re.match(r"^(WAITING ON YOU|PENDING YOUR FEEDBACK)", text(all_lines[j][1])):
        plan["waitingLabel"] = text(all_lines[j][1]).title()
        j += 1
        cur = None
        while j < len(all_lines):
            t = text(all_lines[j][1])
            if t.startswith("•"):
                cur = t.lstrip("• ").strip()
                plan["waitingOn"].append(cur)
            elif cur is not None and not re.match(r"^(VOLUME|ANGLES|Angle |Pillar |THE PLAN)", t):
                plan["waitingOn"][-1] += " " + t
            else:
                break
            j += 1
    plan["waitingOn"] = [split_when(w) for w in plan["waitingOn"]]

    # ---- table parsing (plan rows) using header column positions
    posts = []
    cols = None
    account = None
    cur = None
    angle_table_mode = False
    section_desc = {}
    for li, (pi, ln) in enumerate(all_lines):
        t = text(ln)
        first = ln[0]["text"]
        # account header (multi-account plans), e.g. "CHRIS VAUGHAN · Personal profile ... 22 posts"
        mh = re.match(r"^([A-Z][A-Z .'&-]+) · ([A-Za-z ]+?)\s+\d+ posts", t)
        if mh:
            account = {"name": mh.group(1).title(), "kind": mh.group(2).strip()}
            cols = None
            continue
        if first == "Date" and any(w["text"] in ("Post",) for w in ln):
            cols = []
            for w in ln:
                if w["text"] in ("Date", "Angle", "Pillar", "Topic", "Post", "Type", "Channels", "Status"):
                    cols.append((w["text"], w["x0"]))
            continue
        if cols is None:
            continue
        if first.startswith("Status:") or t.startswith("Status:") or re.match(r"^[A-Z]{4,}", first) and not first in DAYS:
            if cur:
                posts.append(cur)
                cur = None
            cols = None if not first.startswith("Status") else None
            continue
        # assign words to columns
        cells = {c: [] for c, _ in cols}
        for w in ln:
            name_ = cols[0][0]
            for c, x in cols:
                if w["x0"] >= x - 2:
                    name_ = c
            cells[name_].append(w)
        if first in DAYS:
            if cur:
                posts.append(cur)
            cur = {"_cells": {c: [text(v)] for c, v in cells.items()}, "_page": pi, "_top": ln[0]["top"], "_bottom": ln[0]["bottom"], "account": account}
        elif cur:
            for c, v in cells.items():
                if v:
                    cur["_cells"][c].append(text(v))
            cur["_bottom"] = ln[0]["bottom"]
    if cur:
        posts.append(cur)

    for n, p in enumerate(posts):
        c = {k: " ".join(x for x in v if x).strip() for k, v in p["_cells"].items()}
        status_raw = c.get("Status", "")
        uri = None
        for lp, top, bottom, u in links:
            if lp == p["_page"] and bottom >= p["_top"] + 1 and top <= p["_bottom"] - 1 and "/posts/" in u:
                uri = u
                break
        post = {
            "id": f"p{n+1:02d}",
            "date": parse_date(c.get("Date", ""), year),
            "dateLabel": c.get("Date", ""),
            "angle": c.get("Angle") or c.get("Pillar") or "",
            "topicTag": (c.get("Topic", "")).strip(),
            "title": c.get("Post", ""),
            "type": c.get("Type", ""),
            "channels": [x.strip() for x in c.get("Channels", "LI").split("·")] if c.get("Channels") else ["LI"],
            "status": STATUS_MAP.get(status_raw.lower(), slugify(status_raw) or "todo"),
            "statusLabel": status_raw,
            "ordinalUrl": uri,
            "ordinalPostId": uri.rsplit("/", 1)[-1] if uri else None,
        }
        if p["account"]:
            post["account"] = p["account"]["name"]
        plan["posts"].append(post)

    # ---- angle budget table: rows "Name  N  why"
    KNOWN = ["Playbook", "Proof", "Stance", "Human", "Thought Leadership", "Influencers", "FOMO", "Product Marketing"]
    angle_names = KNOWN + sorted({p["angle"] for p in plan["posts"] if p["angle"] and p["angle"] not in KNOWN})
    for _, ln in all_lines:
        t = text(ln)
        if t.startswith("October posts") or " · " in t:
            continue
        for a in angle_names:
            m = re.match(rf"^{re.escape(a)}\s+(\d+)\s+(.*)$", t)
            if m and not any(x["name"] == a for x in plan["angles"]):
                rest = m.group(2)
                # multi-account angle table "8 2 — 10 why..."
                mm = re.match(r"^((?:\d+|—)\s+)+", rest)
                nums = re.findall(r"\d+|—", mm.group(0)) if mm else []
                why = rest[mm.end():] if mm else rest
                count = int(nums[-1]) if nums and nums[-1] != "—" else int(m.group(1))
                plan["angles"].append({"name": a, "target": count, "why": why.strip(), "description": "", "forYou": ""})

    # ---- angle section descriptions ("PLAYBOOK  N posts in October" + desc + "For you:")
    for i, (_, ln) in enumerate(all_lines):
        t = text(ln)
        m = re.match(r"^([A-Z][A-Z ]+?)\s+\d+ posts? in", t)
        if m:
            name_ = m.group(1).strip().title()
            ang = next((a for a in plan["angles"] if a["name"].lower() == name_.lower()), None)
            if not ang:
                continue
            desc, fy = [], []
            k = i + 1
            mode = "d"
            while k < len(all_lines):
                tt = text(all_lines[k][1])
                if tt.startswith("October posts") or tt.startswith("November posts"):
                    break
                if tt.startswith("For you:"):
                    mode = "f"
                    tt = tt[len("For you:"):].strip()
                (fy if mode == "f" else desc).append(tt)
                k += 1
            ang["description"] = " ".join(desc).strip()
            ang["forYou"] = " ".join(fy).strip()

    # ---- freeform sections (e.g. WHAT OCTOBER IS WORKING ON, BUILDING ON WHAT WORKED)
    for i, (_, ln) in enumerate(all_lines):
        t = text(ln)
        if t in ("WHAT OCTOBER IS WORKING ON", "BUILDING ON WHAT WORKED", "WHAT'S RUNNING THIS MONTH", "CONTENT OPPORTUNITIES", "QUESTIONS FOR THE NEXT INTERVIEW"):
            body = []
            k = i + 1
            while k < len(all_lines):
                tt = text(all_lines[k][1])
                if re.match(r"^[A-Z][A-Z' ]{6,}$", tt) or re.match(r"^[A-Z][A-Z ]+\s+\d+ posts? in", tt):
                    break
                body.append(tt)
                k += 1
            plan["sections"].append({"title": t.title(), "body": "\n".join(body).strip()})

    m = re.search(r"(Book (?:your next interview|a session) with Danny:.*?)(?:https://calendly)", full, re.S)
    plan["cta"] = re.sub(r"\s+", " ", m.group(1)).strip() if m else ""

    accts = []
    for p in plan["posts"]:
        if p.get("account") and p["account"] not in accts:
            accts.append(p["account"])
    plan["accounts"] = accts
    return plan


def split_when(s):
    m = re.match(r"^(.*?)\s+·\s+(.*)$", s)
    return {"when": m.group(1), "ask": m.group(2), "done": False} if m else {"when": "", "ask": s, "done": False}


if __name__ == "__main__":
    src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    index = []
    for f in sorted(src.glob("*.pdf")):
        plan = parse_pdf(str(f))
        (out / f"{plan['id']}.json").write_text(json.dumps(plan, indent=2, ensure_ascii=False))
        index.append({"id": plan["id"], "client": plan["client"], "person": plan["person"], "posts": len(plan["posts"]), "angles": len(plan["angles"]), "linked": sum(1 for p in plan["posts"] if p["ordinalPostId"]), "waiting": len(plan["waitingOn"]), "ws": plan["ordinalWorkspace"]})
    for r in index:
        print(r)
