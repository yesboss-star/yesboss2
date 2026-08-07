import logging
from datetime import datetime

import httpx

logger = logging.getLogger("yesboss.google.tasks")

TASKS_API_URL = "https://tasks.googleapis.com/tasks/v1"
YESBOSS_LIST_NAME = "YesBoss"


def _normalize_due(due_date: str | None) -> str | None:
    """Convert yesboss ISO date to Google Tasks RFC3339 ('YYYY-MM-DDTHH:MM:SSZ')."""
    if not due_date:
        return None
    d = str(due_date).strip()
    if len(d) == 10 and d[4] == "-":
        return f"{d}T00:00:00Z"
    if "T" in d:
        return d if d.endswith("Z") else f"{d}Z"
    return f"{d}T00:00:00Z"


class GoogleTasks:
    def __init__(self, db=None):
        self.db = db

    async def _request(self, method: str, url: str, token: str, **kwargs) -> httpx.Response:
        headers = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.request(method, url, headers=headers, **kwargs)
            if resp.status_code in (400, 401, 403, 404):
                logger.warning("Google Tasks API %s %s -> %s: %s", method, url, resp.status_code, resp.text[:300])
            return resp

    async def ensure_list(self, token: str) -> str | None:
        """Find or create the 'YesBoss' task list. Returns the list id."""
        resp = await self._request("GET", f"{TASKS_API_URL}/users/@me/lists", token)
        if resp.status_code != 200:
            return None
        for lst in resp.json().get("items", []):
            if lst.get("title") == YESBOSS_LIST_NAME:
                return lst.get("id")
        create = await self._request("POST", f"{TASKS_API_URL}/users/@me/lists", token, json={"title": YESBOSS_LIST_NAME})
        if create.status_code == 200:
            return create.json().get("id")
        return None

    async def list_all_task_lists(self, token: str) -> list[dict]:
        """Return every task list the user owns: [{id, title}, ...]."""
        resp = await self._request("GET", f"{TASKS_API_URL}/users/@me/lists", token)
        if resp.status_code != 200:
            return []
        return [
            {"id": lst.get("id"), "title": lst.get("title", "")}
            for lst in resp.json().get("items", [])
            if lst.get("id")
        ]

    async def list_tasks_in_list(self, token: str, list_id: str, show_completed: bool = True) -> list[dict]:
        """List tasks from an explicit list id (no ensure/create)."""
        resp = await self._request(
            "GET",
            f"{TASKS_API_URL}/lists/{list_id}/tasks",
            token,
            params={"maxResults": 100, "showCompleted": "true" if show_completed else "false"},
        )
        if resp.status_code != 200:
            return []
        return resp.json().get("items", [])

    async def create_task(self, token: str, list_id: str, task_data: dict) -> str | None:
        title = task_data.get("title", "Untitled")
        notes = str(task_data.get("description") or "").strip()
        extra = []
        if task_data.get("department"):
            extra.append(f"Department: {task_data['department']}")
        if task_data.get("assignee_email"):
            extra.append(f"Assignee: {task_data['assignee_email']}")
        if extra:
            notes = (notes + "\n\n" + "\n".join(extra)) if notes else "\n".join(extra)

        body: dict = {
            "title": title[:2000],
            "status": "needsAction",
        }
        if notes:
            body["notes"] = notes[:8000]
        due = _normalize_due(task_data.get("due_date"))
        if due:
            body["due"] = due

        resp = await self._request("POST", f"{TASKS_API_URL}/lists/{list_id}/tasks", token, json=body)
        if resp.status_code == 200:
            return resp.json().get("id")
        return None

    async def update_task(self, token: str, list_id: str, task_id: str, updates: dict) -> bool:
        body: dict = {}
        if "title" in updates and updates["title"] is not None:
            body["title"] = updates["title"][:2000]
        if "status" in updates and updates["status"] is not None:
            yesboss_status = updates["status"]
            if yesboss_status in ("completed", "approved"):
                body["status"] = "completed"
                body["completed"] = datetime.utcnow().isoformat() + "Z"
            elif yesboss_status == "cancelled":
                return await self.delete_task(token, list_id, task_id)
            else:
                body["status"] = "needsAction"
        if "due_date" in updates:
            due = _normalize_due(updates["due_date"])
            body["due"] = due

        if not body:
            return True

        resp = await self._request("PATCH", f"{TASKS_API_URL}/lists/{list_id}/tasks/{task_id}", token, json=body)
        return resp.status_code == 200

    async def delete_task(self, token: str, list_id: str, task_id: str) -> bool:
        resp = await self._request("DELETE", f"{TASKS_API_URL}/lists/{list_id}/tasks/{task_id}", token)
        return resp.status_code == 204

    async def list_tasks(self, token: str, list_id: str, show_completed: bool = True) -> list[dict]:
        resp = await self._request(
            "GET",
            f"{TASKS_API_URL}/lists/{list_id}/tasks",
            token,
            params={"maxResults": 100, "showCompleted": "true" if show_completed else "false"},
        )
        if resp.status_code != 200:
            return []
        return resp.json().get("items", [])

    @staticmethod
    def map_google_status(google_status: str) -> str:
        return "completed" if google_status == "completed" else "pending"
