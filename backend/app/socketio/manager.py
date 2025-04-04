"""
Socket.IO 서버 관리 클래스

Socket.IO 서버를 초기화하고, 클라이언트와의 연결을 관리하며, 이벤트 처리를 담당합니다.
"""
from typing import Dict, List, Set, Any, Optional, Union, Callable
import socketio
import asyncio
import json
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .models import WSMessageType, SocketSession, SocketError
from .repository import get_socket_repository
from .interfaces import SocketRepositoryInterface, SocketServiceInterface
from ..core.logging_utils import get_logger
from ..core.config import get_settings
from ..auth.service import verify_token, UserService
from ..auth.models import UserResponse
import traceback

# 로거 설정
logger = get_logger(__name__)


class DateTimeEncoder(json.JSONEncoder):
    """JSON 직렬화 시 datetime 및 ObjectId 객체 처리"""
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()  # ISO 표준 포맷 사용
        try:
            from bson import ObjectId
            if isinstance(obj, ObjectId):
                return str(obj)
        except ImportError:
            pass  # bson 라이브러리가 없는 경우 무시
        return super().default(obj)


class SocketManager:
    """소켓 통신 서비스"""
    
    def __init__(self, 
                 user_service: Optional[UserService] = None,
                 repository: Optional[SocketRepositoryInterface] = None,
                 service: Optional[SocketServiceInterface] = None):
        """
        Socket.IO 매니저 초기화
        
        Args:
            user_service: 사용자 인증 서비스. None인 경우 내부에서 생성
            repository: 소켓 저장소 인터페이스. None인 경우 내부에서 생성
            service: 소켓 서비스 인터페이스. None인 경우 내부에서 생성
        """
        self.logger = logger
        self.settings = get_settings()
        
        # 의존성 주입 또는 생성
        self.user_service = user_service
        self.repository = repository or get_socket_repository()
        
        # service는 지연 로딩
        self._service = None
        if service:
            self._service = service
        
        # ping/pong 로깅을 억제하기 위해 socketio 로거 레벨을 WARNING으로 설정
        socketio_logger = logging.getLogger('socketio.server')
        socketio_logger.setLevel(logging.WARNING)
        
        engineio_logger = logging.getLogger('engineio.server')
        engineio_logger.setLevel(logging.WARNING)
        
        # Socket.IO 서버 생성
        self.sio = socketio.AsyncServer(
            async_mode='asgi',
            cors_allowed_origins='*',
            json=json,
            logger=False,  # 핑/퐁 메시지 로깅 비활성화
            engineio_logger=self.settings.WS_ENGINEIO_LOGGER,
            ping_timeout=self.settings.WS_PING_TIMEOUT,
            ping_interval=self.settings.WS_PING_INTERVAL,
            max_http_buffer_size=self.settings.WS_MAX_HTTP_BUFFER_SIZE
        )
        
        # 이벤트 핸들러 등록
        self._setup_event_handlers()
        
        # 앱 인스턴스 생성
        self.app = socketio.ASGIApp(
            self.sio,
            socketio_path=self.settings.socket_path
        )
    
    def _setup_event_handlers(self):
        """소켓 이벤트 핸들러 등록"""
        
        @self.sio.event
        async def connect(sid, environ, auth):
            """연결 이벤트 핸들러"""
            await self._handle_connect(sid, environ, auth)
            
        @self.sio.event
        async def disconnect(sid):
            """연결 해제 이벤트 핸들러"""
            await self._handle_disconnect(sid)
            
        # ping/pong 이벤트 핸들러 제거 - Socket.IO가 내부적으로 처리하도록 함
            
        @self.sio.event
        async def subscribe_cve(sid, data):
            """구독 이벤트 핸들러"""
            # 지연 로딩
            await self._ensure_service()
            response = await self._service.handle_event(sid, WSMessageType.SUBSCRIBE_CVE, data)
            await self.sio.emit(WSMessageType.SUBSCRIPTION_STATUS, response, room=sid)
            
        @self.sio.event
        async def unsubscribe_cve(sid, data):
            """구독 해제 이벤트 핸들러"""
            # 지연 로딩
            await self._ensure_service()
            response = await self._service.handle_event(sid, WSMessageType.UNSUBSCRIBE_CVE, data)
            await self.sio.emit(WSMessageType.SUBSCRIPTION_STATUS, response, room=sid)
    
    async def _handle_connect(self, sid: str, environ: Dict[str, Any], auth: Dict[str, Any]) -> None:
        """
        Socket.IO 'connect' 이벤트의 실제 처리 로직.
        인증 수행, 사용자 연결 정보 등록, 세션 구독 복원 등을 처리합니다.
        
        Args:
            sid: 소켓 ID
            environ: WSGI 환경 변수
            auth: 인증 정보
        """
        try:
            self.logger.info(f"소켓 연결 시도 - SID: {sid}")
            
            # 인증 정보 확인
            auth_success = False
            user_info = None
            
            # auth 파라미터 또는 쿼리 파라미터에서 인증 정보 추출
            token = None
            username = None
            
            if auth:
                token = auth.get('token')
                username = auth.get('username')
            
            if not token or not username:
                # environ의 쿼리 파라미터에서 인증 정보 추출
                query = environ.get('QUERY_STRING', '')
                import urllib.parse
                query_params = dict(urllib.parse.parse_qsl(query))
                token = query_params.get('token') or token
                username = query_params.get('username') or query_params.get('userId') or query_params.get('user_id') or username
            
            # 일단 소켓 연결 정보 로깅
            self.logger.info(f"소켓 인증 시도 - SID: {sid}, token 존재: {token is not None}, username 존재: {username is not None}")
            if token:
                self.logger.info(f"토큰 정보 - 길이: {len(token)}, 형태: {token[:10]}...")
            if username:
                self.logger.info(f"사용자명 정보: {username}")
            
            # auth 파라미터 전체 로깅
            self.logger.info(f"전체 auth 파라미터: {auth}")
            
            # 인증 정보가 있는 경우 토큰 검증
            if token and username:
                if not self.user_service:
                    # UserService가 아직 설정되지 않은 경우 생성
                    from app.auth.service import UserService
                    self.user_service = UserService()
                    
                try:
                    # 토큰 검증 전 로깅
                    self.logger.info(f"소켓 인증 시도 - 토큰 검증 전")
                    
                    # 토큰 검증
                    user_info = await verify_token(token)
                    
                    # 토큰 검증 결과 확인
                    if user_info:
                        self.logger.info(f"토큰 검증 성공 - 토큰 사용자명: {user_info.username}, 요청 사용자명: {username}")
                    else:
                        self.logger.warning(f"토큰 검증 실패 - 유효하지 않은 토큰")
                    
                    if user_info and str(user_info.username) == str(username):
                        auth_success = True
                        self.logger.info(f"소켓 인증 성공 - SID: {sid}, 사용자명: {username}")
                    else:
                        self.logger.warning(f"소켓 인증 실패 - SID: {sid}, 토큰의 사용자명({user_info.username if user_info else 'None'})와 요청 사용자명({username}) 불일치")
                except Exception as e:
                    self.logger.error(f"소켓 인증 중 오류 발생: {str(e)}")
                    self.logger.error(traceback.format_exc())
            
            # 세션 ID 확인 (클라이언트에서 제공하거나 새로 생성)
            session_id = None
            if auth:
                session_id = auth.get('sessionId') or auth.get('session_id')
            if not session_id:
                session_id = environ.get('HTTP_X_SESSION_ID') or f"s_{sid}"
            
            # 소켓 세션 추가
            await self.repository.add_session(
                sid=sid,
                username=username if auth_success else None,
                session_id=session_id
            )
            
            # 인증 결과와 세션 정보를 클라이언트에 전송
            await self.sio.emit(
                WSMessageType.CONNECT_ACK if auth_success else WSMessageType.CONNECTED,
                {
                    "authenticated": auth_success,
                    "username": username if auth_success else None,
                    "sessionId": session_id,
                    "serverTime": datetime.now(ZoneInfo("UTC")).isoformat()
                },
                room=sid
            )
            
            self.logger.info(f"소켓 연결 완료 - SID: {sid}, 인증: {auth_success}, 세션 ID: {session_id}")
        
        except Exception as e:
            self.logger.error(f"소켓 연결 처리 중 오류 발생: {str(e)}")
            self.logger.error(traceback.format_exc())
            
            # 오류 발생 시 클라이언트에 오류 메시지 전송
            try:
                await self.sio.emit(
                    WSMessageType.ERROR,
                    {
                        "code": "CONNECTION_ERROR",
                        "message": "Connection initialization failed",
                        "details": {"reason": str(e)}
                    },
                    room=sid
                )
            except Exception:
                self.logger.error("오류 메시지 전송 중 추가 오류 발생")
    
    async def _handle_disconnect(self, sid: str) -> None:
        """
        Socket.IO 'disconnect' 이벤트의 실제 처리 로직.
        사용자 연결 정보 및 관련 매핑 정보를 정리합니다.
        
        Args:
            sid: 소켓 ID
        """
        try:
            self.logger.info(f"소켓 연결 해제 - SID: {sid}")
            
            # 세션 정보 조회
            session = await self.repository.get_session(sid)
            if not session:
                self.logger.warning(f"연결 해제 시 세션을 찾을 수 없음 - SID: {sid}")
                return
            
            # 사용자 정보 저장
            username = session.username
            session_id = session.session_id
            
            # 세션 제거
            await self.repository.remove_session(sid)
            
            self.logger.info(f"소켓 연결 해제 완료 - SID: {sid}, 사용자: {username}, 세션 ID: {session_id}")
        
        except Exception as e:
            self.logger.error(f"소켓 연결 해제 처리 중 오류 발생: {str(e)}")
            self.logger.error(traceback.format_exc())
    
    async def emit(
        self, 
        event: Union[str, WSMessageType], 
        data: Any, 
        room: Optional[str] = None,
        namespace: Optional[str] = None,
        skip_sid: Optional[str] = None,
        callback: Optional[Callable] = None
    ) -> bool:
        """
        Socket.IO 이벤트를 발신합니다.
        
        Args:
            event: 이벤트 이름 또는 WSMessageType
            data: 이벤트 데이터
            room: 특정 룸이나 SID
            namespace: 네임스페이스 (기본값: '/')
            skip_sid: 제외할 SID
            callback: 콜백 함수
            
        Returns:
            발신 성공 여부
        """
        try:
            # 이벤트 이름 정규화
            event_name = event.value if isinstance(event, WSMessageType) else event
            
            # 데이터 직렬화 시도
            try:
                # 테스트 직렬화 (오류 검증용)
                json.dumps(data, cls=DateTimeEncoder)
            except TypeError as e:
                self.logger.error(f"이벤트 데이터 직렬화 실패 - 이벤트: {event_name}, 오류: {str(e)}")
                if isinstance(data, dict):
                    # 직렬화 가능한 항목만 필터링
                    filtered_data = {}
                    for k, v in data.items():
                        try:
                            json.dumps({k: v}, cls=DateTimeEncoder)
                            filtered_data[k] = v
                        except TypeError:
                            self.logger.warning(f"직렬화 불가능한 필드 제외 - 필드: {k}")
                    data = filtered_data
                else:
                    # 직렬화 불가능한 데이터는 문자열로 변환
                    data = str(data)
            
            # 룸이 사용자 ID인 경우 해당 사용자의 모든 세션에 발신
            if room and len(room) < 50:  # SID는 보통 길기 때문에 사용자 ID인지 확인
                user_sessions = await self.repository.get_user_sessions(room)
                if user_sessions:
                    # 사용자의 모든 세션에 발신
                    for session in user_sessions:
                        await self.sio.emit(
                            event_name,
                            data,
                            room=session.sid,
                            namespace=namespace,
                            skip_sid=skip_sid,
                            callback=callback
                        )
                    return True
            
            # 일반적인 발신
            await self.sio.emit(
                event_name,
                data,
                room=room,
                namespace=namespace,
                skip_sid=skip_sid,
                callback=callback
            )
            return True
            
        except Exception as e:
            self.logger.error(f"이벤트 발신 중 오류 발생 - 이벤트: {event}, 오류: {str(e)}")
            self.logger.error(traceback.format_exc())
            return False

    async def _ensure_service(self):
        """소켓 서비스가 있는지 확인하고 없는 경우 로딩합니다."""
        if self._service is None:
            from .service import get_socket_service
            self._service = get_socket_service()
        return self._service
        
    async def broadcast_json(self, data: Dict[str, Any], event_name: str = "notification") -> bool:
        """연결된 모든 클라이언트에게 JSON 메시지를 브로드캐스트하고 성공 여부를 반환합니다.
        
        Args:
            data: 전송할 JSON 데이터
            event_name: 이벤트 이름 (기본값: notification)
            
        Returns:
            브로드캐스트 성공 여부
        """
        try:
            await self.sio.emit(event_name, data)
            return True
        except Exception as e:
            self.logger.error(f"broadcast_json 메서드 실행 중 오류 발생: {str(e)}")
            self.logger.error(traceback.format_exc())
            return False
            
    async def emit_message(self, event_name: str, data: Any,
                        target_user: Optional[str] = None, target_room: Optional[str] = None,
                        target_sid: Optional[str] = None, broadcast_all: bool = False,
                        skip_sid: Optional[str] = None, namespace: str = "/") -> str:
        """
        범용 메시지 전송 유틸리티 메서드.
        다양한 타겟(특정 SID, 사용자, 룸, 전체)에게 메시지를 전송합니다.
        
        Args:
            event_name: 전송할 이벤트 이름
            data: 전송할 데이터
            target_user: 메시지를 전송할 특정 사용자 ID
            target_room: 메시지를 전송할 특정 룸 이름
            target_sid: 메시지를 전송할 특정 세션 ID
            broadcast_all: 모든 클라이언트에게 전송할지 여부
            skip_sid: 전송 제외할 세션 ID
            namespace: 네임스페이스
            
        Returns:
            전송 결과 메시지
        """
        try:
            if broadcast_all:
                # 모든 클라이언트에게 전송
                await self.sio.emit(event_name, data, namespace=namespace, skip_sid=skip_sid)
                return f"Broadcast to all clients"
            elif target_sid:
                # 특정 세션에만 전송
                await self.sio.emit(event_name, data, room=target_sid, namespace=namespace)
                return f"Sent to session {target_sid}"
            elif target_user:
                # 특정 사용자의 모든 세션에 전송
                user_sessions = await self.repository.get_user_sessions(target_user)
                if not user_sessions:
                    return f"User {target_user} has no active sessions"
                
                sent_count = 0
                for session in user_sessions:
                    await self.sio.emit(event_name, data, room=session.sid, namespace=namespace)
                    sent_count += 1
                return f"Sent to {sent_count} sessions of user {target_user}"
            elif target_room:
                # 특정 룸에 전송
                await self.sio.emit(event_name, data, room=target_room, namespace=namespace)
                return f"Sent to room {target_room}"
            else:
                # 적절한 타겟이 지정되지 않은 경우
                self.logger.warning(f"emit_message: 타겟이 지정되지 않았습니다. 기본적으로 브로드캐스트합니다.")
                await self.sio.emit(event_name, data, namespace=namespace)
                return "Broadcast (default)"
        
        except Exception as e:
            self.logger.error(f"emit_message 메서드 실행 중 오류 발생: {str(e)}")
            self.logger.error(traceback.format_exc())
            return "Error during message emission"
            
    async def broadcast_cve_update(self, cve_id: str, data: Any, event_type: WSMessageType) -> str:
        """
        CVE 업데이트 정보를 모든 클라이언트에게 브로드캐스트합니다.
        
        Args:
            cve_id: 업데이트된 CVE의 ID
            data: 전송할 데이터
            event_type: WebSocket 메시지 타입 (WSMessageType)
            
        Returns:
            전송 결과 메시지
        """
        try:
            event_name = str(event_type.value)
            self.logger.info(f"CVE 업데이트 정보 브로드캐스트: {cve_id} - {event_name}")
            
            # 모든 클라이언트에게 전송
            await self.sio.emit(event_name, data)
            return f"CVE {cve_id} 업데이트가 브로드캐스트되었습니다."
        except Exception as e:
            self.logger.error(f"broadcast_cve_update 중 오류 발생: {str(e)}")
            import traceback
            self.logger.error(traceback.format_exc())
            return f"CVE {cve_id} 업데이트 브로드캐스트 중 오류: {str(e)}"
    
    async def emit_to_user(self, username, event_name, data, raise_exception=False, **kwargs) -> int:
        """
        특정 사용자에게 메시지를 보내고, 성공적으로 전송된 연결 수를 반환합니다.
        전송 실패 시 raise_exception이 True면 예외를 발생시키고, 아니면 0을 반환합니다.
        
        Args:
            username: 메시지를 보낼 사용자명
            event_name: 이벤트 이름
            data: 전송할 데이터
            raise_exception: 예외 발생 여부
            **kwargs: 추가 파라미터
            
        Returns:
            성공적으로 전송된 연결 수
        """
        try:
            result = await self.emit_message(event_name, data, target_user=username, **kwargs)
            if isinstance(result, str) and result.startswith("Sent to"):
                try: 
                    return int(result.split()[2])
                except: 
                    pass  # 숫자 변환 실패 시 0 반환
            elif raise_exception:
                raise Exception(f"메시지 전송 실패: {result}")
            return 0
        except Exception as e:
            self.logger.error(f"emit_to_user 메서드 실행 중 오류 발생: {str(e)}")
            if raise_exception:
                raise
            return 0

# 싱글톤 인스턴스
socket_manager = SocketManager()

# 하위 호환성을 위한 별칭
socketio_manager = socket_manager

# 의존성 주입을 위한 함수
def get_socket_manager():
    """소켓 매니저 인스턴스를 반환합니다."""
    global socket_manager
    return socket_manager

# UserService 설정 함수
def initialize_socket_manager_with_user_service(user_service: UserService) -> SocketManager:
    """
    SocketManager에 UserService를 설정합니다.
    
    Args:
        user_service: UserService 인스턴스
        
    Returns:
        SocketManager 인스턴스
    """
    global socket_manager
    socket_manager.user_service = user_service
    logger.info("SocketManager에 UserService가 설정되었습니다.")
    return socket_manager
