"""Capture inbox: one list for text, voice and file captures, and the visibility rules (offline)."""
from datetime import datetime

import pytest
from bson import ObjectId
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.main import app

API = "/api/v1/captures"
OTHER_ORG = "6a701c5f6183f425010e2999"
OWNER = ("owner-uid-1", "owner@test.local")
EMP = ("emp-uid", "emp@test.local")
MGR = ("mgr-uid", "mgr@test.local")
STRANGER = ("other-uid", "other@other.test")


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


@pytest.fixture
def world(offline_db, monkeypatch):
    from app.core.config import settings

    # These tests are about visibility; the analysis has its own tests (test_capture_analysis.py).
    monkeypatch.setattr(settings, "CAPTURE_AUTO_ANALYZE", False)
    o = offline_db
    o.db.organizations.insert_one({"_id": ObjectId(OTHER_ORG), "name": "Other", "owner_id": "other-owner"})
    o.db.users.insert_one({"uid": STRANGER[0], "email": STRANGER[1], "role": "employee", "organization_id": OTHER_ORG})
    o.db.org_chart_members.update_one({"organization_id": o.org, "email": o.emp}, {"$set": {"full_name": "Emma Employee"}})
    who = {"u": None}

    def current():
        if who["u"] is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return who["u"]

    app.dependency_overrides[get_current_user] = current

    class W:
        db = o.db
        org = o.org
        c = TestClient(app)

        @staticmethod
        def login(person):
            who["u"] = U(*person) if person else None

        @staticmethod
        def create(**body):
            body.setdefault("organization_id", W.org)
            body.setdefault("text", "Some words")
            return W.c.post(API, json=body)

        @staticmethod
        def ids(person, **params):
            W.login(person)
            params.setdefault("organization_id", W.org)
            r = W.c.get(API, params=params)
            assert r.status_code == 200, r.text
            return {c["id"] for c in r.json()["captures"]}

    yield W
    app.dependency_overrides.pop(get_current_user, None)


def _journal_entry(world, uid=EMP[0], text="dear diary"):
    return str(world.db.journal_entries.insert_one(
        {"user_id": uid, "org_id": world.org, "content": text, "type": "journal", "created_at": datetime.utcnow()}
    ).inserted_id)


def _file(world, created_by=EMP[0], org=None):
    return str(world.db.files.insert_one(
        {"filename": "sales.xlsx", "organization_id": org or world.org, "created_by": created_by}
    ).inserted_id)


# ---------------------------------------------------------------- one list for every input
def test_text_voice_and_file_captures_appear_in_one_list(world):
    world.login(EMP)
    text = world.create(source="text", text="Call the supplier").json()["capture"]["id"]
    voice = world.create(source="voice", text="Remind me about the audit").json()["capture"]["id"]
    file_id = _file(world)
    file_cap = world.create(source="file", kind="report", text=None, title="Sales",
                            raw_ref={"type": "file", "id": file_id}).json()["capture"]["id"]
    assert world.ids(EMP) == {text, voice, file_cap}


def test_timestamps_are_marked_utc_so_browsers_show_local_time(world):
    world.login(EMP)
    stamp = world.create().json()["capture"]["created_at"]
    assert stamp.endswith("Z") and datetime.fromisoformat(stamp[:-1])


def test_list_is_newest_first_with_filters_and_paging(world):
    world.login(EMP)
    first = world.create(text="alpha budget", kind="note").json()["capture"]["id"]
    second = world.create(text="beta roadmap", kind="idea", source="voice").json()["capture"]["id"]
    third = world.create(text="gamma budget", kind="mom").json()["capture"]["id"]
    r = world.c.get(API, params={"organization_id": world.org})
    assert [c["id"] for c in r.json()["captures"]] == [third, second, first] and r.json()["total"] == 3
    assert world.ids(EMP, kind="idea") == {second}
    assert world.ids(EMP, source="voice") == {second}
    assert world.ids(EMP, q="BUDGET") == {first, third}
    page = world.c.get(API, params={"organization_id": world.org, "limit": 2, "skip": 2}).json()
    assert [c["id"] for c in page["captures"]] == [first] and page["total"] == 3
    assert world.c.get(API, params={"organization_id": world.org, "kind": "bogus"}).status_code == 400


