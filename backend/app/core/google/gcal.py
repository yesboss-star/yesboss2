import logging
from datetime import UTC, datetime
from typing import Any

import httpx

logger = logging.getLogger("yesboss.google.calendar")

_CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3"


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _to_rfc3339(value: str) -> str:
    """Convert a datetime string to RFC3339 with a Z suffix (UTC)."""
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return value


class GoogleCalendar:
    @staticmethod
    async def get_primary_calendar_id(user_token: str) -> str | None:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{_CALENDAR_API_URL}/users/me/calendarList",
                    params={"maxResults": 100},
                    headers=_bearer(user_token),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    items = data.get("items", [])
                    for cal in items:
                        if cal.get("primary"):
                            return cal.get("id")
                    if items:
                        return items[0].get("id")
                    logger.warning("get_primary_calendar_id: no calendars in response")
                else:
                    logger.warning("get_primary_calendar_id: non-200: %s %s", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("get_primary_calendar_id error: %s", e)
        return None

    @staticmethod
    async def list_events(
        user_token: str,
        calendar_id: str,
        time_min: str,
        time_max: str,
    ) -> list[dict]:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{_CALENDAR_API_URL}/calendars/{calendar_id}/events",
                    params={
                        "timeMin": _to_rfc3339(time_min),
                        "timeMax": _to_rfc3339(time_max),
                        "singleEvents": "true",
                        "orderBy": "startTime",
                        "maxResults": 250,
                    },
                    headers=_bearer(user_token),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("items", [])
                logger.warning("list_events: non-200: %s %s", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("list_events error: %s", e)
        return []

    @staticmethod
    async def get_freebusy(
        user_token: str,
        emails: list[str],
        time_min: str,
        time_max: str,
    ) -> list[dict[str, Any]]:
        """Returns a list of {start, end} busy blocks across all requested emails."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{_CALENDAR_API_URL}/freeBusy",
                    json={
                        "timeMin": _to_rfc3339(time_min),
                        "timeMax": _to_rfc3339(time_max),
                        "items": [{"id": email} for email in emails],
                    },
                    headers=_bearer(user_token),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    busy = []
                    calendars = data.get("calendars", {})
                    for email, cal in calendars.items():
                        for block in cal.get("busy", []):
                            busy.append({
                                "email": email,
                                "start": block.get("start", ""),
                                "end": block.get("end", ""),
                            })
                    return busy
                logger.warning("get_freebusy: non-200: %s %s", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("get_freebusy error: %s", e)
        return []

    @staticmethod
    async def create_event(
        user_token: str,
        calendar_id: str,
        title: str,
        description: str,
        start_dt: str,
        end_dt: str,
        timezone: str,
        attendees: list[dict[str, str]],
    ) -> str | None:
        event = {
            "summary": title,
            "description": description or "",
            "start": {"dateTime": _to_rfc3339(start_dt), "timeZone": timezone},
            "end": {"dateTime": _to_rfc3339(end_dt), "timeZone": timezone},
            "attendees": [{"email": a.get("email"), "responseStatus": "needsAction"} for a in attendees if a.get("email")],
            "reminders": {"useDefault": True},
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{_CALENDAR_API_URL}/calendars/{calendar_id}/events",
                    params={"sendUpdates": "all"},
                    json=event,
                    headers=_bearer(user_token),
                )
                if resp.status_code in (200, 201):
                    data = resp.json()
                    return data.get("id")
                logger.warning("create_event: non-200: %s %s", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("create_event error: %s", e)
        return None

    @staticmethod
    def event_to_dict(ev: dict) -> dict:
        start = ev.get("start", {})
        end = ev.get("end", {})
        return {
            "google_event_id": ev.get("id", ""),
            "title": ev.get("summary", ""),
            "start": start.get("dateTime") or start.get("date", ""),
            "end": end.get("dateTime") or end.get("date", ""),
            "attendees": [{"email": a.get("email")} for a in ev.get("attendees", []) if a.get("email")],
            "location": ev.get("location", ""),
            "description": ev.get("description", ""),
        }
