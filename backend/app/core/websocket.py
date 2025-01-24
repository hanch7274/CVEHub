from typing import List, Dict, Union, Set
from fastapi import WebSocket, WebSocketDisconnect, APIRouter, Depends
from datetime import datetime
import logging
import json
from zoneinfo import ZoneInfo
from beanie import PydanticObjectId
from ..models.user import User
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        # username -> Set[WebSocket]
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.background_tasks = set()

    async def connect(self, websocket: WebSocket, username: str):
        """새로운 WebSocket 연결을 추가합니다."""
        await websocket.accept()
        if username not in self.active_connections:
            self.active_connections[username] = set()
        self.active_connections[username].add(websocket)
        logger.info(f"New WebSocket connection for user: {username}")

    def disconnect(self, websocket: WebSocket, username: str):
        """WebSocket 연결을 제거합니다."""
        if username in self.active_connections:
            self.active_connections[username].discard(websocket)
            if not self.active_connections[username]:
                del self.active_connections[username]
            logger.info(f"WebSocket connection closed for user: {username}")

    async def send_personal_message(self, message: dict, username: str):
        """특정 사용자에게 메시지를 전송합니다."""
        if username in self.active_connections:
            websockets = self.active_connections[username]
            for websocket in websockets:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Failed to send message to {username}: {str(e)}")

    async def handle_ping(self, websocket: WebSocket, user_id: str, session_id: str, data: dict):
        """클라이언트로부터 받은 ping 메시지를 처리하고 pong으로 응답합니다."""
        try:
            # 마지막 활동 시간 기록
            last_activity = data.get('lastActivity', None)
            logger.info(f"Received ping from user {user_id} session {session_id}, last activity: {last_activity}")

            # pong 메시지 전송
            pong_message = {
                "type": "pong",
                "data": {
                    "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
                    "session_id": session_id
                }
            }
            await websocket.send_json(pong_message)
            logger.info(f"Sent pong to user {user_id} session {session_id}")
        except Exception as e:
            logger.error(f"Error handling ping from user {user_id} session {session_id}: {str(e)}")
            # 연결에 문제가 있을 수 있으므로 세션 정리
            await self._cleanup_session(user_id, session_id)

    async def send_notification(self, user_id: str, notification: dict):
        """사용자에게 WebSocket을 통해 알림을 전송합니다."""
        try:
            # 사용자의 모든 활성 세션에 알림 전송
            if user_id not in self.active_connections:
                logger.info(f"User {user_id} has no active WebSocket connections")
                return

            # created_at이 이미 문자열인 경우 변환하지 않음
            if isinstance(notification.get('created_at'), datetime):
                notification['created_at'] = notification['created_at'].isoformat()

            # 알림 데이터 준비
            message_data = {
                "type": "notification",
                "data": {
                    "notification": notification,
                    "unreadCount": await self._get_unread_count(user_id),
                    "toast": {
                        "message": notification.get('content', '새로운 알림이 있습니다.'),
                        "severity": "info"
                    }
                }
            }

            logger.info(f"Preparing to send notification: {message_data}")
            
            failed_sessions = []
            for session_id, websocket in self.active_connections[user_id]:
                try:
                    await websocket.send_json(message_data)
                    logger.info(f"Successfully sent notification to session {session_id} of user {user_id}")
                except Exception as e:
                    logger.error(f"Failed to send notification to session {session_id}: {str(e)}")
                    failed_sessions.append(session_id)

            # 실패한 세션 정리
            for session_id in failed_sessions:
                await self._cleanup_session(user_id, session_id)

        except Exception as e:
            logger.error(f"Error in send_notification: {str(e)}")
            logger.error(f"Full error details: {vars(e) if hasattr(e, '__dict__') else {}}")
            logger.error(f"Active connections for user {user_id}: {self.active_connections.get(user_id, {})}")
            raise

    async def _cleanup_session(self, user_id: str, session_id: str):
        """실패한 세션을 정리합니다."""
        try:
            if user_id in self.active_connections and session_id in self.active_connections[user_id]:
                self.active_connections[user_id].discard(session_id)
                logger.info(f"Cleaned up session {session_id} for user {user_id}")
                
                # 사용자의 모든 세션이 종료된 경우 사용자 엔트리 제거
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
                    logger.info(f"Removed empty connection entry for user {user_id}")
        except Exception as e:
            logger.error(f"Error cleaning up session {session_id}: {str(e)}")

    async def _get_unread_count(self, user_id: str) -> int:
        """사용자의 읽지 않은 알림 개수를 조회합니다."""
        try:
            from app.models.notification import Notification
            
            # user_id를 PydanticObjectId로 변환
            recipient_id = PydanticObjectId(user_id)
            
            unread_count = await Notification.find(
                {"recipient_id": recipient_id, "is_read": False}
            ).count()
            
            logger.info(f"Unread notification count for user {user_id}: {unread_count}")
            return unread_count
        except Exception as e:
            logger.error(f"Error getting unread count for user {user_id}: {str(e)}")
            return 0

    async def broadcast(self, message: dict):
        """모든 연결된 클라이언트에게 메시지를 브로드캐스트합니다."""
        for username in self.active_connections:
            await self.send_personal_message(message, username)

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

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 엔드포인트"""
    try:
        # 토큰 검증 및 사용자 정보 가져오기
        token = websocket.query_params.get("token")
        if not token:
            await websocket.close(code=4001, reason="Authentication required")
            return
        
        try:
            user = await get_current_user(token)
            if not user:
                await websocket.close(code=4001, reason="Invalid token")
                return
        except Exception as e:
            logger.error(f"Authentication failed: {str(e)}")
            await websocket.close(code=4001, reason="Authentication failed")
            return
        
        # WebSocket 연결 수락
        await manager.connect(websocket, user.username)
        
        try:
            while True:
                # 클라이언트로부터 메시지 수신
                data = await websocket.receive_json()
                # 필요한 경우 여기서 메시지 처리 로직 추가
        except WebSocketDisconnect:
            manager.disconnect(websocket, user.username)
        except Exception as e:
            logger.error(f"WebSocket error: {str(e)}")
            manager.disconnect(websocket, user.username)
    except Exception as e:
        logger.error(f"WebSocket connection error: {str(e)}")
        try:
            await websocket.close(code=4000, reason="Connection error")
        except:
            pass
