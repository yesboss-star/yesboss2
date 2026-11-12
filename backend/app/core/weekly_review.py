"""Weekly review (Phase 3): what was decided, what got done, what did not, and what the reports say.

Two scopes:
  company   owners only. Built from the company's shared captures (visibility org / members).
            Private captures and journals are never in it.
  personal  everyone, owners included. Built from what that person may read, including their own
            private captures (a journal is still left out), limited to what they own or wrote.

Every line carries its sources (the capture, the task, the report) so it can be checked.
The same review feeds the in-app page and the Monday email.
"""
import asyncio
import hashlib
import hmac
import logging
import time
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any
from zoneinfo import ZoneInfo

from .capture_access import company_query, visible_query
from .capture_metrics import format_value
from .commitments import evaluate
from .config import settings
from .oauth_state import _secret

logger = logging.getLogger("yesboss.weekly_review")

WINDOW = timedelta(days=7)
LOOKBACK = timedelta(days=60)  # older commitments stop appearing
MAX_ITEMS = 60
MAX_REPORT_ROWS = 30
UNSUBSCRIBE_MAX_AGE = 120 * 24 * 3600
IST = ZoneInfo("Asia/Kolkata")


# ---------------------------------------------------------------- building the review
def _label(capture: dict[str, Any] | None) -> str | None:
    """A short name for a capture: its title, or the start of its text."""
    if not capture:
        return None
    if capture.get("title"):
        return capture["title"]
    preview = " ".join((capture.get("preview") or "").split())
    return (preview[:57].rstrip() + "…") if len(preview) > 58 else (preview or None)


def _iso(value: Any) -> str | None:
    return value.isoformat() + "Z" if isinstance(value, datetime) else (value or None)


def _latest_evidence_at(item: dict[str, Any]) -> datetime | None:
    stamps = [e["at"] for e in item["evidence"] if isinstance(e.get("at"), datetime)]
    return max(stamps) if stamps else None


def _metric_groups(db, org_id: str, captures: dict[Any, dict]) -> dict[tuple, list[dict]]:
    """Every readable number, grouped by (series, metric, unit) and sorted oldest to newest."""
    ids = [cid for cid, c in captures.items() if c.get("kind") == "report"]
    groups: dict[tuple, list[dict]] = {}
    if not ids:
        return groups
    for m in db.report_metrics.find({"org_id": org_id, "capture_id": {"$in": ids}}):
        if m["metric"].endswith(" change"):
            continue  # a stated change is not a level to compare
        groups.setdefault((m.get("series_key") or "", m["metric"], m.get("unit", "")), []).append(m)
    for points in groups.values():
        points.sort(key=lambda p: (p["period_date"], p["at"]))
    return groups


TREND_MIN_POINTS = 3
TREND_MAX_POINTS = 8
MAX_TREND_ROWS = 20


def _trends(groups: dict[tuple, list[dict]], captures: dict[Any, dict]) -> list[dict[str, Any]]:
    """How each number has moved over its last few reports: the points, the current streak and,
    with four or more points, whether the latest is the highest or lowest of them."""
    rows = []
    for (series, metric, unit), points in groups.items():
        recent = points[-TREND_MAX_POINTS:]
        if len(recent) < TREND_MIN_POINTS:
            continue
        values = [p["value"] for p in recent]
        steps = [(b > a) - (b < a) for a, b in zip(values, values[1:])]  # +1 up, -1 down, 0 flat
        streak_dir, streak = steps[-1], 0
        for s in reversed(steps):
            if s != streak_dir:
                break
            streak += 1
        note = None
        if len(values) >= 4 and values[-1] == max(values) and values[-1] != values[0]:
            note = f"Highest of the last {len(values)} reports"
        elif len(values) >= 4 and values[-1] == min(values) and values[-1] != values[0]:
            note = f"Lowest of the last {len(values)} reports"
        elif streak >= 2 and streak_dir != 0:
            note = f"{'Up' if streak_dir > 0 else 'Down'} {streak} reports in a row"
        first = values[0]
        rows.append({
            "series": series or None, "metric": metric, "unit": unit, "note": note,
            "direction": "up" if streak_dir > 0 else "down" if streak_dir < 0 else "flat",
            "streak": streak if streak_dir else 0,
            "change_pct": ((values[-1] - first) / abs(first)) if first else None,
            "points": [{"period": p["period_date"], "value": p["value"], "display": format_value(p["value"], unit),
                        "capture": {"id": str(p["capture_id"]), "title": _label(captures.get(p["capture_id"]))}} for p in recent],
        })
    rows.sort(key=lambda r: (-(r["streak"]), r["metric"]))
    return rows[:MAX_TREND_ROWS]


