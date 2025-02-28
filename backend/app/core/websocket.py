from enum import Enum
from typing import Dict, List, Optional, Set, Any
from fastapi import WebSocket, WebSocketDisconnect, HTTPException, status, APIRouter, Query, Depends
from datetime import datetime, timedelta
import logging
from zoneinfo import ZoneInfo
import asyncio
import traceback
import json
from .auth import verify_token
from starlette.websockets import WebSocketState, WebSocketDisconnect as StarletteWSDisconnect
from bson import ObjectId
from ..models.user import User
from .cache import handle_websocket_event

logger = logging.getLogger(__name__)
router = APIRouter()

class WSMessageType(str, Enum):
    CONNECTED = "connected"
    CONNECT_ACK = "connect_ack"
    PING = "ping"
    PONG = "pong"
    ERROR = "error"
    NOTIFICATION = "notification"
    NOTIFICATION_READ = "notification_read"
    ALL_NOTIFICATIONS_READ = "all_notifications_read"
    CVE_CREATED = "cve_created"
    CVE_UPDATED = "cve_updated"
    CVE_DELETED = "cve_deleted"

class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.strftime('%Y-%m-%d %H:%M:%S')
        return super().default(obj)

def _calculate_message_size(message):
    """JSON 메시지의 크기를 계산 (바이트 단위)"""
    try:
        json_str = json.dumps(message)
        return len(json_str.encode('utf-8'))
    except:
        return 0

