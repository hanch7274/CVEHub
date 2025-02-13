from enum import Enum
from typing import Dict, List, Optional, Set, Any
from fastapi import WebSocket, WebSocketDisconnect, HTTPException, status, APIRouter, Query
from datetime import datetime
import logging
from zoneinfo import ZoneInfo
import asyncio
import traceback
import json
from .auth import verify_token  # auth.py에서 토큰 검증 함수 import

logger = logging.getLogger(__name__)

# APIRouter 인스턴스 생성
router = APIRouter()

class WSMessageType(str, Enum):
    # 시스템 관련
    CONNECTED = "connected"
    CONNECT_ACK = "connect_ack"
    PING = "ping"
    PONG = "pong"
    ERROR = "error"

    # 알림 관련
    NOTIFICATION = "notification"
    NOTIFICATION_READ = "notification_read"
    ALL_NOTIFICATIONS_READ = "all_notifications_read"

    # CVE 관련
    CVE_CREATED = "cve_created"
    CVE_UPDATED = "cve_updated"
    CVE_DELETED = "cve_deleted"

class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.strftime('%Y-%m-%d %H:%M:%S')
        return super().default(obj)

class ConnectionManager:
    def __init__(self):
        # 연결 관리 - 사용자당 여러 연결 허용
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # 구독 관리 - 사용자별 CVE 구독 목록
        self.subscriptions: Dict[str, List[str]] = {}  # user_id: List[cve_id]
        # 활동 시간 관리
        self.last_activity: Dict[str, Dict[WebSocket, datetime]] = {}
        # ping/pong 관리
        self.ping_timers: Dict[str, Dict[WebSocket, asyncio.Task]] = {}
        
        # 타임아웃 설정
        self.KEEP_ALIVE_TIMEOUT = 60
        self.PING_INTERVAL = 30
        self.PONG_TIMEOUT = 10
        self.cleanup_lock = asyncio.Lock()

        # 구독자 관리 - cve_id: Set[user_id]
        self.subscribers: Dict[str, Set[str]] = {}

    async def connect(self, websocket: WebSocket, user_id: str) -> bool:
        """새로운 WebSocket 연결을 등록"""
        try:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = []
                self.last_activity[user_id] = {}
                self.ping_timers[user_id] = {}

            self.active_connections[user_id].append(websocket)
            self.last_activity[user_id][websocket] = datetime.now(ZoneInfo("Asia/Seoul"))

            # 연결 성공 메시지 전송
            await self.send_json(websocket, {
                "type": WSMessageType.CONNECTED,
                "data": {
                    "user_id": user_id,
                    "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
                }
            })

            # ping 타이머 시작
            self.ping_timers[user_id][websocket] = asyncio.create_task(
                self.start_ping_timer(user_id, websocket)
            )

            logging.info(f"New WebSocket connection for user: {user_id}")
            return True
        except Exception as e:
            logging.error(f"Connection error: {str(e)}")
            return False

    async def disconnect(self, user_id: str, websocket: WebSocket):
        try:
            if user_id in self.active_connections:
                # 특정 웹소켓 연결만 제거
                if websocket in self.active_connections[user_id]:
                    self.active_connections[user_id].remove(websocket)
                    
                    # 타이머 정리
                    if websocket in self.ping_timers[user_id]:
                        self.ping_timers[user_id][websocket].cancel()
                        del self.ping_timers[user_id][websocket]
                    
                    # 활동 시간 정리
                    if websocket in self.last_activity[user_id]:
                        del self.last_activity[user_id][websocket]

                # 사용자의 모든 연결이 끊어졌을 때 정리
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
                    del self.last_activity[user_id]
                    del self.ping_timers[user_id]

                logging.info(f"WebSocket disconnected for user: {user_id}")
                
                if websocket.client_state.CONNECTED:
                    await websocket.close()
                    
            # 구독 정리
            if user_id in self.subscriptions:
                del self.subscriptions[user_id]
                logging.info(f"Cleaned up subscriptions for user {user_id}")
                
        except Exception as e:
            logging.error(f"Error during WebSocket disconnect: {str(e)}")

    async def send_json(self, websocket: WebSocket, message: dict):
        try:
            if websocket.client_state.CONNECTED:
                await websocket.send_json(message)
        except Exception as e:
            logging.error(f"Error sending WebSocket message: {str(e)}")
            raise

    async def broadcast(self, message: dict, exclude_user: Optional[str] = None):
        """모든 연결된 클라이언트에게 메시지를 전송합니다."""
        for user_id, connections in self.active_connections.items():
            if user_id != exclude_user:
                for websocket in connections:
                    try:
                        await self.send_json(websocket, message)
                    except Exception as e:
                        logging.error(f"Broadcast error for user {user_id}: {str(e)}")
                        await self.disconnect(user_id, websocket)

    async def handle_message(self, websocket: WebSocket, user_id: str, message: dict):
        try:
            current_time = datetime.now(ZoneInfo("Asia/Seoul"))
            self.last_activity[user_id][websocket] = current_time
            
            # 메시지 파싱
            message_type = message.get("type")
            message_data = message.get("data", {})

            # ping/pong 메시지는 조용히 처리하고 즉시 리턴
            if message_type == "ping":  # WSMessageType.PING 대신 문자열 직접 비교
                await websocket.send_json({
                    "type": "pong",  # WSMessageType.PONG 대신 문자열 사용
                    "timestamp": current_time.strftime('%Y-%m-%d %H:%M:%S')
                })
                return
            
            if message_type == "pong":  # WSMessageType.PONG 대신 문자열 직접 비교
                return

            # ping/pong이 아닌 메시지만 로깅 및 처리
            if message_type not in ["ping", "pong"]:  # WSMessageType 대신 문자열 리스트 사용
                logging.info(f"[WebSocket] Message received from user {user_id}:")
                logging.info(f"[WebSocket] Message type: {message_type}")
                logging.info(f"[WebSocket] Message data: {json.dumps(message_data, indent=2)}")
            
            # 구독 관련 메시지 처리
            if message_type == "subscribe_cve":
                cve_id = message_data.get("cveId")
                if cve_id:
                    subscribers = await self.subscribe_cve(user_id, cve_id)
                    
                    # 구독 응답 전송
                    response = {
                        "type": "subscribe_cve",
                        "data": {
                            "cveId": cve_id,
                            "subscribers": subscribers,
                            "message": f"Successfully subscribed to {cve_id}"
                        }
                    }
                    await websocket.send_json(response)
                    return
                
            elif message_type == "unsubscribe_cve":
                cve_id = message_data.get("cveId")
                if cve_id:
                    logging.info(f"[WebSocket] Processing unsubscribe_cve request for {cve_id}")
                    subscribers = await self.unsubscribe_cve(user_id, cve_id)
                    response = {
                        "type": "unsubscribe_cve",
                        "data": {
                            "cveId": cve_id,
                            "subscribers": subscribers
                        }
                    }
                    logging.info(f"[WebSocket] Sending unsubscribe response: {response}")
                    await websocket.send_json(response)
                    return
            
        except Exception as e:
            logging.error(f"[WebSocket] Error handling message: {str(e)}")
            logging.error(f"[WebSocket] Message that caused error: {json.dumps(message, indent=2)}")
            logging.error(f"[WebSocket] Traceback: {traceback.format_exc()}")
            await self.disconnect(user_id, websocket)

    async def start_ping_timer(self, user_id: str, websocket: WebSocket):
        try:
            while True:
                await asyncio.sleep(self.PING_INTERVAL)
                if user_id in self.active_connections:
                    try:
                        await websocket.send_json({
                            "type": WSMessageType.PING,
                            "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
                        })
                        
                        # pong 응답 대기
                        pong_wait_start = datetime.now(ZoneInfo("Asia/Seoul"))
                        while (datetime.now(ZoneInfo("Asia/Seoul")) - pong_wait_start).total_seconds() < self.PONG_TIMEOUT:
                            if websocket in self.last_activity[user_id] and \
                               (datetime.now(ZoneInfo("Asia/Seoul")) - self.last_activity[user_id][websocket]).total_seconds() < self.PONG_TIMEOUT:
                                break
                            await asyncio.sleep(1)
                        
                        if websocket in self.last_activity[user_id] and \
                           (datetime.now(ZoneInfo("Asia/Seoul")) - self.last_activity[user_id][websocket]).total_seconds() >= self.PONG_TIMEOUT:
                            logger.warning(f"No pong response from user {user_id}")
                            await self.handle_connection_error(user_id, websocket)
                            break
                            
                    except Exception as e:
                        logger.error(f"Error in ping timer for user {user_id}: {str(e)}")
                        await self.handle_connection_error(user_id, websocket)
                        break
                else:
                    break
                    
        except Exception as e:
            logger.error(f"Error in ping timer for user {user_id}: {str(e)}")

    async def handle_connection_error(self, user_id: str, websocket: WebSocket):
        try:
            async with self.cleanup_lock:
                if user_id in self.active_connections:
                    try:
                        await websocket.close(code=1001, reason="Connection error")
                    except Exception as e:
                        logger.error(f"Error closing websocket for user {user_id}: {str(e)}")
                    finally:
                        await self.disconnect(user_id, websocket)
        except Exception as e:
            logger.error(f"Error in handle_connection_error: {str(e)}")

    async def subscribe_cve(self, user_id: str, cve_id: str):
        """CVE 구독 처리 및 구독자 목록 반환"""
        try:
            logging.info(f"[WebSocket] Processing subscribe request - user: {user_id}, cve: {cve_id}")

            # 사용자의 구독 목록에 추가
            if user_id not in self.subscriptions:
                self.subscriptions[user_id] = []
            if cve_id not in self.subscriptions[user_id]:
                self.subscriptions[user_id].append(cve_id)
                logging.info(f"[WebSocket] Added {cve_id} to user {user_id}'s subscriptions")

            # CVE의 구독자 목록에 추가
            if cve_id not in self.subscribers:
                self.subscribers[cve_id] = set()
            self.subscribers[cve_id].add(user_id)

            # 구독자 목록 반환 및 로깅
            subscribers = list(self.subscribers.get(cve_id, set()))
            logging.info(f"[WebSocket] Subscription state for {cve_id}:")
            logging.info(f"  - Total subscribers: {len(subscribers)}")
            if subscribers:
                logging.info(f"  - Active subscribers: {', '.join(subscribers)}")
            else:
                logging.info("  - No active subscribers")

            return subscribers
        except Exception as e:
            logging.error(f"[WebSocket] Error in subscribe_cve: {str(e)}")
            logging.error(traceback.format_exc())
            return []

    async def unsubscribe_cve(self, user_id: str, cve_id: str):
        # 사용자의 구독 목록에서 제거
        if user_id in self.subscriptions and cve_id in self.subscriptions[user_id]:
            self.subscriptions[user_id].remove(cve_id)

        # CVE의 구독자 목록에서 제거
        if cve_id in self.subscribers:
            self.subscribers[cve_id].discard(user_id)
            if not self.subscribers[cve_id]:
                del self.subscribers[cve_id]

        # 남은 구독자 목록 반환
        subscribers = list(self.subscribers.get(cve_id, set()))
        logging.info(f"Remaining subscribers for {cve_id}: {subscribers}")
        return subscribers

    async def broadcast_to_cve(self, cve_id: str, message: dict, sender_id: str = None):
        """CVE 구독자들에게 메시지 브로드캐스트"""
        try:
            subscribers = self.subscribers.get(cve_id, set())
            # 발신자를 제외한 구독자 수 계산
            active_subscribers = set(subscribers) - {sender_id} if sender_id else subscribers
            subscriber_count = len(active_subscribers)
            
            logging.info(f"[WebSocket] Broadcasting message for {cve_id}:")
            logging.info(f"  - Message type: {message.get('type')}")
            logging.info(f"  - Subscribers count: {subscriber_count}")
            
            if subscriber_count > 0:
                logging.info(f"  - Active subscribers: {', '.join(active_subscribers)}")
            else:
                logging.info("  - No active subscribers")

            # datetime 객체를 JSON으로 직렬화
            message_json = json.loads(json.dumps(message, cls=DateTimeEncoder))
            
            # 구독자들에게 메시지 전송
            for user_id in active_subscribers:
                if user_id in self.active_connections:
                    connections = list(self.active_connections[user_id])
                    for websocket in connections:
                        try:
                            await websocket.send_json(message_json)
                            logging.info(f"[WebSocket] Message sent to user {user_id}")
                        except Exception as e:
                            logging.error(f"[WebSocket] Error broadcasting to user {user_id}: {str(e)}")
                            await self.disconnect(user_id, websocket)

        except Exception as e:
            logging.error(f"[WebSocket] Error in broadcast_to_cve: {str(e)}")
            logging.error(traceback.format_exc())

    async def send_message_to_client(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            message["timestamp"] = datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
            for websocket in self.active_connections[user_id]:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending message to user {user_id}: {str(e)}")
                    await self.disconnect(user_id, websocket)

    async def websocket_endpoint(self, websocket: WebSocket):
        user_id = None
        try:
            # 토큰 검증
            token = websocket.query_params.get("token")
            
            if not token:
                await websocket.close(code=4001)
                return
            
            user = await verify_token(token)
            if not user:
                await websocket.close(code=4001)
                return
            
            user_id = str(user.id)
            logging.info(f"WebSocket connection established for user: {user_id}")
            
            # 연결 수락 및 초기화
            connection_success = await self.connect(websocket, user_id)
            if not connection_success:
                logging.error(f"Failed to establish WebSocket connection for user: {user_id}")
                await websocket.close(code=4002)
                return
            
            # 메시지 수신 루프
            while True:
                try:
                    data = await websocket.receive_json()
                    
                    # 클라이언트로부터 PONG 메시지 수신 시 처리
                    if data.get("type") == WSMessageType.PONG:
                        await self.handle_pong(user_id)
                        continue
                    
                    # 클라이언트로부터 CONNECT_ACK 메시지 수신 시 처리
                    if data.get("type") == WSMessageType.CONNECT_ACK:
                        logging.info(f"Received connect acknowledgment for user: {user_id}")
                        continue
                    
                except WebSocketDisconnect:
                    logging.info(f"WebSocket disconnected for user: {user_id}")
                    break
                except Exception as e:
                    logging.error(f"WebSocket error for user {user_id}: {str(e)}")
                    logging.error(traceback.format_exc())
                    break
                
        except Exception as e:
            logging.error(f"WebSocket endpoint error: {str(e)}")
            logging.error(traceback.format_exc())
            
        finally:
            if user_id:
                await self.disconnect(user_id, websocket)

    async def handle_pong(self, user_id: str):
        """Pong 메시지를 받았을 때 타임스탬프 업데이트"""
        if user_id in self.active_connections:
            for websocket in self.active_connections[user_id]:
                current_time = datetime.now(ZoneInfo("Asia/Seoul"))
                self.last_activity[user_id][websocket] = current_time
                logger.debug(f"[WebSocket] Pong received - Updated last activity for user {user_id} at {current_time.strftime('%Y-%m-%d %H:%M:%S')}")

    async def check_connections(self):
        """비활성 연결을 확인하고 정리합니다."""
        try:
            current_time = datetime.now(ZoneInfo("Asia/Seoul"))
            disconnected_users = []
            
            for user_id, connections in self.active_connections.items():
                for websocket in connections:
                    if (current_time - self.last_activity[user_id][websocket]).total_seconds() > self.KEEP_ALIVE_TIMEOUT:
                        logger.warning(f"User {user_id} timed out after {self.KEEP_ALIVE_TIMEOUT} seconds of inactivity")
                        disconnected_users.append((user_id, websocket))
            
            for user_id, websocket in disconnected_users:
                await self.handle_connection_error(user_id, websocket)
        except Exception as e:
            logger.error(f"Error checking connections: {str(e)}")

    async def broadcast_cve_change(self, event_type: str, data: dict):
        """CVE 변경사항을 구독자에게만 전송합니다."""
        try:
            cve_id = data.get("cve", {}).get("cve_id")
            if not cve_id:
                logger.error("No CVE ID in broadcast data")
                return
            
            message = {
                "type": event_type,
                "data": data,
                "timestamp": datetime.now(ZoneInfo('Asia/Seoul')).strftime('%Y-%m-%d %H:%M:%S')
            }
            
            await self.broadcast_to_cve(cve_id, message)
        except Exception as e:
            logger.error(f"Error in broadcast_cve_change: {str(e)}")

    async def send_message(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            for websocket in self.active_connections[user_id]:
                try:
                    message_json = json.dumps(message, cls=DateTimeEncoder)
                    await websocket.send_text(message_json)
                except Exception as e:
                    logger.error(f"Error sending message to user {user_id}: {str(e)}")
                    await self.disconnect(user_id, websocket)

    async def send_personal_message(self, message: dict, user_id: str):
        """특정 사용자의 모든 연결에 메시지를 전송합니다."""
        if user_id in self.active_connections:
            for websocket in self.active_connections[user_id]:
                try:
                    await self.send_json(websocket, message)
                except Exception as e:
                    logging.error(f"Error sending personal message: {str(e)}")
                    await self.disconnect(user_id, websocket)

# 전역 ConnectionManager 인스턴스 생성
manager = ConnectionManager()

# WebSocket 엔드포인트
@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    try:
        logger.info(f"WebSocket connection attempt with token: {token[:10]}...")
        
        # 토큰 검증
        try:
            user = await verify_token(token)
            if not user:
                logger.error("Invalid token")
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
            logger.info(f"Token verified for user: {user.email}")
        except Exception as e:
            logger.error(f"Token verification failed: {str(e)}")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        # 웹소켓 연결 수락
        await websocket.accept()
        
        # 연결 관리자에 추가
        user_id = str(user.id)
        if not await manager.connect(websocket, user_id):
            logger.error(f"Failed to establish WebSocket connection for user {user_id}")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        try:
            while True:
                data = await websocket.receive_json()
                await manager.handle_message(websocket, user_id, data)
        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected for user: {user_id}")
        finally:
            await manager.disconnect(user_id, websocket)
            
    except Exception as e:
        logger.error(f"WebSocket endpoint error: {str(e)}")
        if websocket.client_state.CONNECTED:
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)

def datetime_to_str(obj: Any) -> Any:
    """Convert datetime objects to ISO format strings recursively"""
    if isinstance(obj, datetime):
        return obj.strftime('%Y-%m-%d %H:%M:%S')
    elif isinstance(obj, dict):
        return {k: datetime_to_str(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [datetime_to_str(item) for item in obj]
    return obj

async def broadcast_message(message: Dict[str, Any], manager) -> None:
    try:
        # DateTimeEncoder를 사용하여 datetime 객체를 ISO 문자열로 변환
        message_str = json.dumps(message, cls=DateTimeEncoder)
        
        # 연결된 모든 클라이언트에게 브로드캐스트
        for user_id, connections in manager.active_connections.items():
            for websocket in connections:
                try:
                    await websocket.send_text(message_str)
                except Exception as e:
                    logging.error(f"Broadcast error for session {websocket.id}: {str(e)}")
                
    except Exception as e:
        logging.error(f"Error sending WebSocket message: {str(e)}")
