"""Joining an organization (employee persona) and syncing a user profile (offline)."""
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

import app.api.auth as auth_api
from app.dependencies.auth import get_current_user
from app.main import app

PERSONA = "/api/v1/employees/persona"
SYNC = "/api/v1/auth/sync-user"
OTHER_ORG = "6a701c5f6183f425010e2999"


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


@pytest.fixture
def world(offline_db, monkeypatch):
    o = offline_db
    o.db.organizations.update_one({"_id": ObjectId(o.org)}, {"$set": {"domain": "test.local"}})
    o.db.organizations.insert_one({"_id": ObjectId(OTHER_ORG), "name": "Other", "owner_id": "other-owner", "domain": "other.test"})
    who = {"u": None}

    def current():
        if who["u"] is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Not authenticated")
        return who["u"]

    app.dependency_overrides[get_current_user] = current
    monkeypatch.setattr(auth_api, "set_custom_user_claims", lambda uid, claims: None)

    class W:
        db = o.db
        org = o.org
        c = TestClient(app)

        @staticmethod
        def login(uid, email):
            who["u"] = U(uid, email)

        @staticmethod
        def persona(org, email, **extra):
            body = {"email": email, "full_name": "Someone", "organization_id": org, "department": "Eng", "role": "developer"}
            body.update(extra)
            return W.c.post(PERSONA, json=body)

        @staticmethod
        def in_org_chart(org, email):
            return W.db.org_chart_members.find_one({"organization_id": org, "email": email}) is not None

    yield W
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------- employee persona = joining an org
def test_a_stranger_cannot_add_themselves_to_someone_elses_organization(world):
    world.login("stranger-uid", "stranger@gmail.test")
    r = world.persona(world.org, "stranger@gmail.test")
    assert r.status_code == 403, r.text
    assert not world.in_org_chart(world.org, "stranger@gmail.test")


def test_someone_listed_by_the_owner_can_complete_their_persona(world):
    world.db.org_chart_members.insert_one({"organization_id": world.org, "email": "newhire@gmail.test", "role": "employee"})
    world.login("newhire-uid", "newhire@gmail.test")
    assert world.persona(world.org, "newhire@gmail.test").status_code == 200


def test_existing_members_can_update_their_own_persona(world):
    world.login("emp-uid", "emp@test.local")
    assert world.persona(world.org, "emp@test.local", department="Sales").status_code == 200
    assert world.db.employees.find_one({"email": "emp@test.local"})["department"] == "Sales"


def test_company_domain_email_with_verified_otp_may_join(world):
    world.db.users.insert_one({"uid": "newbie-uid", "email": "newbie@test.local", "email_otp_verified": True})
    world.login("newbie-uid", "newbie@test.local")
    assert world.persona(world.org, "newbie@test.local").status_code == 200


def test_company_domain_email_without_verification_may_not_join(world):
    world.db.users.insert_one({"uid": "faker-uid", "email": "ceo@test.local"})  # never proved they own it
    world.login("faker-uid", "ceo@test.local")
    assert world.persona(world.org, "ceo@test.local").status_code == 403


def test_persona_without_an_org_cannot_touch_other_peoples_records(world):
    world.db.employees.insert_one({"email": "emp@test.local", "organization_id": world.org, "department": "Original"})
    world.login("stranger-uid", "stranger@gmail.test")
    r = world.persona(None, "emp@test.local", department="HACKED")
    assert r.status_code == 403
    assert world.db.employees.find_one({"email": "emp@test.local"})["department"] == "Original"


def test_owner_can_edit_an_employee_in_their_own_org(world):
    world.db.employees.insert_one({"email": "emp@test.local", "organization_id": world.org, "department": "Old"})
    world.login(world.db.users.find_one({"role": "owner"})["uid"], "owner@test.local")
    assert world.persona(world.org, "emp@test.local", department="New").status_code == 200
    assert world.db.employees.find_one({"email": "emp@test.local"})["department"] == "New"


def test_owner_cannot_overwrite_an_employee_of_another_org(world):
    world.db.employees.insert_one({"email": "victim@other.test", "organization_id": OTHER_ORG, "department": "Original"})
    world.login("owner-uid-1", "owner@test.local")
    r = world.persona(world.org, "victim@other.test", department="HACKED")
    assert r.status_code == 403
    assert world.db.employees.find_one({"email": "victim@other.test"})["department"] == "Original"


# ---------------------------------------------------------------- sync-user
def test_sync_user_requires_login(world):
    r = world.c.post(SYNC, json={"uid": "x", "email": "x@x.test", "phone_verified": True})
    assert r.status_code == 401


def test_sync_user_cannot_rewrite_another_users_profile(world):
    world.login("attacker-uid", "attacker@test.local")
    r = world.c.post(SYNC, json={"uid": "emp-uid", "email": "evil@test.local", "full_name": "Pwned", "phone_verified": True})
    assert r.status_code == 403
    doc = world.db.users.find_one({"uid": "emp-uid"})
    assert doc["email"] == "emp@test.local" and doc.get("full_name") != "Pwned"


def test_sync_user_uses_the_verified_email_not_the_body(world):
    world.login("fresh-uid", "fresh@test.local")
    r = world.c.post(SYNC, json={"uid": "fresh-uid", "email": "someone-else@test.local", "full_name": "F", "phone_verified": True})
    assert r.status_code == 200, r.text
    assert world.db.users.find_one({"uid": "fresh-uid"})["email"] == "fresh@test.local"


def test_sync_user_keeps_the_existing_role(world):
    world.login("emp-uid", "emp@test.local")
    r = world.c.post(SYNC, json={"uid": "emp-uid", "email": "emp@test.local", "role": "owner", "phone_verified": True})
    assert r.status_code == 200
    assert world.db.users.find_one({"uid": "emp-uid"})["role"] == "employee"


def test_email_otp_proof_is_recorded_for_later_org_joins(world):
    world.db.signup_otps.insert_one({"email": "proved@test.local", "verification_token": "tok", "verified": True})
    world.login("proved-uid", "proved@test.local")
    r = world.c.post(SYNC, json={"uid": "proved-uid", "email": "proved@test.local", "verification_token": "tok",
                                 "phone_verified": False, "role": "employee"})
    assert r.status_code == 200, r.text
    assert world.db.users.find_one({"uid": "proved-uid"}).get("email_otp_verified") is True
