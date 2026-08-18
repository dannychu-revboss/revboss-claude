#!/usr/bin/env python3
"""Validate a client's pillars.json against the registry schema.

Run before any write, and before trusting coverage math. Errors block; warnings
are things a human should look at but that won't break downstream skills.

  python validate_pillars.py clients/acme-dana/pillars.json
  python validate_pillars.py clients/acme-dana/pillars.json --json

Exit 0 = valid (warnings allowed), 1 = invalid, 2 = unreadable.
Schema reference: references/pillar-registry-schema.md
"""
import argparse
import json
import re
import sys
from datetime import date, datetime

TOP_REQUIRED = ["client", "client_record_id", "slug", "person", "organization",
                "version", "created_at", "reviewed_at", "approved_by", "cadence", "pillars"]
PILLAR_REQUIRED = ["id", "name", "tier", "definition", "in_scope", "out_of_scope",
                   "why_now", "key_terms", "proof_assets", "match", "status"]
# A primary pillar must answer a buyer question; a secondary one is allowed not to
# (that is usually why it's secondary).
PRIMARY_REQUIRED = ["buyer_questions"]
VALID_TIERS = {"primary", "secondary"}
VALID_STATUS = {"active", "paused", "retired"}
MAX_PRIMARY = 5
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def is_date(value):
    try:
        datetime.strptime(str(value), "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


def validate(doc, questions_doc=None):
    errors, warnings = [], []

    if not isinstance(doc, dict):
        return ["top level must be an object"], []

    for field in TOP_REQUIRED:
        if doc.get(field) in (None, "", [], {}):
            errors.append(f"missing required top-level field: {field}")

    if doc.get("slug") and not SLUG_RE.match(str(doc["slug"])):
        errors.append(f"slug '{doc['slug']}' must be lowercase-hyphen")
    if doc.get("version") is not None and not isinstance(doc["version"], int):
        errors.append("version must be an integer")
    for field in ("created_at", "reviewed_at"):
        if doc.get(field) and not is_date(doc[field]):
            errors.append(f"{field} must be YYYY-MM-DD")

    person = doc.get("person") or {}
    if isinstance(person, dict):
        for field in ("name", "role"):
            if not person.get(field):
                errors.append(f"person.{field} is required — pillars belong to a person, not a logo")
        if not person.get("linkedin_url"):
            warnings.append("person.linkedin_url is empty; the weekly monitor can't read their activity")

    cadence = doc.get("cadence") or {}
    if isinstance(cadence, dict):
        ppw = cadence.get("posts_per_week")
        if not isinstance(ppw, (int, float)) or ppw <= 0:
            errors.append("cadence.posts_per_week must be a positive number")
        elif ppw < 2:
            warnings.append(f"cadence.posts_per_week is {ppw}; methodology calls for 2–3 per pillar owner")

    pillars = doc.get("pillars")
    if not isinstance(pillars, list) or not pillars:
        errors.append("pillars must be a non-empty array")
        return errors, warnings

    seen_ids = set()
    primary = []
    question_ids = set()
    for index, pillar in enumerate(pillars):
        where = f"pillars[{index}]"
        if not isinstance(pillar, dict):
            errors.append(f"{where} must be an object")
            continue
        name = pillar.get("id") or where
        for field in PILLAR_REQUIRED:
            if pillar.get(field) in (None, "", [], {}):
                errors.append(f"{name}: missing required field '{field}'")

        pid = pillar.get("id")
        if pid:
            if not SLUG_RE.match(str(pid)):
                errors.append(f"{name}: id must be lowercase-hyphen")
            if pid in seen_ids:
                errors.append(f"duplicate pillar id '{pid}' — ids are the coverage history key")
            seen_ids.add(pid)

        tier = pillar.get("tier")
        if tier and tier not in VALID_TIERS:
            errors.append(f"{name}: tier must be one of {sorted(VALID_TIERS)}")
        status = pillar.get("status")
        if status and status not in VALID_STATUS:
            errors.append(f"{name}: status must be one of {sorted(VALID_STATUS)}")

        active = pillar.get("status", "active") != "retired"
        if tier == "primary" and active:
            primary.append(pillar)
            for field in PRIMARY_REQUIRED:
                if pillar.get(field) in (None, "", [], {}):
                    errors.append(f"{name}: primary pillar missing required field '{field}'")
            weight = pillar.get("weight")
            if not isinstance(weight, (int, float)):
                errors.append(f"{name}: primary pillar needs a numeric weight")
            elif not 0 < weight <= 1:
                errors.append(f"{name}: weight {weight} must be >0 and <=1")
        elif tier == "secondary" and pillar.get("weight"):
            warnings.append(f"{name}: secondary pillars should have weight 0")

        match = pillar.get("match") or {}
        if isinstance(match, dict):
            terms = match.get("terms") or []
            if not terms:
                errors.append(f"{name}: match.terms is required — coverage tagging depends on it")
            else:
                short = [t for t in terms if len(str(t).strip()) < 4]
                if short:
                    warnings.append(f"{name}: very short match terms {short} will over-tag; "
                                    "overbroad terms hide starvation")
        if not pillar.get("buyer_questions") and tier == "secondary":
            warnings.append(f"{name}: secondary pillar with no buyer_questions — fine, but it "
                            "won't be measured on the answer surface")
        question_ids.update(pillar.get("buyer_questions") or [])
        if not pillar.get("proof_assets"):
            warnings.append(f"{name}: no proof_assets — this pillar will produce generic content")
        key_terms = pillar.get("key_terms") or []
        if key_terms and len(key_terms) > 6:
            warnings.append(f"{name}: {len(key_terms)} key_terms; 3–6 keeps first lines focused")

    if len(primary) > MAX_PRIMARY:
        errors.append(f"{len(primary)} active primary pillars; the cap is {MAX_PRIMARY} "
                      "(narrowness is the mechanism)")
    if primary:
        total = sum(float(p.get("weight") or 0) for p in primary)
        if abs(total - 1.0) > 0.01:
            errors.append(f"primary weights sum to {total:.2f}; must sum to 1.00")

    if questions_doc is not None:
        known = {q.get("id") for q in (questions_doc.get("questions") or [])}
        unknown = sorted(q for q in question_ids if q not in known)
        if unknown:
            errors.append(f"pillars reference buyer question ids not in the question set: {unknown}")
        orphans = sorted(known - question_ids)
        if orphans:
            warnings.append(f"buyer questions no pillar answers: {orphans} — either a missing "
                            "pillar or a question we don't care about")

    if doc.get("reviewed_at") and is_date(doc["reviewed_at"]):
        age = (date.today() - datetime.strptime(doc["reviewed_at"], "%Y-%m-%d").date()).days
        interval = doc.get("refresh_interval_days", 90)
        if age > interval:
            warnings.append(f"reviewed_at is {age} days old (interval {interval}) — pillars-stale")

    return errors, warnings


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("path", help="path to pillars.json")
    ap.add_argument("--questions", help="buyer-questions.json, to cross-check question ids")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args(argv)

    try:
        with open(args.path, encoding="utf-8") as fh:
            doc = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        message = f"cannot read {args.path}: {exc}"
        print(json.dumps({"valid": False, "errors": [message]}) if args.json else f"error: {message}",
              file=sys.stderr)
        return 2

    questions_doc = None
    if args.questions:
        try:
            with open(args.questions, encoding="utf-8") as fh:
                questions_doc = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            print(f"error: cannot read {args.questions}: {exc}", file=sys.stderr)
            return 2

    errors, warnings = validate(doc, questions_doc)
    if args.json:
        print(json.dumps({"valid": not errors, "errors": errors, "warnings": warnings}, indent=2))
    else:
        for error in errors:
            print(f"ERROR   {error}")
        for warning in warnings:
            print(f"warning {warning}")
        if not errors:
            count = len([p for p in doc.get("pillars", [])
                         if p.get("tier") == "primary" and p.get("status", "active") != "retired"])
            print(f"OK — {doc.get('client')} · {count} primary pillar(s) · v{doc.get('version')}"
                  + (f" · {len(warnings)} warning(s)" if warnings else ""))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
