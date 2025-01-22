from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # 사용자 ID를 키로 하는 웹소켓 연결 저장
        self.active_connections: Dict[str, WebSocket] = {}
        self.background_tasks = set()

    async def connect(self, websocket: WebSocket, user_id: str):
        """새로운 웹소켓 연결을 설정합니다."""
        await websocket.accept()
        self.active_connections[user_id] = websocket
        logger.info(f"New WebSocket connection for user {user_id}")

    async def disconnect(self, websocket: WebSocket, user_id: str):
        """웹소켓 연결을 종료합니다."""
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            logger.info(f"WebSocket disconnected for user {user_id}")

    async def send_personal_message(self, message: dict, user_id: str):
        """특정 사용자에게 메시지를 전송합니다."""
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_json(message)
            logger.info(f"Message sent to user {user_id}: {message}")

    async def send_notification(self, user_id: str, notification: dict, unread_count: int):
        """특정 사용자에게 알림을 전송합니다."""
        if user_id in self.active_connections:
            message = {
                "type": "notification",
                "data": {
                    "notification": notification,
                    "unreadCount": unread_count
                }
            }
            await self.send_personal_message(message, user_id)
            logger.info(f"Sent notification to user {user_id}")

manager = ConnectionManager()