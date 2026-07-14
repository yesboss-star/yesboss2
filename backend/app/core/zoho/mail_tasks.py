import logging
from typing import Any

import httpx

from ..config import settings
from .base import ZohoOAuth

logger = logging.getLogger("yesboss.zoho.mail_tasks")


class ZohoMailTasks:
    def __init__(self, db):
        self.db = db
        self.oauth = ZohoOAuth(db)

    # ── Group management ────────────────────────────────────────────

    async def ensure_group(self, org_name: str, owner_token: str) -> int | None:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{settings.ZOHO_MAIL_API_URL}/tasks/groups",
                    headers={"Authorization": f"Zoho-oauthtoken {owner_token}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    groups = data.get("data", {}).get("groups", [])
                    for g in groups:
                        if org_name.lower() in g.get("name", "").lower():
                            return g["id"]

                resp2 = await client.post(
                    f"{settings.ZOHO_MAIL_API_URL}/tasks/groups",
                    headers={
                        "Authorization": f"Zoho-oauthtoken {owner_token}",
                        "Content-Type": "application/json",
                    },
                    json={"groupName": f"YesBoss - {org_name}"},
                )
                if resp2.status_code in (200, 201):
                    return resp2.json().get("data", {}).get("id")
        except Exception as e:
            logger.warning("Failed to ensure Zoho group: %s", e)
        return None

    # ── Create tasks ────────────────────────────────────────────────

    async def create_group_task(
        self,
        owner_token: str,
        zgid: int,
        task_data: dict[str, Any],
        assignee_zoho_id: int | None = None,
    ) -> int | None:
        payload = {
            "title": task_data.get("title", "Untitled"),
            "description": task_data.get("description") or "",
            "priority": self._map_priority(task_data.get("priority", "medium")),
        }
        due = task_data.get("due_date")
        if due:
            try:
                if isinstance(due, str) and "T" in due:
                    due = due.split("T")[0]
                parts = due.split("-")
                payload["dueDate"] = f"{parts[2]}/{parts[1]}/{parts[0]}"
            except Exception:
                pass
        if assignee_zoho_id:
            payload["assignee"] = assignee_zoho_id

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{settings.ZOHO_MAIL_API_URL}/tasks/groups/{zgid}",
                    headers={
                        "Authorization": f"Zoho-oauthtoken {owner_token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                if resp.status_code in (200, 201):
                    return resp.json().get("data", {}).get("id")
                logger.warning("Create group task failed: %s %s", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("Create group task error: %s", e)
        return None

    async def create_personal_task(
        self,
        user_token: str,
        task_data: dict[str, Any],
    ) -> int | None:
        payload = {
            "title": task_data.get("title", "Untitled"),
            "description": task_data.get("description") or "",
            "priority": self._map_priority(task_data.get("priority", "medium")),
        }
        due = task_data.get("due_date")
        if due:
            try:
                if isinstance(due, str) and "T" in due:
                    due = due.split("T")[0]
                parts = due.split("-")
                payload["dueDate"] = f"{parts[2]}/{parts[1]}/{parts[0]}"
            except Exception:
                pass

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{settings.ZOHO_MAIL_API_URL}/tasks/me",
                    headers={
                        "Authorization": f"Zoho-oauthtoken {user_token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                if resp.status_code in (200, 201):
                    return resp.json().get("data", {}).get("id")
                logger.warning("Create personal task failed: %s %s", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("Create personal task error: %s", e)
        return None

    # ── Update tasks ────────────────────────────────────────────────

    async def update_task(
        self,
        token: str,
        task_id: int,
        updates: dict[str, Any],
        is_group: bool = False,
        zgid: int | None = None,
    ) -> bool:
        payload = {}
        if "title" in updates:
            payload["title"] = updates["title"]
        if "description" in updates:
            payload["description"] = updates["description"]
        if "priority" in updates:
            payload["priority"] = self._map_priority(updates["priority"])
        if "status" in updates:
            payload["status"] = "completed" if updates["status"] in ("completed", "approved") else "inprogress" if updates["status"] == "in_progress" else None
            if payload["status"] is None:
                del payload["status"]
        if "due_date" in updates:
            due = updates["due_date"]
            try:
                if isinstance(due, str) and "T" in due:
                    due = due.split("T")[0]
                parts = due.split("-")
                payload["dueDate"] = f"{parts[2]}/{parts[1]}/{parts[0]}"
            except Exception:
                pass

        if not payload:
            return True

        url = f"{settings.ZOHO_MAIL_API_URL}/tasks/me/{task_id}"
        if is_group and zgid:
            url = f"{settings.ZOHO_MAIL_API_URL}/tasks/groups/{zgid}/{task_id}"

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.put(
                    url,
                    headers={
                        "Authorization": f"Zoho-oauthtoken {token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                if resp.status_code in (200, 204):
                    return True
                logger.warning("Update Zoho task failed: %s %s", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("Update Zoho task error: %s", e)
        return False

    # ── Delete tasks ────────────────────────────────────────────────

    async def delete_task(
        self,
        token: str,
        task_id: int,
        is_group: bool = False,
        zgid: int | None = None,
    ) -> bool:
        url = f"{settings.ZOHO_MAIL_API_URL}/tasks/me/{task_id}"
        if is_group and zgid:
            url = f"{settings.ZOHO_MAIL_API_URL}/tasks/groups/{zgid}/{task_id}"

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.delete(
                    url,
                    headers={"Authorization": f"Zoho-oauthtoken {token}"},
                )
                return resp.status_code in (200, 204)
        except Exception as e:
            logger.warning("Delete Zoho task error: %s", e)
        return False

    # ── Read tasks (for sync) ───────────────────────────────────────

    async def list_personal_tasks(
        self, user_token: str, since: str | None = None
    ) -> list[dict]:
        tasks = []
        from_val = 0
        limit = 499
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                while True:
                    resp = await client.get(
                        f"{settings.ZOHO_MAIL_API_URL}/tasks/me?from={from_val}&limit={limit}",
                        headers={"Authorization": f"Zoho-oauthtoken {user_token}"},
                    )
                    if resp.status_code != 200:
                        break
                    data = resp.json().get("data", {})
                    batch = data.get("tasks", [])
                    if not batch:
                        break
                    for t in batch:
                        if since:
                            mt = t.get("modifiedTime", "")
                            if mt and mt <= since:
                                continue
                        tasks.append(t)
                    paging = data.get("paging", {})
                    if "nextPage" in paging and paging["nextPage"]:
                        from_val += limit
                    else:
                        break
        except Exception as e:
            logger.warning("List personal tasks error: %s", e)
        return tasks

    async def list_assigned_tasks(
        self, user_token: str, since: str | None = None
    ) -> list[dict]:
        tasks = []
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{settings.ZOHO_MAIL_API_URL}/tasks/?view=assignedtome&action=view&from=0&limit=499",
                    headers={"Authorization": f"Zoho-oauthtoken {user_token}"},
                )
                if resp.status_code == 200:
                    batch = resp.json().get("data", {}).get("tasks", [])
                    for t in batch:
                        if since:
                            mt = t.get("modifiedTime", "")
                            if mt and mt <= since:
                                continue
                        tasks.append(t)
        except Exception as e:
            logger.warning("List assigned tasks error: %s", e)
        return tasks

    # ── Helpers ─────────────────────────────────────────────────────

    async def get_zoho_user_id(self, token: str) -> int | None:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{settings.ZOHO_MAIL_API_URL}/accounts",
                    headers={"Authorization": f"Zoho-oauthtoken {token}"},
                )
                if resp.status_code == 200:
                    accounts = resp.json().get("data", {}).get("accounts", [])
                    for acc in accounts:
                        uid = acc.get("accountId")
                        if uid:
                            return int(uid)
        except Exception as e:
            logger.warning("Get Zoho user ID error: %s", e)
        return None

    def _map_priority(self, p: str) -> str:
        mapping = {"high": "High", "medium": "Normal", "low": "Low"}
        return mapping.get(p.lower(), "Normal")

    @staticmethod
    def map_zoho_status(zoho_status: str) -> str:
        if zoho_status == "Completed":
            return "completed"
        if zoho_status == "In Progress":
            return "in_progress"
        return "pending"

    @staticmethod
    def parse_zoho_date(date_str: str) -> str | None:
        if not date_str:
            return None
        try:
            parts = date_str.split("/")
            if len(parts) == 3:
                return f"{parts[2]}-{parts[1]}-{parts[0]}"
        except Exception:
            pass
        return None
