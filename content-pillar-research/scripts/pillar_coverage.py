#!/usr/bin/env python3
"""Pillar coverage + gap math for content-pillar-research.

Given a client's pillar registry and a normalized dump of their content (published
posts plus everything queued in Ordinal), this answers:

  - how much of each pillar have we actually published in the trailing window?
  - how much is queued inside the near window, and how much sits further out?
  - how long since each pillar was last posted, and how many consecutive weeks
    has it had zero forward coverage?
  - how far is each pillar from its target share of the mix?
  - what should the next N posts be split into to correct the drift?

The last question is the point: idea generation should chase deficits, not
whatever happened to be interesting this week.

Content items are auto-tagged to a pillar via `match.terms` / `match.negative_terms`
when they carry no explicit pillar. Auto-tags come back with a confidence and are
listed under `tagging.low_confidence` so a human can spot-check them.

Example:
  python pillar_coverage.py --pillars clients/acme-dana/pillars.json \\
      --content /tmp/acme-content.json --next-batch 8 --today 2026-08-18

Content JSON: either a bare list or {"items": [...]} where each item is
  {
    "id": "idea_123",
    "title": "...",
    "copy": "...",                     # optional but improves tagging
    "status": "Published|ToDo|...",    # Ordinal status
    "publish_date": "2026-08-14",      # or publishDate / date; omit for undated ideas
    "pillar_id": "onboarding-drop-off",# optional explicit tag (wins over matching)
    "labels": ["pricing-honesty"]      # optional; a label matching a pillar id/name also tags
  }

Output: JSON on stdout (or --output).
"""
import argparse
import json
import re
import sys
from datetime import date, datetime, timedelta

PUBLISHED_STATUSES = {"published", "posted", "sent", "complete", "completed"}
# Anything not published but present in the workspace counts as forward coverage
# only when it is genuinely still alive. Rejected/archived work is not coverage.
DEAD_STATUSES = {"archived", "rejected", "canceled", "cancelled", "deleted"}
DEAD_LABELS = {"hold", "rejected", "archived"}


def parse_date(value):
    """Accept YYYY-MM-DD, ISO datetimes, and trailing-Z UTC stamps. None on failure."""
    if not value:
        return None
    if isinstance(value, (date, datetime)):
        return value.date() if isinstance(value, datetime) else value
    text = str(value).strip()
    if not text:
        return None
    text = text.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(text[:10], fmt).date()
        except ValueError:
            continue
    return None


def normalize(text):
    return re.sub(r"\s+", " ", (text or "").lower())


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def item_field(item, *names):
    for name in names:
        if name in item and item[name] not in (None, ""):
            return item[name]
    return None


def is_dead(item):
    status = normalize(str(item_field(item, "status") or ""))
    if status in DEAD_STATUSES:
        return True
    if item.get("archived") or item.get("isArchived") or item.get("archivedAt"):
        return True
    labels = [normalize(str(x)) for x in (item.get("labels") or [])]
    return any(label in DEAD_LABELS for label in labels)


def is_published(item, today):
    status = normalize(str(item_field(item, "status") or ""))
    if status in PUBLISHED_STATUSES:
        return True
    # A dated item whose date has passed reads as published only if Ordinal says so;
    # a past-dated To-Do is a missed slot, not coverage. Keep it out of both buckets.
    return False


def tag_item(item, pillars):
    """Return (pillar_id, confidence, reason). confidence: explicit|label|strong|weak|none."""
    explicit = item_field(item, "pillar_id", "pillarId", "pillar")
    if explicit:
        for pillar in pillars:
            if explicit in (pillar["id"], pillar.get("name")):
                return pillar["id"], "explicit", "explicit tag"
        return None, "explicit-unknown", f"tagged '{explicit}' which is not a pillar id"

    labels = [str(x) for x in (item.get("labels") or [])]
    for label in labels:
        for pillar in pillars:
            if normalize(label) in (normalize(pillar["id"]), normalize(pillar.get("name"))):
                return pillar["id"], "label", f"label '{label}'"

    haystack = normalize(f"{item_field(item, 'title') or ''} {item_field(item, 'copy', 'body', 'text') or ''}")
    if not haystack.strip():
        return None, "none", "no text to match"

    best = None
    for pillar in pillars:
        match = pillar.get("match") or {}
        negatives = [normalize(t) for t in (match.get("negative_terms") or [])]
        if any(neg and neg in haystack for neg in negatives):
            continue
        hits = [t for t in (match.get("terms") or []) if normalize(t) and normalize(t) in haystack]
        if not hits:
            continue
        score = len(hits)
        if best is None or score > best[1]:
            best = (pillar["id"], score, hits)

    if best is None:
        return None, "none", "no term matched"
    pillar_id, score, hits = best
    confidence = "strong" if score >= 2 else "weak"
    return pillar_id, confidence, "matched " + ", ".join(f"'{h}'" for h in hits[:4])