def test_a_capture_needs_text_or_a_reference(world):
    world.login(EMP)
    assert world.create(text="   ").status_code == 400
    assert world.create(text="x" * 100_001).status_code == 422


def test_anonymous_callers_are_refused(world):
    world.login(None)
    assert world.c.get(API, params={"organization_id": world.org}).status_code == 401
    assert world.create().status_code == 401


# ---------------------------------------------------------------- private
def test_private_captures_are_visible_to_the_author_only_owners_included(world):
    world.login(EMP)
    cid = world.create(text="my private plan").json()["capture"]["id"]
    for person in (OWNER, MGR):
        assert cid not in world.ids(person)
        assert world.c.get(f"{API}/{cid}").status_code == 404
        assert world.c.patch(f"{API}/{cid}", json={"title": "x"}).status_code == 404
        assert world.c.delete(f"{API}/{cid}").status_code == 404
    world.login(EMP)
    assert world.c.get(f"{API}/{cid}").status_code == 200
    assert world.db.captures.count_documents({"_id": ObjectId(cid)}) == 1


# ---------------------------------------------------------------- journal
@pytest.mark.parametrize("extra", [
    {"visibility": "org"},
    {"visibility": "members", "shared_with": [MGR[1]]},
    {"visibility": "private", "shared_with": [MGR[1]]},
])
def test_a_journal_capture_cannot_be_shared(world, extra):
    world.login(EMP)
    r = world.create(kind="journal", text="today was hard", **extra)
    assert r.status_code == 400 and "private" in r.json()["detail"]
    assert world.db.captures.count_documents({}) == 0


def test_a_journal_capture_is_invisible_to_everyone_else(world):
    world.login(EMP)
    cid = world.create(kind="journal", text="secret thoughts").json()["capture"]["id"]
    for person in (OWNER, MGR, STRANGER):
        world.login(person)
        listing = world.c.get(API, params={"organization_id": world.org})
        assert cid not in {c["id"] for c in listing.json().get("captures", [])}
        assert world.c.get(f"{API}/{cid}").status_code == 404


def test_even_a_corrupt_shared_journal_capture_stays_hidden(world):
    """Defence in depth: bad data in the collection must not leak a journal capture."""
    doc = {"org_id": world.org, "user_id": EMP[0], "kind": "journal", "visibility": "org",
           "shared_with": [], "shared_with_emails": [MGR[1]], "text": "leaked?", "created_at": datetime.utcnow()}
    cid = str(world.db.captures.insert_one(doc).inserted_id)
    for person in (OWNER, MGR):
        assert cid not in world.ids(person)
        assert world.c.get(f"{API}/{cid}").status_code == 404


def test_a_capture_cannot_become_a_shared_journal(world):
    world.login(EMP)
    cid = world.create(kind="mom", visibility="org").json()["capture"]["id"]
    r = world.c.patch(f"{API}/{cid}", json={"kind": "journal"})
    assert r.status_code == 200 and r.json()["capture"]["visibility"] == "private"
    assert world.c.patch(f"{API}/{cid}", json={"visibility": "org"}).status_code == 400
    assert world.c.patch(f"{API}/{cid}", json={"visibility": "members", "shared_with": [MGR[1]]}).status_code == 400
    assert cid not in world.ids(MGR)


