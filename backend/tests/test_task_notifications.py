"""Who gets told what, and how, when a task is assigned / completed / approved (offline)."""
import asyncio
import email as email_lib

import app.api.tasks as tasks_api


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


def html_of(mail) -> str:
    msg = email_lib.message_from_string(mail["msg"])
    for part in msg.walk():
        if part.get_content_type() == "text/html":
            return part.get_payload(decode=True).decode("utf-8")
    return ""


async def settle(seconds=1.0):
    await asyncio.sleep(seconds)


async def wait_until(predicate, timeout=20.0):
    """Mail goes out on a worker thread; poll instead of guessing a sleep."""
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        if predicate():
            return True
        await asyncio.sleep(0.1)
    return predicate()


async def create(o, title="Ship the report", assignee=None):
    owner = U(o.owner_uid, o.owner_email)
    body = tasks_api.TaskCreate(title=title, assignee_email=assignee or o.emp)
    res = await tasks_api.create_task(body, organization_id=o.org, current_user=owner)
    await settle()
    return res["task"]["_id"] if "task" in res else res["_id"]


async def test_assignment_notifies_and_emails_the_assignee(offline_db):
    o = offline_db
    await create(o)
    assert o.db.notifications.count_documents({"type": "task_assigned", "user_id": {"$in": [o.emp, "emp-uid"]}}) >= 1
    assert await wait_until(lambda: any(o.emp in m["to"] for m in o.mail)), "assignee got no email"


async def test_assignment_email_does_not_go_to_unrelated_people(offline_db):
    o = offline_db
    await create(o)
    recipients = {m["to"] for m in o.mail}
    assert recipients <= {o.emp, o.owner_email, o.mgr}, recipients  # assignee, creator, assignee's manager at most
    assert "outsider@test.local" not in recipients


async def test_task_title_markup_is_escaped_in_the_assignment_email(offline_db):
    o = offline_db
    await create(o, title='<a href="http://evil.test">Click to verify</a>')
    assert await wait_until(lambda: any(o.emp in m["to"] for m in o.mail))
    mails = [m for m in o.mail if o.emp in m["to"]]
    html = html_of(mails[0])
    assert 'href="http://evil.test"' not in html and "&lt;a href" in html


async def test_assignee_completing_a_task_notifies_the_creator_by_app_and_email(offline_db):
    o = offline_db
    tid = await create(o)
    o.mail.clear()
    await tasks_api.complete_task(tid, current_user=U("emp-uid", o.emp))
    await settle()
    done = list(o.db.notifications.find({"type": "task_completed"}))
    assert len(done) == 1 and done[0]["user_id"] == o.owner_uid
    assert await wait_until(lambda: any(o.owner_email in m["to"] for m in o.mail)), "the creator got no completion email"
    assert o.db.tasks.find_one({"title": "Ship the report"})["status"] == "completed"


async def test_a_stranger_cannot_complete_someone_elses_task(offline_db):
    import pytest
    from fastapi import HTTPException

    o = offline_db
    tid = await create(o)
    with pytest.raises(HTTPException) as exc:
        await tasks_api.complete_task(tid, current_user=U("stranger", "stranger@test.local"))
    assert exc.value.status_code == 403
    assert o.db.tasks.find_one({"title": "Ship the report"})["status"] == "pending"


async def test_approval_notifies_and_emails_the_assignee(offline_db):
    o = offline_db
    tid = await create(o)
    o.mail.clear()
    await tasks_api.approve_task(tid, current_user=U(o.owner_uid, o.owner_email))
    await settle()
    assert o.db.notifications.count_documents({"type": "task_approved"}) == 1
    assert await wait_until(lambda: any(o.emp in m["to"] for m in o.mail)), "the assignee got no approval email"


async def test_completing_twice_does_not_notify_twice(offline_db):
    o = offline_db
    tid = await create(o)
    await tasks_api.complete_task(tid, current_user=U("emp-uid", o.emp))
    await tasks_api.complete_task(tid, current_user=U("emp-uid", o.emp))
    await settle()
    assert o.db.notifications.count_documents({"type": "task_completed"}) == 1, \
        "the creator is notified again every time the same task is 'completed'"
