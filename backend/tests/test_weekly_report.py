import asyncio
from datetime import datetime, timedelta

from app.core import report_generator as rg


class _Cursor(list):
    def sort(self, *args, **kwargs):
        return self

    def limit(self, n):
        return _Cursor(self[:n])


def _match(doc, flt):
    if not flt:
        return True
    for key, expected in flt.items():
        if key == "$or":
            if not any(_match(doc, clause) for clause in expected):
                return False
            continue
        current = doc.get(key)
        if isinstance(expected, dict):
            if "$gte" in expected and not (current is not None and current >= expected["$gte"]):
                return False
            if "$in" in expected and current not in expected["$in"]:
                return False
            if "$ne" in expected and current == expected["$ne"]:
                return False
        elif current != expected:
            return False
    return True


class _Collection:
    def __init__(self, docs):
        self.docs = docs

    def find(self, flt=None, projection=None):
        return _Cursor([doc for doc in self.docs if _match(doc, flt)])

    def find_one(self, flt=None, projection=None):
        for doc in self.docs:
            if _match(doc, flt):
                return doc
        return None

    def insert_one(self, doc):
        self.docs.append(doc)
        return None


class FakeDB:
    def __init__(self, **collections):
        self._collections = {
            name: value if isinstance(value, _Collection) else _Collection(value)
            for name, value in collections.items()
        }

    def __getattr__(self, name):
        return self._collections.setdefault(name, _Collection([]))

    def __getitem__(self, name):
        return getattr(self, name)


def _build_db():
    now = datetime.utcnow()
    db = FakeDB(
        tasks=[{
            "_id": "t1",
            "organization_id": "org1",
            "title": "Ship release",
            "assignee_email": "dev@x.com",
            "status": "in_progress",
            "priority": "high",
            "due_date": now + timedelta(days=2),
            "created_at": now - timedelta(days=1),
            "escalation_level": 0,
        }],
        task_followups=[{
            "_id": "th1",
            "task_id": "t1",
            "org_id": "org1",
            "assignee_email": "dev@x.com",
            "status": "in_progress",
            "criticality": "high",
            "nudge_count": 2,
            "created_at": now - timedelta(days=1),
            "messages": [
                {"dir": "out", "text": "status?", "ts": now - timedelta(hours=5)},
                {"dir": "in", "text": "working on it", "intent": "progress", "ts": now - timedelta(hours=4)},
                {"dir": "out", "text": "update?", "ts": now - timedelta(hours=2)},
                {"dir": "in", "text": "blocked on API keys", "intent": "blocked", "ts": now - timedelta(hours=1)},
            ],
        }],
        org_chart_members=[{
            "email": "dev@x.com",
            "organization_id": "org1",
            "full_name": "Dev One",
            "department": "Engineering",
            "manager_email": "boss@x.com",
        }],
    )
    return db


def test_employee_report_includes_cliq_engagement(monkeypatch):
    async def fake_ai(prompt):
        return "Solid week."

    monkeypatch.setattr(rg, "get_ai_response", fake_ai)
    db = _build_db()
    report = asyncio.run(rg.generate_employee_report(db, "org1", "dev@x.com", "weekly"))

    assert report["employee_email"] == "dev@x.com"
    assert set(report["metrics"]) == {
        "total_tasks", "completed_tasks", "pending_tasks", "in_progress_tasks",
        "overdue_tasks", "avg_overdue_days", "escalated_tasks", "completion_rate",
        "avg_completion_hours", "goals_touched",
    }
    engagement = report["cliq_engagement"]
    assert engagement["threads"] == 1
    assert engagement["replies"] == 2
    assert engagement["nudges"] == 2
    assert engagement["avg_response_hours"] == 1.0
    assert engagement["criticality_trend"] == {"high": 1}


def test_cliq_rollup_summarises_reports(monkeypatch):
    async def fake_ai(prompt):
        return "Solid week."

    monkeypatch.setattr(rg, "get_ai_response", fake_ai)
    db = _build_db()
    report = asyncio.run(rg.generate_employee_report(db, "org1", "dev@x.com", "weekly"))
    rollup = rg.generate_cliq_rollup(db, "org1", [report])

    assert rollup["at_risk_count"] == 1
    assert isinstance(rollup["escalations"], list)
    assert isinstance(rollup["top_blockers"], list)
    assert rollup["coaching"]


def test_task_thread_summary_reports_stats():
    db = _build_db()
    summary = asyncio.run(rg.generate_task_thread_summary(db, "th1", use_llm=False))

    assert summary["found"] is True
    assert summary["status"] == "in_progress"
    assert summary["response_stats"]["replies"] == 2
    assert summary["response_stats"]["nudges"] == 2
    assert "blocked on API keys" in summary["blockers"]
    assert "in_progress" in summary["summary"]


def test_task_thread_summary_uses_llm(monkeypatch):
    async def fake_ai(prompt):
        return "LLM generated summary."

    monkeypatch.setattr(rg, "get_ai_response", fake_ai)
    db = _build_db()
    summary = asyncio.run(rg.generate_task_thread_summary(db, "th1", use_llm=True))
    assert summary["summary"] == "LLM generated summary."


def test_task_thread_summary_missing_thread():
    db = _build_db()
    summary = asyncio.run(rg.generate_task_thread_summary(db, "nope", use_llm=False))
    assert summary["found"] is False
