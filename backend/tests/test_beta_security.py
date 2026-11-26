"""Launch-week security rules (offline, in-memory DB only):

1. Company A can never see or touch company B.
2. An employee cannot do owner-only things (approve their own task, delete goals, ...).
3. The invite-only beta switch only lets invited people create a new account, and can be turned off again.
"""
import pytest
from bson import ObjectId
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.invites import INVITE_ONLY_MESSAGE, is_invited, require_invite
from app.dependencies.auth import get_current_user, get_current_user_optional
from app.main import app

OTHER_ORG = "6a701c5f6183f425010e2999"
AUTH = "/api/v1/auth"


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
            raise HTTPException(status_code=401, detail="Not authenticated")
        return who["u"]

    app.dependency_overrides[get_current_user] = current
    app.dependency_overrides[get_current_user_optional] = lambda: who["u"]
    o.db.organizations.insert_one({"_id": ObjectId(OTHER_ORG), "name": "Other Co", "owner_id": "other-owner"})
    o.db.users.insert_one({"uid": "other-owner", "email": "other-owner@test.local", "role": "owner",
                           "organization_id": OTHER_ORG})

    class W:
        db = o.db
        org = o.org
        c = TestClient(app)

        @staticmethod
        def as_owner():
            who["u"] = U(o.owner_uid, o.owner_email)

        @staticmethod
        def as_employee():
            who["u"] = U("emp-uid", o.emp)

        @staticmethod
        def as_user(uid, email):
            who["u"] = U(uid, email)

    yield W
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_user_optional, None)


# ------------------------------------------------------------------ 1. company isolation
def test_nested_organization_id_in_assistant_body_is_checked(world):
    """The assistant routes carry the company id inside ``context`` — it must be checked there too."""
    world.as_employee()
    for path in ("/analyze-intent", "/chat", "/delegate", "/counter-questions"):
        r = world.c.post(f"/api/v1/assistant{path}", json={
            "message": "hello", "field_id": "title", "text": "x",
            "context": {"organization_id": OTHER_ORG, "user_email": world.db.users.find_one({"uid": "emp-uid"})["email"]},
        })
        assert r.status_code == 403, (path, r.status_code, r.text)


def test_organization_id_is_checked_even_when_the_body_is_not_labelled_json(world):
    world.as_employee()
    r = world.c.post("/api/v1/assistant/chat", content='{"context": {"orgId": "%s"}, "message": "hi"}' % OTHER_ORG,
                     headers={"Content-Type": "text/plain"})
    assert r.status_code == 403


def test_journal_routes_refuse_another_company(world):
    world.as_employee()
    assert world.c.get(f"/api/v1/journal-intel/reminders?organization_id={OTHER_ORG}").status_code == 403
    assert world.c.get(f"/api/v1/journal?organization_id={OTHER_ORG}").status_code == 403


def test_file_routes_refuse_another_company(world):
    world.as_employee()
    r = world.c.get(f"/api/v1/files/search?organization_id={OTHER_ORG}&query=salary&user_id=other-owner")
    assert r.status_code == 403
    assert world.c.get(f"/api/v1/files/context?organization_id={OTHER_ORG}").status_code == 403


def test_member_still_reaches_their_own_company(world):
    world.as_employee()
    assert world.c.get(f"/api/v1/goals?organization_id={world.org}").status_code == 200


# ------------------------------------------------------------------ 2. owner-only actions
def _task(world, **kw):
    doc = {"title": "Ship it", "organization_id": world.org, "status": "completed", "assignee_id": ["emp-uid"],
           "assignee_email": "emp@test.local", "created_by": "mgr-uid", "assigned_to": "emp@test.local"}
    doc.update(kw)
    return str(world.db.tasks.insert_one(doc).inserted_id)


def _goal(world, **kw):
    doc = {"title": "Grow", "organization_id": world.org, "status": "in_progress", "assignee_id": ["emp-uid"],
           "assignee_email": "emp@test.local", "created_by": "owner-uid-1"}
    doc.update(kw)
    return str(world.db.goals.insert_one(doc).inserted_id)


def test_employee_cannot_approve_their_own_task(world):
    tid = _task(world)
    world.as_employee()
    r = world.c.post(f"/api/v1/tasks/{tid}/approve")
    assert r.status_code == 403, r.text
    assert world.db.tasks.find_one({"_id": ObjectId(tid)})["status"] == "completed"


