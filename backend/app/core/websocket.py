from typing import Dict
from fastapi import WebSocket, WebSocketDisconnect, APIRouter
from datetime import datetime
import logging
from zoneinfo import ZoneInfo
from ..models.user import User
from .auth import get_current_user
from jose import JWTError, jwt
from .config.auth import get_auth_settings
import asyncio
import json

logger = logging.getLogger(__name__)

router = APIRouter()
auth_settings = get_auth_settings()

# WebSocket 메시지 타입 정의
class WSMessageType:
    CONNECTED = "connected"
    CONNECT_ACK = "connect_ack"  # 클라이언트의 연결 확인 응답
    PING = "ping"
    PONG = "pong"
    ERROR = "error"
    NOTIFICATION = "notification"

class ConnectionManager:
    def __init__(self):
        # user_id -> (WebSocket, Task)
        self.active_connections: Dict[str, tuple[WebSocket, asyncio.Task]] = {}
        # 연결 시도 중인 사용자 추적
        self.connecting_users: set[str] = set()

    async def connect(self, websocket: WebSocket, user_id: str) -> bool:
        """새로운 WebSocket 연결을 설정합니다."""
        if user_id in self.connecting_users:
            logger.warning(f"User {user_id} is already in connecting state")
            return False

        if user_id in self.active_connections:
            logger.warning(f"User {user_id} already has an active connection")
            try:
                old_websocket, old_task = self.active_connections[user_id]
                await self.disconnect(user_id)
            except Exception as e:
                logger.error(f"Error cleaning up old connection for user {user_id}: {str(e)}")

        try:
            self.connecting_users.add(user_id)
            await websocket.accept()
            
            # 연결 시작 시간 기록
            connection_start = datetime.now()
            max_wait_time = 10.0  # 최대 10초 대기
            
            # 연결 성공 메시지 전송
            await websocket.send_json({
                "type": WSMessageType.CONNECTED,
                "data": {
                    "message": "WebSocket 연결이 성공적으로 설정되었습니다.",
                    "user_id": user_id,
                    "requires_ack": True
                },
                "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).isoformat()
            })
            
            # 클라이언트로부터 ACK 응답 대기
            while (datetime.now() - connection_start).total_seconds() < max_wait_time:
                try:
                    response = await asyncio.wait_for(websocket.receive_json(), timeout=2.0)
                    if isinstance(response, dict):
                        if response.get("type") == WSMessageType.CONNECT_ACK:
                            logger.info(f"Received connection acknowledgment from user {user_id}")
                            
                            # Ping 태스크 생성
                            ping_task = asyncio.create_task(self._ping_client(websocket, user_id))
                            self.active_connections[user_id] = (websocket, ping_task)
                            
                            logger.info(f"New WebSocket connection established for user {user_id}")
                            self.connecting_users.remove(user_id)
                            return True
                        else:
                            logger.warning(f"Received unexpected message type from user {user_id} during handshake: {response.get('type')}")
                except asyncio.TimeoutError:
                    continue
                except WebSocketDisconnect as e:
                    logger.error(f"WebSocket disconnected during handshake for user {user_id}: code={e.code}")
                    break
                except Exception as e:
                    logger.error(f"Error during handshake for user {user_id}: {str(e)}")
                    break
            
            logger.error(f"Connection acknowledgment timeout for user {user_id} after {max_wait_time} seconds")
            return False
            
        except Exception as e:
            logger.error(f"Failed to establish WebSocket connection for user {user_id}: {str(e)}")
            return False
        finally:
            if user_id in self.connecting_users:
                self.connecting_users.remove(user_id)

    async def disconnect(self, user_id: str):
        """WebSocket 연결을 종료합니다."""
        if user_id in self.active_connections:
            websocket, ping_task = self.active_connections[user_id]
            # Ping 태스크 취소
            ping_task.cancel()
            try:
                await ping_task
            except asyncio.CancelledError:
                pass
            
            try:
                await websocket.close()
            except Exception as e:
                logger.error(f"Error closing websocket for user {user_id}: {str(e)}")
            
            del self.active_connections[user_id]
            logger.info(f"WebSocket disconnected for user {user_id}")

    async def _ping_client(self, websocket: WebSocket, user_id: str):
        """클라이언트에게 주기적으로 ping을 보냅니다."""
        while True:
            try:
                await asyncio.sleep(30)  # 30초마다 ping 전송
                if user_id in self.active_connections:
                    await self.send_message(user_id, WSMessageType.PING, {
                        "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).isoformat()
                    })
                else:
                    break
            except Exception as e:
                logger.error(f"Ping failed for user {user_id}: {str(e)}")
                await self.disconnect(user_id)
                break

    async def send_message(self, user_id: str, message_type: str, data: dict):
        """표준화된 형식으로 메시지를 전송합니다."""
        if user_id not in self.active_connections:
            return

        websocket, _ = self.active_connections[user_id]
        message = {
            "type": message_type,
            "data": data,
            "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).isoformat()
        }

        try:
            await websocket.send_json(message)
            logger.info(f"Message sent to user {user_id}: {message_type}")
        except Exception as e:
            logger.error(f"Failed to send message to {user_id}: {str(e)}")
            await self.disconnect(user_id)

    async def broadcast(self, message_type: str, data: dict):
        """모든 연결된 클라이언트에게 메시지를 브로드캐스트합니다."""
        for user_id in list(self.active_connections.keys()):
            await self.send_message(user_id, message_type, data)

    async def handle_pong(self, user_id: str, data: dict):
        """클라이언트로부터 받은 pong 메시지를 처리합니다."""
        logger.debug(f"Received pong from user {user_id}: {data}")

manager = ConnectionManager()

async def verify_token(token: str) -> User:
    """토큰을 검증하고 사용자 정보를 반환합니다."""
    try:
        payload = jwt.decode(
            token,
            auth_settings.SECRET_KEY,
            algorithms=[auth_settings.ALGORITHM]
        )
        email: str = payload.get("email")
        if email is None:
            return None
            
        user = await User.find_one({"email": email})
        return user
    except JWTError:
        return None

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 엔드포인트"""
    user_id = None
    
    try:
        # 토큰 검증 및 사용자 정보 가져오기
        token = websocket.query_params.get("token")
        if not token:
            await websocket.close(code=4001, reason="Authentication required")
            return
        
        try:
            user = await verify_token(token)
            if not user:
                await websocket.close(code=4001, reason="Invalid token")
                return
            user_id = str(user.id)
        except Exception as e:
            logger.error(f"Authentication failed: {str(e)}")
            await websocket.close(code=4001, reason="Authentication failed")
            return
        
        # WebSocket 연결 수락
        if not await manager.connect(websocket, user_id):
            return

        try:
            while True:
                data = await websocket.receive_json()
                
                # Pong 메시지 처리
                if isinstance(data, dict) and data.get("type") == WSMessageType.PONG:
                    await manager.handle_pong(user_id, data.get("data", {}))
                    continue
                
                # 다른 메시지 처리
                logger.info(f"Received message from user {user_id}: {data}")
                
        except WebSocketDisconnect:
            if user_id:
                await manager.disconnect(user_id)
        except Exception as e:
            logger.error(f"WebSocket error: {str(e)}")
            if user_id:
                await manager.disconnect(user_id)
    except Exception as e:
        logger.error(f"WebSocket connection error: {str(e)}")
        try:
            await websocket.close(code=4000, reason="Connection error")
        except:
            pass
        if user_id:
            await manager.disconnect(user_id)
