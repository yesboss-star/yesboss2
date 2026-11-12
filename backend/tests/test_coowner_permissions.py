"""Co-owners must be treated as owners wherever owners may act (offline)."""
import asyncio

import pytest
from bson import ObjectId
from fastapi import HTTPException

import app.api.goals as goals_api
import app.api.tasks as tasks_api


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


CO = U("co-owner-uid", "co@test.local")
STRANGER = U("stranger-uid", "stranger@test.local")


@pytest.fixture
def org(offline_db):
    o = offline_db
    o.db.organizations.update_one({"_id": ObjectId(o.org)}, {"$set": {"co_owners": [CO.uid]}})
    return o


def make_task(o, **extra):
    doc = {"title": "T", "status": "pending", "organization_id": o.org, "assignee_email": o.emp,
           "assignee_id": [o.emp], "created_by": o.owner_uid}
    doc.update(extra)
    return str(o.db.tasks.insert_one(doc).inserted_id)


def make_goal(o):
    return str(o.db.goals.insert_one({"title": "G", "status": "active", "organization_id": o.org,
                                      "created_by": o.owner_uid, "assignee_id": [o.emp]}).inserted_id)


async def test_co_owner_can_complete_and_approve_any_task_in_the_org(org):
    tid = make_task(org)
    assert (await tasks_api.complete_task(tid, current_user=CO))["task"]["status"] == "completed"
    assert (await tasks_api.approve_task(tid, current_user=CO))["task"]["status"] == "approved"


async def test_co_owner_can_delete_a_task(org):
    tid = make_task(org)
    await tasks_api.delete_task(tid, current_user=CO)
    await asyncio.sleep(0.2)
    assert org.db.tasks.find_one({"_id": ObjectId(tid)}) is None


async def test_co_owner_can_update_a_task(org):
    tid = make_task(org)
    await tasks_api.update_task(tid, tasks_api.TaskUpdate(title="Renamed"), current_user=CO)
    assert org.db.tasks.find_one({"_id": ObjectId(tid)})["title"] == "Renamed"


async def test_co_owner_can_delete_a_goal(org):
    gid = make_goal(org)
    await goals_api.delete_goal(gid, current_user=CO)
    assert org.db.goals.find_one({"_id": ObjectId(gid)}) is None


async def test_strangers_are_still_refused(org):
    tid = make_task(org)
    with pytest.raises(HTTPException) as exc:
        await tasks_api.complete_task(tid, current_user=STRANGER)
    assert exc.value.status_code == 403