def largest_remainder(weights, total):
    """Allocate `total` integer slots across weights (dict id->float) proportionally."""
    if total <= 0 or not weights:
        return {k: 0 for k in weights}
    weight_sum = sum(weights.values())
    if weight_sum <= 0:
        return {k: 0 for k in weights}
    exact = {k: total * (v / weight_sum) for k, v in weights.items()}
    floors = {k: int(v) for k, v in exact.items()}
    remaining = total - sum(floors.values())
    order = sorted(weights, key=lambda k: (exact[k] - floors[k], weights[k]), reverse=True)
    for key in order[:remaining]:
        floors[key] += 1
    return floors


def build(pillars_doc, content_items, today, window_days, forward_days, next_batch, starved_state):
    pillars = [p for p in pillars_doc.get("pillars", []) if p.get("status", "active") != "retired"]
    primary = [p for p in pillars if p.get("tier", "primary") == "primary"]
    window_start = today - timedelta(days=window_days)
    forward_end = today + timedelta(days=forward_days)

    counts = {p["id"]: {"published": 0, "forward": 0, "queued_beyond": 0, "last_published": None}
              for p in pillars}
    untagged, low_confidence, dead = [], [], 0

    for item in content_items:
        if is_dead(item):
            dead += 1
            continue
        pillar_id, confidence, reason = tag_item(item, pillars)
        label = item_field(item, "title") or item_field(item, "id") or "(untitled)"
        if pillar_id is None or pillar_id not in counts:
            untagged.append({"item": label, "reason": reason})
            continue
        if confidence in ("weak", "explicit-unknown"):
            low_confidence.append({"item": label, "pillar_id": pillar_id, "reason": reason})

        when = parse_date(item_field(item, "publish_date", "publishDate", "date", "scheduled_at"))
        if is_published(item, today):
            if when and when >= window_start and when <= today:
                counts[pillar_id]["published"] += 1
            prior = counts[pillar_id]["last_published"]
            if when and (prior is None or when > prior):
                counts[pillar_id]["last_published"] = when
        else:
            # Three buckets, because "queued" and "queued soon" are different facts.
            # An undated live idea is material we hold and can slot anywhere -> forward.
            # A dated item inside the window is imminent coverage -> forward.
            # A dated item past the window is real coverage sitting further out
            # (clients who plan two months ahead) -> queued_beyond. Counting that as
            # zero coverage would flag a well-stocked client as starved.
            if when is None or (today <= when <= forward_end):
                counts[pillar_id]["forward"] += 1
            elif when > forward_end:
                counts[pillar_id]["queued_beyond"] += 1

    total_published = sum(c["published"] for c in counts.values()) or 0
    total_forward = sum(c["forward"] for c in counts.values()) or 0
    total_beyond = sum(c["queued_beyond"] for c in counts.values()) or 0

    rows = []
    for pillar in pillars:
        pid = pillar["id"]
        c = counts[pid]
        weight = float(pillar.get("weight") or 0) if pillar.get("tier", "primary") == "primary" else 0.0
        expected_published = weight * total_published
        actual_share = (c["published"] / total_published) if total_published else 0.0
        last = c["last_published"]
        queued_total = c["forward"] + c["queued_beyond"]
        weeks_starved = int((starved_state or {}).get(pid, 0))
        if queued_total == 0 and weight > 0:
            weeks_starved += 1
        else:
            weeks_starved = 0

        if weight == 0:
            status = "secondary"
        elif queued_total == 0:
            status = "starved"
        elif c["forward"] == 0:
            # Covered, but nothing lands inside the near window — a scheduling gap,
            # not a content gap. Different problem, different fix.
            status = "far-out"
        elif expected_published and c["published"] < expected_published - 1:
            status = "behind"
        else:
            status = "ok"

        rows.append({
            "pillar_id": pid,
            "pillar": pillar.get("name", pid),
            "tier": pillar.get("tier", "primary"),
            "weight": round(weight, 3),
            "published": c["published"],
            "forward": c["forward"],
            "queued_beyond": c["queued_beyond"],
            "target_published": round(expected_published, 1),
            "actual_share": round(actual_share, 3),
            "deficit": round(max(0.0, expected_published - c["published"]), 1),
            "days_since_last": (today - last).days if last else None,
            "last_published": last.isoformat() if last else None,
            "weeks_starved": weeks_starved,
            "status": status,
        })

    # Next-batch allocation: weight by target share, amplified by current deficit so the
    # batch actively corrects drift rather than perpetuating it.
    alloc_weights = {}
    for row in rows:
        if row["weight"] <= 0:
            continue
        queued_total = row["forward"] + row["queued_beyond"]
        boost = 1.0 + min(1.0, row["deficit"] / 3.0) + (0.5 if queued_total == 0 else 0.0)
        alloc_weights[row["pillar_id"]] = row["weight"] * boost
    allocation = largest_remainder(alloc_weights, next_batch)

    flags = []
    for row in rows:
        if row["weeks_starved"] >= 3:
            flags.append({"flag": "pillar-starved", "pillar_id": row["pillar_id"],
                          "detail": f"{row['pillar']}: 0 forward coverage for {row['weeks_starved']} weeks"})
        elif row["status"] == "starved":
            flags.append({"flag": "pillar-no-forward", "pillar_id": row["pillar_id"],
                          "detail": f"{row['pillar']}: nothing queued at all"})
        elif row["status"] == "far-out":
            flags.append({"flag": "coverage-far-out", "pillar_id": row["pillar_id"],
                          "detail": f"{row['pillar']}: {row['queued_beyond']} queued but none inside "
                                    f"the next {forward_days} days"})
        if row["days_since_last"] is not None and row["days_since_last"] > 45 and row["weight"] > 0:
            flags.append({"flag": "pillar-cold", "pillar_id": row["pillar_id"],
                          "detail": f"{row['pillar']}: {row['days_since_last']} days since last post"})
    weight_total = sum(float(p.get("weight") or 0) for p in primary)
    if primary and abs(weight_total - 1.0) > 0.01:
        flags.append({"flag": "weights-invalid",
                      "detail": f"primary pillar weights sum to {weight_total:.2f}, expected 1.00"})
    if len(primary) > 5:
        flags.append({"flag": "too-many-pillars",
                      "detail": f"{len(primary)} primary pillars; methodology caps at 5"})

    return {
        "client": pillars_doc.get("client"),
        "slug": pillars_doc.get("slug"),
        "pillars_version": pillars_doc.get("version"),
        "computed_at": today.isoformat(),
        "window_days": window_days,
        "forward_window_days": forward_days,
        "totals": {"published_in_window": total_published, "forward": total_forward,
                   "queued_beyond": total_beyond, "items_considered": len(content_items),
                   "excluded_dead": dead},
        "rows": rows,
        "next_batch": {"size": next_batch, "allocation": allocation},
        "flags": flags,
        "tagging": {"untagged": untagged, "low_confidence": low_confidence},
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pillars", required=True, help="path to clients/<slug>/pillars.json")
    ap.add_argument("--content", required=True, help="normalized content JSON (list or {items:[...]})")
    ap.add_argument("--radar-state", help="radar-state.json, for carrying weeks-starved counters")
    ap.add_argument("--today", help="YYYY-MM-DD (default: system date)")
    ap.add_argument("--window-days", type=int, default=30, help="trailing published window (default 30)")
    ap.add_argument("--forward-days", type=int, default=21, help="forward queued window (default 21)")
    ap.add_argument("--next-batch", type=int, default=8, help="size of the batch to allocate (default 8)")
    ap.add_argument("--output", help="write JSON here instead of stdout")
    args = ap.parse_args(argv)

    pillars_doc = load_json(args.pillars)
    if not pillars_doc.get("pillars"):
        print("error: pillars.json has no pillars — run BASELINE first", file=sys.stderr)
        return 2

    content = load_json(args.content)
    items = content.get("items", content) if isinstance(content, dict) else content
    if not isinstance(items, list):
        print("error: content JSON must be a list or {'items': [...]}", file=sys.stderr)
        return 2

    today = parse_date(args.today) or date.today()
    starved = {}
    if args.radar_state:
        try:
            starved = (load_json(args.radar_state) or {}).get("starved_weeks", {})
        except FileNotFoundError:
            starved = {}

    result = build(pillars_doc, items, today, args.window_days, args.forward_days,
                   args.next_batch, starved)
    text = json.dumps(result, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
        print(f"wrote {args.output}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