def test_task_creator_who_is_not_owner_cannot_approve(world):
    tid = _task(world, created_by="emp-uid")
    world.as_employee()
    assert world.c.post(f"/api/v1/tasks/{tid}/approve").status_code == 403


def test_owner_can_approve_a_task(world):
    tid = _task(world)
    world.as_owner()
    r = world.c.post(f"/api/v1/tasks/{tid}/approve")
    assert r.status_code == 200, r.text
    assert world.db.tasks.find_one({"_id": ObjectId(tid)})["status"] == "approved"


def test_employee_cannot_delete_someone_elses_task_but_owner_can(world):
    tid = _task(world, status="in_progress")
    world.as_employee()
    assert world.c.delete(f"/api/v1/tasks/{tid}").status_code == 403
    assert world.db.tasks.find_one({"_id": ObjectId(tid)}) is not None
    world.as_owner()
    assert world.c.delete(f"/api/v1/tasks/{tid}").status_code == 200


def test_employee_can_delete_their_own_unapproved_task_but_not_an_approved_one(world):
    mine = _task(world, created_by="emp-uid", status="in_progress")
    done = _task(world, created_by="emp-uid", status="approved")
    world.as_employee()
    assert world.c.delete(f"/api/v1/tasks/{mine}").status_code == 200
    assert world.c.delete(f"/api/v1/tasks/{done}").status_code == 403


def test_employee_cannot_delete_a_goal_but_owner_can(world):
    gid = _goal(world)
    world.as_employee()
    assert world.c.delete(f"/api/v1/goals/{gid}").status_code == 403
    assert world.db.goals.find_one({"_id": ObjectId(gid)}) is not None
    world.as_owner()
    assert world.c.delete(f"/api/v1/goals/{gid}").status_code == 200


def test_employee_cannot_complete_or_reopen_a_goal_or_pick_its_reviewer(world):
    gid = _goal(world)
    world.as_employee()
    assert world.c.put(f"/api/v1/goals/{gid}", json={"status": "completed"}).status_code == 403
    assert world.c.put(f"/api/v1/goals/{gid}", json={"reviewer_name": "me"}).status_code == 403
    done = _goal(world, status="completed")
    assert world.c.put(f"/api/v1/goals/{done}", json={"status": "in_progress"}).status_code == 403
    assert world.db.goals.find_one({"_id": ObjectId(gid)})["status"] == "in_progress"


def test_assignee_cannot_review_their_own_goal(world):
    gid = _goal(world, status="pending_review", reviewer_id="emp-uid", reviewer_email="emp@test.local")
    world.as_employee()
    r = world.c.post(f"/api/v1/goals/{gid}/review", json={"decision": "approve", "action": "approve", "approved": True})
    assert r.status_code in (403, 422), r.text
    assert world.db.goals.find_one({"_id": ObjectId(gid)})["status"] != "completed"


def test_employee_cannot_send_reminders_to_the_team(world):
    world.as_employee()
    r = world.c.post("/api/v1/org-chart/members/remind", json={"organization_id": world.org, "emails": ["mgr@test.local"]})
    assert r.status_code in (403, 404, 422), r.text
    if r.status_code != 404:
        assert r.status_code != 200


# ------------------------------------------------------------------ 3. invite-only beta switch
@pytest.fixture
def invite(monkeypatch):
    def configure(on=True, emails="", domains=""):
        monkeypatch.setattr(settings, "INVITE_ONLY", on, raising=False)
        monkeypatch.setattr(settings, "INVITED_EMAILS", emails, raising=False)
        monkeypatch.setattr(settings, "INVITED_DOMAINS", domains, raising=False)
    return configure


def test_switch_is_off_by_default_and_everyone_is_welcome(offline_db):
    assert settings.INVITE_ONLY is False
    assert is_invited("stranger@nowhere.test", offline_db.db) is True
    require_invite("stranger@nowhere.test", offline_db.db)  # does not raise


