import asyncio
import logging
import re
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..api.websocket import manager as ws_manager
from ..core.database import get_database
from ..core.notification_service import create_and_deliver
from ..core.zoho import ZohoCalendar, ZohoOAuth
from ..dependencies.auth import get_current_user_optional

logger = logging.getLogger("yesboss.zoho_calendar")
router = APIRouter()


def get_user_id(user) -> str | None:
    if user is None:
        return None
    return getattr(user, "id", None) or getattr(user, "email", None)


def get_user_email(user) -> str:
    if user is None:
        return ""
    return getattr(user, "email", "")


class BookEventRequest(BaseModel):
    attendees: list[dict]
    title: str
    description: str | None = ""
    start: str
    end: str
    timezone: str = "Asia/Kolkata"


@router.get("/events")
async def get_calendar_events(
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user=Depends(get_current_user_optional),
):
    user_id = get_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_database()
    zoho = ZohoOAuth(db)
    token = await zoho.get_valid_token(user_id)
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Zoho not connected. Connect in Settings > Integrations.",
        )

    cal_uid = await ZohoCalendar.get_default_calendar_uid(token)
    if not cal_uid:
        return {"events": [], "total": 0}

    now = datetime.utcnow()
    range_start = (from_date or (now - timedelta(days=90)).strftime("%Y%m%d")).replace("-", "")
    range_end = (to_date or (now + timedelta(days=30)).strftime("%Y%m%d")).replace("-", "")

    raw_events = await ZohoCalendar.get_events(token, cal_uid, range_start, range_end)

    events = []
    token_doc = db.zoho_tokens.find_one({"user_id": user_id}) if db else None
    org_id = token_doc.get("org_id", "") if token_doc else ""
    for ev in raw_events:
        zoho_id = ev.get("uid")
        if not zoho_id:
            continue
        dt = ev.get("dateandtime", {})
        event = {
            "zoho_event_id": zoho_id,
            "title": ev.get("title", ""),
            "start": dt.get("start", ""),
            "end": dt.get("end", ""),
            "attendees": [{"email": a.get("email")} for a in ev.get("attendees", []) if a.get("email")],
            "location": ev.get("location", ""),
            "description": ev.get("description", ""),
        }
        event["_id"] = zoho_id
        events.append(event)

        if db is not None:
            doc = {
                "zoho_event_id": zoho_id,
                "calendar_uid": cal_uid,
                "organization_id": org_id,
                "user_email": user_id,
                "title": event["title"],
                "description": event["description"],
                "start": event["start"],
                "end": event["end"],
                "attendees": [a["email"] for a in event["attendees"]],
                "location": event["location"],
                "raw_data": ev,
                "synced_at": datetime.utcnow().isoformat(),
            }
            existing = db.calendar_events.find_one({"zoho_event_id": zoho_id})
            if existing:
                db.calendar_events.update_one({"_id": existing["_id"]}, {"$set": doc})
            else:
                db.calendar_events.insert_one(doc)

    return {"events": events, "total": len(events)}


@router.get("/users/search")
async def search_users(
    q: str = Query(...),
    limit: int = Query(10, ge=1, le=50),
    current_user=Depends(get_current_user_optional),
):
    user_id = get_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = None
    token_doc = db.zoho_tokens.find_one({"user_id": user_id})
    if token_doc:
        org_id = token_doc.get("org_id")

    ql = re.escape(q.strip())
    query: dict[str, Any] = {}
    if org_id:
        query["organization_id"] = org_id
    query["$or"] = [
        {"full_name": {"$regex": ql, "$options": "i"}},
        {"email": {"$regex": ql, "$options": "i"}},
    ]

    results: list[dict] = []
    seen_emails: set = set()

    employees = list(db.employees.find(query).limit(limit))
    for emp in employees:
        email = emp.get("email", "")
        if email and email not in seen_emails:
            seen_emails.add(email)
            results.append({
                "id": str(emp["_id"]),
                "name": emp.get("full_name", email),
                "email": email,
                "type": "employee",
            })

    if len(results) < limit:
        owner_query: dict[str, Any] = {}
        if org_id:
            owner_query["_id"] = org_id
        else:
            owner_query["$or"] = [
                {"full_name": {"$regex": ql, "$options": "i"}},
                {"email": {"$regex": ql, "$options": "i"}},
                {"owner_email": {"$regex": ql, "$options": "i"}},
            ]
        owners = list(db.organizations.find(owner_query).limit(limit - len(results)))
        for org in owners:
            email = org.get("email") or org.get("owner_email", "")
            if email and email not in seen_emails:
                seen_emails.add(email)
                results.append({
                    "id": str(org["_id"]),
                    "name": org.get("full_name") or org.get("owner_name") or email,
                    "email": email,
                    "type": "owner",
                })

    return {"users": results}