class ConnectionManager:
    """웹소켓 연결 관리자"""
    
    def __init__(self):
        """연결 관리자 초기화"""
        # 단순하게 List로 모든 연결 관리
        self.active_connections: List[WebSocket] = [] 
        self.user_connections: Dict[str, List[WebSocket]] = {}  # 사용자별 연결 추적
        self.cve_subscribers: Dict[str, Set[str]] = {}
        
        # 나머지 속성은 그대로 유지
        self.subscriptions: Dict[str, List[str]] = {}
        self.last_activity: Dict[str, Dict[WebSocket, datetime]] = {}
        self.ping_timers: Dict[str, Dict[WebSocket, asyncio.Task]] = {}
        
        self.KEEP_ALIVE_TIMEOUT = 120
        self.PING_INTERVAL = 45
        self.PONG_TIMEOUT = 15
        self.cleanup_lock = asyncio.Lock()
        self.CLEANUP_INTERVAL = 300  # 5분마다 정리
        self.cleanup_task = None

        # 메시지 크기 제한
        self.MAX_WS_MESSAGE_SIZE = 1024 * 50  # 50KB 제한

    async def connect(self, websocket: WebSocket, user_id: str) -> bool:
        """웹소켓 연결 활성화"""
        try:
            # 웹소켓 연결 수락 - 이미 수락된 상태라면 무시
            if websocket.client_state != WebSocketState.CONNECTED:
                await websocket.accept()
            
            # 전체 연결 목록에 추가
            self.active_connections.append(websocket)
            
            # 사용자별 연결 관리
            if user_id not in self.user_connections:
                self.user_connections[user_id] = []
            self.user_connections[user_id].append(websocket)
            
            # 마지막 활동 시간 초기화
            if user_id not in self.last_activity:
                self.last_activity[user_id] = {}
            self.last_activity[user_id][websocket] = datetime.now(ZoneInfo("Asia/Seoul"))
            
            # ping 타이머 초기화
            if user_id not in self.ping_timers:
                self.ping_timers[user_id] = {}
            
            # 연결 확인 메시지 전송 - Starlette의 send_json 활용
            await websocket.send_json({
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
            
            logger.info(f"새 웹소켓 연결 성공 - 사용자: {user_id}, IP: {websocket.client.host}")
            
            # 클린업 태스크 시작
            if not self.cleanup_task or self.cleanup_task.done():
                self.cleanup_task = asyncio.create_task(self.start_cleanup_task())
                
            return True
        except Exception as e:
            logger.error(f"연결 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False

    async def disconnect(self, user_id: str, websocket: WebSocket):
        """사용자 웹소켓 연결 해제"""
        try:
            # 전체 연결 목록에서 제거
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
                
            # 사용자별 연결에서 제거
            if user_id in self.user_connections:
                if websocket in self.user_connections[user_id]:
                    self.user_connections[user_id].remove(websocket)
                
                # 사용자의 ping 타이머 취소
                if user_id in self.ping_timers and websocket in self.ping_timers[user_id]:
                    self.ping_timers[user_id][websocket].cancel()
                    del self.ping_timers[user_id][websocket]
                
                # 사용자의 마지막 활동 시간 제거
                if user_id in self.last_activity and websocket in self.last_activity[user_id]:
                    del self.last_activity[user_id][websocket]
            
            logger.info(f"웹소켓 연결 해제 - 사용자: {user_id}")
        except Exception as e:
            logger.error(f"연결 해제 중 오류: {str(e)}")
            logger.error(traceback.format_exc())

    async def _unsubscribe_all_cves(self, user_id: str):
        """사용자의 모든 CVE 구독 해제"""
        subscribed_cves = self.subscriptions.get(user_id, []).copy()
        for cve_id in subscribed_cves:
            await self.unsubscribe_cve(user_id, cve_id)
            logger.info(f"사용자 {user_id}의 {cve_id} 구독 자동 해제")

    async def send_json(self, websocket: WebSocket, message: dict):
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending WebSocket message: {str(e)}")
            raise

    async def broadcast(self, message: dict, exclude_user: Optional[str] = None):
        for user_id, connections in self.active_connections.items():
            if user_id != exclude_user:
                for websocket in connections:
                    try:
                        await self.send_json(websocket, message)
                    except Exception as e:
                        logger.error(f"Broadcast error for user {user_id}: {str(e)}")
                        await self.disconnect(user_id, websocket)

    async def handle_message(self, websocket: WebSocket, user_id: str, message: dict):
        try:
            current_time = datetime.now(ZoneInfo("Asia/Seoul"))
            self.last_activity[user_id][websocket] = current_time
            
            message_type = message.get("type")
            if message_type == WSMessageType.PING:
                # 자동으로 pong 응답 전송
                await self.send_json(websocket, {
                    "type": WSMessageType.PONG,
                    "timestamp": current_time.strftime('%Y-%m-%d %H:%M:%S')
                })
                self.last_activity[user_id][websocket] = current_time
                return
            elif message_type == WSMessageType.PONG:
                # pong 응답 수신 시 last_activity 업데이트
                self.last_activity[user_id][websocket] = current_time
                return

            message_data = message.get("data", {})

            if message_type not in ["ping", "pong"]:
                logger.info(f"[WebSocket] Message received from user {user_id}:")
                logger.info(f"[WebSocket] Message type: {message_type}")
                logger.info(f"[WebSocket] Message data: {json.dumps(message_data, indent=2)}")
            
            if message_type == "subscribe_cve":
                cve_id = message_data.get("cveId")
                if cve_id:
                    subscribers = await self.subscribe_cve(user_id, cve_id)
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
                    logger.info(f"[WebSocket] Processing unsubscribe_cve request for {cve_id}")
                    subscribers = await self.unsubscribe_cve(user_id, cve_id)
                    response = {
                        "type": "unsubscribe_cve",
                        "data": {
                            "cveId": cve_id,
                            "subscribers": subscribers
                        }
                    }
                    logger.info(f"[WebSocket] Sending unsubscribe response: {response}")
                    await websocket.send_json(response)
                    return
            
        except Exception as e:
            logger.error(f"[WebSocket] Error handling message: {str(e)}")
            logger.error(f"[WebSocket] Message that caused error: {json.dumps(message, indent=2)}")
            logger.error(f"[WebSocket] Traceback: {traceback.format_exc()}")
            await self.disconnect(user_id, websocket)

    async def start_ping_timer(self, user_id: str, websocket: WebSocket):
        try:
            while True:
                await asyncio.sleep(self.PING_INTERVAL)
                if user_id not in self.active_connections:
                    break

                try:
                    ping_time = datetime.now(ZoneInfo("Asia/Seoul"))
                    try:
                        await websocket.send_json({
                            "type": WSMessageType.PING,
                            "timestamp": ping_time.strftime('%Y-%m-%d %H:%M:%S')
                        })
                    except Exception as send_error:
                        logger.error(f"Error sending ping: {str(send_error)}")
                        await self.disconnect(user_id, websocket)
                        break
                    
                    pong_received = False
                    for _ in range(self.PONG_TIMEOUT):
                        if websocket not in self.last_activity[user_id]:
                            break
                        last_activity = self.last_activity[user_id][websocket]
                        if last_activity > ping_time:
                            pong_received = True
                            break
                        await asyncio.sleep(1)
                    
                    if not pong_received:
                        logger.warning(f"No pong response from user {user_id} - Closing connection")
                        await self.handle_connection_error(user_id, websocket)
                        break

                except Exception as e:
                    if "close message has been sent" not in str(e):
                        logger.error(f"Error in ping timer for user {user_id}: {str(e)}")
                    await self.handle_connection_error(user_id, websocket)
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
        try:
            if user_id not in self.subscriptions:
                self.subscriptions[user_id] = []
            if cve_id not in self.subscriptions[user_id]:
                self.subscriptions[user_id].append(cve_id)
                logger.info(f"[WebSocket] Added subscription:")
                logger.info(f"  - CVE: {cve_id}")
                logger.info(f"  - User: {user_id}")
            
            # cve_subscribers로 통일
            if cve_id not in self.cve_subscribers:
                self.cve_subscribers[cve_id] = set()
            self.cve_subscribers[cve_id].add(user_id)
            
            # 구독자 정보 조회
            subscriber_details = []
            for subscriber_id in self.cve_subscribers[cve_id]:
                user = await User.find_one({"_id": ObjectId(subscriber_id)})
                if user:
                    subscriber_details.append({
                        "id": str(user.id),
                        "username": user.username,
                        "profile_image": user.profile_image if hasattr(user, 'profile_image') else None,
                        "displayName": user.display_name if hasattr(user, 'display_name') else user.username
                    })

            # 구독 메시지 생성
            message = {
                "type": "subscribe_cve",
                "data": {
                    "cveId": cve_id,
                    "subscribers": subscriber_details,
                    "username": (await User.find_one({"_id": ObjectId(user_id)})).username
                },
                "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
            }

            # 1. 기존 구독자들에게 메시지 전송
            for subscriber_id in self.cve_subscribers[cve_id]:
                if subscriber_id != user_id:  # 새로 구독한 사용자 제외
                    await self.send_message(subscriber_id, message)

            # 2. 새로 구독한 사용자에게 메시지 전송
            await self.send_message(user_id, message)

            # 로깅
            logger.info(f"[WebSocket] Broadcast subscribe message:")
            logger.info(f"  - CVE: {cve_id}")
            logger.info(f"  - New subscriber: {user_id}")
            logger.info(f"  - Total subscribers: {len(subscriber_details)}")
            logger.info("  - Active subscribers:")
            for sub in subscriber_details:
                logger.info(f"    • {sub['username']} (ID: {sub['id']}, Display: {sub['displayName']})")

            return subscriber_details
        except Exception as e:
            logger.error(f"[WebSocket] Error in subscribe_cve: {str(e)}")
            logger.error(traceback.format_exc())
            return []

    async def unsubscribe_cve(self, user_id: str, cve_id: str):
        try:
            logger.info(f"[WebSocket] Processing unsubscribe request:")
            logger.info(f"  - CVE: {cve_id}")
            logger.info(f"  - User: {user_id}")

            if user_id in self.subscriptions and cve_id in self.subscriptions[user_id]:
                self.subscriptions[user_id] = [id for id in self.subscriptions[user_id] if id != cve_id]
                logger.info(f"[WebSocket] Removed subscription:")
                logger.info(f"  - CVE: {cve_id}")
                logger.info(f"  - User: {user_id}")
            
            # cve_subscribers로 통일
            if cve_id in self.cve_subscribers:
                self.cve_subscribers[cve_id].discard(user_id)
                if not self.cve_subscribers[cve_id]:
                    del self.cve_subscribers[cve_id]
            
            # 남은 구독자 정보 조회
            subscriber_details = []
            for subscriber_id in self.cve_subscribers.get(cve_id, set()):
                user = await User.find_one({"_id": ObjectId(subscriber_id)})
                if user:
                    subscriber_details.append({
                        "id": str(user.id),
                        "username": user.username,
                        "profile_image": user.profile_image if hasattr(user, 'profile_image') else None,
                        "displayName": user.display_name if hasattr(user, 'display_name') else user.username
                    })
            
            # 구독 해제한 사용자 정보 조회
            unsubscribed_user = await User.find_one({"_id": ObjectId(user_id)})
            username = unsubscribed_user.username if unsubscribed_user else "알 수 없는 사용자"
            
            logger.info(f"[WebSocket] Current subscription state for {cve_id}:")
            logger.info(f"  - Total remaining subscribers: {len(subscriber_details)}")
            if subscriber_details:
                logger.info("  - Active subscribers:")
                for sub in subscriber_details:
                    logger.info(f"    • {sub['username']} (ID: {sub['id']}, Display: {sub['displayName']})")
            else:
                logger.info("  - No active subscribers remaining")
            
            # 구독 해제 메시지를 모든 구독자에게 브로드캐스트
            message = {
                "type": "unsubscribe_cve",
                "data": {
                    "cveId": cve_id,
                    "subscribers": subscriber_details,
                    "username": username
                },
                "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
            }

            # 현재 구독 중인 모든 사용자에게 메시지 전송
            for subscriber_id in self.cve_subscribers.get(cve_id, set()):
                await self.send_message(subscriber_id, message)
            
            # 구독 해제한 사용자에게도 메시지 전송
            await self.send_message(user_id, message)
            
            return subscriber_details
        except Exception as e:
            logger.error(f"[WebSocket] Error in unsubscribe_cve: {str(e)}")
            logger.error(traceback.format_exc())
            return []

    async def broadcast_to_cve(self, cve_id: str, message_type: str, data: dict = None):
        """특정 CVE를 구독 중인 모든 클라이언트에게 메시지 전송"""
        try:
            subscribers = self.cve_subscribers.get(cve_id, set())
            
            # 구독자 정보 조회 및 형식 통일
            subscriber_details = []
            for user_id in subscribers:
                user = await User.find_one({"_id": ObjectId(user_id)})
                if user:
                    subscriber_details.append({
                        "id": str(user.id),  # ObjectId를 문자열로 변환
                        "username": user.username,
                        "profile_image": user.profile_image if hasattr(user, 'profile_image') else None,
                        "displayName": user.display_name if hasattr(user, 'display_name') else user.username
                    })

            # 로깅 추가
            logger.info(f"[WebSocket] Subscriber details: {subscriber_details}")

            # 기본 데이터 구성
            message_data = {
                "subscribers": subscriber_details,
                "cveId": cve_id
            }

            # 추가 데이터가 있으면 병합
            if data:
                # 데이터가 딕셔너리인지 확인
                if isinstance(data, dict):
                    message_data.update(data)
                else:
                    # 딕셔너리가 아닌 경우 안전하게 처리
                    logger.warning(f"[WebSocket] Non-dictionary data provided to broadcast_to_cve: {data}")
                    message_data["additional_data"] = data

            message = {
                "type": message_type,
                "data": message_data,
                "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
            }

            for user_id in subscribers:
                await self.send_message(user_id, message)
            
            logger.info(f"[WebSocket] Broadcasting message for {cve_id}:")
            logger.info(f"  - Message type: {message_type}")
            logger.info(f"  - Subscribers count: {len(subscribers)}")
            logger.info(f"  - Active subscribers: {', '.join(subscribers)}")

        except Exception as e:
            logger.error(f"[WebSocket] Error in broadcast_to_cve: {str(e)}")
            logger.error(traceback.format_exc())

    async def send_message(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            message["timestamp"] = datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
            for websocket in self.active_connections:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending message to user {user_id}: {str(e)}")
                    await self.disconnect(user_id, websocket)

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            for websocket in self.active_connections:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending personal message: {str(e)}")
                    await self.disconnect(user_id, websocket)

    async def start_cleanup_task(self):
        """주기적으로 비활성 구독자 정리"""
        while True:
            try:
                await asyncio.sleep(self.CLEANUP_INTERVAL)
                await self.cleanup_inactive_subscriptions()
            except Exception as e:
                logger.error(f"[WebSocket] Error in cleanup task: {str(e)}")
                logger.error(traceback.format_exc())

    async def cleanup_inactive_subscriptions(self):
        """비활성 구독자 정리"""
        try:
            logger.info("[WebSocket] Starting inactive subscriptions cleanup")
            
            # 모든 CVE의 구독자 확인
            for cve_id, subscribers in self.cve_subscribers.copy().items():
                for user_id in subscribers.copy():
                    # 사용자가 연결되어 있지 않으면 구독 해제
                    if user_id not in self.active_connections or not self.active_connections[user_id]:
                        # 마지막 활동 시간 확인 (15분 이상 비활성 상태인 경우에만 정리)
                        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
                        last_active = None
                        
                        # 사용자의 모든 연결에 대한 마지막 활동 시간 확인
                        if user_id in self.last_activity:
                            for ws, last_time in self.last_activity[user_id].items():
                                if last_active is None or last_time > last_active:
                                    last_active = last_time
                        
                        # 마지막 활동이 없거나 15분 이상 지난 경우에만 구독 해제
                        if last_active is None or (current_time - last_active).total_seconds() > 900:  # 15분 = 900초
                            await self.unsubscribe_cve(user_id, cve_id)
                            logger.info(f"[WebSocket] Cleaned up inactive subscription: User {user_id} from {cve_id}")
                        else:
                            logger.info(f"[WebSocket] Keeping subscription for recently active user: {user_id} on {cve_id}")

            logger.info("[WebSocket] Completed inactive subscriptions cleanup")
        except Exception as e:
            logger.error(f"[WebSocket] Error during subscription cleanup: {str(e)}")
            logger.error(traceback.format_exc())

    async def broadcast_json(self, data: Dict[str, Any]):
        """모든 활성화된 웹소켓 연결에 JSON 데이터 브로드캐스트"""
        try:
            # 메시지 크기 확인 및 로깅
            message_size = _calculate_message_size(data)
            logger.debug(f"웹소켓 메시지 크기: {message_size} 바이트")
            
            # 메시지 크기가 너무 크면 경고
            if message_size > self.MAX_WS_MESSAGE_SIZE:
                logger.warning(f"대용량 웹소켓 메시지 감지 ({message_size} 바이트): {data.get('type', 'unknown')} 타입")
                
                # 크롤러 업데이트 진행 메시지인 경우 updated_cves 필드 제거
                if data.get("type") == "crawler_update_progress" and "data" in data:
                    if "updated_cves" in data["data"]:
                        # 카운트만 유지하고 항목 목록은 제거
                        if isinstance(data["data"]["updated_cves"], dict) and "count" in data["data"]["updated_cves"]:
                            count = data["data"]["updated_cves"]["count"]
                            data["data"]["updated_count"] = count
                        # updated_cves 필드 제거
                        data["data"].pop("updated_cves", None)
                        
                        # 메시지 크기 다시 계산
                        message_size = _calculate_message_size(data)
                        logger.debug(f"필터링 후 웹소켓 메시지 크기: {message_size} 바이트")
            
            # 메시지 타입과 단계 로깅
            if "type" in data and data["type"] == "crawler_update_progress" and "data" in data:
                stage = data["data"].get("stage", "")
                percent = data["data"].get("percent", 0)
                logger.info(f"크롤러 진행 상황 전송: {stage}, {percent}% (메시지 크기: {message_size} 바이트)")
            
            # 전송 지연 증가 (메시지 간 간격 확보) - 100ms로 증가
            await asyncio.sleep(0.1)
            
            # 활성 연결 목록 로깅
            logger.debug(f"활성 웹소켓 연결 수: {len(self.active_connections)}")
            
            # 활성화된 웹소켓 연결이 없으면 일찍 종료
            if not self.active_connections:
                logger.info("활성화된 웹소켓 연결이 없습니다. 브로드캐스트를 건너뜁니다.")
                return 0
            
            # 중요 메시지인 경우 전송 보장을 위해 재시도 로직 추가
            is_important = False
            if "type" in data and data["type"] == "crawler_update_progress" and "data" in data:
                stage = data["data"].get("stage", "")
                if stage in ["준비", "데이터 수집", "데이터 처리", "데이터베이스 업데이트", "완료"]:
                    is_important = True
            
            # 재시도 횟수 설정 (중요 메시지는 최대 3회)
            max_retries = 3 if is_important else 1
            
            for attempt in range(max_retries):
                # 직접 모든 연결에 전송
                sent_count = 0
                disconnected = []  # 연결이 끊어진 웹소켓 목록
                
                for connection in self.active_connections:
                    try:
                        if connection.client_state == WebSocketState.CONNECTED:
                            # 메시지 전송 전 로깅
                            logger.debug(f"웹소켓 메시지 전송 시도: {connection.client}")
                            
                            # 메시지 전송
                            await connection.send_json(data)
                            
                            # 전송 후 적은 지연 추가 (과부하 방지)
                            await asyncio.sleep(0.01)
                            
                            sent_count += 1
                        else:
                            # 연결 상태 로깅
                            logger.debug(f"비활성 웹소켓 연결: {connection.client}, 상태: {connection.client_state}")
                            disconnected.append(connection)
                    except Exception as e:
                        logger.warning(f"메시지 전송 실패: {str(e)}")
                        logger.debug(traceback.format_exc())
                        disconnected.append(connection)
                
                # 연결이 끊어진 웹소켓 정리
                for conn in disconnected:
                    if conn in self.active_connections:
                        self.active_connections.remove(conn)
                        logger.info("오래된 연결 제거됨")
                
                if sent_count > 0 or attempt == max_retries - 1:
                    break
                
                # 재시도 전 대기
                if attempt < max_retries - 1:
                    logger.warning(f"중요 메시지 전송 재시도 ({attempt+2}/{max_retries}): {data.get('type')}")
                    await asyncio.sleep(0.5)
                
            if sent_count > 0:
                logger.info(f"총 {sent_count}개 연결에 성공적으로 메시지 브로드캐스트")
                
            return sent_count
        except Exception as e:
            logger.error(f"브로드캐스트 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return 0

    def _serialize_datetime(self, data):
        """datetime 객체를 ISO 형식 문자열로 변환"""
        if isinstance(data, dict):
            return {k: self._serialize_datetime(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._serialize_datetime(i) for i in data]
        elif isinstance(data, datetime):
            return data.isoformat()
        else:
            return data

    async def send_to_specific_user(self, user_id: str, data: Dict[str, Any]):
        """특정 사용자에게만 메시지 전송"""
        try:
            # 사용자별 연결 확인
            user_connections = self.user_connections.get(user_id, [])
            
            if not user_connections:
                logger.warning(f"사용자 {user_id}에게 메시지를 보낼 수 없음: 연결된 웹소켓 없음")
                return 0
            
            # 사용자의 모든 연결에 메시지 전송
            sent_count = 0
            disconnected = []
            
            for connection in user_connections:
                try:
                    if connection.client_state == WebSocketState.CONNECTED:
                        await connection.send_json(data)
                        sent_count += 1
                    else:
                        disconnected.append(connection)
                except Exception as e:
                    logger.warning(f"사용자 {user_id}에게 메시지 전송 실패: {str(e)}")
                    disconnected.append(connection)
            
            # 끊어진 연결 정리
            for conn in disconnected:
                if conn in user_connections:
                    user_connections.remove(conn)
                    if conn in self.active_connections:
                        self.active_connections.remove(conn)
            
            if sent_count > 0:
                logger.info(f"사용자 {user_id}에게 {sent_count}개 연결로 메시지 전송 성공")
            
            return sent_count
        except Exception as e:
            logger.error(f"사용자 메시지 전송 중 오류: {str(e)}")
            return 0

manager = ConnectionManager()

@router.websocket("/ws/connect/{token}")
async def authenticated_websocket(websocket: WebSocket, token: str):
    """인증된 웹소켓 연결 처리"""
    try:
        # 토큰 검증
        user = await verify_token(token)
        if not user:
            await websocket.close(code=1008, reason="Invalid or expired token")
            return
        
        # 웹소켓 연결 수락
        await websocket.accept()
        
        # 연결 관리자에 사용자 추가
        await manager.connect(websocket, str(user.id))
        logger.info(f"인증된 웹소켓 연결 성공: {user.username} (ID: {user.id})")
        
        try:
            # 클라이언트로부터 메시지 수신 대기
            while True:
                # Starlette의 receive_text 대신 receive_json 활용
                try:
                    # JSON 형식 메시지 수신
                    message = await websocket.receive_json()
                    message_type = message.get("type")
                    
                    # 핑/퐁 메시지 처리
                    if message_type == WSMessageType.PING:
                        await websocket.send_json({
                            "type": WSMessageType.PONG,
                            "data": {
                                "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
                            }
                        })
                        # 마지막 활동 시간 업데이트
                        manager.update_last_activity(str(user.id), websocket)
                        continue
                    
                    # TODO: 다른 메시지 타입 처리
                    # ...
                
                except json.JSONDecodeError:
                    # 텍스트 메시지 처리 (JSON이 아닌 경우)
                    data = await websocket.receive_text()
                    logger.warning(f"잘못된 JSON 형식: {data}")
                    await websocket.send_json({
                        "type": WSMessageType.ERROR,
                        "data": {
                            "message": "Invalid JSON format"
                        }
                    })
                except Exception as e:
                    logger.error(f"메시지 처리 오류: {str(e)}")
                    logger.error(traceback.format_exc())
        
        # Starlette의 WebSocketDisconnect 예외 처리
        except (WebSocketDisconnect, StarletteWSDisconnect):
            logger.info(f"웹소켓 연결 종료: {user.username} (ID: {user.id})")
            await manager.disconnect(str(user.id), websocket)
        except Exception as e:
            logger.error(f"웹소켓 오류: {str(e)}")
            logger.error(traceback.format_exc())
            await manager.disconnect(str(user.id), websocket)
    
    except Exception as e:
        logger.error(f"인증 웹소켓 연결 설정 오류: {str(e)}")
        logger.error(traceback.format_exc())
        try:
            await websocket.close(code=1011, reason="Server error")
        except:
            pass

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """인증 없이 크롤러 업데이트 진행 상황을 받기 위한 웹소켓 연결"""
    try:
        # 웹소켓 연결 수락 - Starlette WebSocket 메서드 활용
        await websocket.accept()
        
        # 전역 연결 목록에 추가
        if websocket not in manager.active_connections:
            manager.active_connections.append(websocket)
            
        logger.info(f"크롤러 웹소켓 연결 수립: {websocket.client}")
        
        # 연결 확인 메시지 전송 - Starlette의 send_json 활용
        await websocket.send_json({
            "type": "connection_established",
            "data": {
                "message": "크롤러 웹소켓 연결이 성공적으로 수립되었습니다.",
                "timestamp": datetime.now().isoformat()
            }
        })
        
        # 연결 유지
        while True:
            try:
                # JSON 메시지 수신 시도
                message = await websocket.receive_json()
                logger.debug(f"웹소켓 JSON 메시지 수신: {message}")
                
                # 메시지 타입에 따른 처리
                message_type = message.get("type")
                if message_type == "ping":
                    await websocket.send_json({"type": "pong", "data": {"timestamp": datetime.now().isoformat()}})
            except json.JSONDecodeError:
                # 일반 텍스트 메시지 처리
                data = await websocket.receive_text()
                logger.debug(f"웹소켓 텍스트 메시지 수신: {data}")
                
                # 핑/퐁 메시지 처리
                if data == "ping":
                    await websocket.send_text("pong")
    
    # Starlette의 WebSocketDisconnect 예외 활용
    except (WebSocketDisconnect, StarletteWSDisconnect):
        logger.info(f"웹소켓 연결 종료: {websocket.client}")
        if websocket in manager.active_connections:
            manager.active_connections.remove(websocket)
    except Exception as e:
        logger.error(f"웹소켓 오류: {str(e)}")
        if websocket in manager.active_connections:
            manager.active_connections.remove(websocket)
