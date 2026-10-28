"""Journal intelligence: entry analysis, search, mood insights, ideas, recaps,
"ask my journal", pattern detection and contextual reminders.

Everything here is scoped to a single author (`user_id`). Statistics (counts,
co-occurrence) are computed in code; the AI only reads, summarises and phrases.
"""

import asyncio
import json
import logging
import re
import uuid
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from .ai_client import get_ai_response

logger = logging.getLogger("yesboss.journal_intel")

IST = ZoneInfo("Asia/Kolkata")
COLLECTION = "journal_entries"
ENTRY_KINDS = ("idea", "frustration", "decision", "concern", "goal", "opportunity", "reflection")
TRIGGERS = ("team", "money", "workload", "customers", "uncertainty")
IDEA_STATUSES = ("thought", "exploring", "experiment", "implemented", "dropped")

_STOP = set(
    "the a an and or of to in on for with is are was were be been it this that i my me we our you your at by from as "
    "but have has had do does did not no so if then than too very can will just about what when how why which who "
    "mera meri mere hai hain ho tha thi ka ki ke ko se mein par aur kya".split()
)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def parse_json_loose(text: str | None) -> dict | None:
    """Parse the first JSON object in an AI reply (tolerates fences and chatter)."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?", "", t).strip()
        t = re.sub(r"```$", "", t).strip()
    m = re.search(r"\{.*\}", t, re.DOTALL)
    if not m:
        return None
    try:
        value = json.loads(m.group(0))
    except Exception:
        return None
    return value if isinstance(value, dict) else None


def _clamp(value: Any, lo: int = 1, hi: int = 5) -> int | None:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        return None
    return max(lo, min(hi, number))


def _strs(value: Any, limit: int = 6, maxlen: int = 180) -> list[str]:
    if isinstance(value, str):
        value = [value]
    out: list[str] = []
    for item in value or []:
        text = str(item.get("text") if isinstance(item, dict) else item or "").strip()
        if text and text not in out:
            out.append(text[:maxlen])
        if len(out) >= limit:
            break
    return out


def _as_utc(dt: Any) -> datetime:
    if isinstance(dt, datetime):
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    return datetime.now(UTC)


def day_ist(dt: Any) -> str:
    return _as_utc(dt).astimezone(IST).strftime("%Y-%m-%d")


def entry_text(entry: dict[str, Any], limit: int = 3000) -> str:
    """The author's own words for an entry (user chat turns, else content)."""
    msgs = entry.get("messages") or []
    user_parts = [str(m.get("content") or "").strip() for m in msgs if m.get("role") == "user"]
    text = "\n".join(p for p in user_parts if p) or str(entry.get("content") or "")
    return text.strip()[:limit]


def _snippet(entry: dict[str, Any], n: int = 160) -> str:
    analysis = entry.get("ai_analysis") or {}
    text = analysis.get("summary") or entry_text(entry, 400)
    return text[:n]


def public_entry(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "entry_id": str(entry.get("_id")),
        "session_id": entry.get("session_id"),
        "date": day_ist(entry.get("created_at")),
        "snippet": _snippet(entry),
        "kind": (entry.get("ai_analysis") or {}).get("kind"),
    }


def _norm_theme(value: Any) -> str:
    text = re.sub(r"[^\w\s-]", " ", str(value or "").lower())
    return re.sub(r"\s+", " ", text).strip()[:60]


def _tokens(query: str) -> list[str]:
    return [w for w in re.findall(r"\w+", (query or "").lower()) if len(w) > 2 and w not in _STOP]


# ---------------------------------------------------------------------------
# 1) Entry analysis (AI Journal Intelligence)
# ---------------------------------------------------------------------------

ANALYSIS_SYSTEM = """You analyse a business owner's private journal entry. Return ONLY a JSON object:
{
  "kind": "idea|frustration|decision|concern|goal|opportunity|reflection",
  "summary": "one or two plain sentences",
  "takeaways": ["up to 4 short key takeaways"],
  "entities": {"people": [], "projects": [], "deadlines": [], "problems": ["business problems mentioned, 2-6 words each"]},
  "hypotheses": ["possible explanations the writer suggested or implied, phrased as hypotheses that need validation"],
  "follow_up_questions": ["up to 3 short, useful questions the writer could explore next"],
  "themes": ["2-4 short lowercase topic tags, e.g. 'sales decline', 'delegation'"],
  "signals": {"mood": 1-5 or null, "energy": 1-5 or null, "stress": 1-5 or null, "confidence": 1-5 or null,
              "triggers": ["only from: team, money, workload, customers, uncertainty"]},
  "category": "product|operations|sales|marketing|hr|finance|strategy|general",
  "actionable_items": [{"text": "specific next action", "priority": "high|medium|low"}],
  "suggested_goal_titles": []
}
Rules:
- Use only what the writer said; never invent names, numbers or dates.
- If a signal is not evident, use null. Signals are estimates from text, not facts.
- Hypotheses are NOT conclusions; keep them tentative.
- Write in the same language as the entry (English, Hindi or Hinglish)."""