# ---------------------------------------------------------------- members
def test_a_members_capture_reaches_the_named_people_and_the_owner_only(world):
    world.login(EMP)
    r = world.create(kind="mom", visibility="members", shared_with=[MGR[1].upper()])
    assert r.status_code == 201, r.text
    cap = r.json()["capture"]
    assert cap["shared_with"] == [{"email": MGR[1], "name": "mgr"}]
    cid = cap["id"]
    assert cid in world.ids(MGR) and cid in world.ids(OWNER)
    other = ("third-uid", "third@test.local")
    world.db.users.insert_one({"uid": other[0], "email": other[1], "role": "employee", "organization_id": world.org})
    assert cid not in world.ids(other)
    assert world.c.get(f"{API}/{cid}").status_code == 404
    assert cid not in world.ids(STRANGER, organization_id=OTHER_ORG)


def test_sharing_needs_real_members_of_the_organization(world):
    world.login(EMP)
    r = world.create(visibility="members", shared_with=["ceo@competitor.test"])
    assert r.status_code == 400 and "ceo@competitor.test" in r.json()["detail"]
    assert world.create(visibility="members", shared_with=[]).status_code == 400
    assert world.create(visibility="members", shared_with=["not-an-email"]).status_code == 400
    assert world.create(visibility="private", shared_with=[MGR[1]]).status_code == 400
    assert world.db.captures.count_documents({}) == 0


def test_only_the_author_or_an_owner_may_change_who_it_is_shared_with(world):
    world.login(EMP)
    cid = world.create(visibility="members", shared_with=[MGR[1]]).json()["capture"]["id"]
    world.login(MGR)
    assert world.c.patch(f"{API}/{cid}", json={"shared_with": [MGR[1], OWNER[1]]}).status_code == 403
    assert world.c.patch(f"{API}/{cid}", json={"title": "mine now"}).status_code == 403
    world.login(OWNER)
    assert world.c.patch(f"{API}/{cid}", json={"title": "renamed"}).status_code == 403
    r = world.c.patch(f"{API}/{cid}", json={"shared_with": [EMP[1]]})
    assert r.status_code == 200 and [p["email"] for p in r.json()["capture"]["shared_with"]] == [EMP[1]]
    world.login(MGR)
    assert world.c.get(f"{API}/{cid}").status_code == 404


def test_unsharing_makes_it_private_again(world):
    world.login(EMP)
    cid = world.create(visibility="members", shared_with=[MGR[1]]).json()["capture"]["id"]
    r = world.c.patch(f"{API}/{cid}", json={"visibility": "private"})
    assert r.status_code == 200 and r.json()["capture"]["shared_with"] == []
    assert cid not in world.ids(MGR) and cid not in world.ids(OWNER)


# ---------------------------------------------------------------- organization-wide
def test_an_org_capture_reaches_every_member_but_not_other_companies(world):
    world.login(EMP)
    cid = world.create(visibility="org", kind="report").json()["capture"]["id"]
    assert cid in world.ids(MGR) and cid in world.ids(OWNER)
    world.login(STRANGER)
    assert world.c.get(API, params={"organization_id": world.org}).status_code == 403
    assert world.c.get(f"{API}/{cid}").status_code == 404  # same answer as "does not exist"
    assert world.create(organization_id=world.org).status_code == 403


# ---------------------------------------------------------------- references to existing records
def test_a_capture_can_point_at_my_own_journal_entry_but_not_someone_elses(world):
    mine = _journal_entry(world, EMP[0], "my diary page")
    theirs = _journal_entry(world, MGR[0], "manager diary")
    world.login(EMP)
    r = world.create(kind="journal", source="text", text=None, raw_ref={"type": "journal_entry", "id": mine})
    assert r.status_code == 201 and r.json()["capture"]["preview"] == "my diary page"
    assert world.create(kind="journal", text=None, raw_ref={"type": "journal_entry", "id": theirs}).status_code == 400
    assert world.create(text=None, raw_ref={"type": "journal_entry", "id": "nope"}).status_code == 400


