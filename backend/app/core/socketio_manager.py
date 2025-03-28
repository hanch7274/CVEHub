# -*- coding: utf-8 -*-
from enum import Enum
from typing import Dict, List, Optional, Set, Any, Callable, Awaitable, Union
import socketio
import logging
import json
import asyncio
import traceback
import inspect  # 함수 시그니처 검사를 위한 모듈 추가
from datetime import datetime
from fastapi import Depends # Depends는 현재 코드에서 직접 사용되진 않지만, 향후 확장성을 위해 유지 가능

# 프로젝트 구조에 맞게 경로 조정 필요
from ..utils.datetime_utils import get_current_time
from .config import get_settings
from .logging_utils import get_logger
from ..core.auth import verify_token
from ..services.user_service import UserService
from ..models.user_model import UserResponse

# 표준화된 로거 사용
logger = get_logger(__name__)

class WSMessageType(str, Enum):
    """WebSocket 메시지 타입 열거형"""
    CONNECTED = "connected"
    CONNECT_ACK = "connect_ack"
    SESSION_INFO_ACK = "session_info_ack"
    PING = "ping"
    PONG = "pong"
    ERROR = "error"
    NOTIFICATION = "notification"
    NOTIFICATION_READ = "notification_read"
    ALL_NOTIFICATIONS_READ = "all_notifications_read"
    CVE_CREATED = "cve_created"
    CVE_UPDATED = "cve_updated"
    CVE_DELETED = "cve_deleted"
    CRAWLER_UPDATE_PROGRESS = "crawler_update_progress"
    COMMENT_ADDED = "comment_added"
    COMMENT_UPDATED = "comment_updated"
    COMMENT_DELETED = "comment_deleted"
    COMMENT_REACTION_ADDED = "comment_reaction_added"
    COMMENT_REACTION_REMOVED = "comment_reaction_removed"
    COMMENT_COUNT_UPDATE = "comment_count_update"
    SUBSCRIBE_CVE = "subscribe_cve"
    UNSUBSCRIBE_CVE = "unsubscribe_cve"
    SUBSCRIPTION_STATUS = "subscription_status"
    CVE_SUBSCRIBERS_UPDATED = "cve_subscribers_updated"


class DateTimeEncoder(json.JSONEncoder):
    """JSON 직렬화 시 datetime 및 ObjectId 객체 처리"""
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat() # ISO 표준 포맷 사용
        try:
            from bson import ObjectId
            if isinstance(obj, ObjectId):
                return str(obj)
        except ImportError:
            pass # bson 라이브러리가 없는 경우 무시
        return super().default(obj)

def _calculate_message_size(message):
    """주어진 메시지 객체의 UTF-8 인코딩된 JSON 문자열 크기(바이트) 계산"""
    try:
        json_str = json.dumps(message, cls=DateTimeEncoder)
        return len(json_str.encode('utf-8'))
    except Exception as e:
        logger.error(f"메시지 크기 계산 실패: {e}")
        return 0

class EventBus:
    """간단한 인-메모리 이벤트 버스 구현"""
    def __init__(self):
        """이벤트 핸들러 저장소를 초기화합니다."""
        self.handlers: Dict[str, List[Callable]] = {}
        self.logger = logger

    def register(self, event_name: str, handler: Callable) -> None:
        """지정된 이벤트 이름에 대한 핸들러 함수를 등록합니다."""
        if event_name not in self.handlers:
            self.handlers[event_name] = []
        if handler not in self.handlers[event_name]:
            self.handlers[event_name].append(handler)
            self.logger.debug(f"EventBus: 핸들러 등록됨 - 이벤트 '{event_name}', 핸들러 '{getattr(handler, '__name__', repr(handler))}'")

    def unregister(self, event_name: str, handler: Optional[Callable] = None) -> None:
        """지정된 이벤트 이름에서 핸들러 함수를 등록 해제합니다. 핸들러가 없으면 해당 이벤트의 모든 핸들러를 제거합니다."""
        if event_name not in self.handlers:
            return
        if handler is None:
            del self.handlers[event_name]
            self.logger.debug(f"EventBus: 이벤트 '{event_name}'의 모든 핸들러 등록 해제됨")
        elif handler in self.handlers[event_name]:
            self.handlers[event_name].remove(handler)
            self.logger.debug(f"EventBus: 핸들러 등록 해제됨 - 이벤트 '{event_name}', 핸들러 '{getattr(handler, '__name__', repr(handler))}'")
            if not self.handlers[event_name]:
                del self.handlers[event_name]

    async def emit(self, event_name: str, data: Any, sender: Optional[str] = None) -> None:
        """지정된 이벤트 이름으로 이벤트를 발행하고 등록된 핸들러들을 호출합니다."""
        if event_name not in self.handlers:
            self.logger.debug(f"EventBus: 처리할 핸들러 없음 - 이벤트 '{event_name}'")
            return

        self.logger.debug(f"EventBus: 이벤트 발행 - 이벤트 '{event_name}', 데이터: {str(data)[:100]}..., 핸들러 수: {len(self.handlers[event_name])}")
        tasks = []
        for handler in self.handlers[event_name]:
            try:
                if asyncio.iscoroutinefunction(handler):
                    tasks.append(asyncio.create_task(self._safe_execute(handler, data, sender)))
                else:
                    self._safe_execute_sync(handler, data, sender)
            except Exception as e:
                self.logger.error(f"EventBus: 핸들러 실행 준비 중 오류 발생 '{getattr(handler, '__name__', repr(handler))}': {e}")
                self.logger.error(traceback.format_exc())
        
        if tasks:
            await asyncio.gather(*tasks)

    async def _safe_execute(self, handler: Callable, data: Any, sender: Optional[str]):
        """비동기 핸들러를 안전하게 실행하고 예외를 로깅합니다."""
        try:
            handler_name = getattr(handler, '__name__', repr(handler))
            # 핸들러 인자 개수를 동적으로 확인하여 sender 전달 여부 결정 (선택적 개선)
            # 여기서는 기본적으로 data만 전달하거나, 핸들러가 sender를 받도록 구현되었다고 가정
            try:
                 sig = inspect.signature(handler)  # asyncio.signature -> inspect.signature
                 num_params = len(sig.parameters)
            except (ValueError, TypeError): # 일부 내장 함수 등 시그니처 얻기 불가
                 num_params = 1 # 기본값
            
            if sender is not None and num_params >= 2:
                 await handler(data, sender)
            else:
                 await handler(data)
        except Exception as e:
            self.logger.error(f"EventBus: 핸들러 '{handler_name}' 실행 중 오류: {e}")
            self.logger.error(traceback.format_exc())

    def _safe_execute_sync(self, handler: Callable, data: Any, sender: Optional[str]):
        """동기 핸들러를 안전하게 실행하고 예외를 로깅합니다."""
        try:
            handler_name = getattr(handler, '__name__', repr(handler))
            # 동기 함수 인자 개수 확인 (선택적 개선)
            try:
                 num_params = handler.__code__.co_argcount
            except AttributeError:
                 num_params = 1 # 기본값
            
            if sender is not None and num_params >= 2:
                 handler(data, sender)
            else:
                 handler(data)
        except Exception as e:
            self.logger.error(f"EventBus: 동기 핸들러 '{handler_name}' 실행 중 오류: {e}")
            self.logger.error(traceback.format_exc())


