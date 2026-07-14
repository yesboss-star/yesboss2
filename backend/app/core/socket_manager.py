import logging
from typing import Any

logger = logging.getLogger("yesboss.socket")

class SocketManager:
    def __init__(self):
        self.active_connections: dict[str, set[str]] = {}
        self._server = None

    async def connect(self, sid: str, organization_id: str = None, user_id: str = None):
        if organization_id:
            if organization_id not in self.active_connections:
                self.active_connections[organization_id] = set()
            self.active_connections[organization_id].add(sid)

        if user_id:
            user_key = f"user_{user_id}"
            if user_key not in self.active_connections:
                self.active_connections[user_key] = set()
            self.active_connections[user_key].add(sid)

        logger.info(f"Client {sid} connected. Active connections: {len(self.active_connections)}")

    def disconnect(self, sid: str, organization_id: str = None, user_id: str = None):
        if organization_id and organization_id in self.active_connections:
            self.active_connections[organization_id].discard(sid)
            if not self.active_connections[organization_id]:
                del self.active_connections[organization_id]

        if user_id:
            user_key = f"user_{user_id}"
            if user_key in self.active_connections:
                self.active_connections[user_key].discard(sid)
                if not self.active_connections[user_key]:
                    del self.active_connections[user_key]

        logger.info(f"Client {sid} disconnected")

    async def send_task_update(self, organization_id: str, task_data: dict):
        if organization_id in self.active_connections:
            for sid in self.active_connections[organization_id]:
                if self._server:
                    await self._server.emit("task_update", task_data, to=sid)

    async def send_notification(self, user_id: str, notification: dict):
        user_key = f"user_{user_id}"
        if user_key in self.active_connections:
            for sid in self.active_connections[user_key]:
                if self._server:
                    await self._server.emit("notification", notification, to=sid)

    async def broadcast_to_org(self, organization_id: str, event: str, data: Any):
        if organization_id in self.active_connections:
            for sid in self.active_connections[organization_id]:
                if self._server:
                    await self._server.emit(event, data, to=sid)

    def set_server(self, server):
        self._server = server

socket_manager = SocketManager()
