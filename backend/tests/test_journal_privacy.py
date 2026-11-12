"""Private journal entries must stay private (offline)."""
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.main import app


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}
        self.user_metadata = {}


@pytest.fixture
def api(offline_db):
    who = {"u": U("emp-uid", "emp@test.local")}
    app.dependency_overrides[get_current_user] = lambda: who["u"]
    c = TestClient(app)
    c.who = who
    c.o = offline_db
    yield c
    app.dependency_overrides.pop(get_current_user, None)


def entry(api, **extra):
    doc = {"user_id": "emp-uid", "org_id": api.o.org, "content": "dear diary", "type": "journal", "is_shared": False}
    doc.update(extra)
    return str(api.o.db.journal_entries.insert_one(doc).inserted_id)


def test_editing_cannot_turn_a_private_journal_into_an_owner_visible_entry(api):
    eid = entry(api)
    r = api.put(f"/api/v1/journal/{eid}", json={"type": "idea"})
    assert r.status_code == 400
    assert api.o.db.journal_entries.find_one({"_id": ObjectId(eid)})["type"] == "journal"


def test_editing_the_text_of_a_private_journal_still_works(api):
    eid = entry(api)
    assert api.put(f"/api/v1/journal/{eid}", json={"content": "updated", "mood": "calm"}).status_code == 200
    assert api.o.db.journal_entries.find_one({"_id": ObjectId(eid)})["content"] == "updated"


def test_an_idea_may_be_made_private(api):
    eid = entry(api, type="idea")
    assert api.put(f"/api/v1/journal/{eid}", json={"type": "journal"}).status_code == 200


def test_other_users_cannot_edit_or_read_my_journal(api):
    eid = entry(api)
    api.who["u"] = U("owner-uid-1", "owner@test.local")  # even the org owner
    assert api.put(f"/api/v1/journal/{eid}", json={"content": "x"}).status_code == 404
    assert api.get(f"/api/v1/journal/{eid}").status_code in (403, 404)


def test_bad_entry_ids_are_404_not_500(api):
    assert api.put("/api/v1/journal/not-an-id", json={"content": "x"}).status_code == 404
    assert api.delete("/api/v1/journal/not-an-id").status_code == 404
