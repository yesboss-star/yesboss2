import hashlib
import json
import logging
import re
from collections import Counter
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..core.ai_client import get_ai_response
from ..core.database import get_database
from ..dependencies.auth import get_current_user
from ..dependencies.scope import resolve_user_org_ids, user_email, user_id

router = APIRouter()
logger = logging.getLogger("yesboss.me")


def _org_ref(org_id: str) -> str:
    return hashlib.sha256(str(org_id).encode()).hexdigest()[:16]


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    return [str(value)]


def _extract_json(text: str) -> dict | None:
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except Exception:
            return None
    return None


@router.get("/understanding")
async def get_understanding(current_user=Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    uid = user_id(current_user)
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")

    email = user_email(current_user)
    org_ids = list(await resolve_user_org_ids(db, current_user))
    org_refs = [_org_ref(o) for o in org_ids]

    identities = [uid]
    if email and email not in identities:
        identities.append(email)

    # Work-style signals from the frequency agent (keyed by assignee email OR creator uid).
    freq_query: dict[str, Any] = {"employee_role": {"$in": identities}}
    if org_refs:
        freq_query["org_ref"] = {"$in": org_refs}
    freqs = list(db.employee_frequencies.find(freq_query))

    # Tasks assigned to this user.
    task_query: dict[str, Any] = {
        "$or": [
            {"assignee_email": {"$in": identities}},
            {"assignee_id": {"$in": identities}},
        ]
    }
    if org_ids:
        task_query["organization_id"] = {"$in": org_ids}
    tasks = list(db.tasks.find(task_query))

    # Existing learned patterns (breakdown chat habits).
    pattern_query: dict[str, Any] = {"user_id": uid}
    if org_ids:
        pattern_query["org_id"] = {"$in": org_ids}
    pattern_docs = list(db.user_patterns.find(pattern_query).sort("created_at", -1))

    facts = _build_facts(freqs, tasks, pattern_docs)
    has_data = (
        bool(freqs)
        or bool(tasks)
        or any(
            d.get("questions_asked") or d.get("breakdowns_provided")
            for d in pattern_docs
        )
    )

    if not has_data:
        return {
            "working_style": (
                "I haven't learned enough about how you work yet. Create tasks and goals "
                "and work on them — I'll build a picture of your working style over time."
            ),
            "improvements": [],
            "facts": facts,
            "has_data": False,
        }

    result = await _build_understanding(facts)
    result["facts"] = facts
    result["has_data"] = True
    return result


def _build_facts(freqs: list[dict], tasks: list[dict], pattern_docs: list[dict]) -> dict:
    categories: Counter = Counter()
    hours: list[float] = []
    levels: Counter = Counter()
    for f in freqs:
        categories[f.get("work_category", "general")] += 1
        h = f.get("avg_completion_hours")
        if h is not None:
            hours.append(float(h))
        levels[f.get("level") or f.get("complexity_level") or "intermediate"] += 1

    total = len(tasks)
    completed = len([t for t in tasks if t.get("status") == "completed"])
    in_progress = len([t for t in tasks if t.get("status") == "in_progress"])
    pending = len([t for t in tasks if t.get("status") == "pending"])
    overdue = len(
        [
            t
            for t in tasks
            if t.get("due_date")
            and t.get("status") not in ("completed", "approved")
            and _is_overdue(t.get("due_date"))
        ]
    )
    completion_rate = round((completed / total * 100), 1) if total else None

    questions: list[str] = []
    breakdowns: list[str] = []
    for d in pattern_docs:
        questions.extend(_as_list(d.get("questions_asked")))
        breakdowns.extend(_as_list(d.get("breakdowns_provided")))

    return {
        "top_categories": [
            {"name": c, "count": n} for c, n in categories.most_common(6)
        ],
        "avg_completion_hours": round(sum(hours) / len(hours), 1) if hours else None,
        "complexity_levels": dict(levels),
        "task": {
            "total": total,
            "completed": completed,
            "in_progress": in_progress,
            "pending": pending,
            "overdue": overdue,
            "completion_rate": completion_rate,
        },
        "questions_asked": questions[:5],
        "work_breakdowns": breakdowns[:5],
    }


def _is_overdue(due_date: Any) -> bool:
    if not due_date:
        return False
    try:
        d = (
            datetime.fromisoformat(str(due_date).replace("Z", ""))
            if isinstance(due_date, str)
            else due_date
        )
        return d < datetime.utcnow()
    except Exception:
        return False


async def _build_understanding(facts: dict) -> dict:
    categories = ", ".join(
        f"{c['name']} ({c['count']})" for c in facts["top_categories"]
    ) or "unknown"
    task = facts["task"]
    avg_hours = (
        f"~{facts['avg_completion_hours']}h" if facts["avg_completion_hours"] else "unknown"
    )
    lines = [
        f"- Work categories (frequency): {categories}",
        f"- Average task completion time: {avg_hours}",
        f"- Complexity mix: {facts['complexity_levels'] or 'unknown'}",
        f"- Tasks: {task['total']} total, {task['completed']} completed "
        f"({task['completion_rate'] if task['completion_rate'] is not None else 'n/a'}%), "
        f"{task['overdue']} overdue, {task['in_progress']} in progress",
    ]
    if facts["questions_asked"]:
        lines.append(f"- Questions they ask: {'; '.join(facts['questions_asked'])}")
    if facts["work_breakdowns"]:
        lines.append(f"- How they break work down: {'; '.join(facts['work_breakdowns'])}")

    prompt = (
        "Here is what YesBoss has observed about this user's working style:\n"
        + "\n".join(lines)
        + "\n\n"
        "Respond with ONLY a JSON object with exactly two keys:\n"
        '"working_style": a 2-4 sentence first-person summary of how this user works '
        '(write as YesBoss, e.g. "I\'ve learned you...").\n'
        '"improvements": an array of 2-3 short, specific, data-grounded suggestions '
        "to improve their working style.\n"
        "Do not invent facts. Be friendly and jargon-free."
    )

    try:
        raw = await get_ai_response(
            prompt=prompt,
            system_prompt=(
                "You are YesBoss, a friendly AI business assistant. You summarize what you "
                "have learned about a user's working style and suggest improvements."
            ),
            temperature=0.7,
            max_tokens=400,
        )
        parsed = _extract_json(raw)
        if parsed and isinstance(parsed, dict):
            style = str(parsed.get("working_style", "")).strip()
            improvements = parsed.get("improvements") or []
            if isinstance(improvements, list):
                improvements = [str(i).strip() for i in improvements if str(i).strip()][:4]
            else:
                improvements = []
            if style:
                return {"working_style": style, "improvements": improvements}
    except Exception as e:
        logger.warning(f"AI understanding failed: {e}")

    return {
        "working_style": "Here's a snapshot of how you work — see the details below.",
        "improvements": [],
    }
