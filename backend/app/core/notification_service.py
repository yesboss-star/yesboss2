import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Optional
from ..core.database import get_database
from ..api.websocket import manager as ws_manager
from ..core.email_service import send_notification_email, is_email_configured

logger = logging.getLogger("yesboss.notification_service")

_email_rate_limit = {}  # org_id -> list of timestamps

def _check_email_rate_limit(org_id: str, max_per_hour: int = 50) -> bool:
    now = time.time()
    window = 3600
    if org_id not in _email_rate_limit:
        _email_rate_limit[org_id] = []
    _email_rate_limit[org_id] = [ts for ts in _email_rate_limit[org_id] if now - ts < window]
    if len(_email_rate_limit[org_id]) >= max_per_hour:
        logger.warning(f"Email rate limit hit for org {org_id}: {len(_email_rate_limit[org_id])} in last hour")
        return False
    _email_rate_limit[org_id].append(now)
    return True


def get_user_email(user_id: str) -> Optional[str]:
    db = get_database()
    if db is None:
        return None
    for collection_name in ["users", "employees", "org_chart_members"]:
        for query in [
            {"uid": user_id},
            {"id": user_id},
            {"user_id": user_id},
            {"_id": user_id},
            {"email": user_id},
        ]:
            doc = db[collection_name].find_one(query)
            if doc:
                email = doc.get("email") or doc.get("user_email")
                if email:
                    return email
    return None


def get_preferences(user_id: str, org_id: str) -> dict:
    db = get_database()
    if db is None:
        return {}
    prefs = db["notification_preferences"].find_one({"user_id": user_id, "organization_id": org_id})
    if not prefs:
        return {}
    prefs.pop("_id", None)
    return prefs


def is_channel_enabled(prefs: dict, channel: str, notif_type: str) -> bool:
    if not prefs:
        return True
    channel_prefs = prefs.get(channel, {})
    if isinstance(channel_prefs, bool):
        return channel_prefs
    return channel_prefs.get(notif_type, True)


async def create_and_deliver(
    user_id: str,
    org_id: str,
    type: str,
    title: str,
    message: str,
    link: str = None,
    actor_id: str = None,
    actor_name: str = None,
    metadata: dict = None,
    email: str = None,
):
    db = get_database()
    if db is None:
        return None

    prefs = get_preferences(user_id, org_id)

    notif_doc = None

    if is_channel_enabled(prefs, "in_app", type):
        notif_doc = {
            "type": type,
            "title": title,
            "message": message,
            "user_id": user_id,
            "organization_id": org_id,
            "link": link,
            "actor_id": actor_id,
            "actor_name": actor_name,
            "metadata": metadata or {},
            "read": False,
            "created_at": datetime.utcnow(),
        }
        result = db.notifications.insert_one(notif_doc)
        notif_doc["_id"] = str(result.inserted_id)

        asyncio.create_task(ws_manager.send_personal_message(
            {"type": "notification", "data": notif_doc},
            user_id,
        ))

    if is_channel_enabled(prefs, "email", type) and is_email_configured():
        user_email = email or get_user_email(user_id)
        if user_email and _check_email_rate_limit(org_id):
            asyncio.create_task(asyncio.to_thread(
                send_notification_email, user_email, title, message, link
            ))

    if is_channel_enabled(prefs, "push", type):
        asyncio.create_task(_send_push(user_id, title, message, link, notif_doc.get("_id") if notif_doc else None))

    return notif_doc


async def _send_push(user_id: str, title: str, message: str, link: str = None, notification_id: str = None):
    db = get_database()
    if db is None:
        return
    subs = list(db["push_subscriptions"].find({"user_id": user_id}))
    if not subs:
        return

    payload = json.dumps({
        "title": title,
        "message": message,
        "link": link or "",
        "notification_id": notification_id or "",
    })

    from ..core.config import settings as cfg
    if not cfg.VAPID_PUBLIC_KEY or not cfg.VAPID_PRIVATE_KEY:
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning("pywebpush not installed — skipping push")
        return

    vapid_private_key = cfg.VAPID_PRIVATE_KEY
    vapid_claims = {"sub": f"mailto:{cfg.VAPID_CLAIMS_EMAIL}"}

    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
                data=payload,
                vapid_private_key=vapid_private_key,
                vapid_claims=vapid_claims,
            )
        except WebPushException as e:
            if e.response and e.response.status_code in (410, 404):
                db["push_subscriptions"].delete_one({"_id": sub["_id"]})
            logger.warning(f"Push send failed: {e}")


async def send_digest(user_id: str, org_id: str, frequency: str = "daily"):
    db = get_database()
    if db is None:
        return

    prefs = get_preferences(user_id, org_id)
    if not prefs.get("digest", {}).get("enabled", False):
        return
    if prefs.get("digest", {}).get("frequency") != frequency:
        return

    from datetime import timedelta, timezone
    cutoff = datetime.utcnow() - timedelta(days=1 if frequency == "daily" else 7)

    notifications = list(
        db.notifications.find({
            "user_id": user_id,
            "organization_id": org_id,
            "created_at": {"$gte": cutoff},
        }).sort("created_at", -1).limit(50)
    )

    if not notifications:
        return

    email = get_user_email(user_id)
    if email and is_email_configured():
        items = [
            {"title": n.get("title", ""), "message": n.get("message", ""),
             "created_at": str(n.get("created_at", ""))}
            for n in notifications
        ]
        asyncio.create_task(asyncio.to_thread(
            send_notification_email, email,
            f"Your {frequency.capitalize()} Digest — {len(items)} notifications",
            "Here's your summary",
            None
        ))
        # Use digest email function
        from ..core.email_service import send_digest_email
        asyncio.create_task(asyncio.to_thread(
            send_digest_email, email, items, frequency
        ))
