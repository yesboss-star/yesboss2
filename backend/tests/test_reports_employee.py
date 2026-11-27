"""The "My Report" button: an employee gets a report about themselves, never about someone else or another company."""
from bson import ObjectId
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user, get_current_user_optional
from app.main import app
import pytest

OTHER_ORG = "6a701c5f6183f425010e2998"
URL = "/api/v1/reports/generate/employee"


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


@pytest.fixture
def who(offline_db):
    state = {"u": None}

    def current():
        if state["u"] is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return state["u"]

    app.dependency_overrides[get_current_user] = current
    app.dependency_overrides[get_current_user_optional] = lambda: state["u"]
    offline_db.db.organizations.insert_one({"_id": ObjectId(OTHER_ORG), "name": "Other Co", "owner_id": "other-owner"})
    offline_db.db.tasks.insert_one({"organization_id": offline_db.org, "title": "Mine", "status": "completed",
                                    "assignee_email": offline_db.emp, "created_at": __import__("datetime").datetime.utcnow()})
    client = TestClient(app)
    yield offline_db, state, client
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_user_optional, None)


def test_employee_gets_own_report(who):
    o, state, c = who
    state["u"] = U("emp-uid", o.emp)
    r = c.post(URL, json={"period": "weekly", "organization_id": o.org})
    assert r.status_code == 200, r.text
    assert r.json()["report"]["employee_email"] == o.emp
    assert r.json()["report"]["metrics"]["total_tasks"] == 1


def test_employee_cannot_ask_for_someone_else(who):
    o, state, c = who
    state["u"] = U("emp-uid", o.emp)
    r = c.post(URL, json={"organization_id": o.org, "employee_email": o.mgr})
    assert r.status_code == 403


def test_outsider_cannot_generate_in_another_company(who):
    o, state, c = who
    state["u"] = U("emp-uid", o.emp)
    r = c.post(URL, json={"organization_id": OTHER_ORG})
    assert r.status_code == 403


def test_owner_can_ask_for_an_employee(who):
    o, state, c = who
    state["u"] = U(o.owner_uid, o.owner_email)
    r = c.post(URL, json={"organization_id": o.org, "employee_email": o.emp})
    assert r.status_code == 200, r.text
    assert r.json()["report"]["employee_email"] == o.emp


def test_owner_with_no_name_gets_own_report(who):
    o, state, c = who
    state["u"] = U(o.owner_uid, o.owner_email)
    r = c.post(URL, json={"organization_id": o.org})
    assert r.status_code == 200, r.text
    assert r.json()["report"]["employee_email"] == o.owner_email
