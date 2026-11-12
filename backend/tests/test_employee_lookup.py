"""Looking up an employee by email: yourself always, someone else only inside your organization (offline)."""
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
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
    o.db.organizations.insert_one({"_id": ObjectId(OTHER_ORG), "name": "Other", "owner_id": "other-owner"})
    who = {"u": None}
    app.dependency_overrides[get_current_user] = lambda: who["u"]

    class W:
        db = o.db
        org = o.org
        c = TestClient(app)

        @staticmethod
        def login(uid, email):
            who["u"] = U(uid, email)

        @staticmethod
        def lookup(email):
            return W.c.get(f"/api/v1/employees/by-email/{email}")

    yield W
    app.dependency_overrides.pop(get_current_user, None)


def test_an_owner_who_is_in_no_list_can_look_themselves_up(world):
    """The owner is not an employee or an org-chart member: that is an empty profile, not a 403."""
    world.login("owner-uid-1", "owner@test.local")
    r = world.lookup("owner@test.local")
    assert r.status_code == 200 and r.json() == {"employee": None}


def test_looking_yourself_up_is_case_insensitive_and_returns_your_record(world):
    world.db.employees.insert_one({"email": "emp@test.local", "organization_id": world.org, "full_name": "Eve", "department": "Sales"})
    world.login("emp-uid", "Emp@Test.Local")
    r = world.lookup("EMP@test.local")
    assert r.status_code == 200 and r.json()["employee"]["department"] == "Sales"


def test_a_colleague_in_the_same_organization_can_be_looked_up(world):
    world.db.org_chart_members.insert_one({"email": "colleague@test.local", "organization_id": world.org, "full_name": "Max", "department": "Ops", "role": "manager"})
    world.login("owner-uid-1", "owner@test.local")
    r = world.lookup("colleague@test.local")
    assert r.status_code == 200 and r.json()["employee"]["full_name"] == "Max"


def test_someone_in_another_organization_still_cannot_be_looked_up(world):
    world.db.employees.insert_one({"email": "victim@other.test", "organization_id": OTHER_ORG, "full_name": "Victim"})
    world.login("owner-uid-1", "owner@test.local")
    assert world.lookup("victim@other.test").status_code == 403


def test_an_unknown_person_is_refused_not_revealed(world):
    """Nothing says whether the address exists: the answer is the same 403 as for another organization."""
    world.login("owner-uid-1", "owner@test.local")
    assert world.lookup("nobody@nowhere.test").status_code == 403


def test_looking_someone_up_needs_a_sign_in(offline_db):
    app.dependency_overrides.pop(get_current_user, None)
    assert TestClient(app).get("/api/v1/employees/by-email/emp@test.local").status_code == 401
