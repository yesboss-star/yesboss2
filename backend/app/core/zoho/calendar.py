import logging
from typing import Any, Dict, List, Optional
import httpx

from ..config import settings

logger = logging.getLogger("yesboss.zoho.calendar")


class ZohoCalendar:
    @staticmethod
    async def list_calendars(user_token: str) -> List[Dict]:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{settings.ZOHO_CALENDAR_API_URL}/calendars",
                    headers={"Authorization": f"Zoho-oauthtoken {user_token}"},
                )
                if resp.status_code == 200:
                    return resp.json().get("calendars", [])
        except Exception as e:
            logger.warning("List calendars error: %s", e)
        return []

    @staticmethod
    async def get_default_calendar_uid(user_token: str) -> Optional[str]:
        calendars = await ZohoCalendar.list_calendars(user_token)
        for cal in calendars:
            if cal.get("isdefault") or cal.get("type") == 0:
                return cal.get("uid")
        if calendars:
            return calendars[0].get("uid")
        return None

    @staticmethod
    async def get_events(
        user_token: str, calendar_uid: str, range_start: str, range_end: str
    ) -> List[Dict]:
        import json
        range_param = json.dumps({"start": range_start, "end": range_end})
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{settings.ZOHO_CALENDAR_API_URL}/calendars/{calendar_uid}/events",
                    params={"range": range_param},
                    headers={"Authorization": f"Zoho-oauthtoken {user_token}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("events", []) if isinstance(data, dict) else data
        except Exception as e:
            logger.warning("Get events error: %s", e)
        return []

    @staticmethod
    async def check_freebusy(
        user_token: str, email: str, start: str, end: str
    ) -> List[Dict]:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{settings.ZOHO_CALENDAR_API_URL}/calendars/freebusy",
                    params={"uemail": email, "sdate": start, "edate": end},
                    headers={"Authorization": f"Zoho-oauthtoken {user_token}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("freebusy", [])
        except Exception as e:
            logger.warning("Free/busy error: %s", e)
        return []

    @staticmethod
    async def create_event(
        user_token: str,
        calendar_uid: str,
        title: str,
        description: str,
        start_dt: str,
        end_dt: str,
        timezone: str,
        attendees: List[Dict[str, str]],
    ) -> Optional[str]:
        import json
        eventdata = {
            "title": title,
            "richtext_description": description,
            "dateandtime": {
                "timezone": timezone,
                "start": start_dt,
                "end": end_dt,
            },
            "attendees": [{"email": a["email"], "status": "NEEDS-ACTION"} for a in attendees],
            "reminders": [{"action": "popup", "minutes": -10}],
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{settings.ZOHO_CALENDAR_API_URL}/calendars/{calendar_uid}/events",
                    params={"eventdata": json.dumps(eventdata)},
                    headers={"Authorization": f"Zoho-oauthtoken {user_token}"},
                )
                if resp.status_code in (200, 201):
                    data = resp.json()
                    return data.get("events", [{}])[0].get("uid") if isinstance(data, dict) else None
                logger.warning("Create event failed: %s %s", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("Create event error: %s", e)
        return None
