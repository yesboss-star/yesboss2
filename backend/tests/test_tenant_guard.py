"""Router-level auth + tenant isolation (offline, in-memory DB)."""
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user, get_current_user_optional
from app.main import app

OTHER_ORG = "6a701c5f6183f425010e2999"


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


@pytest.fixture
def world(offline_db):
    o = offline_db
    who = {"u": None}

    def current():
        if who["u"] is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Not authenticated")
        return who["u"]

    app.dependency_overrides[get_current_user] = current
    app.dependency_overrides[get_current_user_optional] = lambda: who["u"]
    o.db.organizations.insert_one({"_id": ObjectId(OTHER_ORG), "name": "Other Co", "owner_id": "other-owner",
                                   "persona_answers": ["secret"], "co_owners": ["x"], "domain": "other.test"})
    client = TestClient(app)

    class W:
        db = o.db
        org = o.org
        c = client

        @staticmethod
        def as_owner():
            who["u"] = U(o.owner_uid, o.owner_email)

        @staticmethod
        def as_member():
            who["u"] = U("emp-uid", o.emp)

        @staticmethod
        def as_outsider():
            who["u"] = U("outsider-uid", "outsider@test.local")

        @staticmethod
        def as_anon():
            who["u"] = None

    yield W
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_user_optional, None)


# (method, path template, json body, form body)
QUERY_ROUTES = [
    ("GET", "/api/v1/goals?organization_id={org}", None, None),
    ("GET", "/api/v1/tasks?organization_id={org}", None, None),
    ("GET", "/api/v1/dashboard/kpi?organization_id={org}", None, None),
    ("GET", "/api/v1/dashboard/document-count?organization_id={org}", None, None),
    ("GET", "/api/v1/notifications?organization_id={org}", None, None),
    ("GET", "/api/v1/strategy-chat/history?organization_id={org}", None, None),
    ("GET", "/api/v1/strategy-chat/sessions?organization_id={org}", None, None),
    ("GET", "/api/v1/reports/history?organization_id={org}", None, None),
    ("GET", "/api/v1/meetings/titles?organization_id={org}", None, None),
]
PATH_ROUTES = [
    ("GET", "/api/v1/finance/metrics/{org}", None, None),
    ("GET", "/api/v1/trends/impact/{org}", None, None),
    ("GET", "/api/v1/learning/patterns/{org}", None, None),
    ("GET", "/api/v1/sessions/insights/{org}", None, None),
]
BODY_ROUTES = [
    ("POST", "/api/v1/assistant/people/search", {"organization_id": "{org}", "query": "a"}, None),
    ("POST", "/api/v1/assistant/delegate", {"organization_id": "{org}", "message": "x"}, None),
    ("POST", "/api/v1/assistant/generate-insights", {"organization_id": "{org}"}, None),
    ("POST", "/api/v1/strategy-chat/people/search", {"organization_id": "{org}", "query": "a"}, None),
    ("POST", "/api/v1/prompt/build", {"organization_id": "{org}", "user_id": "u"}, None),
    ("POST", "/api/v1/goals/delete-defaults", {"organization_id": "{org}"}, None),
]
FORM_ROUTES = [
    ("POST", "/api/v1/meetings/confirm", None, {"organization_id": "{org}", "meeting_title": "t", "tasks": "[]"}),
]
ALL_ROUTES = QUERY_ROUTES + PATH_ROUTES + BODY_ROUTES + FORM_ROUTES


def call(client, route, org):
    method, path, js, form = route
    path = path.format(org=org)
    if js is not None:
        js = {k: (v.format(org=org) if isinstance(v, str) else v) for k, v in js.items()}
    if form is not None:
        form = {k: v.format(org=org) for k, v in form.items()}
    return client.request(method, path, json=js, data=form)


@pytest.mark.parametrize("route", ALL_ROUTES, ids=lambda r: f"{r[0]} {r[1].split('?')[0]}")
def test_anonymous_callers_get_401(world, route):
    world.as_anon()
    assert call(world.c, route, world.org).status_code == 401


@pytest.mark.parametrize("route", ALL_ROUTES, ids=lambda r: f"{r[0]} {r[1].split('?')[0]}")
def test_outsiders_cannot_touch_another_organizations_data(world, route):
    world.as_outsider()
    assert call(world.c, route, world.org).status_code == 403


@pytest.mark.parametrize("route", ALL_ROUTES, ids=lambda r: f"{r[0]} {r[1].split('?')[0]}")
def test_members_of_one_org_cannot_use_another_org_id(world, route):
    world.as_owner()  # owner of the test org, but not a member of OTHER_ORG
    assert call(world.c, route, OTHER_ORG).status_code == 403


# (dashboard/kpi has its own employee-vs-owner rule, so it is not a pure guard probe)
MEMBER_ROUTES = [QUERY_ROUTES[0], QUERY_ROUTES[1], QUERY_ROUTES[3], QUERY_ROUTES[4], PATH_ROUTES[0]]


@pytest.mark.parametrize("route", MEMBER_ROUTES, ids=lambda r: r[1].split("?")[0])
def test_members_pass_the_guard(world, route):
    world.as_member()
    assert call(world.c, route, world.org).status_code not in (401, 403)


def test_placeholder_org_ids_are_treated_as_absent():
    from app.dependencies.tenant import _clean
    for bogus in ("undefined", "null", "None", "", "  ", "temp", None, {"a": 1}, ["x"]):
        assert _clean(bogus) is None, bogus
    assert _clean(" 6a701c5f6183f425010e290d ") == "6a701c5f6183f425010e290d"