def _report_changes(groups: dict[tuple, list[dict]], captures: dict[Any, dict], now: datetime) -> list[dict[str, Any]]:
    rows = []
    for (series, metric, unit), points in groups.items():
        if len(points) < 2 or points[-1]["at"] < now - WINDOW:
            continue  # nothing new this week, or nothing to compare with
        last, prev = points[-1], points[-2]
        change = last["value"] - prev["value"]
        pct = (change / abs(prev["value"])) if prev["value"] else None

        def end(p):
            cap = captures.get(p["capture_id"], {})
            return {"value": p["value"], "display": format_value(p["value"], unit), "period": p["period_date"],
                    "capture": {"id": str(p["capture_id"]), "title": _label(cap)}}

        rows.append({
            "series": series or None, "metric": metric, "unit": unit, "latest": end(last), "previous": end(prev),
            "change": change, "change_display": format_value(change, unit), "change_pct": pct,
            "direction": "up" if change > 0 else "down" if change < 0 else "flat",
        })
    rows.sort(key=lambda r: -abs(r["change_pct"] or 0))
    return rows[:MAX_REPORT_ROWS]


async def build_review(db, org_id: str, user, scope: str = "personal", now: datetime | None = None) -> dict[str, Any]:
    """The review for the last seven days. ``scope='company'`` is for owners (the caller checks)."""
    now = now or datetime.utcnow()
    start = now - WINDOW
    me = (getattr(user, "email", "") or "").strip().lower()
    uid = getattr(user, "uid", None) or getattr(user, "id", None)

    base = company_query(org_id) if scope == "company" else await visible_query(db, org_id, user)
    query = {"$and": [base, {"kind": {"$ne": "journal"}}]}
    captures = {c["_id"]: c for c in db.captures.find(query, {"title": 1, "preview": 1, "kind": 1, "user_id": 1, "created_at": 1}).limit(2000)}

    commitments = list(db.commitments.find({
        "org_id": org_id, "capture_id": {"$in": list(captures)}, "dropped": {"$ne": True},
        "created_at": {"$gte": now - LOOKBACK},
    }))
    if scope != "company":
        commitments = [c for c in commitments if c.get("owner_email") == me or captures[c["capture_id"]].get("user_id") == uid]

    members = {m["email"].lower(): m.get("full_name") for m in
               db.org_chart_members.find({"organization_id": org_id}, {"email": 1, "full_name": 1}) if m.get("email")}

    sections: dict[str, list[dict]] = {"done": [], "open": [], "missed": [], "no_evidence": []}
    decided = 0
    for item in evaluate(db, commitments, now):
        cap = captures[item["capture_id"]]
        decided_now = item["created_at"] >= start
        decided += decided_now
        if item["state"] == "done":
            when = _latest_evidence_at(item)
            if when is None or when < start:
                continue  # finished before this week: not news
        sections[item["state"]].append({
            "id": str(item["_id"]), "text": item["text"], "state": item["state"],
            "owner_email": item.get("owner_email"), "owner_name": members.get(item.get("owner_email") or ""),
            "due_date": item.get("due_date"), "decided_this_week": decided_now,
            "evidence": [{**e, "at": _iso(e.get("at"))} for e in item["evidence"]],
            "task": item["task"],
            "capture": {"id": str(cap["_id"]), "title": _label(cap), "kind": cap.get("kind")},
            "created_at": _iso(item["created_at"]),
        })
    for name in sections:
        sections[name].sort(key=lambda i: (i["due_date"] or "9999", i["created_at"] or ""))
        sections[name] = sections[name][:MAX_ITEMS]

    new_this_week: dict[str, int] = {}
    for c in captures.values():
        if isinstance(c.get("created_at"), datetime) and c["created_at"] >= start:
            new_this_week[c.get("kind", "note")] = new_this_week.get(c.get("kind", "note"), 0) + 1

    groups = _metric_groups(db, org_id, captures)
    reports = _report_changes(groups, captures, now)
    return {
        "scope": scope, "organization_id": org_id,
        "period": {"start": _iso(start), "end": _iso(now)},
        "generated_at": _iso(now),
        "counts": {"decided": decided, **{k: len(v) for k, v in sections.items()}, "report_changes": len(reports),
                   "new_captures": sum(new_this_week.values())},
        **sections,
        "reports": reports,
        "trends": _trends(groups, captures),
        "new_captures": new_this_week,
    }