def normalize_analysis(raw: dict[str, Any]) -> dict[str, Any]:
    kind = str(raw.get("kind") or "reflection").lower()
    if kind not in ENTRY_KINDS:
        kind = "reflection"
    entities = raw.get("entities") if isinstance(raw.get("entities"), dict) else {}
    signals = raw.get("signals") if isinstance(raw.get("signals"), dict) else {}
    triggers = [t for t in _strs(signals.get("triggers"), 5, 20) if t.lower() in TRIGGERS]
    actions = []
    for item in raw.get("actionable_items") or []:
        if isinstance(item, dict) and str(item.get("text") or "").strip():
            priority = str(item.get("priority") or "medium").lower()
            actions.append({"text": str(item["text"]).strip()[:200], "priority": priority if priority in ("high", "medium", "low") else "medium"})
    return {
        "kind": kind,
        "summary": str(raw.get("summary") or "").strip()[:400],
        "takeaways": _strs(raw.get("takeaways"), 4),
        "entities": {
            "people": _strs(entities.get("people"), 8, 60),
            "projects": _strs(entities.get("projects"), 8, 80),
            "deadlines": _strs(entities.get("deadlines"), 6, 60),
            "problems": _strs(entities.get("problems"), 6, 80),
        },
        "hypotheses": _strs(raw.get("hypotheses"), 4),
        "follow_up_questions": _strs(raw.get("follow_up_questions"), 3),
        "themes": [t for t in (_norm_theme(x) for x in _strs(raw.get("themes"), 4, 60)) if t],
        "signals": {
            "mood": _clamp(signals.get("mood")),
            "energy": _clamp(signals.get("energy")),
            "stress": _clamp(signals.get("stress")),
            "confidence": _clamp(signals.get("confidence")),
            "triggers": [t.lower() for t in triggers],
            "inferred": True,
        },
        "category": str(raw.get("category") or "general").lower(),
        "actionable_items": actions[:5],
        "suggested_goal_titles": _strs(raw.get("suggested_goal_titles"), 4, 120),
        "analysis_version": 2,
    }


async def analyze_content(content: str, entry_type: str = "journal") -> dict[str, Any] | None:
    text = (content or "").strip()
    if not text:
        return None
    try:
        raw = await get_ai_response(
            f"Entry type: {entry_type}\n\nEntry:\n{text[:4000]}",
            ANALYSIS_SYSTEM,
            temperature=0.2,
            max_tokens=1100,
        )
    except Exception as e:
        logger.warning("journal analysis call failed: %s", e)
        return None
    parsed = parse_json_loose(raw)
    if not parsed:
        logger.warning("journal analysis returned unparseable output")
        return None
    analysis = normalize_analysis(parsed)
    analysis["analyzed_at"] = datetime.utcnow().isoformat()
    return analysis


# ---------------------------------------------------------------------------
# 2) Search / embeddings (Qdrant with a keyword fallback)
# ---------------------------------------------------------------------------

def _index_entry_sync(entry: dict[str, Any]) -> bool:
    from qdrant_client.models import PointStruct

    from .qdrant import create_collection, get_embedding, get_qdrant_client

    text = f"{(entry.get('ai_analysis') or {}).get('summary', '')}\n{entry_text(entry)}".strip()
    if not text:
        return False
    if not create_collection(COLLECTION):
        return False
    client = get_qdrant_client()
    if client is None:
        return False
    created = _as_utc(entry.get("created_at"))
    client.upsert(
        collection_name=COLLECTION,
        points=[PointStruct(
            id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"journal:{entry['_id']}")),
            vector=get_embedding(text),
            payload={
                "entry_id": str(entry["_id"]),
                "user_id": entry.get("user_id"),
                "org_id": entry.get("org_id"),
                "ts": created.timestamp(),
                "kind": (entry.get("ai_analysis") or {}).get("kind"),
            },
        )],
    )
    return True


async def index_entry(entry: dict[str, Any]) -> bool:
    try:
        return await asyncio.to_thread(_index_entry_sync, entry)
    except Exception as e:
        logger.warning("journal entry indexing failed: %s", e)
        return False