@router.get("/freebusy")
async def check_freebusy(
    emails: str = Query(...),
    date: str = Query(...),
    from_time: str = Query("09:00"),
    to_time: str = Query("18:00"),
    current_user=Depends(get_current_user_optional),
):
    user_id = get_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_database()
    zoho = ZohoOAuth(db)
    token = await zoho.get_valid_token(user_id)
    if not token:
        raise HTTPException(status_code=400, detail="Zoho not connected. Connect in Settings > Integrations.")

    email_list = [e.strip() for e in emails.split(",") if e.strip()]

    start_dt = datetime.strptime(date, "%Y-%m-%d")
    start_str = start_dt.strftime("%Y%m%dT000000")
    end_str = start_dt.strftime("%Y%m%dT235959")

    all_busy = []
    unchecked = []
    for email in email_list:
        att_token = await zoho.get_valid_token(email)
        if not att_token:
            att_token_doc = db.zoho_tokens.find_one({"$or": [{"zoho_mail_id": email}, {"email": email}, {"user_id": email}]})
            if att_token_doc:
                att_token = await zoho.get_valid_token(att_token_doc.get("user_id"))
        if not att_token:
            unchecked.append(email)
            logger.warning("freebusy: no token found for attendee %s — cannot verify calendar", email)
            continue
        blocks = await ZohoCalendar.check_freebusy(att_token, email, start_str, end_str)
        logger.info("freebusy: email=%s returned %s blocks", email, len(blocks))
        for b in blocks:
            fb_start = b.get("startTime", "")
            fb_end = b.get("endTime", "")
            if fb_start and fb_end:
                try:
                    s = datetime.strptime(fb_start.replace("T", ""), "%Y%m%d%H%M%S")
                    e = datetime.strptime(fb_end.replace("T", ""), "%Y%m%d%H%M%S")
                    all_busy.append({"start": s.strftime("%H:%M"), "end": e.strftime("%H:%M")})
                except Exception:
                    pass

    datetime.strptime(f"{date} {from_time}", "%Y-%m-%d %H:%M")
    datetime.strptime(f"{date} {to_time}", "%Y-%m-%d %H:%M")

    conflict = False
    for busy in all_busy:
        if busy["start"] < to_time and busy["end"] > from_time:
            conflict = True
            break

    return {
        "available": [{"start": from_time, "end": to_time}] if not conflict else [],
        "busy": all_busy,
        "conflict": conflict,
        "date": date,
        "unchecked": unchecked,
    }


@router.post("/book")
async def book_event(
    request: BookEventRequest,
    current_user=Depends(get_current_user_optional),
):
    user_id = get_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    zoho = ZohoOAuth(db)
    token = await zoho.get_valid_token(user_id)
    if not token:
        raise HTTPException(status_code=400, detail="Zoho not connected. Connect in Settings > Integrations.")

    cal_uid = await ZohoCalendar.get_default_calendar_uid(token)
    if not cal_uid:
        raise HTTPException(status_code=400, detail="No calendar found in Zoho account")

    event_id = await ZohoCalendar.create_event(
        user_token=token,
        calendar_uid=cal_uid,
        title=request.title,
        description=request.description,
        start_dt=request.start,
        end_dt=request.end,
        timezone=request.timezone,
        attendees=request.attendees,
    )

    if not event_id:
        raise HTTPException(status_code=502, detail="Failed to create event in Zoho Calendar")

    token_doc = db.zoho_tokens.find_one({"user_id": user_id})
    org_id = token_doc.get("org_id", "") if token_doc else ""

    event_doc = {
        "zoho_event_id": event_id,
        "calendar_uid": cal_uid,
        "organization_id": org_id,
        "user_email": user_id,
        "title": request.title,
        "description": request.description,
        "start": request.start,
        "end": request.end,
        "attendees": [a.get("email") for a in request.attendees],
        "location": "",
        "raw_data": {},
        "synced_at": datetime.utcnow().isoformat(),
    }

    db.calendar_events.insert_one(event_doc)

    attendee_results = []
    for att in request.attendees:
        email = att.get("email", "")
        if email:
            if email == get_user_email(current_user):
                attendee_results.append({"email": email, "event_id": event_id, "status": "booked"})
                continue
            att_token_doc = db.zoho_tokens.find_one({"$or": [{"zoho_mail_id": email}, {"email": email}, {"user_id": email}]})
            if att_token_doc:
                att_user_id = att_token_doc.get("user_id")
                att_token = await zoho.get_valid_token(att_user_id)
                if att_token:
                    att_cal_uid = await ZohoCalendar.get_default_calendar_uid(att_token)
                    if att_cal_uid:
                        att_event_id = await ZohoCalendar.create_event(
                            user_token=att_token,
                            calendar_uid=att_cal_uid,
                            title=request.title,
                            description=request.description,
                            start_dt=request.start,
                            end_dt=request.end,
                            timezone=request.timezone,
                            attendees=request.attendees,
                        )
                        attendee_results.append({"email": email, "event_id": att_event_id, "status": "booked" if att_event_id else "failed"})
                        continue
                    attendee_results.append({"email": email, "status": "no_calendar"})
                else:
                    attendee_results.append({"email": email, "status": "no_token"})
            else:
                attendee_results.append({"email": email, "status": "not_connected"})

    meeting_doc = {
        "title": request.title,
        "description": request.description,
        "organization_id": org_id,
        "created_by": user_id,
        "zoho_event_id": event_id,
        "attendees": [a.get("email") for a in request.attendees],
        "status": "booked",
        "mom_uploaded": False,
        "reminder_sent": False,
        "start_dt": request.start,
        "end_dt": request.end,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    db.meetings.insert_one(meeting_doc)

    for att in request.attendees:
        email = att.get("email", "")
        if email:
            asyncio.create_task(create_and_deliver(
                user_id=email,
                org_id=org_id,
                type="meeting_scheduled",
                title=f"Meeting: {request.title}",
                message=f"Meeting '{request.title}' scheduled at {request.start} — upload MoM after",
                link=f"/dashboard?zoho_event_id={event_id}",
                metadata={"zoho_event_id": event_id, "start_dt": request.start},
            ))

    asyncio.create_task(ws_manager.broadcast_to_organization(
        {"type": "event_created", "data": event_doc},
        org_id,
    ))

    return {
        "event_id": event_id,
        "calendar_uid": cal_uid,
        "title": request.title,
        "start": request.start,
        "end": request.end,
        "attendees": request.attendees,
        "attendee_results": attendee_results,
    }
