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
import uuid

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
        
        # 세션별 구독 정보 추적을 위한 데이터 구조 추가
        # 형식: {session_id: {user_id: [cve_id1, cve_id2, ...]}}
        self.session_subscriptions: Dict[str, Dict[str, List[str]]] = {}
        # 사용자별 세션 구독 목록: {user_id: {cve_id: [session_id1, session_id2]}}
        self.user_session_subscriptions: Dict[str, Dict[str, List[str]]] = {}
        
        self.KEEP_ALIVE_TIMEOUT = 120
        self.PING_INTERVAL = 45
        self.PONG_TIMEOUT = 15
        self.cleanup_lock = asyncio.Lock()
        self.CLEANUP_INTERVAL = 300  # 5분마다 정리
        self.cleanup_task = None

        # 메시지 크기 제한
        self.MAX_WS_MESSAGE_SIZE = 1024 * 50  # 50KB 제한

    def has_active_connections(self, user_id=None) -> bool:
        """
        사용자 ID에 대한 활성 WebSocket 연결이 있는지 확인합니다.
        user_id가 None이면 모든 사용자에 대해 확인합니다.
        
        Args:
            user_id: 확인할 사용자 ID (선택 사항)
            
        Returns:
            bool: 활성 연결이 있으면 True, 없으면 False
        """
        try:
            # 사용자 ID 정규화 (문자열 형식으로 변환)
            normalized_user_id = str(user_id) if user_id else None
            
            if normalized_user_id:
                # 특정 사용자에 대한 연결 확인
                connections = self.user_connections.get(normalized_user_id, [])
                has_connections = len(connections) > 0
                
                # 연결 상태 로깅
                if has_connections:
                    logger.info(f"사용자 {normalized_user_id}에 대한 활성 WebSocket 연결 {len(connections)}개 확인")
                else:
                    logger.warning(f"사용자 {normalized_user_id}에 대한 활성 WebSocket 연결 없음")
                    
                    # 디버깅을 위한 추가 정보 로깅
                    if self.user_connections:
                        logger.debug(f"현재 활성 연결 사용자 목록: {list(self.user_connections.keys())}")
                        
                        # MongoDB ObjectId와 문자열 형식 불일치 확인
                        for existing_id in self.user_connections.keys():
                            if normalized_user_id in existing_id or existing_id in normalized_user_id:
                                logger.warning(f"ID 형식 불일치 가능성: 요청된 ID '{normalized_user_id}'와 저장된 ID '{existing_id}'가 유사함")
                
                return has_connections
            else:
                # 모든 사용자에 대한 연결 확인
                total_connections = sum(len(conns) for conns in self.user_connections.values())
                
                if total_connections > 0:
                    logger.info(f"총 {len(self.user_connections)}명의 사용자에 대한 {total_connections}개의 활성 WebSocket 연결 확인")
                else:
                    logger.warning("활성 WebSocket 연결이 없음")
                    
                return total_connections > 0
        except Exception as e:
            logger.error(f"WebSocket 연결 확인 중 오류 발생: {str(e)}")
            return False

    async def connect(self, websocket: WebSocket, user_id: str) -> bool:
        """웹소켓 연결 활성화"""
        try:
            # 웹소켓 연결 수락 - 이미 수락된 상태라면 무시
            if websocket.client_state != WebSocketState.CONNECTED:
                await websocket.accept()
                logger.debug(f"웹소켓 연결 수락됨 - 사용자: {user_id}, IP: {websocket.client.host}")
            else:
                logger.debug(f"이미 연결된 웹소켓 - 사용자: {user_id}, IP: {websocket.client.host}")
            
            # 전체 연결 목록에 추가 (active_connections는 리스트)
            self.active_connections.append(websocket)
            
            # 사용자별 연결 관리 (user_connections는 딕셔너리)
            if user_id not in self.user_connections:
                self.user_connections[user_id] = []
            self.user_connections[user_id].append(websocket)
            
            # 연결 상태 로깅
            total_connections = len(self.active_connections)
            active_users = len(self.user_connections)
            user_connection_count = len(self.user_connections.get(user_id, []))
            
            logger.info(f"새 웹소켓 연결 성공 - 사용자: {user_id}, IP: {websocket.client.host}")
            logger.info(f"연결 상태 - 총 연결: {total_connections}, 활성 사용자: {active_users}, 사용자 {user_id}의 연결 수: {user_connection_count}")
            logger.debug(f"활성 사용자 목록: {list(self.user_connections.keys())}")
            
            # 마지막 활동 시간 초기화
            if user_id not in self.last_activity:
                self.last_activity[user_id] = {}
            self.last_activity[user_id][websocket] = datetime.now(ZoneInfo("Asia/Seoul"))
            
            # 핑 타이머 설정
            await self.start_ping_timer(user_id, websocket)
            
            # 명시적으로 연결 확인 메시지 전송
            try:
                connect_ack_message = {
                    "type": "connect_ack",
                    "data": {
                        "user_id": user_id,
                        "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S'),
                        "connection_info": {
                            "total_connections": total_connections,
                            "user_connections": user_connection_count
                        },
                        "message": "서버 연결이 성공적으로 수락되었습니다."
                    }
                }
                await websocket.send_json(connect_ack_message)
                logger.debug(f"connect_ack 메시지 전송 - 사용자: {user_id}")
            except Exception as e:
                logger.error(f"connect_ack 메시지 전송 중 오류 발생: {str(e)}")
                logger.error(traceback.format_exc())
            
            return True
        except Exception as e:
            logger.error(f"연결 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False

    async def disconnect(self, user_id: str, websocket: WebSocket):
        """사용자 웹소켓 연결 해제"""
        try:
            # 연결 상태 로깅 (연결 해제 전)
            total_connections_before = len(self.active_connections)
            active_users_before = len(self.user_connections)
            user_connection_count_before = len(self.user_connections.get(user_id, []))
            
            logger.debug(f"웹소켓 연결 해제 시작 - 사용자: {user_id}")
            logger.debug(f"연결 해제 전 상태 - 총 연결: {total_connections_before}, 활성 사용자: {active_users_before}, 사용자 {user_id}의 연결 수: {user_connection_count_before}")
            
            # 전체 연결 목록에서 제거
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
                logger.debug(f"전체 연결 목록에서 웹소켓 제거됨 - 사용자: {user_id}")
            else:
                logger.warning(f"전체 연결 목록에 존재하지 않는 웹소켓 - 사용자: {user_id}")
            
            # 사용자별 연결에서 제거
            if user_id in self.user_connections:
                if websocket in self.user_connections[user_id]:
                    self.user_connections[user_id].remove(websocket)
                    logger.debug(f"사용자 {user_id}의 연결 목록에서 웹소켓 제거됨")
                else:
                    logger.warning(f"사용자 {user_id}의 연결 목록에 존재하지 않는 웹소켓")
                
                # 사용자의 모든 연결이 끊어진 경우 딕셔너리에서 사용자 제거
                if not self.user_connections[user_id]:
                    del self.user_connections[user_id]
                    logger.debug(f"사용자 {user_id}의 모든 연결이 끊어져 사용자 항목 제거됨")
                
                # 사용자의 ping 타이머 취소
                if user_id in self.ping_timers and websocket in self.ping_timers[user_id]:
                    self.ping_timers[user_id][websocket].cancel()
                    del self.ping_timers[user_id][websocket]
                    logger.debug(f"사용자 {user_id}의 ping 타이머 취소됨")
                
                # 사용자의 마지막 활동 시간 제거
                if user_id in self.last_activity and websocket in self.last_activity[user_id]:
                    del self.last_activity[user_id][websocket]
                    logger.debug(f"사용자 {user_id}의 마지막 활동 시간 제거됨")
            else:
                logger.warning(f"연결 해제 중 - 사용자 {user_id}가 연결 목록에 존재하지 않음")
            
            # 연결 상태 로깅 (연결 해제 후)
            total_connections_after = len(self.active_connections)
            active_users_after = len(self.user_connections)
            user_connection_count_after = len(self.user_connections.get(user_id, []))
            
            logger.info(f"웹소켓 연결 해제 완료 - 사용자: {user_id}")
            logger.info(f"연결 해제 후 상태 - 총 연결: {total_connections_after}, 활성 사용자: {active_users_after}, 사용자 {user_id}의 연결 수: {user_connection_count_after}")
            logger.debug(f"활성 사용자 목록: {list(self.user_connections.keys())}")
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
                logger.info(f"[웹소켓] Message received from user {user_id}:")
                logger.info(f"[웹소켓] Message type: {message_type}")
                logger.info(f"[웹소켓] Message data: {json.dumps(message_data, indent=2)}")
            
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
                    logger.info(f"[웹소켓] Processing unsubscribe_cve request for {cve_id}")
                    subscribers = await self.unsubscribe_cve(user_id, cve_id)
                    response = {
                        "type": "unsubscribe_cve",
                        "data": {
                            "cveId": cve_id,
                            "subscribers": subscribers
                        }
                    }
                    await websocket.send_json(response)
                    return
            elif message_type == "cleanup_connections":
                # 다중 연결 정리 메시지 처리
                cleanup_response = await self.handle_cleanup_connections(websocket, user_id, message_data)
                await websocket.send_json(cleanup_response)
                return
            elif message_type == "session_info":
                # 세션 정보 메시지 처리
                session_id = message_data.get("sessionId")
                client_info = message_data.get("clientInfo", {})
                needs_ack = message_data.get("needsAck", False)
                priority = message_data.get("priority", "normal")
                
                if session_id:
                    logger.info(f"세션 정보 수신 - 사용자: {user_id}, 세션: {session_id}")
                    
                    # 세션 정보 저장
                    if user_id not in self.session_subscriptions:
                        self.session_subscriptions[user_id] = {}
                    
                    # connect_ack 응답 전송 (session_info_ack 대신)
                    # 클라이언트의 웹소켓 초기화와 일관성을 유지하기 위해
                    connection_info = await self.get_connection_info(user_id)
                    
                    response = {
                        "type": "connect_ack",  # session_info_ack 대신 connect_ack 사용
                        "data": {
                            "user_id": user_id,
                            "session_id": session_id,
                            "timestamp": current_time.strftime('%Y-%m-%d %H:%M:%S'),
                            "connection_info": connection_info,
                            "message": "서버 연결이 성공적으로 수락되었습니다."
                        }
                    }
                    
                    # 우선순위가 높은 메시지는 즉시 응답
                    if priority == "high" or needs_ack:
                        await websocket.send_json(response)
                    else:
                        # 일반 우선순위 메시지는 약간의 지연 허용 (백그라운드 태스크로 전송)
                        asyncio.create_task(websocket.send_json(response))
                
            # 기타 메시지 타입 핸들링
            # ...

        except Exception as e:
            logger.error(f"메시지 처리 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            
    async def handle_cleanup_connections(self, websocket: WebSocket, user_id: str, data: dict):
        """
        사용자의 다중 연결을 정리합니다.
        
        Args:
            websocket (WebSocket): 현재 웹소켓 연결
            user_id (str): 사용자 ID
            data (dict): 요청 데이터
        """
        try:
            # 요청 데이터 확인
            keep_current = data.get("keepCurrent", True)
            session_id = data.get("sessionId")
            current_count = data.get("currentCount", 0)
            
            if not session_id:
                logger.warning(f"연결 정리 요청에 세션 ID가 없음 - 사용자: {user_id}")
                return {
                    "success": False,
                    "message": "세션 ID가 필요합니다.",
                    "type": "cleanup_response"
                }
            
            # 세션 ID 로깅
            logger.info(f"연결 정리 요청 - 사용자: {user_id}, 세션: {session_id}, 현재 연결 수: {current_count}")
            
            # 사용자 연결 목록 확인
            user_websockets = self.user_connections.get(user_id, [])
            if not user_websockets:
                logger.info(f"정리할 연결 없음 - 사용자: {user_id}")
                return {
                    "success": True,
                    "message": "정리할 연결이 없습니다.",
                    "count": 0,
                    "type": "cleanup_response"
                }
            
            # 현재 연결 제외하고 정리
            to_disconnect = []
            current_ws_key = id(websocket)
            
            for ws in user_websockets:
                # 현재 웹소켓과 다른 연결만 정리
                if keep_current and id(ws) == current_ws_key:
                    continue
                
                # 정리 대상 추가
                to_disconnect.append(ws)
            
            # 연결 정리
            disconnect_count = 0
            for ws in to_disconnect:
                try:
                    if ws.client_state == WebSocketState.CONNECTED:
                        await ws.close(code=1000, reason="다른 세션에서 새로운 연결 감지")
                        disconnect_count += 1
                        logger.info(f"중복 연결 정리됨 - 사용자: {user_id}")
                except Exception as e:
                    logger.error(f"연결 종료 중 오류: {str(e)}")
            
            # 응답 생성
            return {
                "success": True,
                "message": f"{disconnect_count}개 연결이 정리되었습니다.",
                "count": disconnect_count,
                "type": "cleanup_response"
            }
        except Exception as e:
            logger.error(f"연결 정리 처리 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return {
                "success": False,
                "message": f"연결 정리 중 오류 발생: {str(e)}",
                "type": "cleanup_response"
            }

    async def start_ping_timer(self, user_id: str, websocket: WebSocket):
        try:
            while True:
                await asyncio.sleep(self.PING_INTERVAL)
                if user_id not in self.active_connections:
                    logger.debug(f"Ping 타이머 종료: 사용자 {user_id}가 더 이상, active_connections에 존재하지 않음")
                    break
                
                if websocket.client_state != WebSocketState.CONNECTED:
                    logger.debug(f"Ping 타이머 종료: 사용자 {user_id}의 웹소켓이 연결 상태가 아님")
                    await self.disconnect(user_id, websocket)
                    break
                
                try:
                    logger.debug(f"사용자 {user_id}에게 ping 메시지 전송")
                    await websocket.send_json({
                        "type": WSMessageType.PING,
                        "data": {
                            "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
                        }
                    })
                    
                    # Ping 응답 타임아웃 타이머
                    start_time = datetime.now()
                    while datetime.now() - start_time < timedelta(seconds=self.PONG_TIMEOUT):
                        # 최근 활동 시간 확인
                        if user_id in self.last_activity and websocket in self.last_activity[user_id]:
                            last_activity = self.last_activity[user_id][websocket]
                            if (datetime.now(ZoneInfo("Asia/Seoul")) - last_activity) < timedelta(seconds=self.PONG_TIMEOUT):
                                logger.debug(f"사용자 {user_id}의 Pong 응답 또는 최근 활동 확인됨")
                                break
                        
                        await asyncio.sleep(1)
                    else:
                        # Pong 응답이 없으면 연결 종료
                        logger.warning(f"사용자 {user_id}의 Pong 응답 없음 - 연결 종료")
                        await self.disconnect(user_id, websocket)
                        break
                    
                except Exception as e:
                    logger.error(f"Ping 전송 중 오류: {str(e)}")
                    await self.disconnect(user_id, websocket)
                    break
                
        except asyncio.CancelledError:
            logger.debug(f"Ping 타이머 취소됨: 사용자 {user_id}")
        except Exception as e:
            logger.error(f"Ping 타이머 오류: {str(e)}")
            logger.error(traceback.format_exc())

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

    async def subscribe_cve(self, user_id: str, cve_id: str, session_id: str = None):
        try:
            # 세션 ID가 없으면 UUID 생성
            if not session_id:
                logger.warning(f"세션 ID 없이 구독 요청됨, 임시 ID 생성 - 사용자: {user_id}, CVE: {cve_id}")
                session_id = f"temp_{str(uuid.uuid4())}"

            # 기존 구독 목록 관리 (하위 호환성 유지)
            if user_id not in self.subscriptions:
                self.subscriptions[user_id] = []
            if cve_id not in self.subscriptions[user_id]:
                self.subscriptions[user_id].append(cve_id)
                logger.info(f"[웹소켓] Added subscription:")
                logger.info(f"  - CVE: {cve_id}")
                logger.info(f"  - User: {user_id}")
                logger.info(f"  - Session: {session_id}")
            
            # cve_subscribers 통일
            if cve_id not in self.cve_subscribers:
                self.cve_subscribers[cve_id] = set()
            self.cve_subscribers[cve_id].add(user_id)
            
            # 세션별 구독 정보 추가
            if session_id not in self.session_subscriptions:
                self.session_subscriptions[session_id] = {}
            if user_id not in self.session_subscriptions[session_id]:
                self.session_subscriptions[session_id][user_id] = []
            if cve_id not in self.session_subscriptions[session_id][user_id]:
                self.session_subscriptions[session_id][user_id].append(cve_id)
            
            # 사용자별 세션 구독 정보 추가
            if user_id not in self.user_session_subscriptions:
                self.user_session_subscriptions[user_id] = {}
            if cve_id not in self.user_session_subscriptions[user_id]:
                self.user_session_subscriptions[user_id][cve_id] = []
            if session_id not in self.user_session_subscriptions[user_id][cve_id]:
                self.user_session_subscriptions[user_id][cve_id].append(session_id)
                
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
            logger.info(f"[웹소켓] Broadcast subscribe message:")
            logger.info(f"  - CVE: {cve_id}")
            logger.info(f"  - New subscriber: {user_id}")
            logger.info(f"  - Total subscribers: {len(subscriber_details)}")
            logger.info("  - Active subscribers:")
            for sub in subscriber_details:
                logger.info(f"    • {sub['username']} (ID: {sub['id']}, Display: {sub['displayName']})")

            return subscriber_details
        except Exception as e:
            logger.error(f"[웹소켓] Error in subscribe_cve: {str(e)}")
            logger.error(traceback.format_exc())
            return []

    async def unsubscribe_cve(self, user_id: str, cve_id: str, session_id: str = None):
        try:
            logger.info(f"[웹소켓] Processing unsubscribe request:")
            logger.info(f"  - CVE: {cve_id}")
            logger.info(f"  - User: {user_id}")
            if session_id:
                logger.info(f"  - Session: {session_id}")

            # 기존 구독 목록에서 제거 (하위 호환성 유지)
            if user_id in self.subscriptions and cve_id in self.subscriptions[user_id]:
                # 특정 세션만 제거하는 경우, 다른 세션에서도 구독 중인지 확인
                if session_id and user_id in self.user_session_subscriptions and cve_id in self.user_session_subscriptions[user_id]:
                    other_sessions = [s for s in self.user_session_subscriptions[user_id][cve_id] if s != session_id]
                    # 다른 세션에서도 구독 중이면 전체 구독 목록에서는 제거하지 않음
                    if other_sessions:
                        logger.info(f"[웹소켓] 다른 세션에서도 구독 중 - 전체 구독 목록 유지:")
                        logger.info(f"  - CVE: {cve_id}")
                        logger.info(f"  - User: {user_id}")
                        logger.info(f"  - Other sessions: {len(other_sessions)}")
                    else:
                        # 다른 세션에서 구독 중이 아니면 전체 구독 목록에서 제거
                        self.subscriptions[user_id] = [id for id in self.subscriptions[user_id] if id != cve_id]
                        # cve_subscribers에서도 제거
                        if cve_id in self.cve_subscribers:
                            self.cve_subscribers[cve_id].discard(user_id)
                            if not self.cve_subscribers[cve_id]:
                                del self.cve_subscribers[cve_id]
                        logger.info(f"[웹소켓] 모든 세션에서 구독 해제됨:")
                        logger.info(f"  - CVE: {cve_id}")
                        logger.info(f"  - User: {user_id}")
                else:
                    # 세션 ID가 없거나 세션별 구독 정보가 없는 경우 전체 구독 해제
                    self.subscriptions[user_id] = [id for id in self.subscriptions[user_id] if id != cve_id]
                    # cve_subscribers에서도 제거
                    if cve_id in self.cve_subscribers:
                        self.cve_subscribers[cve_id].discard(user_id)
                        if not self.cve_subscribers[cve_id]:
                            del self.cve_subscribers[cve_id]
                    logger.info(f"[웹소켓] 구독 해제 완료:")
                    logger.info(f"  - CVE: {cve_id}")
                    logger.info(f"  - User: {user_id}")
            
            # 세션별 구독 정보 업데이트
            if session_id:
                # 세션 구독 정보에서 제거
                if session_id in self.session_subscriptions and user_id in self.session_subscriptions[session_id]:
                    if cve_id in self.session_subscriptions[session_id][user_id]:
                        self.session_subscriptions[session_id][user_id].remove(cve_id)
                        logger.info(f"[웹소켓] 세션별 구독 정보 업데이트:")
                        logger.info(f"  - CVE: {cve_id}")
                        logger.info(f"  - User: {user_id}")
                        logger.info(f"  - Session: {session_id}")
                    
                    # 해당 사용자의 구독이 없으면 사용자 정보도 제거
                    if not self.session_subscriptions[session_id][user_id]:
                        del self.session_subscriptions[session_id][user_id]
                    
                    # 해당 세션의 구독이 없으면 세션 정보도 제거
                    if not self.session_subscriptions[session_id]:
                        del self.session_subscriptions[session_id]
                
                # 사용자별 세션 구독 정보에서 제거
                if user_id in self.user_session_subscriptions and cve_id in self.user_session_subscriptions[user_id]:
                    if session_id in self.user_session_subscriptions[user_id][cve_id]:
                        self.user_session_subscriptions[user_id][cve_id].remove(session_id)
                    
                    # 해당 CVE의 세션이 없으면 CVE 정보도 제거
                    if not self.user_session_subscriptions[user_id][cve_id]:
                        del self.user_session_subscriptions[user_id][cve_id]
                    
                    # 해당 사용자의 구독이 없으면 사용자 정보도 제거
                    if not self.user_session_subscriptions[user_id]:
                        del self.user_session_subscriptions[user_id]
            
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
            
            logger.info(f"[웹소켓] Current subscription state for {cve_id}:")
            logger.info(f"  - Total remaining subscribers: {len(subscriber_details)}")
            if subscriber_details:
                logger.info("  - Active subscribers:")
                for sub in subscriber_details:
                    logger.info(f"    • {sub['username']} (ID: {sub['id']}, Display: {sub.get('displayName', sub['username'])})")
            
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
            logger.error(f"[웹소켓] Error in unsubscribe_cve: {str(e)}")
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
            logger.info(f"[웹소켓] Subscriber details: {subscriber_details}")

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
                    logger.warning(f"[웹소켓] Non-dictionary data provided to broadcast_to_cve: {data}")
                    message_data["additional_data"] = data

            message = {
                "type": message_type,
                "data": message_data,
                "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
            }

            for user_id in subscribers:
                await self.send_message(user_id, message)
            
            logger.info(f"[웹소켓] Broadcasting message for {cve_id}:")
            logger.info(f"  - Message type: {message_type}")
            logger.info(f"  - Subscribers count: {len(subscribers)}")
            logger.info(f"  - Active subscribers: {', '.join(subscribers)}")

        except Exception as e:
            logger.error(f"[웹소켓] Error in broadcast_to_cve: {str(e)}")
            logger.error(traceback.format_exc())

    async def send_message(self, user_id: str, message: dict):
        """
        특정 사용자에게 메시지 전송하는 단순화된 메서드
        
        Args:
            user_id: 메시지를 받을 사용자 ID
            message: 전송할 메시지 (dict)
        """
        if user_id in self.user_connections:
            message["timestamp"] = datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
            for websocket in self.user_connections[user_id]:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"메시지 전송 중 오류: {str(e)}")
    
    async def send_personal_message(self, message: dict, user_id: str):
        """
        send_message의 별칭 (이전 코드와의 호환성 유지)
        """
        if user_id in self.user_connections:
            for websocket in self.user_connections[user_id]:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"개인 메시지 전송 중 오류: {str(e)}")
                    logger.error(traceback.format_exc())

    async def start_cleanup_task(self):
        """주기적으로 비활성 구독자 정리"""
        while True:
            try:
                await asyncio.sleep(self.CLEANUP_INTERVAL)
                await self.cleanup_inactive_subscriptions()
            except Exception as e:
                logger.error(f"[웹소켓] Error in cleanup task: {str(e)}")
                logger.error(traceback.format_exc())

    async def cleanup_inactive_subscriptions(self):
        """
        비활성 상태인 구독 정리
        """
        try:
            # 각 CVE에 대한 구독자 목록 확인
            for cve_id, subscribers in self.cve_subscribers.items():
                for user_id in subscribers.copy():
                    # 사용자가 연결되어 있지 않으면 구독 해제
                    if user_id not in self.user_connections or not self.user_connections[user_id]:
                        # 마지막 활동 시간 확인 (15분 이상 비활성 상태인 경우에만 정리)
                        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
                        last_activity_time = None
                        
                        if user_id in self.last_activity:
                            # 사용자의 모든 연결에 대한 마지막 활동 시간 중 가장 최근 시간 확인
                            if self.last_activity[user_id]:
                                last_activity_time = max(self.last_activity[user_id].values())
                        
                        # 마지막 활동 시간이 없거나 15분 이상 경과한 경우 구독 해제
                        if not last_activity_time or (current_time - last_activity_time).total_seconds() > 900:  # 15분 = 900초
                            logger.info(f"비활성 사용자 {user_id}의 {cve_id} 구독 자동 해제")
                            await self.unsubscribe_cve(user_id, cve_id)
        except Exception as e:
            logger.error(f"비활성 구독 정리 중 오류: {str(e)}")
            logger.error(traceback.format_exc())

    async def broadcast_json(self, message: dict, exclude_user_id: str = None, raise_exception: bool = False) -> bool:
        """
        모든 연결된 클라이언트에게 JSON 메시지를 브로드캐스트합니다.
        
        Args:
            message: 전송할 메시지 (dict)
            exclude_user_id: 제외할 사용자 ID (선택 사항)
            raise_exception: 연결이 없을 때 예외를 발생시킬지 여부
            
        Returns:
            bool: 메시지 전송 성공 여부
            
        Raises:
            WebSocketConnectionError: raise_exception이 True이고 연결이 없을 때 발생
        """
        # 활성 연결 확인 (user_connections 사용)
        if not self.user_connections:
            warning_msg = "브로드캐스트할 활성 WebSocket 연결이 없음"
            logger.warning(warning_msg)
            
            # 예외 발생 여부에 따라 처리
            if raise_exception:
                from app.core.exceptions import WebSocketConnectionError
                raise WebSocketConnectionError(warning_msg)
            return False
        
        # 제외할 사용자 ID 정규화
        normalized_exclude_id = str(exclude_user_id) if exclude_user_id else None
        
        # 메시지 전송
        success = False
        for user_id, connections in self.user_connections.items():
            # 제외할 사용자 건너뛰기
            if normalized_exclude_id and (user_id == normalized_exclude_id or normalized_exclude_id in user_id or user_id in normalized_exclude_id):
                continue
            
            if connections:
                await self._send_message_to_connections(connections, message)
                success = True
        
        return success
        
    async def _send_message_to_connections(self, connections: List[WebSocket], message: dict) -> bool:
        """
        주어진 WebSocket 연결 목록에 메시지를 전송합니다.
        
        Args:
            connections: WebSocket 연결 목록
            message: 전송할 메시지 (dict)
            
        Returns:
            bool: 성공적으로 메시지를 전송했는지 여부
        """
        if not connections:
            logger.debug("전송할 WebSocket 연결이 없음")
            return False
        
        # 메시지 크기 계산 및 로깅
        try:
            message_size = _calculate_message_size(message)
            if message_size > 65536:  # 64KB 제한
                logger.warning(f"메시지 크기가 제한을 초과함: {message_size} 바이트 (최대: 65536 바이트)")
        except Exception as e:
            logger.warning(f"메시지 크기 계산 중 오류: {str(e)}")
        
        # 메시지 전송
        sent_count = 0
        disconnected = []
        
        for connection in connections:
            try:
                # 연결 상태 확인
                if connection.client_state == WebSocketState.CONNECTED:
                    # 메시지 전송
                    await self.send_json(connection, message)
                    sent_count += 1
                else:
                    logger.warning(f"WebSocket이 연결 상태가 아님: {connection.client_state}")
                    disconnected.append(connection)
            except WebSocketDisconnect:
                logger.warning("WebSocket 연결이 끊어짐")
                disconnected.append(connection)
            except Exception as e:
                logger.warning(f"메시지 전송 중 오류 발생: {str(e)}")
                disconnected.append(connection)
        
        # 끊어진 연결 정리
        for conn in disconnected:
            if conn in connections:
                connections.remove(conn)
        
        # 결과 로깅
        if sent_count > 0:
            logger.debug(f"{sent_count}개 연결에 메시지 전송 성공")
            return True
        else:
            logger.warning("메시지 전송 실패: 모든 연결이 비활성 상태")
            return False

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

    async def send_to_specific_user(self, user_id: str, message: dict, raise_exception: bool = False) -> bool:
        """
        특정 사용자에게 메시지를 전송합니다.
        
        Args:
            user_id: 메시지를 받을 사용자 ID
            message: 전송할 메시지 (dict)
            raise_exception: 연결이 없을 때 예외를 발생시킬지 여부
            
        Returns:
            bool: 메시지 전송 성공 여부
            
        Raises:
            WebSocketConnectionError: raise_exception이 True이고 연결이 없을 때 발생
        """
        # 사용자 ID 정규화 (문자열 형식으로 변환)
        normalized_user_id = str(user_id)
        
        # 사용자 연결 확인 (user_connections 사용)
        if normalized_user_id not in self.user_connections or not self.user_connections[normalized_user_id]:
            warning_msg = f"사용자 {normalized_user_id}에게 메시지를 보낼 수 없음: 연결된 웹소켓 없음"
            logger.warning(warning_msg)
            
            # 디버깅을 위한 추가 정보 로깅
            if self.user_connections:
                logger.debug(f"현재 활성 연결 사용자 목록: {list(self.user_connections.keys())}")
                
                # MongoDB ObjectId와 문자열 형식 불일치 확인
                for existing_id in self.user_connections.keys():
                    if normalized_user_id in existing_id or existing_id in normalized_user_id:
                        logger.warning(f"ID 형식 불일치 가능성: 요청된 ID '{normalized_user_id}'와 저장된 ID '{existing_id}'가 유사함")
                        
                        # 유사한 ID가 있으면 해당 ID로 메시지 전송 시도
                        logger.info(f"유사한 ID '{existing_id}'로 메시지 전송 시도")
                        return await self.send_to_specific_user(existing_id, message, raise_exception)
                
            if raise_exception:
                from app.core.exceptions import WebSocketConnectionError
                raise WebSocketConnectionError(warning_msg)
            return False
        
        # 메시지 전송
        connections = self.user_connections[normalized_user_id]
        success = await self._send_message_to_connections(connections, message)
        return success

    async def unsubscribe_session_cves(self, session_id: str, user_id: str = None):
        """특정 세션의 모든 CVE 구독 해제
        
        세션 ID에 해당하는 모든 구독을 해제합니다.
        user_id가 지정된 경우, 해당 사용자의 구독만 해제합니다.
        """
        try:
            if session_id not in self.session_subscriptions:
                logger.info(f"세션 {session_id}의 구독 정보가 없습니다.")
                return False
            
            logger.info(f"세션 {session_id}의 구독 정리 시작")
            
            # 세션에 등록된 모든 사용자 ID 목록
            users_to_process = []
            
            if user_id:
                # 특정 사용자만 처리
                if user_id in self.session_subscriptions[session_id]:
                    users_to_process.append(user_id)
            else:
                # 세션에 등록된 모든 사용자 처리
                users_to_process = list(self.session_subscriptions[session_id].keys())
            
            total_unsubscribed = 0
            
            for uid in users_to_process:
                # 세션 내 해당 사용자의 모든 CVE 목록
                cve_ids = self.session_subscriptions[session_id][uid].copy()
                
                for cve_id in cve_ids:
                    await self.unsubscribe_cve(uid, cve_id, session_id)
                    total_unsubscribed += 1
                    logger.info(f"세션 {session_id}의 사용자 {uid}가 구독한 {cve_id} 구독 해제")
            
            # 정리 완료 후 세션 정보가 남아있는지 확인
            if session_id in self.session_subscriptions:
                logger.warning(f"세션 {session_id}의 구독 정보가 완전히 제거되지 않았습니다. 수동으로 제거합니다.")
                del self.session_subscriptions[session_id]
            
            logger.info(f"세션 {session_id}의 구독 정리 완료: {total_unsubscribed}개 구독 해제")
            return {"success": True, "count": total_unsubscribed}
        except Exception as e:
            logger.error(f"세션 {session_id}의 구독 정리 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            return {"success": False, "error": str(e)}

    async def get_connection_info(self, user_id=None):
        """
        현재 연결 상태 정보를 반환합니다.
        
        Args:
            user_id (str, optional): 특정 사용자 ID. 지정하지 않으면 전체 통계 반환
            
        Returns:
            dict: 연결 상태 정보
        """
        try:
            # 전체 연결 수
            total_connections = len(self.active_connections)
            
            # 활성 사용자 수
            active_users = len(self.user_connections)
            
            # 특정 사용자 연결 수
            user_connections = 0
            if user_id and user_id in self.user_connections:
                user_connections = len(self.user_connections[user_id])
            
            return {
                "totalConnections": total_connections,
                "activeUsers": active_users,
                "userConnections": user_connections,
                "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
            }
        except Exception as e:
            logger.error(f"연결 정보 조회 중 오류: {str(e)}")
            return {
                "totalConnections": 0,
                "activeUsers": 0,
                "userConnections": 0,
                "error": "정보 조회 중 오류 발생"
            }

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

@router.websocket("/ws/crawler")
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
