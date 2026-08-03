import asyncio
import logging
import re
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..api.websocket import manager as ws_manager
from ..core.database import get_database
from ..core.google import GoogleCalendar, GoogleOAuth
from ..core.notification_service import create_and_deliver
from ..dependencies.auth import get_current_user_optional

logger = logging.getLogger("yesboss.google_calendar")
router = APIRouter()


def get_user_id(user) -> str | None:
    if user is None:
        return None
    return getattr(user, "id", None) or getattr(user, "email", None)


def get_user_email(user) -> str:
    if user is None:
        return ""
    return getattr(user, "email", "")


async def _resolve_google_token_for_email(db, email: str) -> str | None:
    """Find a valid Google access token for a user by their email address."""
    goauth = GoogleOAuth(db)
    doc = db.google_tokens.find_one({
        "$or": [{"email": email}, {"user_id": email}, {"google_id": email}],
    })
    if doc and doc.get("user_id"):
        token = await goauth.get_valid_token(doc["user_id"])
        if token:
            return token
    return None


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
    google = GoogleOAuth(db)
    token = await google.get_valid_token(user_id)
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Google not connected. Connect in Settings > Integrations.",
        )

    cal_id = await GoogleCalendar.get_primary_calendar_id(token)
    if not cal_id:
        return {"events": [], "total": 0}

    now = datetime.utcnow()
    time_min = (from_date or (now - timedelta(days=90)).isoformat())
    time_max = (to_date or (now + timedelta(days=30)).isoformat())

    raw_events = await GoogleCalendar.list_events(token, cal_id, time_min, time_max)

    events = []
    token_doc = db.google_tokens.find_one({"user_id": user_id}) if db else None
    org_id = token_doc.get("org_id", "") if token_doc else ""
    for ev in raw_events:
        google_id = ev.get("id")
        if not google_id:
            continue
        event = GoogleCalendar.event_to_dict(ev)
        event["_id"] = google_id
        events.append(event)

        if db is not None:
            doc = {
                "google_event_id": google_id,
                "calendar_uid": cal_id,
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
            existing = db.calendar_events.find_one({"google_event_id": google_id})
            if existing:
                db.calendar_events.update_one({"_id": existing["_id"]}, {"$set": doc})
            else:
                db.calendar_events.insert_one(doc)

    return {"events": events[:limit], "total": len(events)}


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
    token_doc = db.google_tokens.find_one({"user_id": user_id})
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
    timezone: str = Query("Asia/Kolkata"),
    current_user=Depends(get_current_user_optional),
):
    user_id = get_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_database()
    google = GoogleOAuth(db)
    token = await google.get_valid_token(user_id)
    if not token:
        raise HTTPException(status_code=400, detail="Google not connected. Connect in Settings > Integrations.")

    email_list = [e.strip() for e in emails.split(",") if e.strip()]

    tz = ZoneInfo(timezone)
    start_dt = datetime.fromisoformat(f"{date}T{from_time}:00").replace(tzinfo=tz)
    end_dt = datetime.fromisoformat(f"{date}T{to_time}:00").replace(tzinfo=tz)

    all_busy = []
    unchecked = []
    for email in email_list:
        att_token = await _resolve_google_token_for_email(db, email)
        if not att_token:
            unchecked.append(email)
            logger.warning("freebusy: no Google token found for attendee %s", email)
            continue
        blocks = await GoogleCalendar.get_freebusy(att_token, [email], start_dt.isoformat(), end_dt.isoformat())
        for b in blocks:
            all_busy.append({
                "start": b.get("start", "")[11:16] if len(b.get("start", "")) >= 16 else b.get("start", ""),
                "end": b.get("end", "")[11:16] if len(b.get("end", "")) >= 16 else b.get("end", ""),
            })

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

    google = GoogleOAuth(db)
    token = await google.get_valid_token(user_id)
    if not token:
        raise HTTPException(status_code=400, detail="Google not connected. Connect in Settings > Integrations.")

    cal_id = await GoogleCalendar.get_primary_calendar_id(token)
    if not cal_id:
        raise HTTPException(status_code=400, detail="No calendar found in Google account")

    event_id = await GoogleCalendar.create_event(
        user_token=token,
        calendar_id=cal_id,
        title=request.title,
        description=request.description,
        start_dt=request.start,
        end_dt=request.end,
        timezone=request.timezone,
        attendees=request.attendees,
    )

    if not event_id:
        raise HTTPException(status_code=502, detail="Failed to create event in Google Calendar")

    token_doc = db.google_tokens.find_one({"user_id": user_id})
    org_id = token_doc.get("org_id", "") if token_doc else ""

    event_doc = {
        "google_event_id": event_id,
        "calendar_uid": cal_id,
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
            att_token = await _resolve_google_token_for_email(db, email)
            if att_token:
                att_cal_id = await GoogleCalendar.get_primary_calendar_id(att_token)
                if att_cal_id:
                    att_event_id = await GoogleCalendar.create_event(
                        user_token=att_token,
                        calendar_id=att_cal_id,
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
                attendee_results.append({"email": email, "status": "not_connected"})

    meeting_doc = {
        "title": request.title,
        "description": request.description,
        "organization_id": org_id,
        "created_by": user_id,
        "google_event_id": event_id,
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
                link=f"/dashboard?google_event_id={event_id}",
                metadata={"google_event_id": event_id, "start_dt": request.start},
            ))

    asyncio.create_task(ws_manager.broadcast_to_organization(
        {"type": "event_created", "data": event_doc},
        org_id,
    ))

    return {
        "event_id": event_id,
        "calendar_uid": cal_id,
        "title": request.title,
        "start": request.start,
        "end": request.end,
        "attendees": request.attendees,
        "attendee_results": attendee_results,
    }