def is_empty(review: dict[str, Any]) -> bool:
    c = review["counts"]
    return not any(c[k] for k in ("done", "open", "missed", "no_evidence", "report_changes", "decided"))


# ---------------------------------------------------------------- the unsubscribe link
def _sign(uid: str, issued: int) -> str:
    return hmac.new(_secret(), f"weekly-review-unsubscribe:{uid}:{issued}".encode(), hashlib.sha256).hexdigest()


def sign_unsubscribe(uid: str, now: float | None = None) -> str:
    issued = int(now if now is not None else time.time())
    return f"{uid}:{issued}:{_sign(uid, issued)}"


def verify_unsubscribe(token: str | None, now: float | None = None) -> str | None:
    """The uid behind a genuine, unexpired unsubscribe token, else None."""
    if not token:
        return None
    try:
        uid, issued_raw, sig = token.rsplit(":", 2)
        issued = int(issued_raw)
    except ValueError:
        return None
    if not uid or not hmac.compare_digest(sig, _sign(uid, issued)):
        return None
    current = now if now is not None else time.time()
    return uid if -60 <= current - issued <= UNSUBSCRIBE_MAX_AGE else None


def wants_email(db, uid: str | None) -> bool:
    row = db.users.find_one({"uid": uid}, {"weekly_review_email": 1}) if uid else None
    return bool(row) and row.get("weekly_review_email", True) is not False


# ---------------------------------------------------------------- the email
def _api_base() -> str:
    return (getattr(settings, "API_URL", "") or "http://127.0.0.1:8000/api/v1").rstrip("/")


def _app_link() -> str:
    return f"{(getattr(settings, 'FRONTEND_URL', '') or 'http://localhost:3000').rstrip('/')}/dashboard/review"


def review_email_lines(review: dict[str, Any]) -> list[tuple[str, list[str]]]:
    """Plain-text sections shared by the HTML and text versions of the email."""
    def who(i):
        return i["owner_name"] or (i["owner_email"] or "").split("@")[0] or "someone"

    sections: list[tuple[str, list[str]]] = []
    if review["done"]:
        sections.append(("Done this week", [
            f"{i['text']} ({who(i)}) - {i['evidence'][0]['note'] if i['evidence'] else ''}" for i in review["done"][:10]]))
    if review["missed"]:
        sections.append(("Missed", [f"{i['text']} ({who(i)}), was due {(i['due_date'] or '')[:10]}" for i in review["missed"][:10]]))
    if review["open"]:
        sections.append(("Still open", [
            f"{i['text']} ({who(i)})" + (f", due {i['due_date'][:10]}" if i["due_date"] else "") for i in review["open"][:10]]))
    if review["no_evidence"]:
        sections.append(("No evidence either way", [f"{i['text']} ({who(i)})" for i in review["no_evidence"][:10]]))
    if review["reports"]:
        sections.append(("What the reports say", [
            f"{r['metric'].capitalize()}: {r['previous']['display']} -> {r['latest']['display']}"
            + (f" ({r['change_pct']:+.0%})" if r["change_pct"] is not None else "") for r in review["reports"][:10]]))
    return sections