def test_a_capture_cannot_point_at_another_companys_file(world):
    foreign = _file(world, created_by="other-owner", org=OTHER_ORG)
    colleague = _file(world, created_by=MGR[0])
    world.login(EMP)
    assert world.create(source="file", text=None, raw_ref={"type": "file", "id": foreign}).status_code == 400
    assert world.create(source="file", text=None, raw_ref={"type": "file", "id": colleague}).status_code == 400
    world.login(OWNER)
    assert world.create(source="file", text=None, raw_ref={"type": "file", "id": colleague}).status_code == 201


def test_a_capture_can_point_at_a_file_processed_in_uploaded_data(world):
    """The data page stores uploads under ``documents`` with a uuid file_id, not in ``files``."""
    world.db.documents.insert_many([
        {"file_id": "uuid-mine", "org_id": world.org, "user_id": EMP[0], "text": "Q3 revenue was 4.2 crore"},
        {"file_id": "uuid-theirs", "org_id": world.org, "user_id": MGR[0], "text": "manager only"},
        {"file_id": "uuid-foreign", "org_id": OTHER_ORG, "user_id": STRANGER[0], "text": "other company"},
    ])
    world.login(EMP)
    r = world.create(source="file", kind="report", text=None, raw_ref={"type": "file", "id": "uuid-mine"})
    assert r.status_code == 201 and r.json()["capture"]["preview"] == "Q3 revenue was 4.2 crore"
    for other in ("uuid-theirs", "uuid-foreign", "uuid-missing"):
        assert world.create(source="file", text=None, raw_ref={"type": "file", "id": other}).status_code == 400


def test_a_capture_can_point_at_a_meeting_of_my_organization(world):
    mine = str(world.db.meetings.insert_one({"organization_id": world.org, "title": "Weekly"}).inserted_id)
    foreign = str(world.db.meetings.insert_one({"organization_id": OTHER_ORG, "title": "Theirs"}).inserted_id)
    world.login(EMP)
    assert world.create(kind="mom", text="notes", raw_ref={"type": "meeting", "id": mine}).status_code == 201
    assert world.create(kind="mom", text="notes", raw_ref={"type": "meeting", "id": foreign}).status_code == 400


# ---------------------------------------------------------------- delete
def test_authors_can_delete_and_a_private_journal_entry_goes_with_it(world):
    entry = _journal_entry(world, EMP[0])
    world.login(EMP)
    cid = world.create(kind="journal", text=None, raw_ref={"type": "journal_entry", "id": entry}).json()["capture"]["id"]
    r = world.c.delete(f"{API}/{cid}")
    assert r.status_code == 200 and r.json()["source_deleted"] is True
    assert world.db.captures.count_documents({}) == 0
    assert world.db.journal_entries.count_documents({"_id": ObjectId(entry)}) == 0


def test_deleting_a_capture_keeps_company_files_and_says_so(world):
    file_id = _file(world, EMP[0])
    world.login(EMP)
    cid = world.create(source="file", text=None, raw_ref={"type": "file", "id": file_id}).json()["capture"]["id"]
    r = world.c.delete(f"{API}/{cid}")
    assert r.status_code == 200 and r.json()["source_kept"] == {"type": "file", "id": file_id}
    assert world.db.files.count_documents({"_id": ObjectId(file_id)}) == 1


def test_an_owner_can_delete_a_shared_capture_but_a_named_person_cannot(world):
    world.login(EMP)
    cid = world.create(visibility="members", shared_with=[MGR[1]]).json()["capture"]["id"]
    world.login(MGR)
    assert world.c.delete(f"{API}/{cid}").status_code == 403
    world.login(OWNER)
    assert world.c.delete(f"{API}/{cid}").status_code == 200
    assert world.db.captures.count_documents({}) == 0


def test_unknown_ids_are_404(world):
    world.login(EMP)
    assert world.c.get(f"{API}/not-an-id").status_code == 404
    assert world.c.get(f"{API}/{ObjectId()}").status_code == 404
    assert world.c.delete(f"{API}/{ObjectId()}").status_code == 404
