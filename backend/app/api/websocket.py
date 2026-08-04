import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("yesboss.websocket")

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, set[WebSocket]] = {}
        self.user_connections: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, organization_id: str = None, user_id: str = None):
        await websocket.accept()

        if organization_id:
            if organization_id not in self.active_connections:
                self.active_connections[organization_id] = set()
            self.active_connections[organization_id].add(websocket)

        if user_id:
            if user_id not in self.user_connections:
                self.user_connections[user_id] = set()
            self.user_connections[user_id].add(websocket)

        logger.info(f"WebSocket connected. Org: {organization_id}, User: {user_id}")

    def disconnect(self, websocket: WebSocket, organization_id: str = None, user_id: str = None):
        if organization_id and organization_id in self.active_connections:
            self.active_connections[organization_id].discard(websocket)

        if user_id and user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.user_connections:
            for connection in list(self.user_connections[user_id]):
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.warning("WS send failed (kept alive): %s", e)

    async def broadcast_to_organization(self, message: dict, organization_id: str):
        if organization_id in self.active_connections:
            for connection in list(self.active_connections[organization_id]):
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.warning("WS send failed (kept alive): %s", e)

manager = ConnectionManager()

@router.websocket("/ws/{organization_id}")
async def websocket_endpoint(websocket: WebSocket, organization_id: str, user_id: str = None, token: str = None):
    from ..core.database import get_database
    from ..core.firebase_admin import verify_id_token

    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return
    auth_user = verify_id_token(token)
    if not auth_user:
        await websocket.close(code=4001, reason="Invalid token")
        return

    db = get_database()
    org = None
    if db is not None:
        from bson import ObjectId
        org = db.organizations.find_one(
            {"_id": ObjectId(organization_id) if ObjectId.is_valid(organization_id) else organization_id},
            {"owner_id": 1, "co_owners": 1},
        )
    owners = set(org.get("co_owners") or []) | {org.get("owner_id")} if org else set()
    uid = auth_user.id
    is_owner = uid in owners
    is_employee = False
    if db is not None and not is_owner:
        emp = db.users.find_one({"uid": uid, "organization_id": organization_id})
        is_employee = emp is not None
    if org is None or not (is_owner or is_employee):
        await websocket.close(code=4003, reason="Not a member")
        return

    await manager.connect(websocket, organization_id, auth_user.id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                message_type = message.get("type")

                if message_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif message_type == "task_update":
                    await manager.broadcast_to_organization(
                        {"type": "task_update", "data": message.get("data")},
                        organization_id
                    )
                elif message_type == "notification":
                    target_user = message.get("user_id")
                    if target_user:
                        await manager.send_personal_message(
                            {"type": "notification", "data": message.get("data")},
                            target_user
                        )
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, organization_id, auth_user.id)
        logger.info(f"WebSocket disconnected. Org: {organization_id}")

@router.websocket("/ws/user/{user_id}")
async def user_websocket_endpoint(websocket: WebSocket, user_id: str, token: str = None):
    from ..core.firebase_admin import verify_id_token

    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return
    auth_user = verify_id_token(token)
    if not auth_user or auth_user.id != user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await manager.connect(websocket, user_id=auth_user.id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id=auth_user.id)
        logger.info(f"User WebSocket disconnected: {user_id}")
