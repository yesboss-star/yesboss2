"""The dashboard must show real data or say there is none: never numbers or articles the AI made up (offline)."""
from datetime import datetime

import pytest

import app.agents.default_goals_agent as dga
import app.api.market_trends as market_trends
import app.core.ai_client as ai_client
from app.api.reports import ReportRequest, build_report_content
from app.core.financial_parser import normalize_metrics
from app.core.market_impact import analyze_market_impact


# ---------------------------------------------------------------- financial figures are read, not invented
def test_text_numbers_become_numbers_and_junk_is_dropped():
    out = normalize_metrics({"revenue": {"value": "3,456,789", "currency": "INR"}, "expenses": {"value": "n/a", "currency": "EUR"}, "burn_rate": {"value": True}})
    assert out["revenue"]["value"] == 3456789.0
    assert out["expenses"] == {"value": None, "currency": None}  # not a number, and a currency that was not INR or USD
    assert out["burn_rate"]["value"] is None


def test_the_margin_is_calculated_here_from_the_figures_not_taken_from_the_model():
    out = normalize_metrics({"revenue": {"value": 3456789}, "net_profit": {"value": 1345567}, "profit_margin_pct": 99})
    assert out["profit_margin_pct"] == 38.9


def test_a_margin_is_only_kept_when_it_cannot_be_calculated_and_the_document_stated_it():
    assert normalize_metrics({"revenue": {"value": None}, "net_profit": {"value": 5}, "profit_margin_pct": "12.5"})["profit_margin_pct"] == 12.5
    assert normalize_metrics({"revenue": {"value": 0}, "net_profit": {"value": 5}}).get("profit_margin_pct") is None  # no dividing by zero


# ---------------------------------------------------------------- market impact never invents news
@pytest.fixture
def no_ai(monkeypatch):
    called = []

    async def forbidden(*args, **kwargs):
        called.append(1)
        raise AssertionError("the AI must not be asked to write market articles")

    monkeypatch.setattr(ai_client, "get_ai_response", forbidden)
    return called


async def test_with_no_real_news_it_says_so_and_writes_nothing(offline_db, monkeypatch, no_ai):
    async def no_news(industry, micro_vertical=""):
        return []

    monkeypatch.setattr(market_trends, "fetch_google_news", no_news)
    offline_db.db.organizations.update_one({"_id": offline_db.db.organizations.find_one()["_id"]}, {"$set": {"industry": "IT Services"}})
    result = await analyze_market_impact(offline_db.db, offline_db.org)
    assert result["impacts"] == [] and result["summary"] == "" and result["trend_count"] == 0
    assert offline_db.db.market_trends.count_documents({}) == 0  # nothing was stored as if it were news
    assert offline_db.db.market_impacts.count_documents({}) == 0  # and no empty answer is cached
    assert not no_ai


async def test_the_news_feed_failing_is_not_a_reason_to_generate_articles(offline_db, monkeypatch, no_ai):
    async def broken(industry, micro_vertical=""):
        raise RuntimeError("feed down")

    monkeypatch.setattr(market_trends, "fetch_google_news", broken)
    result = await analyze_market_impact(offline_db.db, offline_db.org)
    assert result["impacts"] == [] and offline_db.db.market_trends.count_documents({}) == 0 and not no_ai


async def test_the_news_endpoint_returns_no_articles_when_the_feed_finds_none(monkeypatch, no_ai):
    async def no_news(industry, micro_vertical=""):
        return []

    monkeypatch.setattr(market_trends, "fetch_google_news", no_news)
    out = await market_trends.get_market_news(industry="IT Services", micro_vertical=None, current_user=None)
    assert out["articles"] == [] and out["total"] == 0 and out["source"] == "none" and not no_ai


# ---------------------------------------------------------------- starter goals are never template goals
async def test_when_the_ai_fails_there_are_no_starter_goals_not_template_ones(monkeypatch):
    async def down(*args, **kwargs):
        raise RuntimeError("no model")

    monkeypatch.setattr(dga, "get_ai_response", down)
    assert await dga.generate_default_goals("saas", None, 5) == []


# ---------------------------------------------------------------- the report counts what is there, and passes no verdict
def test_approved_tasks_count_as_finished_in_the_report(offline_db):
    now = datetime.utcnow()
    offline_db.db.tasks.insert_many([
        {"organization_id": offline_db.org, "title": "a", "status": "approved", "created_at": now},
        {"organization_id": offline_db.org, "title": "b", "status": "completed", "created_at": now},
        {"organization_id": offline_db.org, "title": "c", "status": "pending", "created_at": now},
        {"organization_id": offline_db.org, "title": "d", "status": "in_progress", "created_at": now},
    ])
    summary = build_report_content(offline_db.db, offline_db.org, ReportRequest())["summary"]
    assert summary["total_tasks"] == 4 and summary["completed_tasks"] == 2 and summary["completion_rate"] == 50.0
    assert summary["pending_tasks"] == 1 and summary["in_progress_tasks"] == 1