def test_auth_only_routers_reject_anonymous(world):
    world.as_anon()
    assert world.c.post("/api/v1/scrape/scrape", json={"domain": "example.com"}).status_code == 401
    assert world.c.post("/api/v1/social/detect", json={"domain": "example.com"}).status_code in (401, 422)
    assert world.c.get("/api/v1/intelligence/taxonomy").status_code in (401, 404)


# ---------------------------------------------------------------- records looked up by their own id
def _goal(world, org):
    return str(world.db.goals.insert_one({"title": "G", "organization_id": org, "status": "active"}).inserted_id)


def _task(world, org):
    return str(world.db.tasks.insert_one({"title": "T", "organization_id": org, "status": "pending",
                                          "assignee_id": [], "created_by": "x"}).inserted_id)


@pytest.mark.parametrize("suffix", ["generate-strategies", "suggest-children"])
def test_goal_subroutes_check_the_goals_organization(world, suffix):
    gid = _goal(world, OTHER_ORG)
    world.as_owner()  # belongs to the test org only
    assert world.c.post(f"/api/v1/goals/{gid}/{suffix}").status_code == 403


def test_goal_subroute_unknown_goal_is_404_not_500(world):
    world.as_owner()
    assert world.c.post(f"/api/v1/goals/{ObjectId()}/generate-strategies").status_code == 404
    assert world.c.post("/api/v1/goals/not-an-id/generate-strategies").status_code == 404


def test_generate_tasks_and_select_strategy_check_goal_org(world):
    gid = _goal(world, OTHER_ORG)
    world.as_owner()
    assert world.c.post("/api/v1/goals/generate-tasks", json={"goal_id": gid}).status_code == 403
    assert world.c.post(f"/api/v1/goals/{gid}/select-strategy", json={"strategy_id": "s"}).status_code in (403, 422)


def test_task_comments_require_membership_of_the_tasks_org(world):
    foreign, own = _task(world, OTHER_ORG), _task(world, world.org)
    world.as_owner()
    assert world.c.post(f"/api/v1/tasks/{foreign}/comments", json={"content": "hi"}).status_code == 403
    assert world.c.post(f"/api/v1/tasks/{own}/comments", json={"content": "hi"}).status_code == 200


def test_strategy_sessions_are_org_scoped(world):
    sid_other = str(world.db.strategy_chat_sessions.insert_one(
        {"organization_id": OTHER_ORG, "user_id": "x", "messages": []}).inserted_id)
    sid_own = str(world.db.strategy_chat_sessions.insert_one(
        {"organization_id": world.org, "user_id": "x", "messages": []}).inserted_id)
    world.as_owner()
    assert world.c.get(f"/api/v1/strategy-chat/sessions/{sid_other}").status_code == 403
    assert world.c.delete(f"/api/v1/strategy-chat/sessions/{sid_other}").status_code == 403
    assert world.c.post(f"/api/v1/strategy-chat/sessions/{sid_other}/messages",
                        json={"role": "user", "content": "x"}).status_code == 403
    assert world.db.strategy_chat_sessions.count_documents({"_id": ObjectId(sid_other)}) == 1
    assert world.c.get(f"/api/v1/strategy-chat/sessions/{sid_own}").status_code == 200


def test_documents_of_other_orgs_cannot_be_read_by_file_id(world):
    world.db.documents.insert_one({"file_id": "f-other", "org_id": OTHER_ORG, "text": "TOP SECRET", "filename": "x.pdf"})
    world.as_owner()
    r = world.c.post("/api/v1/assistant/re-analyze", json={
        "file_id": "f-other", "original_message": "q", "organization_id": world.org})
    assert r.status_code == 404
    r = world.c.post(f"/api/v1/finance/extract?organization_id={world.org}&file_id=f-other")
    assert r.status_code in (400, 404) and "TOP SECRET" not in r.text


# ---------------------------------------------------------------- organizations
def test_create_organization_ignores_body_owner(world):
    world.as_outsider()
    r = world.c.post("/api/v1/organizations", json={
        "name": "Mine", "domain": "mine.test", "owner_id": "someone-else", "co_owners": ["another"]})
    assert r.status_code in (200, 201), r.text
    doc = world.db.organizations.find_one({"domain": "mine.test"})
    assert doc["owner_id"] == "outsider-uid" and doc["co_owners"] == []


def test_create_organization_requires_auth(world):
    world.as_anon()
    assert world.c.post("/api/v1/organizations", json={"name": "X", "domain": "x.test", "owner_id": "a"}).status_code == 401


def test_organization_directory_requires_auth_and_hides_ownership(world):
    world.as_anon()
    assert world.c.get("/api/v1/organizations").status_code == 401
    assert world.c.get("/api/v1/organizations/by-domain/other.test").status_code == 401
    world.as_outsider()
    orgs = world.c.get("/api/v1/organizations").json()["organizations"]
    other = next(o for o in orgs if o["name"] == "Other Co")
    assert "owner_id" not in other and "persona_answers" not in other and "co_owners" not in other
    body = world.c.get("/api/v1/organizations/by-domain/other.test").json()
    assert body["organization"]["name"] == "Other Co"
    assert "owner_id" not in body["organization"] and "persona_answers" not in body["organization"]


def test_by_domain_regex_is_escaped(world):
    world.as_outsider()
    assert world.c.get("/api/v1/organizations/by-domain/.*").json()["organization"] is None


def test_org_members_still_get_the_full_document_by_domain(world):
    world.db.organizations.update_one({"_id": ObjectId(world.org)}, {"$set": {"domain": "mine.test"}})
    world.as_owner()
    org = world.c.get("/api/v1/organizations/by-domain/mine.test").json()["organization"]
    assert org["owner_id"] == "owner-uid-1"
