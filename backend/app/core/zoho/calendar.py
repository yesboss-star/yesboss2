import logging

import httpx

from ..config import settings

logger = logging.getLogger("yesboss.zoho.calendar")


class ZohoCalendar:
    @staticmethod
    async def list_calendars(user_token: str) -> list[dict]:
        url = f"{settings.ZOHO_CALENDAR_API_URL}/calendars"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    url,
                    headers={"Authorization": f"Zoho-oauthtoken {user_token}"},
                )
                logger.info("List calendars response: status=%s for url=%s", resp.status_code, url)
                if resp.status_code == 200:
                    data = resp.json()
                    logger.info("Calendar API response keys: %s", list(data.keys()) if isinstance(data, dict) else type(data).__name__)
                    if isinstance(data, list):
                        logger.info("Calendar API returned a list — using directly")
                        return data
                    calendars = data.get("calendars") or data.get("data") or []
                    if not calendars:
                        logger.warning("No calendars found in response: %s", str(data)[:500])
                    return calendars
                else:
                    logger.warning("List calendars failed: %s %s", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("List calendars error: %s", e)
        return []

    @staticmethod
    async def get_default_calendar_uid(user_token: str) -> str | None:
        calendars = await ZohoCalendar.list_calendars(user_token)
        logger.info("get_default_calendar_uid: found %s calendars", len(calendars))
        for cal in calendars:
            if cal.get("isdefault") or cal.get("type") == 0:
                uid = cal.get("uid") or cal.get("calendar_id") or cal.get("id")
                logger.info("Found default calendar: uid=%s", uid)
                return uid
        if calendars:
            uid = calendars[0].get("uid") or calendars[0].get("calendar_id") or calendars[0].get("id")
            logger.info("Using first calendar: uid=%s", uid)
            return uid
        logger.warning("No calendars found at all")
        return None

    @staticmethod
    async def get_events(
        user_token: str, calendar_uid: str, range_start: str, range_end: str
    ) -> list[dict]:
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
    ) -> list[dict]:
        url = f"{settings.ZOHO_CALENDAR_API_URL}/calendars/freebusy"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    url,
                    params={"uemail": email, "sdate": start, "edate": end},
                    headers={"Authorization": f"Zoho-oauthtoken {user_token}"},
                )
                logger.info("freebusy: status=%s for email=%s", resp.status_code, email)
                if resp.status_code == 200:
                    data = resp.json()
                    logger.info("freebusy: response keys=%s", list(data.keys()) if isinstance(data, dict) else type(data).__name__)
                    # Try different response formats
                    fb = data.get("freebusy") or data.get("data") or data.get("result") or []
                    if isinstance(fb, list):
                        return fb
                    logger.warning("freebusy: unexpected format: %s", str(data)[:500])
                else:
                    logger.warning("freebusy: non-200: %s %s", resp.status_code, resp.text)
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
        attendees: list[dict[str, str]],
    ) -> str | None:
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