class SocketIOManager:
    """
    Socket.IO 서버 관리, 연결 처리, 메시지 전송, 구독 관리 등을 담당하는 클래스.
    UserService에 대한 의존성을 가지며, 생성 시 주입받거나 내부에서 생성합니다.
    """

    def __init__(self, user_service: Optional[UserService] = None):
        """
        SocketIOManager 인스턴스를 초기화합니다.

        Args:
            user_service (Optional[UserService]): 사용할 UserService 인스턴스. 
                                                 제공되지 않으면 내부에서 새로 생성합니다.
        """
        settings = get_settings()
        self.sio = socketio.AsyncServer(
            async_mode='asgi',
            cors_allowed_origins=settings.CORS_ORIGINS if settings.CORS_ORIGINS else ["*"],
            ping_timeout=settings.WS_PING_TIMEOUT,
            ping_interval=settings.WS_PING_INTERVAL,
            max_http_buffer_size=settings.WS_MAX_HTTP_BUFFER_SIZE,
            logger=logger,
            engineio_logger=settings.WS_ENGINEIO_LOGGER,
            json=json # python-socketio 기본 json 처리 사용 고려
        )

        logger.info(f"Socket.IO 서버 초기화: CORS={settings.CORS_ORIGINS}, PingTimeout={settings.WS_PING_TIMEOUT}, PingInterval={settings.WS_PING_INTERVAL}")

        # UserService 의존성 설정
        if user_service is None:
            logger.warning("UserService가 주입되지 않아 내부에서 생성합니다.")
            from ..services.user_service import UserService # 지연 import
            self.user_service = UserService()
        else:
            self.user_service = user_service
            logger.info("UserService가 성공적으로 주입되었습니다.")

        # --- 상태 관리 변수 ---
        # 사용자 ID를 키로, 해당 사용자의 Socket.IO 세션 ID(sid) 리스트(Set)를 값으로 가집니다.
        self.user_connections: Dict[str, Set[str]] = {}
        # Socket.IO 세션 ID(sid)를 키로, 해당 세션의 사용자 ID를 값으로 가집니다.
        self.sid_to_user: Dict[str, str] = {}
        # CVE ID를 키로, 해당 CVE를 구독하는 사용자 ID 집합(Set)을 값으로 가집니다.
        self.cve_subscribers: Dict[str, Set[str]] = {}
        # 사용자 ID를 키로, 해당 사용자가 구독하는 CVE ID 집합(Set)을 값으로 가집니다. (직접 구독 + 모든 세션 구독 포함)
        self.user_subscriptions: Dict[str, Set[str]] = {}
        # 클라이언트 세션 ID를 키로, 해당 세션에서 구독하는 CVE ID 집합(Set)을 값으로 가집니다.
        self.session_cve_subscriptions: Dict[str, Set[str]] = {}
        # Socket.IO 세션 ID(sid)를 키로, 해당 세션에 연결된 클라이언트 세션 ID를 값으로 가집니다.
        self.sid_to_session: Dict[str, str] = {}

        # 주기적 정리 작업 관련 변수
        self.cleanup_lock = asyncio.Lock()
        self.CLEANUP_INTERVAL = settings.WS_CLEANUP_INTERVAL
        self.cleanup_task = None

        # 내부 이벤트 버스 인스턴스
        self.event_bus = EventBus()

        # Socket.IO 이벤트 핸들러 설정
        self._setup_event_handlers()
        # 주기적 정리 작업 시작
        self.start_cleanup_task()
        # 내부 이벤트 버스 핸들러 등록
        self.event_bus.register('connected', self.handle_connected_event)
        self.event_bus.register('disconnected', self.handle_disconnected_event)
        self.event_bus.register('cve_subscribed', self.handle_cve_subscribed_event)
        self.event_bus.register('cve_unsubscribed', self.handle_cve_unsubscribed_event)

    def _setup_event_handlers(self):
        """@sio.event 데코레이터를 사용하여 Socket.IO 이벤트 핸들러를 등록합니다."""
        
        @self.sio.event
        async def connect(sid, environ, auth):
            """클라이언트 연결 시 호출되는 핸들러"""
            await self._handle_connect(sid, environ, auth)

        @self.sio.event
        async def disconnect(sid):
            """클라이언트 연결 해제 시 호출되는 핸들러"""
            await self._handle_disconnect(sid)

        @self.sio.event
        async def ping(sid, data=None):
            """클라이언트의 ping 요청 처리 핸들러"""
            await self._handle_ping(sid, data or {})

        @self.sio.event
        async def subscribe_cve(sid, data):
            """CVE 구독 요청 처리 핸들러"""
            await self._handle_cve_subscribe(sid, data)

        @self.sio.event
        async def unsubscribe_cve(sid, data):
            """CVE 구독 해제 요청 처리 핸들러"""
            await self._handle_cve_unsubscribe(sid, data)
            
        # 여기에 필요한 다른 Socket.IO 이벤트 핸들러를 추가할 수 있습니다.

    async def _handle_connect(self, sid, environ, auth):
        """
        Socket.IO 'connect' 이벤트의 실제 처리 로직.
        인증 수행, 사용자 연결 정보 등록, 세션 구독 복원 등을 처리합니다.
        """
        logger.info(f"Socket.IO 연결 요청 - SID: {sid}")
        try:
            # 인증 토큰 확인
            if not auth or 'token' not in auth:
                logger.warning(f"인증 토큰 없음 - SID: {sid}. 연결 거부.")
                await self.emit_message(WSMessageType.ERROR, 
                                        {"message": "인증 토큰이 필요합니다.", "code": "missing_auth_token"}, 
                                        target_sid=sid)
                return

            token = auth.get('token')
            client_id = auth.get('client_id', 'unknown')
            session_id = auth.get('session_id')

            # 토큰 검증 및 사용자 정보 조회
            success, user_or_error = await self.validate_token(token)
            if not success:
                logger.warning(f"유효하지 않은 토큰 - SID: {sid}, 오류: {user_or_error}. 연결 거부.")
                await self.emit_message(WSMessageType.ERROR, {"message": f"유효하지 않은 인증 토큰입니다: {user_or_error}", "code": "invalid_auth_token"}, target_sid=sid)
                return

            user: UserResponse = user_or_error
            user_id = str(user.id)

            # 사용자 연결 정보 등록
            self.register_user_connection(user_id, sid)
            if session_id:
                self.sid_to_session[sid] = session_id # SID-세션 매핑

            logger.info(f"Socket.IO 연결 성공 - 사용자: {user_id}, SID: {sid}, SessionID: {session_id}")

            # 연결 확인 응답 전송
            await self.emit_message(WSMessageType.CONNECT_ACK, {
                "user_id": user_id, "username": user.username,
                "connected_at": get_current_time().isoformat(),
                "session_id": session_id, "client_id": client_id
            }, target_sid=sid)

            # 세션 구독 정보 복원
            if session_id:
                subscribed_cves = list(self.session_cve_subscriptions.get(session_id, set()))
                # 사용자의 전체 구독 목록에도 세션 구독 내용 반영
                if user_id not in self.user_subscriptions: self.user_subscriptions[user_id] = set()
                self.user_subscriptions[user_id].update(subscribed_cves)
                # CVE별 구독자 목록에도 반영
                for cve_id in subscribed_cves:
                    if cve_id not in self.cve_subscribers: self.cve_subscribers[cve_id] = set()
                    self.cve_subscribers[cve_id].add(user_id)

                # 클라이언트에 복원된 세션 정보 알림
                await self.emit_message(WSMessageType.SESSION_INFO_ACK, {
                    "session_id": session_id, "subscribed_cves": subscribed_cves,
                    "restored": bool(subscribed_cves)
                }, target_sid=sid)
                logger.info(f"세션 정보 복원됨 - 사용자: {user_id}, 세션: {session_id}, 복원된 CVE 수: {len(subscribed_cves)}")

            # 내부 이벤트 발행
            await self.event_bus.emit('connected', {
                'user_id': user_id, 'sid': sid, 'session_id': session_id
            })

        except Exception as e:
            logger.error(f"Socket.IO 연결 처리 중 예외 발생 - SID: {sid}: {e}")
            logger.error(traceback.format_exc())
            try:
                await self.emit_message(WSMessageType.ERROR, {
                    "message": "연결 처리 중 서버 오류 발생", "code": "connection_error",
                    "details": str(e)
                }, target_sid=sid)
            except Exception as emit_err:
                logger.error(f"오류 메시지 전송 실패 - SID: {sid}: {emit_err}")


    async def _handle_disconnect(self, sid: str) -> None:
        """
        Socket.IO 'disconnect' 이벤트의 실제 처리 로직.
        사용자 연결 정보 및 관련 매핑 정보를 정리합니다.
        세션 구독 정보는 이 단계에서 자동으로 정리하지 않습니다.
        """
        logger.info(f"Socket.IO 연결 해제 시작 - SID: {sid}")
        user_id = self.sid_to_user.get(sid)
        session_id = self.sid_to_session.get(sid)

        if user_id:
            logger.info(f"사용자 연결 해제 - 사용자: {user_id}, SID: {sid}, SessionID: {session_id}")

            # 사용자 연결 목록(Set)에서 SID 제거
            if user_id in self.user_connections and sid in self.user_connections[user_id]:
                self.user_connections[user_id].remove(sid)
                if not self.user_connections[user_id]: # 마지막 연결인지 확인
                    del self.user_connections[user_id]
                    logger.info(f"사용자의 마지막 연결 해제됨 - 사용자: {user_id}")
                    # 참고: 사용자의 마지막 연결이 끊어져도 세션 구독 정보는 유지될 수 있음
                    #       (브라우저 리프레시 등 고려)

            # SID -> User ID 매핑 제거
            if sid in self.sid_to_user: del self.sid_to_user[sid]
            # SID -> Session ID 매핑 제거
            if sid in self.sid_to_session: del self.sid_to_session[sid]

            # 내부 이벤트 발행
            await self.event_bus.emit('disconnected', {'user_id': user_id, 'sid': sid, 'session_id': session_id})
        else:
            logger.warning(f"알 수 없는 SID의 연결 해제 시도 - SID: {sid}")

        logger.info(f"Socket.IO 연결 해제 완료 - SID: {sid}")


    async def _handle_ping(self, sid: str, data: Dict[str, Any]) -> None:
        """'ping' 이벤트 처리: 클라이언트에게 'pong' 응답을 보냅니다."""
        pong_data = {
            'timestamp': get_current_time().isoformat(),
            'client_id': data.get('client_id', sid),
        }
        # 핑퐁 로그는 설정에 따라 조건부 출력
        if logger.isEnabledFor(logging.DEBUG) and get_settings().LOG_PING_PONG:
            user_id = self.sid_to_user.get(sid, 'unknown')
            logger.debug(f"Ping 수신 - 사용자: {user_id}, SID: {sid}, 데이터: {data}")

        # emit_message를 사용하여 pong 전송
        await self.emit_message(WSMessageType.PONG, pong_data, target_sid=sid)

        if logger.isEnabledFor(logging.DEBUG) and get_settings().LOG_PING_PONG:
            user_id = self.sid_to_user.get(sid, 'unknown')
            logger.debug(f"Pong 전송 - 사용자: {user_id}, SID: {sid}, 데이터: {pong_data}")


    async def _handle_cve_subscribe(self, sid: str, data: Dict[str, Any]) -> None:
        """'subscribe_cve' 이벤트 처리: 사용자와 세션의 CVE 구독 정보를 업데이트합니다."""
        user_id = self.sid_to_user.get(sid)
        if not user_id:
            logger.warning(f"알 수 없는 SID의 구독 요청 거부 - SID: {sid}")
            await self.emit_message(WSMessageType.ERROR, {"message": "인증되지 않은 구독 요청", "code": "unauthorized"}, target_sid=sid)
            return

        cve_id = data.get('cve_id')
        session_id = self.sid_to_session.get(sid)

        if not cve_id:
            logger.warning(f"CVE ID 없는 구독 요청 - 사용자: {user_id}, SID: {sid}")
            await self.emit_message(WSMessageType.ERROR, {"message": "CVE ID가 필요합니다.", "code": "missing_cve_id"}, target_sid=sid)
            return
            
        # 이미 구독 중인지 확인 (중복 구독 요청 처리)
        already_subscribed = False
        is_user_subscribed = user_id in self.user_subscriptions and cve_id in self.user_subscriptions[user_id]
        is_session_subscribed = session_id and session_id in self.session_cve_subscriptions and cve_id in self.session_cve_subscriptions[session_id]
        
        if is_user_subscribed or is_session_subscribed:
            already_subscribed = True
            logger.info(f"중복 구독 요청 감지 - 사용자: {user_id}, CVE: {cve_id}, 세션: {session_id}, SID: {sid} (이미 구독 중)")
            
            # 클라이언트에 중복 구독이지만 성공 응답 전송
            await self.emit_message(WSMessageType.SUBSCRIPTION_STATUS, {
                "status": "subscribed", "cve_id": cve_id, "session_id": session_id,
                "success": True, "message": f"CVE {cve_id} 이미 구독 중", 
                "already_subscribed": True
            }, target_sid=sid)
            
            # 현재 구독자 수 정보 전송
            await self.broadcast_subscribers_updated(cve_id)
            return

        # 새로운 구독 요청 처리
        # CVE 구독자 목록 업데이트
        if cve_id not in self.cve_subscribers: self.cve_subscribers[cve_id] = set()
        self.cve_subscribers[cve_id].add(user_id)
        # 사용자 구독 목록 업데이트
        if user_id not in self.user_subscriptions: self.user_subscriptions[user_id] = set()
        self.user_subscriptions[user_id].add(cve_id)
        # 세션 구독 목록 업데이트
        if session_id:
            if session_id not in self.session_cve_subscriptions: self.session_cve_subscriptions[session_id] = set()
            self.session_cve_subscriptions[session_id].add(cve_id)
            logger.info(f"CVE 구독 성공 - 사용자: {user_id}, CVE: {cve_id}, 세션: {session_id}, SID: {sid}")
        else:
             logger.info(f"CVE 구독 성공 (세션 없음) - 사용자: {user_id}, CVE: {cve_id}, SID: {sid}")

        # 클라이언트에 구독 상태 응답
        await self.emit_message(WSMessageType.SUBSCRIPTION_STATUS, {
            "status": "subscribed", "cve_id": cve_id, "session_id": session_id,
            "success": True, "message": f"CVE {cve_id} 구독 성공",
            "already_subscribed": False
        }, target_sid=sid)

        # 내부 이벤트 발행 및 구독자 수 업데이트 알림
        await self.event_bus.emit('cve_subscribed', {'cve_id': cve_id, 'user_id': user_id, 'session_id': session_id, 'sid': sid})
        await self.broadcast_subscribers_updated(cve_id)


    async def _handle_cve_unsubscribe(self, sid: str, data: Dict[str, Any]) -> None:
        """'unsubscribe_cve' 이벤트 처리: 사용자와 세션의 CVE 구독 정보를 업데이트합니다."""
        user_id = self.sid_to_user.get(sid)
        if not user_id:
            logger.warning(f"알 수 없는 SID의 구독 해제 요청 거부 - SID: {sid}")
            await self.emit_message(WSMessageType.ERROR, {"message": "인증되지 않은 구독 해제 요청", "code": "unauthorized"}, target_sid=sid)
            return

        cve_id = data.get('cve_id')
        session_id = self.sid_to_session.get(sid)

        if not cve_id:
            logger.warning(f"CVE ID 없는 구독 해제 요청 - 사용자: {user_id}, SID: {sid}")
            await self.emit_message(WSMessageType.ERROR, {"message": "CVE ID가 필요합니다.", "code": "missing_cve_id"}, target_sid=sid)
            return
            
        # 이미 구독 해제되었는지 확인 (중복 구독 해제 요청 처리)
        already_unsubscribed = True
        is_user_subscribed = user_id in self.user_subscriptions and cve_id in self.user_subscriptions[user_id]
        is_session_subscribed = session_id and session_id in self.session_cve_subscriptions and cve_id in self.session_cve_subscriptions[session_id]
        
        if not is_user_subscribed and not is_session_subscribed:
            logger.info(f"중복 구독 해제 요청 감지 - 사용자: {user_id}, CVE: {cve_id}, 세션: {session_id}, SID: {sid} (이미 구독 해제됨)")
            
            # 클라이언트에 중복 구독 해제이지만 성공 응답 전송
            await self.emit_message(WSMessageType.SUBSCRIPTION_STATUS, {
                "status": "unsubscribed", "cve_id": cve_id, "session_id": session_id,
                "success": True, "message": f"CVE {cve_id} 이미 구독 해제됨", 
                "already_unsubscribed": True
            }, target_sid=sid)
            
            # 현재 구독자 수 정보 전송
            await self.broadcast_subscribers_updated(cve_id)
            return
            
        # 실제 구독 해제 처리
        removed_from_user, removed_from_session, removed_from_cve_list = False, False, False

        # 1. 사용자 구독 정보에서 제거
        if user_id in self.user_subscriptions and cve_id in self.user_subscriptions[user_id]:
            self.user_subscriptions[user_id].remove(cve_id)
            removed_from_user = True
            if not self.user_subscriptions[user_id]: del self.user_subscriptions[user_id]

        # 2. 세션 구독 정보에서 제거
        if session_id and session_id in self.session_cve_subscriptions and cve_id in self.session_cve_subscriptions[session_id]:
            self.session_cve_subscriptions[session_id].remove(cve_id)
            removed_from_session = True
            if not self.session_cve_subscriptions[session_id]: del self.session_cve_subscriptions[session_id]

        # 3. CVE 구독자 정보에서 제거 (더 이상 이 사용자가 어떤 연결/세션에서도 구독하지 않는 경우)
        is_still_subscribed = False
        if user_id in self.user_subscriptions and cve_id in self.user_subscriptions.get(user_id, set()):
            is_still_subscribed = True
        else:
            for active_sid in self.user_connections.get(user_id, set()):
                 active_session_id = self.sid_to_session.get(active_sid)
                 if active_session_id and cve_id in self.session_cve_subscriptions.get(active_session_id, set()):
                      is_still_subscribed = True
                      break
        
        if not is_still_subscribed and cve_id in self.cve_subscribers and user_id in self.cve_subscribers[cve_id]:
            self.cve_subscribers[cve_id].remove(user_id)
            removed_from_cve_list = True
            if not self.cve_subscribers[cve_id]: del self.cve_subscribers[cve_id]

        logger.info(f"CVE 구독 해제 성공 - 사용자: {user_id}, CVE: {cve_id}, 세션: {session_id}, SID: {sid} (U:{removed_from_user}, S:{removed_from_session}, C:{removed_from_cve_list})")

        # 클라이언트에 구독 해제 상태 응답
        await self.emit_message(WSMessageType.SUBSCRIPTION_STATUS, {
            "status": "unsubscribed", "cve_id": cve_id, "session_id": session_id,
            "success": True, "message": f"CVE {cve_id} 구독 해제 성공",
            "already_unsubscribed": False
        }, target_sid=sid)

        # 내부 이벤트 발행 및 구독자 수 업데이트 알림
        await self.event_bus.emit('cve_unsubscribed', {'cve_id': cve_id, 'user_id': user_id, 'session_id': session_id, 'sid': sid})
        await self.broadcast_subscribers_updated(cve_id)


    async def emit_message(self, event_type: Union[str, WSMessageType], data: Any,
                           target_user: Optional[str] = None, target_cve: Optional[str] = None,
                           target_sid: Optional[str] = None, broadcast_all: bool = False,
                           room: Optional[str] = None, **kwargs) -> str:
        """
        범용 메시지 전송 유틸리티 메서드.
        다양한 타겟(특정 SID, 사용자, CVE 구독자, 전체)에게 메시지를 전송합니다.

        Args:
            event_type: 보낼 이벤트의 타입 (WSMessageType 또는 문자열).
            data: 보낼 데이터 객체.
            target_user: 메시지를 보낼 특정 사용자 ID.
            target_cve: 해당 CVE를 구독하는 모든 사용자에게 메시지를 보냄.
            target_sid: 메시지를 보낼 특정 Socket.IO 세션 ID.
            broadcast_all: 연결된 모든 클라이언트에게 메시지를 보냄.
            room: 메시지를 보낼 특정 Socket.IO 룸 이름.
            **kwargs: 페이로드에 추가할 추가 키워드 인자 (예: critical=True).

        Returns:
            str: 전송 결과 상태 메시지 (예: "Sent to 5 SIDs", "No active SIDs found", "Error").
        """
        event_name = event_type.value if isinstance(event_type, Enum) else event_type
        try:
            # 페이로드 생성 (날짜/시간 인코딩 포함)
            payload = {"data": data, "timestamp": get_current_time().isoformat(), **kwargs}
            payload_str = json.dumps(payload, cls=DateTimeEncoder)
            payload_for_emit = json.loads(payload_str)
            data_summary = payload_str[:100] + '...' if len(payload_str) > 100 else payload_str
        except Exception as json_err:
             logger.error(f"emit_message 페이로드 생성 실패 ({event_name}): {json_err}")
             return "Error creating payload"

        try:
            target_sids: Set[str] = set()
            log_target = "Unknown"

            # 타겟 SID 목록 결정
            if target_sid:
                target_sids.add(target_sid); log_target = f"SID {target_sid}"
            elif target_user:
                user_id_str = str(target_user)
                target_sids.update(self.user_connections.get(user_id_str, set())); log_target = f"User {user_id_str}"
            elif target_cve:
                cve_id_str = str(target_cve)
                if cve_id_str in self.cve_subscribers:
                    for user_id in self.cve_subscribers[cve_id_str]:
                        target_sids.update(self.user_connections.get(user_id, set()))
                log_target = f"CVE {cve_id_str} subscribers"
            elif broadcast_all:
                for user_id, sids in self.user_connections.items(): target_sids.update(sids)
                log_target = "All connected users"
            elif room:
                # Room 대상 전송은 self.sio.emit 에서 직접 처리
                logger.info(f"Emitting message to room '{room}' - Event: {event_name}")
                logger.debug(f"Data for room '{room}': {data_summary}")
                await self.sio.emit(event_name, payload_for_emit, room=room)
                return f"Sent to room {room}"
            else:
                logger.warning(f"emit_message 대상 없음 - Event: {event_name}")
                return "No target specified"

            # 실제 전송할 SID가 없는 경우
            if not target_sids:
                logger.info(f"emit_message 활성 SID 없음 - Target: '{log_target}', Event: {event_name}")
                return "No active SIDs found"

            logger.info(f"emit_message 전송 시작 - Target: {log_target} ({len(target_sids)} SIDs), Event: {event_name}")
            logger.debug(f"Data for {log_target}: {data_summary}")

            # 비동기 emit 작업 생성 및 실행
            sent_count = 0
            tasks = [self.sio.emit(event_name, payload_for_emit, room=sid) for sid in target_sids]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # 결과 집계 및 로깅
            for i, result in enumerate(results):
                 sid = list(target_sids)[i] # 로깅용 SID (순서 보장 안 될 수 있음)
                 if isinstance(result, Exception): logger.error(f"emit_message 전송 실패 - SID: {sid}, Event: {event_name}, Error: {result}")
                 else: sent_count += 1
            logger.info(f"emit_message 전송 완료 - Target: {log_target}, Event: {event_name}, Sent: {sent_count}/{len(target_sids)}")
            return f"Sent to {sent_count} SIDs"

        except Exception as e:
            logger.error(f"emit_message 중 오류 발생 ({log_target}, {event_name}): {e}")
            logger.error(traceback.format_exc())
            return "Error during message emission"

    # --- 메시지 전송 래퍼 메서드들 ---
    # 아래 메서드들은 emit_message를 사용하여 구현됨

    async def broadcast_cve_update(self, cve_id, data, event_type=WSMessageType.CVE_UPDATED):
        """지정된 CVE를 구독하는 모든 사용자에게 업데이트 메시지를 브로드캐스트합니다."""
        return await self.emit_message(event_type, data, target_cve=cve_id)

    async def broadcast_to_cve(self, cve_id, data, event_type=WSMessageType.CVE_UPDATED):
        """broadcast_cve_update의 별칭 (호환성용)."""
        return await self.emit_message(event_type, data, target_cve=cve_id)

    async def send_notification(self, user_id, notification_data):
        """특정 사용자에게 일반 알림 메시지를 보냅니다."""
        return await self.emit_message(WSMessageType.NOTIFICATION, notification_data, target_user=user_id)

    async def send_message_to_user(self, user_id, event_type, data):
        """특정 사용자에게 지정된 이벤트 타입의 메시지를 보냅니다."""
        return await self.emit_message(event_type, data, target_user=user_id)

    async def send_to_user(self, user_id, data, event_type=WSMessageType.NOTIFICATION):
        """send_message_to_user의 별칭 (호환성용)."""
        return await self.emit_message(event_type, data, target_user=user_id)

    async def emit_to_user(self, user_id, event_type, data, raise_exception=False, **kwargs) -> int:
        """
        특정 사용자에게 메시지를 보내고, 성공적으로 전송된 연결 수를 반환합니다.
        전송 실패 시 raise_exception이 True면 예외를 발생시키고, 아니면 0을 반환합니다.
        """
        result = await self.emit_message(event_type, data, target_user=user_id, **kwargs)
        if isinstance(result, str) and result.startswith("Sent to"):
             try: return int(result.split()[2])
             except: pass # 숫자 변환 실패 시 0 반환
        elif raise_exception:
             raise Exception(f"메시지 전송 실패: {result}")
        return 0

    async def emit(self, event_type, data, critical=False, raise_exception=False, **kwargs) -> int:
        """
        연결된 모든 클라이언트에게 메시지를 브로드캐스트하고, 성공적으로 전송된 연결 수를 반환합니다.
        실패 시 raise_exception 여부에 따라 예외 발생 또는 0 반환.
        """
        kwargs['critical'] = critical
        result = await self.emit_message(event_type, data, broadcast_all=True, **kwargs)
        if isinstance(result, str) and result.startswith("Sent to"):
            try: return int(result.split()[2])
            except: pass
        elif raise_exception:
             raise Exception(f"전체 브로드캐스트 실패: {result}")
        return 0

    async def send_to_specific_user(self, user_id: str, data: Dict[str, Any], event_type: str = WSMessageType.NOTIFICATION) -> bool:
        """특정 사용자에게 메시지 전송 성공 여부를 bool 값으로 반환합니다."""
        result = await self.emit_message(event_type, data, target_user=user_id)
        return isinstance(result, str) and result.startswith("Sent to")

    async def broadcast_json(self, data: Dict[str, Any], event_type: str = WSMessageType.NOTIFICATION) -> bool:
        """연결된 모든 클라이언트에게 JSON 메시지 브로드캐스트 성공 여부를 bool 값으로 반환합니다."""
        result = await self.emit_message(event_type, data, broadcast_all=True)
        return isinstance(result, str) and result.startswith("Sent to")


    # --- 상태 조회 메서드 ---

    def get_participants(self) -> List[str]:
        """현재 연결된 모든 고유 사용자 ID 목록을 반환합니다."""
        return list(self.user_connections.keys())

    def get_connection_info(self, user_id: Optional[str] = None) -> Dict[str, int]:
        """
        현재 서버의 전체 연결 수, 활성 사용자 수 및 (선택적) 특정 사용자의 연결 수를 반환합니다.
        """
        total_connections = len(self.sid_to_user)
        active_users = len(self.user_connections)
        info = {"total_connections": total_connections, "active_users": active_users}
        if user_id:
            info["user_connections"] = len(self.user_connections.get(str(user_id), set()))
        return info

    def has_active_connections(self, user_id: Optional[str] = None) -> bool:
        """서버에 활성 연결이 있는지, 또는 특정 사용자가 활성 연결을 가지고 있는지 확인합니다."""
        if user_id:
            return str(user_id) in self.user_connections and bool(self.user_connections[str(user_id)])
        else:
            return bool(self.sid_to_user)

    def get_user_connection_count(self, user_id: str) -> int:
        """특정 사용자의 현재 활성 Socket.IO 연결(SID) 수를 반환합니다."""
        return len(self.user_connections.get(str(user_id), set()))


    # --- 구독 관련 메서드 ---

    async def broadcast_subscribers_updated(self, cve_id: str):
        """지정된 CVE의 구독자 수가 변경되었음을 해당 CVE 구독자들에게 알립니다."""
        subscriber_ids = self.cve_subscribers.get(str(cve_id), set())
        count = len(subscriber_ids)
        
        # 구독자 정보 수집
        subscribers_data = []
        for user_id in subscriber_ids:
            try:
                user = await self.user_service._get_user_by_id(user_id)
                if user:
                    subscribers_data.append({
                        "id": str(user.id),
                        "userId": str(user.id),
                        "username": user.username,
                        "displayName": user.username,  # username을 displayName으로 사용
                        "profileImage": None  # 프로필 이미지는 None으로 설정하여 사용자 이름 기반 아바타 사용
                    })
            except Exception as e:
                logger.error(f"구독자 정보 조회 중 오류 - 사용자: {user_id}, CVE: {cve_id}: {e}")
        
        logger.info(f"CVE 구독자 정보 전송 - CVE: {cve_id}, 구독자 수: {count}, 구독자 정보 수: {len(subscribers_data)}")
        logger.debug(f"구독자 데이터: {subscribers_data}")
        
        # 메시지 전송
        await self.emit_message(WSMessageType.CVE_SUBSCRIBERS_UPDATED,
                               {'cve_id': cve_id, 'subscribers_count': count, 'subscribers': subscribers_data},
                               target_cve=cve_id)

    def check_cve_subscription(self, cve_id: str, user_id: str) -> bool:
        """
        특정 사용자가 주어진 CVE를 구독하고 있는지 (직접 또는 세션을 통해) 확인합니다.
        """
        user_id_str = str(user_id)
        cve_id_str = str(cve_id)
        # 1. 사용자의 직접 구독 목록 확인
        if user_id_str in self.user_subscriptions and cve_id_str in self.user_subscriptions[user_id_str]:
            return True
        # 2. 사용자의 활성 세션들의 구독 목록 확인
        for sid in self.user_connections.get(user_id_str, set()):
             session_id = self.sid_to_session.get(sid)
             if session_id and cve_id_str in self.session_cve_subscriptions.get(session_id, set()):
                  return True
        return False

    def get_cve_subscribers(self, cve_id: str) -> List[str]:
        """지정된 CVE를 구독하는 모든 고유 사용자 ID 목록을 반환합니다."""
        return list(self.cve_subscribers.get(str(cve_id), set()))


    # --- 사용자 연결 관리 ---

    def register_user_connection(self, user_id: str, sid: str) -> bool:
        """새로운 사용자 연결(SID)을 등록하고 관련 매핑 정보를 업데이트합니다."""
        user_id_str = str(user_id)
        logger.debug(f"사용자 연결 등록 시도 - 사용자: {user_id_str}, SID: {sid}")
        self.sid_to_user[sid] = user_id_str # SID -> User 매핑
        if user_id_str not in self.user_connections:
            self.user_connections[user_id_str] = set() # User -> SID Set 초기화

        # User -> SID Set에 추가 (Set이므로 중복 자동 처리)
        if sid not in self.user_connections[user_id_str]:
             self.user_connections[user_id_str].add(sid)
             logger.info(f"사용자 연결 등록 완료 - 사용자: {user_id_str}, SID: {sid}, 현재 연결 수: {len(self.user_connections[user_id_str])}")
             return True
        else:
             # 이미 존재하는 SID를 다시 등록하려는 경우 (일반적이지 않음)
             logger.warning(f"중복된 SID 등록 시도 감지 - 사용자: {user_id_str}, SID: {sid}")
             return False

    # unregister_user_connection 메서드는 현재 사용되지 않으므로 제거하거나,
    # 필요하다면 _handle_disconnect 로직을 참고하여 구현합니다.


    # --- 의존성 사용 메서드 ---

    async def get_user_by_session_id(self, sid: str, silent: bool = False) -> Optional[UserResponse]:
        """
        주어진 Socket.IO 세션 ID(sid)에 연결된 사용자 정보를 조회합니다.
        내부적으로 self.user_service를 사용하여 사용자 데이터를 가져옵니다.
        """
        if not silent: logger.debug(f"SID로 사용자 조회 시도 - SID: {sid}")

        user_id = self.sid_to_user.get(sid)
        if not user_id:
            if not silent: logger.info(f"SID에 해당하는 사용자 없음 - SID: {sid}")
            return None

        try:
            # 생성자에서 주입받거나 생성된 user_service 사용
            user = await self.user_service._get_user_by_id(user_id)

            if not user:
                 if not silent: logger.warning(f"사용자 ID는 찾았으나 DB 조회 실패 - 사용자 ID: {user_id}, SID: {sid}")
                 return None
            if not silent: logger.debug(f"SID로 사용자 조회 성공 - 사용자: {user.username}, SID: {sid}")
            return user
        except Exception as e:
            logger.error(f"SID로 사용자 조회 중 DB 오류 발생 - 사용자 ID: {user_id}, SID: {sid}: {e}")
            logger.error(traceback.format_exc())
            return None

    async def validate_token(self, token: str) -> tuple[bool, Union[UserResponse, str]]:
        """
        주어진 JWT 토큰을 검증하고, 유효한 경우 사용자 정보를 반환합니다.
        실제 검증 로직은 core.auth 모듈의 verify_token 함수를 사용합니다.
        """
        try:
            if not token: return False, "토큰 미제공"
            # 외부 auth 모듈 함수 호출
            user: Optional[UserResponse] = await verify_token(token)
            if not user: return False, "유효하지 않은 토큰 또는 사용자 없음"
            return True, user
        except Exception as e:
            logger.error(f"토큰 검증 중 예외 발생: {e}")
            return False, f"토큰 검증 중 서버 오류: {str(e)}"

    # --- 주기적 정리 작업 ---

    def start_cleanup_task(self):
        """주기적인 오래된 연결 및 구독 정리 작업을 백그라운드에서 시작합니다."""
        if self.cleanup_task is None or self.cleanup_task.done():
            self.cleanup_task = asyncio.create_task(self.periodic_cleanup())
            logger.info(f"주기적 정리 작업 시작 (간격: {self.CLEANUP_INTERVAL}초)")

    async def periodic_cleanup(self):
        """설정된 간격마다 오래된 연결 및 구독 정보를 정리하는 작업을 반복 실행합니다."""
        while True:
            await asyncio.sleep(self.CLEANUP_INTERVAL)
            logger.info("주기적 정리 작업 실행 시작...")
            async with self.cleanup_lock: # 동시 실행 방지
                try:
                    await self.cleanup_stale_connections_and_subscriptions()
                except Exception as e:
                    logger.error(f"주기적 정리 작업 중 오류 발생: {e}")
                    logger.error(traceback.format_exc())
            logger.info("주기적 정리 작업 실행 완료.")

    async def cleanup_stale_connections_and_subscriptions(self):
        """
        오래된 (비활성) 연결 및 관련 구독 정보를 정리합니다.
        - 연결이 끊긴 사용자의 구독 정보 제거
        - 활성 연결이 없는 세션의 구독 정보 제거
        - 구독자가 없는 CVE 항목 제거
        """
        logger.debug("오래된 연결 및 구독 정리 시작...")
        cleaned_users, cleaned_sessions, cleaned_cve_subs = 0, 0, 0

        # 1. 연결 없는 사용자의 구독 정보 정리
        inactive_users = set(self.user_subscriptions.keys()) - set(self.user_connections.keys())
        for user_id in list(inactive_users): # 복사본 순회
             logger.info(f"비활성 사용자 구독 정리 - 사용자: {user_id}")
             await self._cleanup_user_subscriptions(user_id)
             cleaned_users += 1

        # 2. 활성 SID가 없는 세션의 구독 정보 정리
        # 현재 연결된 모든 SID에 연결된 세션 ID 집합 계산
        active_session_ids = {self.sid_to_session[sid] for sid in self.sid_to_user if sid in self.sid_to_session}
        inactive_sessions = set(self.session_cve_subscriptions.keys()) - active_session_ids
        for session_id in list(inactive_sessions):
             logger.info(f"비활성 세션 구독 정리 - 세션: {session_id}")
             if session_id in self.session_cve_subscriptions:
                  subscribed_cves = list(self.session_cve_subscriptions[session_id])
                  del self.session_cve_subscriptions[session_id]
                  cleaned_sessions += 1
                  logger.debug(f"세션 {session_id}의 CVE 구독 {len(subscribed_cves)}개 정리됨")

        # 3. 구독자가 없는 CVE 항목 정리
        empty_cves = {cve_id for cve_id, subscribers in self.cve_subscribers.items() if not subscribers}
        for cve_id in list(empty_cves):
            logger.info(f"구독자 없는 CVE 정리 - CVE: {cve_id}")
            if cve_id in self.cve_subscribers:
                 del self.cve_subscribers[cve_id]
                 cleaned_cve_subs += 1

        logger.info(f"오래된 연결/구독 정리 완료 - 정리된 사용자 구독: {cleaned_users}, 세션 구독: {cleaned_sessions}, 빈 CVE 항목: {cleaned_cve_subs}")


    async def _cleanup_user_subscriptions(self, user_id: str):
        """
        주어진 사용자 ID와 관련된 모든 구독 정보(사용자 구독 목록, CVE 구독자 목록)를 정리합니다.
        주로 연결이 완전히 끊긴 사용자에 대해 호출됩니다.
        """
        user_id_str = str(user_id)
        logger.debug(f"사용자 구독 전체 정리 시작 - 사용자: {user_id_str}")

        subscribed_cves = self.user_subscriptions.pop(user_id_str, set())
        cves_now_empty = []
        for cve_id in subscribed_cves:
            if cve_id in self.cve_subscribers and user_id_str in self.cve_subscribers[cve_id]:
                self.cve_subscribers[cve_id].remove(user_id_str)
                logger.debug(f"CVE 구독자 목록에서 사용자 제거됨 - 사용자: {user_id_str}, CVE: {cve_id}")
                if not self.cve_subscribers[cve_id]: cves_now_empty.append(cve_id)

        for cve_id in cves_now_empty:
            if cve_id in self.cve_subscribers:
                del self.cve_subscribers[cve_id]
                logger.info(f"구독자 없는 CVE 항목 제거됨 - CVE: {cve_id}")

        logger.info(f"사용자 구독 전체 정리 완료 - 사용자: {user_id_str}, 정리된 CVE 수: {len(subscribed_cves)}")

    async def handle_connected_event(self, data: Dict[str, str]):
        """
        EventBus를 통해 전달된 'connected' 이벤트를 처리합니다.
        """
        user_id = data.get('user_id')
        sid = data.get('sid')
        session_id = data.get('session_id')

        logger.info(f"EventBus: connected 이벤트 수신 - 사용자: {user_id}, SID: {sid}, 세션: {session_id}")

    async def handle_disconnected_event(self, data: Dict[str, str]):
        """
        EventBus를 통해 전달된 'disconnected' 이벤트를 처리합니다.
        """
        user_id = data.get('user_id')
        sid = data.get('sid')
        session_id = data.get('session_id')

        logger.info(f"EventBus: disconnected 이벤트 수신 - 사용자: {user_id}, SID: {sid}, 세션: {session_id}")

    async def handle_cve_subscribed_event(self, data: Dict[str, str]):
        """
        EventBus를 통해 전달된 'cve_subscribed' 이벤트를 처리합니다.
        """
        cve_id = data.get('cve_id')
        user_id = data.get('user_id')
        session_id = data.get('session_id')
        sid = data.get('sid')

        logger.info(f"EventBus: cve_subscribed 이벤트 수신 - CVE: {cve_id}, 사용자: {user_id}, 세션: {session_id}, SID: {sid}")

    async def handle_cve_unsubscribed_event(self, data: Dict[str, str]):
        """
        EventBus를 통해 전달된 'cve_unsubscribed' 이벤트를 처리합니다.
        """
        cve_id = data.get('cve_id')
        user_id = data.get('user_id')
        session_id = data.get('session_id')
        sid = data.get('sid')

        logger.info(f"EventBus: cve_unsubscribed 이벤트 수신 - CVE: {cve_id}, 사용자: {user_id}, 세션: {session_id}, SID: {sid}")


# --- SocketIOManager 싱글톤 인스턴스 생성 ---
# 이 인스턴스는 기존 코드와의 호환성을 위해 유지됩니다.
# 새로운 코드에서는 의존성 주입을 통해 SocketIOManager를 사용하는 것이 권장됩니다.

# UserService 인스턴스는 나중에 초기화됩니다.
socketio_manager = SocketIOManager(user_service=None)

# 의존성 주입 시스템에서 사용할 함수
def get_socketio_manager_instance() -> SocketIOManager:
    """
    SocketIOManager 싱글톤 인스턴스를 반환합니다.
    의존성 주입 시스템에서 사용됩니다.
    """
    global socketio_manager
    return socketio_manager

# UserService 인스턴스를 설정하는 함수
def initialize_socketio_manager_with_user_service(user_service):
    """
    SocketIOManager 인스턴스에 UserService를 설정합니다.
    애플리케이션 시작 시 호출됩니다.
    """
    global socketio_manager
    socketio_manager.user_service = user_service
    logger.info("SocketIOManager에 UserService가 성공적으로 설정되었습니다.")
    return socketio_manager
