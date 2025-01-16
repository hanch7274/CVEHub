from typing import List, Dict, Union, Set
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime
import logging
import json
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # {username: [websocket: WebSocket]}
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # {username: Set[str]} - 각 사용자의 활성 세션 ID 저장
        self.active_sessions: Dict[str, Set[str]] = {}

    async def connect(self, websocket: WebSocket, username: str, session_id: str):
        """웹소켓 연결을 관리자에 추가합니다."""
        if username not in self.active_connections:
            self.active_connections[username] = []
            self.active_sessions[username] = set()
        
        # 이미 존재하는 세션인지 확인
        if session_id in self.active_sessions[username]:
            logger.warning(f"Duplicate session detected for user {username}")
            return False
            
        self.active_connections[username].append(websocket)
        self.active_sessions[username].add(session_id)
        logger.info(f"New WebSocket connection added for user {username} (session: {session_id})")
        return True

    def disconnect(self, websocket: WebSocket, username: str, session_id: str):
        """웹소켓 연결을 관리자에서 제거합니다."""
        if username in self.active_connections:
            if websocket in self.active_connections[username]:
                self.active_connections[username].remove(websocket)
                logger.info(f"WebSocket connection removed for user {username} (session: {session_id})")
            if session_id in self.active_sessions[username]:
                self.active_sessions[username].remove(session_id)
            if not self.active_connections[username]:
                del self.active_connections[username]
                del self.active_sessions[username]
                logger.info(f"User {username} has no active connections. Removing user.")

    def is_connected(self, username: str) -> bool:
        """사용자의 연결 상태를 확인합니다."""
        return username in self.active_connections and len(self.active_connections[username]) > 0

    def has_session(self, username: str, session_id: str) -> bool:
        """사용자의 특정 세션이 활성 상태인지 확인합니다."""
        return username in self.active_sessions and session_id in self.active_sessions[username]

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """특정 웹소켓 연결에 개인 메시지를 전송합니다."""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error(f"Error sending personal message: {str(e)}")

    async def broadcast(self, message: Union[str, dict]):
        """모든 활성 연결에 메시지를 브로드캐스트합니다."""
        if isinstance(message, str):
            message = {
                "type": "message",
                "data": message,
                "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).isoformat()
            }
        elif isinstance(message, dict) and "timestamp" not in message:
            message["timestamp"] = datetime.now(ZoneInfo("Asia/Seoul")).isoformat()

        message_str = json.dumps(message)
        disconnected_users = []
        
        for username, connections in self.active_connections.items():
            disconnected = []
            for websocket in connections:
                try:
                    await websocket.send_text(message_str)
                except WebSocketDisconnect:
                    disconnected.append(websocket)
                except Exception as e:
                    logger.error(f"Error broadcasting message to user {username}: {str(e)}")
                    disconnected.append(websocket)
            
            # 연결이 끊긴 웹소켓 제거
            for websocket in disconnected:
                # 세션 ID를 찾아서 제거
                session_id = next((sid for sid in self.active_sessions[username] 
                                if any(ws == websocket for ws in self.active_connections[username])), None)
                if session_id:
                    self.disconnect(websocket, username, session_id)
            
            # 사용자의 모든 연결이 끊어졌는지 확인
            if username in self.active_connections and not self.active_connections[username]:
                disconnected_users.append(username)
        
        # 연결이 없는 사용자 제거
        for username in disconnected_users:
            if username in self.active_connections:
                del self.active_connections[username]
                del self.active_sessions[username]
                logger.info(f"Removed user {username} with no active connections")

    async def broadcast_user_event(self, username: str, event_type: str, data: str = None):
        """사용자 이벤트를 브로드캐스트합니다."""
        # 이미 연결된 사용자에 대한 중복 이벤트 방지
        if event_type == "user_connected" and len(self.active_connections.get(username, [])) > 1:
            return

        message = {
            "type": event_type,
            "username": username,
            "data": data,
            "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).isoformat()
        }
        await self.broadcast(message)

manager = ConnectionManager()

async def notify_clients(event_type: str, data: dict = None):
    """모든 연결된 클라이언트에게 이벤트를 브로드캐스트합니다."""
    try:
        message = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).isoformat()
        }
        await manager.broadcast(message)
    except Exception as e:
        logger.error(f"Error notifying clients: {str(e)}")
