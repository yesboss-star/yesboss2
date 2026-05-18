from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
import logging

logger = logging.getLogger("yesboss.websocket")

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.user_connections: Dict[str, Set[WebSocket]] = {}

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
            for connection in self.user_connections[user_id]:
                try:
                    await connection.send_json(message)
                except:
                    pass

    async def broadcast_to_organization(self, message: dict, organization_id: str):
        if organization_id in self.active_connections:
            for connection in self.active_connections[organization_id]:
                try:
                    await connection.send_json(message)
                except:
                    pass

manager = ConnectionManager()

@router.websocket("/ws/{organization_id}")
async def websocket_endpoint(websocket: WebSocket, organization_id: str, user_id: str = None):
    await manager.connect(websocket, organization_id, user_id)
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
        manager.disconnect(websocket, organization_id, user_id)
        logger.info(f"WebSocket disconnected. Org: {organization_id}")

@router.websocket("/ws/user/{user_id}")
async def user_websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id=user_id)
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
        manager.disconnect(websocket, user_id=user_id)
        logger.info(f"User WebSocket disconnected: {user_id}")