def send_review_email(to_email: str, name: str, review: dict[str, Any], uid: str) -> bool:
    from .email_service import send_weekly_review_email

    unsubscribe = f"{_api_base()}/weekly-review/unsubscribe?token={sign_unsubscribe(uid)}"
    return send_weekly_review_email(to_email, name, review["scope"], review_email_lines(review), review["counts"],
                                    _app_link(), unsubscribe)


async def email_review_to(db, org_id: str, user, scope: str) -> dict[str, Any]:
    """Build and send one person's review. Returns what happened (no claim, no schedule check)."""
    from .email_service import is_email_configured

    if not is_email_configured():
        return {"sent": False, "reason": "Email is not configured on this server."}
    review = await build_review(db, org_id, user, scope)
    if is_empty(review):
        return {"sent": False, "reason": "Nothing to report yet."}
    row = db.users.find_one({"uid": user.uid}, {"full_name": 1}) or {}
    ok = await asyncio.to_thread(send_review_email, user.email, row.get("full_name") or user.email.split("@")[0], review, user.uid)
    return {"sent": ok, "reason": None if ok else "The email could not be sent."}


# ---------------------------------------------------------------- the Monday job
def week_key(now_ist: datetime) -> str:
    iso = now_ist.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def _recipients(db, org: dict[str, Any]) -> list[tuple[SimpleNamespace, bool]]:
    """(user, is_owner) for everyone in the organization who has an account."""
    org_id = str(org["_id"])
    owner_ids = {org.get("owner_id"), *(org.get("co_owners") or [])} - {None}
    emails = {m["email"].strip().lower() for m in db.org_chart_members.find({"organization_id": org_id}, {"email": 1}) if m.get("email")}
    people: dict[str, SimpleNamespace] = {}
    for u in db.users.find({"$or": [{"uid": {"$in": list(owner_ids)}}, {"email": {"$in": list(emails)}}]}, {"uid": 1, "email": 1}):
        if u.get("uid") and u.get("email"):
            people[u["uid"]] = SimpleNamespace(id=u["uid"], uid=u["uid"], email=u["email"].strip().lower())
    return [(p, p.uid in owner_ids) for p in people.values()]


async def send_weekly_reviews(db, now_utc: datetime | None = None, force: bool = False) -> dict[str, int]:
    """Monday 08:00-08:59 IST: email each person their review, once per week, unless they opted out.

    The claim in ``weekly_review_sent`` makes this safe to run more than once (two workers, two
    hourly ticks, a second scheduler): whoever claims a person's week first sends it."""
    from .email_service import is_email_configured

    now_ist = (now_utc or datetime.utcnow()).replace(tzinfo=ZoneInfo("UTC")).astimezone(IST)
    result = {"sent": 0, "skipped": 0, "opted_out": 0}
    if not force and not (now_ist.weekday() == 0 and now_ist.hour == 8):
        return result
    if not is_email_configured():
        logger.info("Weekly review emails skipped: SMTP is not configured")
        return result

    week = week_key(now_ist)
    for org in db.organizations.find({}):
        org_id = str(org["_id"])
        for user, owner in _recipients(db, org):
            if not wants_email(db, user.uid):
                result["opted_out"] += 1
                continue
            try:
                review = await build_review(db, org_id, user, "company" if owner else "personal")
                if is_empty(review):
                    result["skipped"] += 1
                    continue
                claim = db.weekly_review_sent.update_one(
                    {"org_id": org_id, "email": user.email, "week": week},
                    {"$setOnInsert": {"claimed_at": datetime.utcnow()}}, upsert=True)
                if claim.upserted_id is None:
                    result["skipped"] += 1  # already sent (or being sent) this week
                    continue
                row = db.users.find_one({"uid": user.uid}, {"full_name": 1}) or {}
                ok = await asyncio.to_thread(send_review_email, user.email, row.get("full_name") or user.email.split("@")[0], review, user.uid)
                if ok:
                    result["sent"] += 1
                else:  # free the claim so the next hourly tick can try again
                    db.weekly_review_sent.delete_one({"_id": claim.upserted_id})
            except Exception:
                logger.exception("Weekly review failed for %s in %s", user.email, org_id)
    logger.info("Weekly reviews: %s", result)
    return result