def test_listed_email_and_domain_are_invited_and_strangers_are_not(offline_db, invite):
    invite(True, emails="Friend@Example.com , other@x.test", domains="@acme.com, big.org")
    db = offline_db.db
    assert is_invited("friend@example.com", db)
    assert is_invited("FRIEND@example.com", db)
    assert is_invited("anyone@acme.com", db)
    assert is_invited("someone@BIG.org", db)
    assert not is_invited("stranger@nowhere.test", db)
    assert not is_invited("evil@acme.com.attacker.test", db)
    assert not is_invited("", db)
    assert not is_invited(None, db)
    assert not is_invited("no-at-sign", db)


def test_people_who_already_have_an_account_or_were_added_by_an_owner_stay_in(offline_db, invite):
    invite(True)
    db = offline_db.db
    assert is_invited(offline_db.owner_email, db)  # existing user
    assert is_invited(offline_db.mgr, db)  # added to the org chart by the owner
    db.employees.insert_one({"organization_id": offline_db.org, "email": "newhire@test.local"})
    assert is_invited("NewHire@test.local", db)
    assert not is_invited("random@test.local", db)


def test_refusal_is_a_friendly_403(offline_db, invite):
    invite(True)
    with pytest.raises(HTTPException) as e:
        require_invite("random@test.local", offline_db.db)
    assert e.value.status_code == 403 and e.value.detail == INVITE_ONLY_MESSAGE


def test_uninvited_email_gets_no_signup_code(offline_db, invite):
    invite(True, emails="friend@example.com")
    c = TestClient(app)
    r = c.post(f"{AUTH}/send-otp", json={"email": "random@test.local"})
    assert r.status_code == 403
    assert "invite-only" in r.json()["detail"]
    assert offline_db.db.signup_otps.count_documents({}) == 0
    assert not [m for m in offline_db.mail if "random@test.local" in m["to"]]
    ok = c.post(f"{AUTH}/send-otp", json={"email": "friend@example.com"})
    assert ok.status_code == 200, ok.text


def test_signup_code_is_open_again_when_the_switch_is_off(offline_db, invite):
    invite(False)
    assert TestClient(app).post(f"{AUTH}/send-otp", json={"email": "random@test.local"}).status_code == 200


def test_direct_signup_is_refused_for_uninvited_email(offline_db, invite):
    invite(True)
    r = TestClient(app).post(f"{AUTH}/signup", json={
        "email": "random@test.local", "password": "Str0ng!Passw0rd", "full_name": "Random", "role": "owner"})
    assert r.status_code == 403, r.text


def _sync(world, uid, email, monkeypatch):
    deleted = []
    import app.api.auth as auth_api
    monkeypatch.setattr(auth_api, "delete_user", lambda u: deleted.append(u) or True)
    monkeypatch.setattr(auth_api, "set_custom_user_claims", lambda *a, **k: None)
    world.as_user(uid, email)
    r = world.c.post(f"{AUTH}/sync-user", json={"uid": uid, "email": email, "full_name": "N", "phone_verified": True})
    return r, deleted


def test_sync_user_blocks_a_new_google_account_that_was_not_invited(world, invite, monkeypatch):
    invite(True, emails="friend@example.com")
    r, deleted = _sync(world, "new-uid", "random@test.local", monkeypatch)
    assert r.status_code == 403, r.text
    assert world.db.users.find_one({"uid": "new-uid"}) is None
    assert deleted == ["new-uid"]  # the half-made login is removed too


def test_sync_user_lets_an_invited_new_account_in(world, invite, monkeypatch):
    invite(True, domains="acme.com")
    r, deleted = _sync(world, "acme-uid", "boss@acme.com", monkeypatch)
    assert r.status_code == 200, r.text
    assert world.db.users.find_one({"uid": "acme-uid"}) is not None
    assert deleted == []


def test_sync_user_never_locks_out_an_existing_user(world, invite, monkeypatch):
    invite(True)  # nobody is on any list
    r, deleted = _sync(world, "emp-uid", world.db.users.find_one({"uid": "emp-uid"})["email"], monkeypatch)
    assert r.status_code == 200, r.text
    assert deleted == []


def test_phone_only_new_account_is_blocked_in_invite_only_mode(world, invite, monkeypatch):
    invite(True, emails="friend@example.com")
    r, deleted = _sync(world, "phone-uid", "", monkeypatch)
    assert r.status_code == 403