def _semantic_search_sync(user_id: str, org_id: str, query: str, k: int, since: datetime | None, until: datetime | None) -> list[dict[str, Any]]:
    from qdrant_client.models import FieldCondition, Filter, Match, Range

    from .qdrant import get_embedding, get_qdrant_client

    client = get_qdrant_client()
    if client is None:
        return []
    conds = [FieldCondition(key="user_id", match=Match(value=user_id)), FieldCondition(key="org_id", match=Match(value=org_id))]
    if since or until:
        conds.append(FieldCondition(key="ts", range=Range(
            gte=_as_utc(since).timestamp() if since else None,
            lte=_as_utc(until).timestamp() if until else None,
        )))
    results = client.search(
        collection_name=COLLECTION,
        query_vector=get_embedding(query),
        limit=k,
        query_filter=Filter(must=conds),
        with_payload=True,
    )
    return [{"entry_id": r.payload.get("entry_id"), "score": float(r.score)} for r in results if r.payload]


def _keyword_rank(entries: list[dict[str, Any]], query: str, k: int) -> list[dict[str, Any]]:
    tokens = _tokens(query)
    scored: list[tuple[float, dict[str, Any]]] = []
    for e in entries:
        a = e.get("ai_analysis") or {}
        blob = " ".join([entry_text(e), a.get("summary", ""), " ".join(a.get("takeaways", [])), " ".join(a.get("themes", []))]).lower()
        score = sum(blob.count(t) for t in tokens) if tokens else 0
        if score:
            scored.append((score, e))
    scored.sort(key=lambda p: (p[0], _as_utc(p[1].get("created_at"))), reverse=True)
    return [e for _, e in scored[:k]]