def test_an_employee_line_is_a_count_never_a_judgement(offline_db):
    now = datetime.utcnow()
    offline_db.db.org_chart_members.insert_one({"organization_id": offline_db.org, "email": "e@test.local", "full_name": "E", "department": "Ops"})
    offline_db.db.tasks.insert_one({"organization_id": offline_db.org, "title": "a", "status": "completed", "assignee_email": "e@test.local", "created_at": now})
    line = build_report_content(offline_db.db, offline_db.org, ReportRequest())["employee_insights"][0]["suggestion"]
    assert line == ""  # the old text said "On track" or "Needs attention": a verdict from a threshold


def test_the_fake_insights_templates_are_gone():
    import app.api.dashboard as dashboard

    assert not hasattr(dashboard, "get_industry_insights")  # the canned "revenue up 23%" style insights


async def test_the_modules_endpoint_no_longer_counts_invented_insights(offline_db):
    from types import SimpleNamespace

    import app.api.dashboard as dashboard

    user = SimpleNamespace(id="u1", uid="u1", email="x@test.local", user_metadata={}, custom_claims={})
    out = await dashboard.get_dashboard_modules(industry="saas", organization_id=None, current_user=user)
    assert out["modules"] and all("insights_count" not in m for m in out["modules"])


# ---------------------------------------------------------------- the analysis is given real totals, and a new run is really saved
def _real_trend(db, org):
    db.market_trends.insert_one({"organization_id": org, "title": "Real headline", "source": "Reuters", "url": "https://news.google.com/x",
                                 "published_at": "2026-11-01T00:00:00Z", "growth_impact": ""})


async def test_the_analysis_is_given_totals_over_all_tasks_not_a_sample(offline_db, monkeypatch):
    prompts = []

    async def fake_ai(prompt, *args, **kwargs):
        prompts.append(prompt)
        return '{"impacts": [], "summary": "ok"}'

    monkeypatch.setattr(ai_client, "get_ai_response", fake_ai)
    _real_trend(offline_db.db, offline_db.org)
    now = datetime.utcnow()
    # 60 tasks: more than the 50 a sample would see; 20 of them finished (some approved)
    offline_db.db.tasks.insert_many(
        [{"organization_id": offline_db.org, "title": f"t{i}", "status": "pending", "created_at": now} for i in range(40)]
        + [{"organization_id": offline_db.org, "title": f"d{i}", "status": "approved" if i % 2 else "completed", "created_at": datetime(2020, 1, 1)} for i in range(20)]
    )
    await analyze_market_impact(offline_db.db, offline_db.org)
    assert "Tasks finished: 20 of 60" in prompts[-1] and "Task completion rate: 33.3%" in prompts[-1]


async def test_a_second_analysis_replaces_the_first_and_keeps_the_old_one_in_history(offline_db, monkeypatch):
    answers = iter(['{"impacts": [], "summary": "first"}', '{"impacts": [], "summary": "second"}'])

    async def fake_ai(prompt, *args, **kwargs):
        return next(answers)

    monkeypatch.setattr(ai_client, "get_ai_response", fake_ai)
    _real_trend(offline_db.db, offline_db.org)
    await analyze_market_impact(offline_db.db, offline_db.org)
    await analyze_market_impact(offline_db.db, offline_db.org)
    stored = list(offline_db.db.market_impacts.find({"organization_id": offline_db.org}))
    assert len(stored) == 1 and stored[0]["summary"] == "second"  # the update really matched the stored record
    assert offline_db.db.market_impact_history.count_documents({}) == 1


# ---------------------------------------------------------------- a goal's progress counts approved work as done
def test_goal_progress_counts_approved_tasks_as_done(offline_db):
    from fastapi.testclient import TestClient

    from app.dependencies.auth import get_current_user
    from app.main import app

    class U:
        id = uid = "owner-uid-1"
        email = "owner@test.local"
        custom_claims: dict = {}

    gid = offline_db.db.goals.insert_one({"organization_id": offline_db.org, "title": "G", "status": "active", "created_at": datetime.utcnow()}).inserted_id
    offline_db.db.tasks.insert_many([
        {"organization_id": offline_db.org, "goal_id": str(gid), "title": "a", "status": "approved"},
        {"organization_id": offline_db.org, "goal_id": str(gid), "title": "b", "status": "completed"},
        {"organization_id": offline_db.org, "goal_id": str(gid), "title": "c", "status": "pending"},
        {"organization_id": offline_db.org, "goal_id": str(gid), "title": "d", "status": "pending"},
    ])
    app.dependency_overrides[get_current_user] = lambda: U()
    try:
        goals = TestClient(app).get("/api/v1/goals", params={"organization_id": offline_db.org})
        assert goals.status_code == 200, goals.text
        goal = next(g for g in goals.json()["goals"] if g["title"] == "G")
        assert goal["progress"] == 50.0 and goal["task_counts"]["completed"] == 2  # approved counts, as it does when tasks change
    finally:
        app.dependency_overrides.pop(get_current_user, None)
