"""Tests for the strategic-briefing response mode.

The model decides via ASK_SYSTEM whether a long multi-topic strategy message
should be answered with type="briefing". These tests pin the backend routing:
a briefing JSON from the AI must surface as AskResponse(type="briefing") with
its answer, missing_data, and suggestions — and must NOT create anything.
"""

import json

import pytest

import app.api.assistant as assistant
from app.main import app

BRIEFING_DUMP = (
    "Okay so now are you listening to what I'm saying? I am really stressed out because all my "
    "business codes and dynamics are slightly off from what I had planned. Today we have planned "
    "that I will do 21 crores. My business is a software service business. There are three major "
    "indicators: order booking where we close large orders, then execution with milestones and "
    "billing, then I need to collect my money. Today our order booking was 21 crores but we have "
    "only done 3 crores of order booking this year even though the funnel looks like a 20-30 crore "
    "funnel, so the conversion is lower right now. My worry is the rework - 50% of our energy is "
    "lost to rework because BA and developer build something else and then no sign off. We need to "
    "restructure the organization and I need a full-fledged governance control. Rangeesh is the co-CEO, "
    "Ekta owns the PMO, Chandrakant leads business, Shraddha heads technology, Vinay leads sales, "
    "Omkar is his fallback, Arijit does pre-sales on CRM, Zoya does account management and new lead "
    "nurturing, and the intern handles marketing branding. I want to keep 40% margin and reach "
    "profitability in the next 8 months. I am also worried about culture - we grew from 9 to 100 "
    "people and a negative culture is creeping in, and I feel HR has no owner. What should I "
    "focus on every week in August? Also should I slow down and not add new projects? I am attaching "
    "an excel sheet of the funnel, an implementation process document, an org chart, and a production "
    "house presentation."
)

BRIEFING_RESPONSE = {
    "type": "briefing",
    "answer": (
        "Here's the structure pulled out of everything you said.\n\n"
        "**Your business, in one flow**\n"
        "FUNNEL → ORDER BOOKING → EXECUTION → INVOICING → COLLECTION\n"
        "```\nCEO: you + Mangesh ji\n  ├─ Ekta (PMO)\n  ├─ Chandrakant (Business)\n  └─ Shraddha (Tech)\n```\n\n"
        "| Lever | What's broken | Owner | Fix in motion |\n"
        "|-------|---------------|-------|---------------|\n"
        "| Order booking | ₹3cr booked vs ₹21cr planned | Vinay | Weekly commit |\n"
        "| Execution | ~50% rework | Ekta | Implementation checklist |\n"
        "| Collection | Cash lagging | New controller | Daily tracker |\n"
    ),
    "follow_up": "Want me to turn this into a weekly tracker you can actually fill in?",
    "missing_data": {
        "doc_type": "Funnel Excel + implementation process doc + org chart + production house PPT",
        "reason": "You mentioned attaching these but none came through — with them I can plug real numbers in.",
    },
    "suggestions": [
        {"label": "Build my weekly plan", "action": "Build the August weekly operating plan"},
        {"label": "Show collection tracker", "action": "Set up the daily collection tracker"},
    ],
}


@pytest.fixture
def briefing_env(monkeypatch):
    """Stub the snapshot + AI so smart_ask only exercises briefing routing."""
    async def fake_build_prompt(**kwargs):
        return (
            "Organization: test\nUser's message:\n\"fake\"\n\n",
            "Fake system",
            {"documents": {"total_documents": 0, "analyzed_documents": 0, "summary": ""}},
        )

    async def fake_ai(**kwargs):
        return json.dumps(BRIEFING_RESPONSE)

    monkeypatch.setattr(assistant, "_build_ask_prompt", fake_build_prompt)
    monkeypatch.setattr(assistant, "get_ai_response", fake_ai)

    created = {"goals": 0, "tasks": 0}

    class _FakeDB:
        goals = None
        tasks = None
        session_insights = None
        organizations = None
        employees = None
        org_chart_members = None
        team_updates = None
        session_context = None

    monkeypatch.setattr(assistant, "get_database", lambda: _FakeDB())
    return created


def _client():
    from fastapi.testclient import TestClient

    return TestClient(app)


def _ask_body(message):
    return {
        "message": message,
        "context": {"user_email": "owner@value-score.co.in", "organization_id": "org-1"},
    }


def test_long_strategy_dump_returns_briefing(briefing_env):
    resp = _client().post("/api/v1/assistant/ask", json=_ask_body(BRIEFING_DUMP))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["type"] == "briefing"
    assert "FUNNEL → ORDER BOOKING" in data["answer"]
    assert data["missing_data"] and "Funnel Excel" in data["missing_data"]["doc_type"]
    assert data["suggestions"] and len(data["suggestions"]) >= 1
    assert data["follow_up"]


def test_answer_type_does_not_take_briefing_branch(briefing_env):
    """A normal answer-type response routes to type=answer — briefing is opt-in."""
    import app.api.assistant as asst_mod

    async def answer_ai(**kwargs):
        return '{"type":"answer","answer":"Short focused answer.","follow_up":"Anything else?"}'

    asst_mod.get_ai_response = answer_ai
    resp = _client().post("/api/v1/assistant/ask", json=_ask_body("What is unit economics?"))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["type"] == "answer"
    assert data["answer"] == "Short focused answer."
    assert data["follow_up"] == "Anything else?"
