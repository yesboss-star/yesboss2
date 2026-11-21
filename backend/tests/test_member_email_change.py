"""Correcting a member's email on the org chart.

The org chart can list someone under an address that is not the one they sign in with. Their tasks, notifications
and meetings then sit on an address that is not theirs. Changing the email now moves all of that, inside one
organization only. All offline.
"""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import app.api.org_chart as org_chart

OLD = "valuescore@valuescore.co.in"
NEW = "valuescore@value-score.co.in"


def person(uid, email):
    return SimpleNamespace(id=uid, uid=uid, email=email, custom_claims={})


@pytest.fixture
def chart(offline_db):
    db, org = offline_db.db, offline_db.org
    other_org = "6a701c5f6183f425010e0000"
    me = str(db.org_chart_members.insert_one({"organization_id": org, "email": OLD, "full_name": "Valuescore", "role": "ceo"}).inserted_id)
    db.org_chart_members.insert_one({"organization_id": org, "email": "report@test.local", "manager_email": OLD})
    db.tasks.insert_many([
        {"organization_id": org, "title": "one", "assignee_email": OLD, "assignee_id": [OLD]},
        {"organization_id": org, "title": "shared", "assignee_email": ["Valuescore@Valuescore.co.in", "emp@test.local"],
         "assignee_id": [OLD, "emp@test.local", NEW]},
        {"organization_id": org, "title": "someone else", "assignee_email": "emp@test.local", "assignee_id": ["emp@test.local"]},
        {"organization_id": other_org, "title": "other company", "assignee_email": OLD, "assignee_id": [OLD]},
    ])
    db.goals.insert_one({"organization_id": org, "title": "g", "assignee_id": [OLD]})
    db.meetings.insert_one({"organization_id": org, "title": "m", "attendees": [OLD, "emp@test.local"], "participants": [OLD], "created_by": OLD})
    db.notifications.insert_many([{"organization_id": org, "user_id": OLD, "title": "n"}, {"organization_id": org, "user_id": "emp@test.local", "title": "n2"}])
    db.task_followups.insert_one({"org_id": org, "assignee_email": OLD})
    db.commitments.insert_one({"org_id": org, "owner_email": OLD})
    offline_db.member_id = me
    offline_db.other_org = other_org
    offline_db.owner = person(offline_db.owner_uid, offline_db.owner_email)
    return offline_db


def change(chart, email, user=None):
    update = org_chart.OrgMemberUpdate(email=email)
    return asyncio.run(org_chart.update_org_member(chart.member_id, update, current_user=user or chart.owner))


def test_the_email_changes_and_the_response_says_what_moved(chart):
    out = change(chart, NEW)
    assert out["member"]["email"] == NEW
    assert out["email_changed"]["from"] == OLD and out["email_changed"]["to"] == NEW
    assert out["email_changed"]["moved"] == {
        "tasks": 2, "goals": 1, "meetings": 1, "notifications": 1, "task_followups": 1, "commitments": 1, "org_chart_members": 1,
    }


def test_tasks_goals_meetings_and_notifications_follow_the_new_address(chart):
    change(chart, NEW)
    db = chart.db
    one = db.tasks.find_one({"title": "one"})
    assert one["assignee_email"] == NEW and one["assignee_id"] == [NEW]
    assert db.goals.find_one({})["assignee_id"] == [NEW]
    meeting = db.meetings.find_one({})
    assert meeting["attendees"] == [NEW, "emp@test.local"] and meeting["participants"] == [NEW] and meeting["created_by"] == NEW
    assert db.notifications.find_one({"title": "n"})["user_id"] == NEW
    assert db.task_followups.find_one({})["assignee_email"] == NEW and db.commitments.find_one({})["owner_email"] == NEW
    assert db.org_chart_members.find_one({"email": "report@test.local"})["manager_email"] == NEW


def test_a_shared_task_keeps_its_other_person_and_never_lists_the_new_address_twice(chart):
    change(chart, NEW)
    shared = chart.db.tasks.find_one({"title": "shared"})
    assert shared["assignee_email"] == [NEW, "emp@test.local"]  # matched case-insensitively
    assert shared["assignee_id"] == [NEW, "emp@test.local"]  # NEW was already there: no duplicate


def test_other_people_and_other_companies_are_left_alone(chart):
    change(chart, NEW)
    db = chart.db
    assert db.tasks.find_one({"title": "someone else"})["assignee_email"] == "emp@test.local"
    assert db.tasks.find_one({"title": "other company"})["assignee_email"] == OLD, "another organization's data was changed"
    assert db.notifications.find_one({"title": "n2"})["user_id"] == "emp@test.local"


def test_an_unchanged_email_moves_nothing(chart):
    out = change(chart, OLD.upper())
    assert "email_changed" not in out
    assert chart.db.tasks.find_one({"title": "one"})["assignee_email"] == OLD


def test_an_email_already_on_the_chart_is_refused(chart):
    with pytest.raises(HTTPException) as err:
        change(chart, "report@test.local")
    assert err.value.status_code == 409
    assert chart.db.org_chart_members.find_one({"full_name": "Valuescore"})["email"] == OLD
    assert chart.db.tasks.find_one({"title": "one"})["assignee_email"] == OLD


@pytest.mark.parametrize("bad", ["not-an-email", "a@b", "two words@x.com", "@x.com"])
def test_a_malformed_email_is_refused(chart, bad):
    with pytest.raises(HTTPException) as err:
        change(chart, bad)
    assert err.value.status_code == 422 and chart.db.tasks.find_one({"title": "one"})["assignee_email"] == OLD


def test_only_an_owner_can_change_a_members_email(chart):
    with pytest.raises(HTTPException) as err:
        change(chart, NEW, user=person("emp-uid", chart.emp))
    assert err.value.status_code == 403
    assert chart.db.org_chart_members.find_one({"full_name": "Valuescore"})["email"] == OLD


def test_other_fields_still_update_without_touching_any_email(chart):
    out = asyncio.run(org_chart.update_org_member(chart.member_id, org_chart.OrgMemberUpdate(title="CEO"), current_user=chart.owner))
    assert out["member"]["title"] == "CEO" and out["member"]["email"] == OLD and "email_changed" not in out
