from enum import Enum
from typing import Dict, List, Optional, Set, Any
from fastapi import WebSocket, WebSocketDisconnect, HTTPException, status, APIRouter, Query
from datetime import datetime
import logging
from zoneinfo import ZoneInfo
import asyncio
import traceback
import json
from .auth import verify_token
from starlette.websockets import WebSocketState
from bson import ObjectId
from ..models.user import User

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

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.subscriptions: Dict[str, List[str]] = {}
        self.last_activity: Dict[str, Dict[WebSocket, datetime]] = {}
        self.ping_timers: Dict[str, Dict[WebSocket, asyncio.Task]] = {}
        
        self.KEEP_ALIVE_TIMEOUT = 120
        self.PING_INTERVAL = 45
        self.PONG_TIMEOUT = 15
        self.cleanup_lock = asyncio.Lock()
        self.cve_subscribers: Dict[str, Set[str]] = {}
        self.CLEANUP_INTERVAL = 300  # 5분마다 정리
        self.cleanup_task = None

    async def connect(self, websocket: WebSocket, user_id: str) -> bool:
        try:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = []
                self.last_activity[user_id] = {}
                self.ping_timers[user_id] = {}

            self.active_connections[user_id].append(websocket)
            self.last_activity[user_id][websocket] = datetime.now(ZoneInfo("Asia/Seoul"))

            await self.send_json(websocket, {
                "type": WSMessageType.CONNECTED,
                "data": {
                    "user_id": user_id,
                    "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
                }
            })

            self.ping_timers[user_id][websocket] = asyncio.create_task(
                self.start_ping_timer(user_id, websocket)
            )

            logger.info(f"New WebSocket connection for user: {user_id}")

            # 클린업 태스크가 실행 중이 아니면 시작
            if not self.cleanup_task or self.cleanup_task.done():
                self.cleanup_task = asyncio.create_task(self.start_cleanup_task())

            return True
        except Exception as e:
            logger.error(f"Connection error: {str(e)}")
            return False

    async def disconnect(self, user_id: str, websocket: WebSocket):
        try:
            # 기존 연결 정리
            if user_id in self.active_connections:
                if websocket in self.active_connections[user_id]:
                    self.active_connections[user_id].remove(websocket)
                    if websocket in self.ping_timers[user_id]:
                        self.ping_timers[user_id][websocket].cancel()
                        del self.ping_timers[user_id][websocket]
                    if websocket in self.last_activity[user_id]:
                        del self.last_activity[user_id][websocket]

                # 사용자의 마지막 연결이 종료되면 모든 구독 해제
                if not self.active_connections[user_id]:
                    # 모든 CVE 구독 해제
                    subscribed_cves = self.subscriptions.get(user_id, []).copy()
                    for cve_id in subscribed_cves:
                        await self.unsubscribe_cve(user_id, cve_id)
                        logger.info(f"[WebSocket] Auto-unsubscribed user {user_id} from {cve_id} due to disconnect")

                    del self.active_connections[user_id]
                    del self.last_activity[user_id]
                    del self.ping_timers[user_id]
                    if user_id in self.subscriptions:
                        del self.subscriptions[user_id]

                    logger.info(f"[WebSocket] Cleaned up all subscriptions for disconnected user {user_id}")

        except Exception as e:
            logger.error(f"[WebSocket] Error during disconnect cleanup: {str(e)}")
            logger.error(traceback.format_exc())

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
                message_data.update(data)

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
            for websocket in self.active_connections[user_id]:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending message to user {user_id}: {str(e)}")
                    await self.disconnect(user_id, websocket)

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            for websocket in self.active_connections[user_id]:
                try:
                    await self.send_json(websocket, message)
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
                        await self.unsubscribe_cve(user_id, cve_id)
                        logger.info(f"[WebSocket] Cleaned up inactive subscription: User {user_id} from {cve_id}")

            logger.info("[WebSocket] Completed inactive subscriptions cleanup")
        except Exception as e:
            logger.error(f"[WebSocket] Error during subscription cleanup: {str(e)}")
            logger.error(traceback.format_exc())

manager = ConnectionManager()
