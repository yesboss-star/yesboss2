import logging
import httpx

from ..config import settings

logger = logging.getLogger("yesboss.zoho.taz")

TAZ_WEBHOOK_URL = getattr(settings, "TAZ_WEBHOOK_URL", "")


async def send_reminder(
    message: str,
    title: str = "Yes Boss Reminder",
    assignee_email: str = "",
) -> bool:
    """Send a reminder message via the TAZ webhook.

    TAZ is a Zoho Cliq bot configured with an incoming webhook URL.
    Set TAZ_WEBHOOK_URL in your .env to enable.
    """
    if not TAZ_WEBHOOK_URL:
        logger.warning("TAZ_WEBHOOK_URL not configured — skipping TAZ reminder")
        return False

    payload = {
        "text": f"*{title}*\n\n{message}",
        "card": {
            "title": title,
            "description": message,
        },
    }
    if assignee_email:
        payload["text"] += f"\n\n— {assignee_email}"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(TAZ_WEBHOOK_URL, json=payload)
            if resp.status_code in (200, 201, 204):
                logger.info("TAZ reminder sent: %s", title[:60])
                return True
            logger.warning("TAZ webhook returned %s: %s", resp.status_code, resp.text[:200])
            return False
    except Exception as e:
        logger.error("TAZ webhook error: %s", e)
        return False


async def send_task_reminder(
    task_title: str,
    due_date: str = "",
    assignee_email: str = "",
    task_id: str = "",
    reminder_type: str = "upcoming",
):
    """Convenience wrapper to send a task-related reminder via TAZ."""
    messages = {
        "upcoming": f"⏰ Task *{task_title}* is due *{due_date}* — update status or request extension",
        "overdue": f"🚨 Task *{task_title}* is overdue (was due {due_date}) — escalate?",
        "new": f"📋 New task assigned: *{task_title}* — due {due_date or 'no deadline set'}",
    }
    msg = messages.get(reminder_type, messages["upcoming"])
    return await send_reminder(msg, title=task_title, assignee_email=assignee_email)