async def search_entries(
    db, user_id: str, org_id: str, query: str, k: int = 6,
    since: datetime | None = None, until: datetime | None = None,
    exclude_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Hybrid search over the author's own entries. Returns entries with `_score` when semantic."""
    from bson import ObjectId

    exclude_ids = exclude_ids or set()
    base: dict[str, Any] = {"user_id": user_id, "org_id": org_id}
    if since or until:
        base["created_at"] = {k_: v for k_, v in (("$gte", since), ("$lte", until)) if v}

    hits: list[dict[str, Any]] = []
    try:
        hits = await asyncio.to_thread(_semantic_search_sync, user_id, org_id, query, k + len(exclude_ids), since, until)
    except Exception as e:
        logger.info("semantic journal search unavailable: %s", e)

    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    ids = [h["entry_id"] for h in hits if h.get("entry_id") and h["entry_id"] not in exclude_ids]
    if ids:
        scores = {h["entry_id"]: h["score"] for h in hits}
        docs = {str(d["_id"]): d for d in db.journal_entries.find({**base, "_id": {"$in": [ObjectId(i) for i in ids]}})}
        for i in ids:
            if i in docs and i not in seen:
                docs[i]["_score"] = scores.get(i)
                result.append(docs[i])
                seen.add(i)

    recent = list(db.journal_entries.find(base).sort("created_at", -1).limit(300))
    for e in _keyword_rank(recent, query, k):
        sid = str(e["_id"])
        if sid not in seen and sid not in exclude_ids:
            result.append(e)
            seen.add(sid)
    return result[:k]


# ---------------------------------------------------------------------------
# 3) Ideas (vault + connection engine)
# ---------------------------------------------------------------------------

def _goal_overlap(db, org_id: str, text: str) -> list[str]:
    tokens = set(_tokens(text))
    ids: list[str] = []
    try:
        for g in db.goals.find({"organization_id": org_id, "status": {"$nin": ["completed", "cancelled"]}}, {"title": 1}).limit(80):
            shared = tokens & set(_tokens(g.get("title", "")))
            if len(shared) >= 2:
                ids.append(str(g["_id"]))
    except Exception as e:
        logger.info("goal overlap lookup failed: %s", e)
    return ids[:3]


async def sync_idea(db, entry: dict[str, Any], analysis: dict[str, Any]) -> dict[str, Any] | None:
    """Create/refresh the vault record for an idea/opportunity entry and connect it to older entries."""
    if analysis.get("kind") not in ("idea", "opportunity"):
        return None
    uid, org = entry.get("user_id"), entry.get("org_id")
    entry_id = str(entry["_id"])
    related = await search_entries(db, uid, org, f"{analysis.get('summary', '')} {entry_text(entry, 500)}", k=3, exclude_ids={entry_id})
    connections = []
    duplicate_of = None
    for rel in related:
        score = rel.get("_score")
        relation = "duplicate" if score is not None and score >= 0.9 else "related"
        if relation == "duplicate" and duplicate_of is None:
            duplicate_of = str(rel["_id"])
        info = public_entry(rel)
        info["relation"] = relation
        connections.append(info)
    note = None
    if connections:
        first = connections[0]
        note = f'You wrote about "{first["snippet"][:90]}" on {first["date"]}. This idea may be connected.'
    now = datetime.utcnow()
    fields = {
        "title": (analysis.get("summary") or entry_text(entry, 80))[:120],
        "summary": analysis.get("summary", ""),
        "category": analysis.get("category", "general"),
        "themes": analysis.get("themes", []),
        "connections": connections,
        "connection_note": note,
        "duplicate_of": duplicate_of,
        "links.goal_ids": _goal_overlap(db, org, f"{analysis.get('summary', '')} {' '.join(analysis.get('themes', []))}"),
        "updated_at": now,
    }
    db.journal_ideas.update_one(
        {"user_id": uid, "entry_id": entry_id},
        {"$set": fields, "$setOnInsert": {"user_id": uid, "org_id": org, "entry_id": entry_id, "status": "thought", "created_at": entry.get("created_at") or now, "links.task_ids": [], "links.problem": ""}},
        upsert=True,
    )
    return db.journal_ideas.find_one({"user_id": uid, "entry_id": entry_id})


# ---------------------------------------------------------------------------
# 4) Mood, energy and stress insights
# ---------------------------------------------------------------------------

def compute_mood_insights(checkins: list[dict[str, Any]], entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Daily series, weekly averages and *possible* trigger patterns (never causal claims)."""
    days: dict[str, dict[str, Any]] = {}

    def bucket(day: str) -> dict[str, Any]:
        return days.setdefault(day, {"vals": defaultdict(list), "triggers": set(), "source": "inferred"})

    for e in entries:
        signals = (e.get("ai_analysis") or {}).get("signals") or {}
        b = bucket(day_ist(e.get("created_at")))
        for key in ("mood", "energy", "stress", "confidence"):
            if signals.get(key) is not None:
                b["vals"][key].append(signals[key])
        b["triggers"].update(signals.get("triggers") or [])
        b["triggers"].update(_norm_theme(p) for p in ((e.get("ai_analysis") or {}).get("entities") or {}).get("problems", []))
    for c in checkins:
        b = bucket(str(c.get("date")))
        b["source"] = "checkin"
        b["vals"] = defaultdict(list, {k: [c[k]] for k in ("mood", "energy", "stress", "confidence") if c.get(k) is not None})
        b["triggers"].update(c.get("reasons") or [])

    series = []
    for day in sorted(days):
        b = days[day]
        row: dict[str, Any] = {"date": day, "source": b["source"], "triggers": sorted(t for t in b["triggers"] if t)}
        for key in ("mood", "energy", "stress", "confidence"):
            vals = b["vals"].get(key) or []
            row[key] = round(sum(vals) / len(vals), 1) if vals else None
        series.append(row)

    weekly: dict[str, dict[str, list[float]]] = {}
    for row in series:
        d = datetime.strptime(row["date"], "%Y-%m-%d")
        week = (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")
        w = weekly.setdefault(week, defaultdict(list))
        w["n"].append(1)
        for key in ("mood", "energy", "stress", "confidence"):
            if row[key] is not None:
                w[key].append(row[key])
    weekly_rows = [
        {"week_start": week, "days": len(v["n"]), **{k: (round(sum(v[k]) / len(v[k]), 1) if v.get(k) else None) for k in ("mood", "energy", "stress", "confidence")}}
        for week, v in sorted(weekly.items())
    ]

    trigger_days: Counter[str] = Counter()
    high_stress: dict[str, list[str]] = defaultdict(list)
    for row in series:
        for t in row["triggers"]:
            trigger_days[t] += 1
            if row["stress"] is not None and row["stress"] >= 4:
                high_stress[t].append(row["date"])
    patterns = []
    for t, dates in sorted(high_stress.items(), key=lambda p: -len(p[1])):
        if len(dates) >= 2:
            label = f"'{t}' was a factor" if t in TRIGGERS else f'you mentioned "{t}"'
            patterns.append({
                "trigger": t,
                "count": len(dates),
                "dates": dates[-6:],
                "text": f"You reported high stress on {len(dates)} days when {label}. This may be a pattern, not a proven cause.",
            })
    return {
        "series": series,
        "weekly": weekly_rows,
        "top_triggers": [{"trigger": t, "days": n} for t, n in trigger_days.most_common(6)],
        "patterns": patterns[:5],
    }


# ---------------------------------------------------------------------------
# 5) Recaps
# ---------------------------------------------------------------------------

RECAP_SYSTEM = {
    "daily": """You write a short daily recap of a founder's private journal. Return ONLY JSON:
{"on_your_mind":[{"text":"","refs":[1]}],"moved_forward":[...],"unresolved":[...],"tomorrow":[...]}
Each list has 1-4 short items. "refs" are the [E#] numbers of entries that support the item.
Use only the given entries; never invent facts. Same language as the entries.""",
    "weekly": """You write a weekly recap of a founder's private journal. Return ONLY JSON:
{"wins":[{"text":"","refs":[1]}],"recurring_frustrations":[...],"decisions_made":[...],"incomplete_actions":[...],"emerging_ideas":[...],"repeated_concerns":[...],"next_week_priorities":[exactly 3 items]}
Each list has 1-4 short items; "refs" are the [E#] numbers of supporting entries.
Use only the given entries; never invent facts. Same language as the entries.""",
}
RECAP_LABELS = {
    "on_your_mind": "What occupied your mind", "moved_forward": "What moved forward", "unresolved": "What remains unresolved",
    "tomorrow": "What deserves attention tomorrow", "wins": "Biggest wins", "recurring_frustrations": "Recurring frustrations",
    "decisions_made": "Decisions made", "incomplete_actions": "Actions left incomplete", "emerging_ideas": "Emerging ideas",
    "repeated_concerns": "Repeated concerns", "next_week_priorities": "Suggested priorities for next week",
}


def recap_range(period: str, now: datetime | None = None) -> tuple[datetime, datetime, str]:
    now_ist = (now or datetime.now(UTC)).astimezone(IST)
    if period == "weekly":
        start = (now_ist - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
        key = f"{start.strftime('%Y-%m-%d')}..{now_ist.strftime('%Y-%m-%d')}"
    else:
        start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        key = start.strftime("%Y-%m-%d")
    return start.astimezone(UTC).replace(tzinfo=None), now_ist.astimezone(UTC).replace(tzinfo=None), key


async def build_recap(db, user_id: str, org_id: str, period: str = "daily", now: datetime | None = None) -> dict[str, Any] | None:
    period = "weekly" if period == "weekly" else "daily"
    start, end, key = recap_range(period, now)
    entries = list(db.journal_entries.find({"user_id": user_id, "org_id": org_id, "created_at": {"$gte": start, "$lte": end}}).sort("created_at", 1).limit(40))
    updated = list(db.journal_entries.find({"user_id": user_id, "org_id": org_id, "updated_at": {"$gte": start, "$lte": end}, "created_at": {"$lt": start}}).limit(10))
    entries = entries + [e for e in updated if e not in entries]
    if not entries:
        return None
    lines = [f"[E{i}] {day_ist(e.get('created_at'))} ({(e.get('ai_analysis') or {}).get('kind', 'entry')}): {_snippet(e, 280)}" for i, e in enumerate(entries, 1)]
    extras = []
    decisions = list(db.journal_decisions.find({"user_id": user_id, "org_id": org_id, "created_at": {"$gte": start, "$lte": end}}).limit(8))
    if decisions:
        extras.append("Decisions logged: " + "; ".join(d.get("question", "")[:80] for d in decisions))
    sections: dict[str, list[dict[str, Any]]] = {}
    try:
        raw = await get_ai_response("\n".join(lines + extras), RECAP_SYSTEM[period], temperature=0.3, max_tokens=1200)
        parsed = parse_json_loose(raw) or {}
        for name in RECAP_LABELS:
            items = []
            for item in parsed.get(name) or []:
                text = str(item.get("text") if isinstance(item, dict) else item or "").strip()
                if not text:
                    continue
                refs = [r for r in (item.get("refs") if isinstance(item, dict) else []) if isinstance(r, int) and 1 <= r <= len(entries)]
                items.append({"text": text[:240], "entry_ids": [str(entries[r - 1]["_id"]) for r in refs]})
            if items:
                sections[name] = items[:4]
    except Exception as e:
        logger.warning("recap generation failed: %s", e)
    if not sections:
        first = "on_your_mind" if period == "daily" else "repeated_concerns"
        sections[first] = [{"text": _snippet(e, 200), "entry_ids": [str(e["_id"])]} for e in entries[:4]]
    doc = {
        "user_id": user_id, "org_id": org_id, "period": period, "range_key": key,
        "sections": sections,
        "sources": [public_entry(e) for e in entries],
        "created_at": datetime.utcnow(),
    }
    db.journal_recaps.update_one({"user_id": user_id, "period": period, "range_key": key}, {"$set": doc}, upsert=True)
    return doc


# ---------------------------------------------------------------------------
# 6) Talk to your past self
# ---------------------------------------------------------------------------

_WINDOWS = [
    (r"\b(last|past|pichle|pichhle)\s+(3|three)\s+months?\b", 90),
    (r"\b(last|past|pichle|pichhle)\s+month\b|\bpichle\s+mahine\b|\bthis\s+month\b|\bis\s+mahine\b", 31),
    (r"\b(last|past)\s+week\b|\bpichle\s+hafte\b|\bthis\s+week\b|\bis\s+hafte\b", 8),
    (r"\byesterday\b", 2),
]


def detect_window(question: str, now: datetime | None = None) -> tuple[datetime | None, datetime | None]:
    """Map phrases like 'last month' to a (since, until) range; (None, None) when no time phrase."""
    now = now or datetime.utcnow()
    q = (question or "").lower()
    for pattern, days_back in _WINDOWS:
        if re.search(pattern, q):
            return now - timedelta(days=days_back), None
    return None, None


ASK_SYSTEM = """You answer a founder's question about THEIR OWN past journal entries.
You get numbered entries like [E1] date: text. Return ONLY JSON:
{"answer":"2-5 short sentences","cited":[1,2]}
Rules:
- Use only the entries and idea list provided; never invent. If they do not cover the question, say so briefly.
- Mention dates when helpful. Put the entry numbers you relied on in "cited".
- Notice repeated themes but present them as possibilities, not facts about the person.
- Reply in the language of the question."""


async def ask_journal(db, user_id: str, org_id: str, question: str) -> dict[str, Any]:
    since, until = detect_window(question)
    entries = await search_entries(db, user_id, org_id, question, k=8, since=since, until=until)
    if len(entries) < 4:
        base: dict[str, Any] = {"user_id": user_id, "org_id": org_id}
        if since or until:
            base["created_at"] = {k: v for k, v in (("$gte", since), ("$lte", until)) if v}
        have = {str(e["_id"]) for e in entries}
        for e in db.journal_entries.find(base).sort("created_at", -1).limit(8):
            if str(e["_id"]) not in have and len(entries) < 8:
                entries.append(e)
    if not entries:
        return {"answer": "I couldn't find any journal entries to answer that yet.", "citations": []}
    lines = [f"[E{i}] {day_ist(e.get('created_at'))} ({(e.get('ai_analysis') or {}).get('kind', 'entry')}): {entry_text(e, 450)}" for i, e in enumerate(entries, 1)]
    extra = ""
    if re.search(r"\bideas?\b|\bacted\b|\bnever\b", question.lower()):
        ideas = list(db.journal_ideas.find({"user_id": user_id, "org_id": org_id}).sort("created_at", -1).limit(15))
        if ideas:
            extra = "\n\nIdea vault (status):\n" + "\n".join(f"- {i.get('title', '')[:90]} [{i.get('status')}] ({day_ist(i.get('created_at'))})" for i in ideas)
    try:
        raw = await get_ai_response("\n".join(lines) + extra + f"\n\nQuestion: {question}", ASK_SYSTEM, temperature=0.3, max_tokens=700)
    except Exception as e:
        logger.warning("ask_journal failed: %s", e)
        return {"answer": "I couldn't read your journal just now. Please try again.", "citations": []}
    parsed = parse_json_loose(raw)
    answer = str((parsed or {}).get("answer") or "").strip() or (raw or "").strip()[:600]
    cited = [c for c in ((parsed or {}).get("cited") or []) if isinstance(c, int) and 1 <= c <= len(entries)]
    citations = [public_entry(entries[c - 1]) for c in dict.fromkeys(cited)] or [public_entry(e) for e in entries[:3]]
    return {"answer": answer, "citations": citations}


# ---------------------------------------------------------------------------
# 7) Founder pattern detection
# ---------------------------------------------------------------------------

def detect_patterns(entries: list[dict[str, Any]], ideas: list[dict[str, Any]], now: datetime | None = None) -> list[dict[str, Any]]:
    """Recurring themes, postponed goals, uncertainty topics and stalled ideas (counts computed in code)."""
    now = now or datetime.utcnow()
    themes: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for e in entries:
        a = e.get("ai_analysis") or {}
        keys = set(a.get("themes") or []) | {_norm_theme(p) for p in (a.get("entities") or {}).get("problems", [])}
        for t in keys:
            if t:
                themes[t].append(e)
    found: list[dict[str, Any]] = []
    for theme, es in themes.items():
        days = {day_ist(e.get("created_at")) for e in es}
        if len(es) < 3 or len(days) < 2:
            continue
        ids = [str(e["_id"]) for e in es]
        goals = [e for e in es if (e.get("ai_analysis") or {}).get("kind") == "goal"]
        uncertain = [
            e for e in es
            if ((e.get("ai_analysis") or {}).get("signals") or {}).get("confidence") in (1, 2)
            or ((e.get("ai_analysis") or {}).get("signals") or {}).get("stress") in (4, 5)
        ]
        span = (max(_as_utc(e.get("created_at")) for e in es) - min(_as_utc(e.get("created_at")) for e in es)).days + 1
        if len(goals) >= 3:
            kind, text = "postponed_goal", f'The goal "{theme}" came up in {len(goals)} entries without visible progress. Would you like to look at what is blocking it?'
        elif len(uncertain) >= 3:
            kind, text = "uncertainty_topic", f'"{theme}" appeared in {len(uncertain)} entries alongside low confidence or high stress. Would you like to explore it?'
        else:
            kind, text = "recurring_theme", f'You\'ve mentioned "{theme}" in {len(es)} entries over {span} days. Would you like to explore the pattern?'
        found.append({"key": f"{kind}:{theme}", "type": kind, "theme": theme, "count": len(es), "entry_ids": ids[-8:], "text": text})
    stalled = [i for i in ideas if i.get("status") == "thought" and (now - _as_utc(i.get("created_at")).replace(tzinfo=None)).days >= 14]
    if len(stalled) >= 3:
        found.append({
            "key": "stalled_ideas:vault", "type": "stalled_ideas", "theme": "ideas not acted on", "count": len(stalled),
            "entry_ids": [str(i.get("entry_id")) for i in stalled[:8]],
            "text": f"{len(stalled)} ideas have stayed at the 'thought' stage for over two weeks. Want to pick one to try?",
        })
    found.sort(key=lambda p: -p["count"])
    return found[:8]


def refresh_patterns(db, user_id: str, org_id: str) -> list[dict[str, Any]]:
    since = datetime.utcnow() - timedelta(days=90)
    entries = list(db.journal_entries.find({"user_id": user_id, "org_id": org_id, "created_at": {"$gte": since}, "ai_analysis": {"$ne": None}}).limit(400))
    ideas = list(db.journal_ideas.find({"user_id": user_id, "org_id": org_id}).limit(200))
    now = datetime.utcnow()
    kept = []
    for p in detect_patterns(entries, ideas, now):
        existing = db.journal_patterns.find_one({"user_id": user_id, "key": p["key"]})
        if existing and existing.get("status") in ("dismissed", "corrected"):
            continue  # the author told us this interpretation was wrong
        db.journal_patterns.update_one(
            {"user_id": user_id, "key": p["key"]},
            {"$set": {**p, "user_id": user_id, "org_id": org_id, "last_seen": now}, "$setOnInsert": {"status": "active", "first_seen": now}},
            upsert=True,
        )
        kept.append(p["key"])
    return kept


# ---------------------------------------------------------------------------
# 8) What-if explorer
# ---------------------------------------------------------------------------

WHAT_IF_SYSTEM = """You help a business owner think through a possible decision BEFORE committing. Return ONLY JSON:
{"summary":"one sentence restating the decision",
 "benefits":[{"text":"","basis":"fact|estimate"}],
 "costs":[{"text":"","basis":"fact|estimate"}],
 "risks":[{"text":"","basis":"fact|estimate"}],
 "assumptions":["things that must be true for this to work"],
 "info_needed":["facts to gather before deciding"],
 "first_step":"a small, low-risk way to test the idea"}
Rules:
- 2-4 items per list. basis="fact" ONLY if it comes from the provided business data; otherwise "estimate".
- Do not predict the future or give guaranteed numbers; say what would need to be measured.
- Same language as the question. Be concise."""


async def what_if(question: str, org_context: str) -> dict[str, Any] | None:
    try:
        raw = await get_ai_response(f"Business data:\n{org_context or 'No business data available.'}\n\nDecision to explore:\n{question}", WHAT_IF_SYSTEM, temperature=0.4, max_tokens=1100)
    except Exception as e:
        logger.warning("what_if failed: %s", e)
        return None
    data = parse_json_loose(raw)
    if not data:
        return None

    def items(name: str) -> list[dict[str, str]]:
        out = []
        for it in data.get(name) or []:
            text = str(it.get("text") if isinstance(it, dict) else it or "").strip()
            basis = str(it.get("basis") if isinstance(it, dict) else "estimate").lower()
            if text:
                out.append({"text": text[:220], "basis": "fact" if basis == "fact" else "estimate"})
        return out[:4]

    return {
        "summary": str(data.get("summary") or question)[:240],
        "benefits": items("benefits"), "costs": items("costs"), "risks": items("risks"),
        "assumptions": _strs(data.get("assumptions"), 4, 200),
        "info_needed": _strs(data.get("info_needed"), 4, 200),
        "first_step": str(data.get("first_step") or "")[:240],
    }


# ---------------------------------------------------------------------------
# 9) Contextual reminders
# ---------------------------------------------------------------------------

def create_reminder(db, user_id: str, org_id: str, text: str, trigger: dict[str, Any], user_email: str | None = None,
                    entry_id: str | None = None, decision_id: str | None = None, idea_id: str | None = None) -> dict[str, Any]:
    doc = {
        "user_id": user_id, "org_id": org_id, "user_email": (user_email or "").lower() or None,
        "text": text.strip()[:240], "trigger": trigger, "status": "active",
        "entry_id": entry_id, "decision_id": decision_id, "idea_id": idea_id,
        "created_at": datetime.utcnow(), "fired_at": None,
    }
    if trigger.get("type") == "project_active":
        title = str(trigger.get("goal_title") or "")
        doc["trigger"]["baseline_active"] = bool(title) and db.goals.count_documents(
            {"organization_id": org_id, "title": {"$regex": re.escape(title), "$options": "i"}, "status": "active"}
        ) > 0
    result = db.journal_reminders.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def _meeting_time_passed(end_dt: str, now_ist: datetime) -> bool:
    try:
        return datetime.strptime(str(end_dt)[:15], "%Y%m%dT%H%M%S") <= now_ist.replace(tzinfo=None)
    except ValueError:
        return False


def reminder_is_due(db, rem: dict[str, Any], now: datetime | None = None) -> bool:
    now = now or datetime.utcnow()
    trig = rem.get("trigger") or {}
    kind = trig.get("type")
    if kind == "date":
        due = trig.get("due_at")
        return isinstance(due, datetime) and due <= now
    if kind == "after_meeting":
        match = str(trig.get("match") or "").strip()
        if not match:
            return False
        ids = [x for x in (rem.get("user_id"), rem.get("user_email")) if x]
        now_ist = now.replace(tzinfo=UTC).astimezone(IST)
        for m in db.meetings.find({
            "organization_id": rem.get("org_id"), "title": {"$regex": re.escape(match), "$options": "i"},
            "status": {"$nin": ["cancelled", "canceled"]},
            "$or": [{"created_by": {"$in": ids}}, {"attendees": {"$in": ids}}],
        }).limit(10):
            if _meeting_time_passed(m.get("end_dt", ""), now_ist) and str(m.get("end_dt", ""))[:8] >= _as_utc(rem.get("created_at")).astimezone(IST).strftime("%Y%m%d"):
                return True
        return False
    if kind == "project_active":
        title = str(trig.get("goal_title") or "").strip()
        if not title or trig.get("baseline_active"):
            return False
        return db.goals.count_documents({"organization_id": rem.get("org_id"), "title": {"$regex": re.escape(title), "$options": "i"}, "status": "active"}) > 0
    return False


async def check_journal_reminders(db) -> int:
    fired = 0
    try:
        active = list(db.journal_reminders.find({"status": "active"}).limit(500))
    except Exception as e:
        logger.warning("journal reminder scan failed: %s", e)
        return 0
    for rem in active:
        try:
            if not reminder_is_due(db, rem):
                continue
            db.journal_reminders.update_one({"_id": rem["_id"], "status": "active"}, {"$set": {"status": "fired", "fired_at": datetime.utcnow()}})
            link = "/dashboard/journal"
            if rem.get("entry_id"):
                link += f"?entry={rem['entry_id']}"
            elif rem.get("decision_id"):
                link += f"?view=decisions&decision={rem['decision_id']}"
            from .notification_service import create_and_deliver

            await create_and_deliver(
                user_id=rem["user_id"], org_id=rem.get("org_id", ""), type="journal_reminder",
                title="Journal reminder", message=rem.get("text", "")[:200], link=link,
            )
            fired += 1
        except Exception as e:
            logger.warning("journal reminder %s failed: %s", rem.get("_id"), e)
    return fired


async def run_journal_jobs(db, hour_ist: int, weekday: int) -> None:
    """Hourly scheduler hook: reminders every run, recaps/patterns at fixed local times."""
    await check_journal_reminders(db)
    if hour_ist not in (20, 21):
        return
    weekly = hour_ist == 20 and weekday == 6  # Sunday evening
    daily = hour_ist == 21
    if not (weekly or daily):
        return
    since = datetime.utcnow() - timedelta(days=7 if weekly else 1)
    try:
        authors = {(e["user_id"], e["org_id"]) for e in db.journal_entries.find({"updated_at": {"$gte": since}, "type": "journal"}, {"user_id": 1, "org_id": 1}).limit(500) if e.get("user_id") and e.get("org_id")}
    except Exception as e:
        logger.warning("journal job author scan failed: %s", e)
        return
    for user_id, org_id in authors:
        try:
            if weekly:
                await build_recap(db, user_id, org_id, "weekly")
                await asyncio.to_thread(refresh_patterns, db, user_id, org_id)
            if daily:
                await build_recap(db, user_id, org_id, "daily")
        except Exception as e:
            logger.warning("journal recap job failed for %s: %s", user_id, e)
