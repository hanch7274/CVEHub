from enum import Enum
from typing import Dict, List, Optional, Set, Any
import socketio
import logging
import json
import asyncio
import traceback
from datetime import datetime
from ..utils.datetime_utils import get_current_time
from .config import get_settings
from .logging_utils import get_logger

# 표준화된 로거 사용
logger = get_logger(__name__)

class WSMessageType(str, Enum):
    """WebSocket 메시지 타입 열거형
    
    프론트엔드와 백엔드 간의 일관된 이벤트 타입을 유지하기 위해 사용됩니다.
    프론트엔드의 SOCKET_EVENTS 상수와 동기화되어야 합니다.
    """
    # 연결 관련 이벤트
    CONNECTED = "connected"  # 클라이언트가 서버에 연결되었을 때 발생
    CONNECT_ACK = "connect_ack"  # 서버가 클라이언트 연결을 확인했을 때 발생
    SESSION_INFO_ACK = "session_info_ack"  # 세션 정보 확인 응답
    
    # 핑/퐁 관련 이벤트
    PING = "ping"  # 클라이언트에서 서버로 보내는 연결 확인 메시지
    PONG = "pong"  # 서버에서 클라이언트로 보내는 연결 확인 응답
    
    # 오류 관련 이벤트
    ERROR = "error"  # 오류 발생 시 전송되는 메시지
    
    # 알림 관련 이벤트
    NOTIFICATION = "notification"  # 일반 알림 메시지
    NOTIFICATION_READ = "notification_read"  # 알림이 읽힘 상태로 변경됨
    ALL_NOTIFICATIONS_READ = "all_notifications_read"  # 모든 알림이 읽힘 상태로 변경됨
    
    # CVE 관련 이벤트
    CVE_CREATED = "cve_created"  # 새로운 CVE가 생성됨
    CVE_UPDATED = "cve_updated"  # 기존 CVE가 업데이트됨
    CVE_DELETED = "cve_deleted"  # CVE가 삭제됨
    
    # 크롤러 관련 이벤트
    CRAWLER_UPDATE_PROGRESS = "crawler_update_progress"  # 크롤러 진행 상황 업데이트
    
    # 댓글 관련 이벤트
    COMMENT_ADDED = "comment_added"  # 새로운 댓글이 추가됨
    COMMENT_UPDATED = "comment_updated"  # 기존 댓글이 업데이트됨
    COMMENT_DELETED = "comment_deleted"  # 댓글이 삭제됨
    COMMENT_REACTION_ADDED = "comment_reaction_added"  # 댓글에 반응이 추가됨
    COMMENT_REACTION_REMOVED = "comment_reaction_removed"  # 댓글에서 반응이 제거됨
    COMMENT_COUNT_UPDATE = "comment_count_update"  # 댓글 수 업데이트

class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.strftime('%Y-%m-%d %H:%M:%S')
        # MongoDB ObjectId 처리 추가
        try:
            from bson import ObjectId
            if isinstance(obj, ObjectId):
                return str(obj)
        except ImportError:
            pass
        return super().default(obj)

def _calculate_message_size(message):
    """JSON 메시지의 크기를 계산 (바이트 단위)"""
    try:
        json_str = json.dumps(message)
        return len(json_str.encode('utf-8'))
    except:
        return 0

class SocketIOManager:
    """Socket.IO 연결 관리자"""
    
    def __init__(self):
        """연결 관리자 초기화"""
        # 설정 가져오기
        settings = get_settings()
        
        # Socket.IO 서버 생성 - Docker 환경에 최적화된 설정
        self.sio = socketio.AsyncServer(
            async_mode='asgi',
            cors_allowed_origins=[
                'http://localhost:3000',
                'http://127.0.0.1:3000',
                'http://localhost:8000',
                'http://127.0.0.1:8000',
                'http://localhost:10683',
                'http://127.0.0.1:10683',
                '*'  # 모든 출처 허용 (개발 환경용)
            ],  # 프론트엔드 주소 명시적 허용
            ping_timeout=settings.WS_PING_TIMEOUT,  # 설정에서 가져온 값 사용
            ping_interval=settings.WS_PING_INTERVAL,  # 설정에서 가져온 값 사용
            max_http_buffer_size=1024 * 50,  # 50KB 제한
            logger=logger  # 로깅 사용
        )
        
        # 사용자별 연결 추적
        self.user_connections: Dict[str, List[str]] = {}  # 사용자별 sid 목록
        self.sid_to_user: Dict[str, str] = {}  # sid에서 사용자 ID로의 매핑
        
        # CVE 구독 관리
        self.cve_subscribers: Dict[str, Set[str]] = {}  # CVE ID별 구독 사용자 목록
        self.user_subscriptions: Dict[str, Set[str]] = {}  # 사용자별 구독 CVE 목록
        
        # 세션 관리
        self.session_subscriptions: Dict[str, Dict[str, List[str]]] = {}  # 세션별 구독 정보
        self.user_session_subscriptions: Dict[str, Dict[str, List[str]]] = {}  # 사용자별 세션 구독 목록
        self.user_session_map: Dict[str, Dict[str, str]] = {}  # 사용자별 세션 ID 매핑
        self.session_cve_subscriptions: Dict[str, Set[str]] = {}  # 세션별 CVE 구독 정보
        
        # 정리 작업 설정
        self.cleanup_lock = asyncio.Lock()
        self.CLEANUP_INTERVAL = 300  # 5분마다 정리
        self.cleanup_task = None
        
        # 이벤트 핸들러 등록
        self.register_handlers()
        
        # 주기적 정리 작업 시작
        self.start_cleanup_task()
    
    def register_handlers(self):
        """Socket.IO 이벤트 핸들러 등록"""
        # connect 이벤트 핸들러는 socketio_routes.py에서 처리하므로 여기서는 제거
        
        @self.sio.event
        async def disconnect(sid):
            """클라이언트 연결 해제 시 호출"""
            try:
                user_id = self.sid_to_user.get(sid)
                if user_id:
                    logger.info(f"Socket.IO 연결 해제 - 사용자: {user_id}, SID: {sid}")
                    
                    # 사용자 연결 정보 업데이트
                    if user_id in self.user_connections:
                        if sid in self.user_connections[user_id]:
                            self.user_connections[user_id].remove(sid)
                        
                        # 사용자의 모든 연결이 끊어진 경우 정리
                        if not self.user_connections[user_id]:
                            del self.user_connections[user_id]
                            
                            # 사용자의 모든 연결이 끊어진 경우 구독 정보도 정리
                            await self._cleanup_user_subscriptions(user_id)
                    
                    # 세션 정보 정리
                    await self._cleanup_session_by_sid(sid)
                    
                    # SID 매핑 제거
                    if sid in self.sid_to_user:
                        del self.sid_to_user[sid]
                else:
                    logger.warning(f"알 수 없는 사용자의 연결 해제 - SID: {sid}")
            except Exception as e:
                logger.error(f"연결 해제 처리 중 오류: {str(e)}")
                logger.error(traceback.format_exc())
        
        @self.sio.event
        async def ping(sid, data):
            """클라이언트 ping 이벤트 처리"""
            try:
                # 사용자 정보 확인
                if sid not in self.sid_to_user:
                    logger.warning(f"알 수 없는 SID의 ping: {sid}")
                    return
                
                # pong 응답 전송
                pong_data = {
                    'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    'server_time': datetime.now().isoformat(),
                    'client_id': data.get('client_id', sid),
                    'received_at': datetime.now().timestamp()
                }
                
                # 로그 레벨을 DEBUG에서 TRACE로 변경 (실제로는 TRACE가 없으므로 DEBUG 레벨이지만 조건부로 출력)
                if logger.isEnabledFor(logging.DEBUG) and get_settings().LOG_PING_PONG:
                    user_id = self.sid_to_user.get(sid, 'unknown')
                    logger.debug(f"Ping 이벤트 수신 - 사용자: {user_id}, SID: {sid}, 데이터: {data}")
                
                await self.sio.emit('pong', pong_data, room=sid)
                
                # 로그 레벨을 DEBUG에서 TRACE로 변경 (실제로는 TRACE가 없으므로 DEBUG 레벨이지만 조건부로 출력)
                if logger.isEnabledFor(logging.DEBUG) and get_settings().LOG_PING_PONG:
                    user_id = self.sid_to_user.get(sid, 'unknown')
                    logger.debug(f"Pong 응답 전송 - 사용자: {user_id}, SID: {sid}, 데이터: {pong_data}")
                
            except Exception as e:
                logger.error(f"Ping 처리 중 오류: {str(e)}")
                logger.error(traceback.format_exc())
        
        @self.sio.event
        async def subscribe_cve(sid, data):
            """CVE 구독 처리"""
            try:
                user_id = self.sid_to_user.get(sid)
                if not user_id:
                    logger.warning(f"알 수 없는 SID의 구독 요청: {sid}")
                    return
                
                cve_id = data.get('cve_id')
                session_id = data.get('session_id')
                
                if not cve_id:
                    logger.warning(f"CVE ID 없는 구독 요청 - 사용자: {user_id}")
                    return
                
                # CVE 구독 정보 업데이트
                if cve_id not in self.cve_subscribers:
                    self.cve_subscribers[cve_id] = set()
                self.cve_subscribers[cve_id].add(user_id)
                
                # 사용자 구독 정보 업데이트
                if user_id not in self.user_subscriptions:
                    self.user_subscriptions[user_id] = set()
                self.user_subscriptions[user_id].add(cve_id)
                
                # 세션 정보가 있으면 세션 구독 정보 업데이트
                if session_id:
                    if session_id not in self.session_cve_subscriptions:
                        self.session_cve_subscriptions[session_id] = set()
                    self.session_cve_subscriptions[session_id].add(cve_id)
                    
                    # 사용자-세션 매핑 업데이트
                    if user_id not in self.user_session_map:
                        self.user_session_map[user_id] = {}
                    self.user_session_map[user_id][sid] = session_id
                
                logger.info(f"CVE 구독 성공 - 사용자: {user_id}, CVE: {cve_id}, 세션: {session_id}")
                
                # 구독 확인 응답
                await self.sio.emit('subscribe_ack', {
                    "cve_id": cve_id,
                    "session_id": session_id,
                    "success": True,
                    "message": f"CVE {cve_id} 구독 성공"
                }, room=sid)
            except Exception as e:
                logger.error(f"CVE 구독 처리 중 오류: {str(e)}")
                logger.error(traceback.format_exc())
        
        @self.sio.event
        async def unsubscribe_cve(sid, data):
            """CVE 구독 해제 처리"""
            try:
                user_id = self.sid_to_user.get(sid)
                if not user_id:
                    logger.warning(f"알 수 없는 SID의 구독 해제 요청: {sid}")
                    return
                
                cve_id = data.get('cve_id')
                session_id = data.get('session_id')
                
                if not cve_id:
                    logger.warning(f"CVE ID 없는 구독 해제 요청 - 사용자: {user_id}")
                    return
                
                # CVE 구독 정보 업데이트
                if cve_id in self.cve_subscribers and user_id in self.cve_subscribers[cve_id]:
                    self.cve_subscribers[cve_id].remove(user_id)
                    if not self.cve_subscribers[cve_id]:
                        del self.cve_subscribers[cve_id]
                
                # 사용자 구독 정보 업데이트
                if user_id in self.user_subscriptions and cve_id in self.user_subscriptions[user_id]:
                    self.user_subscriptions[user_id].remove(cve_id)
                    if not self.user_subscriptions[user_id]:
                        del self.user_subscriptions[user_id]
                
                # 세션 정보가 있으면 세션 구독 정보 업데이트
                if session_id and session_id in self.session_cve_subscriptions:
                    if cve_id in self.session_cve_subscriptions[session_id]:
                        self.session_cve_subscriptions[session_id].remove(cve_id)
                        if not self.session_cve_subscriptions[session_id]:
                            del self.session_cve_subscriptions[session_id]
                
                logger.info(f"CVE 구독 해제 성공 - 사용자: {user_id}, CVE: {cve_id}, 세션: {session_id}")
                
                # 구독 해제 확인 응답
                await self.sio.emit('unsubscribe_ack', {
                    "cve_id": cve_id,
                    "session_id": session_id,
                    "success": True,
                    "message": f"CVE {cve_id} 구독 해제 성공"
                }, room=sid)
            except Exception as e:
                logger.error(f"CVE 구독 해제 처리 중 오류: {str(e)}")
                logger.error(traceback.format_exc())
    
    def register_user_connection(self, user_id: str, sid: str) -> bool:
        """사용자 연결 정보 등록
        
        Args:
            user_id: 사용자 ID
            sid: Socket.IO 세션 ID
            
        Returns:
            bool: 등록 성공 여부
        """
        try:
            # 사용자 연결 목록 초기화 (필요한 경우)
            if user_id not in self.user_connections:
                self.user_connections[user_id] = []
            
            # 중복 연결 방지
            if sid not in self.user_connections[user_id]:
                self.user_connections[user_id].append(sid)
            
            # SID와 사용자 ID 매핑
            self.sid_to_user[sid] = user_id
            
            # 연결 상태 로깅
            total_connections = len(self.sid_to_user)
            user_connections = len(self.user_connections.get(user_id, []))
            
            logger.debug(f"사용자 연결 등록 완료 - 사용자: {user_id}, SID: {sid}")
            logger.debug(f"연결 상태 - 총 연결 수: {total_connections}, 사용자 연결 수: {user_connections}")
            
            return True
        except Exception as e:
            logger.error(f"사용자 연결 등록 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False
    
    async def cleanup_subscriptions(self, sid, user_id):
        """연결 해제 시 구독 정보 정리"""
        try:
            # 세션 ID 확인
            session_id = None
            if user_id in self.user_session_map and sid in self.user_session_map[user_id]:
                session_id = self.user_session_map[user_id][sid]
                del self.user_session_map[user_id][sid]
                if not self.user_session_map[user_id]:
                    del self.user_session_map[user_id]
            
            # 세션 구독 정보 정리
            if session_id and session_id in self.session_cve_subscriptions:
                del self.session_cve_subscriptions[session_id]
            
            # 사용자의 다른 연결이 없으면 모든 구독 정리
            if user_id not in self.user_connections or not self.user_connections[user_id]:
                # CVE 구독자 목록에서 사용자 제거
                for cve_id in list(self.cve_subscribers.keys()):
                    if user_id in self.cve_subscribers[cve_id]:
                        self.cve_subscribers[cve_id].remove(user_id)
                        if not self.cve_subscribers[cve_id]:
                            del self.cve_subscribers[cve_id]
                
                # 사용자 구독 정보 제거
                if user_id in self.user_subscriptions:
                    del self.user_subscriptions[user_id]
        except Exception as e:
            logger.error(f"구독 정리 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
    
    async def unsubscribe_session_cves(self, session_id, user_id):
        """세션 구독 정리"""
        try:
            if not session_id:
                logger.warning(f"세션 ID 없는 구독 정리 요청 - 사용자: {user_id}")
                return False
            
            logger.info(f"세션 구독 정리 - 사용자: {user_id}, 세션: {session_id}")
            
            # 세션 구독 정보 제거
            if session_id in self.session_cve_subscriptions:
                del self.session_cve_subscriptions[session_id]
            
            # 사용자-세션 매핑 업데이트
            if user_id in self.user_session_map:
                for sid, sess_id in list(self.user_session_map[user_id].items()):
                    if sess_id == session_id:
                        del self.user_session_map[user_id][sid]
                
                if not self.user_session_map[user_id]:
                    del self.user_session_map[user_id]
            
            return True
        except Exception as e:
            logger.error(f"세션 구독 정리 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False
    
    async def broadcast_cve_update(self, cve_id, data, event_type=WSMessageType.CVE_UPDATED):
        """CVE 업데이트 브로드캐스트"""
        try:
            if cve_id not in self.cve_subscribers:
                logger.debug(f"구독자 없는 CVE 업데이트: {cve_id}")
                return
            
            subscribers = self.cve_subscribers[cve_id]
            logger.info(f"CVE 업데이트 브로드캐스트 - CVE: {cve_id}, 구독자: {len(subscribers)}명")
            
            # 각 구독자에게 메시지 전송
            for user_id in subscribers:
                if user_id in self.user_connections:
                    for sid in self.user_connections[user_id]:
                        await self.sio.emit(event_type, {
                            "cve_id": cve_id,
                            "data": data,
                            "timestamp": get_current_time()
                        }, room=sid)
        except Exception as e:
            logger.error(f"CVE 업데이트 브로드캐스트 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
    
    async def broadcast_to_cve(self, cve_id, data, event_type=WSMessageType.CVE_UPDATED):
        """CVE 업데이트 브로드캐스트 (프론트엔드 호환성 함수)
        
        Args:
            cve_id: CVE ID
            data: 전송할 데이터
            event_type: 이벤트 타입 (기본값: CVE_UPDATED)
        """
        try:
            if cve_id not in self.cve_subscribers:
                logger.debug(f"구독자 없는 CVE 업데이트: {cve_id}")
                return
            
            subscribers = self.cve_subscribers[cve_id]
            logger.info(f"CVE 업데이트 브로드캐스트 (broadcast_to_cve) - CVE: {cve_id}, 구독자: {len(subscribers)}명")
            
            # 각 구독자에게 메시지 전송
            for user_id in subscribers:
                if user_id in self.user_connections:
                    for sid in self.user_connections[user_id]:
                        await self.sio.emit(event_type, {
                            "cve_id": cve_id,
                            "data": data,
                            "timestamp": get_current_time()
                        }, room=sid)
            
            return True
        except Exception as e:
            logger.error(f"CVE 업데이트 브로드캐스트 (broadcast_to_cve) 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False
    
    async def send_notification(self, user_id, notification_data):
        """사용자에게 알림 전송"""
        try:
            if user_id not in self.user_connections:
                logger.debug(f"연결 없는 사용자 알림: {user_id}")
                return
            
            logger.info(f"알림 전송 - 사용자: {user_id}")
            
            # 사용자의 모든 연결에 알림 전송
            for sid in self.user_connections[user_id]:
                await self.sio.emit('notification', {
                    "data": notification_data,
                    "timestamp": get_current_time()
                }, room=sid)
        except Exception as e:
            logger.error(f"알림 전송 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
    
    async def send_message_to_user(self, user_id, event_type, data):
        """사용자에게 특정 이벤트 타입의 메시지 전송
        
        Args:
            user_id: 메시지를 받을 사용자 ID
            event_type: 이벤트 타입 (WSMessageType 또는 문자열)
            data: 전송할 데이터
        """
        try:
            if user_id not in self.user_connections:
                logger.debug(f"연결 없는 사용자 메시지 전송 실패: {user_id}, 이벤트: {event_type}")
                return
            
            logger.info(f"메시지 전송 - 사용자: {user_id}, 이벤트: {event_type}")
            
            # 사용자의 모든 연결에 메시지 전송
            for sid in self.user_connections[user_id]:
                await self.sio.emit(event_type, {
                    "data": data,
                    "timestamp": get_current_time()
                }, room=sid)
        except Exception as e:
            logger.error(f"메시지 전송 중 오류: {str(e)}, 이벤트: {event_type}")
            logger.error(traceback.format_exc())
            
    async def send_to_user(self, user_id, data, event_type=WSMessageType.NOTIFICATION):
        """사용자에게 메시지 전송 (호환성 함수)
        
        Args:
            user_id: 메시지를 받을 사용자 ID
            data: 전송할 데이터
            event_type: 이벤트 타입 (기본값: NOTIFICATION)
        """
        await self.send_message_to_user(user_id, event_type, data)
    
    async def emit_to_user(self, user_id, event_type, data, raise_exception=False):
        """사용자에게 메시지 전송 및 전송된 연결 수 반환
        
        Args:
            user_id: 메시지를 받을 사용자 ID
            event_type: 이벤트 타입
            data: 전송할 데이터
            raise_exception: 예외 발생 시 예외를 던질지 여부
            
        Returns:
            int: 메시지가 전송된 연결 수
            
        Raises:
            Exception: raise_exception이 True이고 메시지 전송에 실패한 경우
        """
        try:
            if user_id not in self.user_connections:
                logger.warning(f"사용자 {user_id}에게 메시지 전송 실패: 연결된 웹소켓 없음")
                if raise_exception:
                    raise Exception(f"사용자 {user_id}에게 메시지 전송 실패: 연결된 웹소켓 없음")
                return 0
            
            # 열거형 값인 경우 실제 값(문자열)을 사용
            if isinstance(event_type, Enum):
                event_name = event_type.value
            else:
                event_name = event_type
            
            sent_count = 0
            for sid in self.user_connections[user_id]:
                await self.sio.emit(event_name, {
                    "data": data,
                    "timestamp": get_current_time()
                }, room=sid)
                sent_count += 1
            
            logger.info(f"사용자 {user_id}에게 메시지 전송 완료 - 이벤트: {event_name}, 전송 수: {sent_count}")
            return sent_count
        except Exception as e:
            logger.error(f"사용자 {user_id}에게 메시지 전송 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            if raise_exception:
                raise
            return 0
    
    async def emit(self, event_type, data, critical=False, raise_exception=False):
        """모든 연결된 클라이언트에게 메시지 전송
        
        Args:
            event_type: 이벤트 타입
            data: 전송할 데이터
            critical: 중요한 메시지 여부
            raise_exception: 예외 발생 시 예외를 던질지 여부
            
        Returns:
            int: 메시지가 전송된 연결 수
            
        Raises:
            Exception: raise_exception이 True이고 메시지 전송에 실패한 경우
        """
        try:
            sent_count = 0
            
            # 열거형 값인 경우 실제 값(문자열)을 사용
            if isinstance(event_type, Enum):
                event_name = event_type.value
            else:
                event_name = event_type
            
            # 모든 연결된 사용자에게 메시지 전송
            for user_id, sids in self.user_connections.items():
                for sid in sids:
                    await self.sio.emit(event_name, {
                        "data": data,
                        "timestamp": get_current_time(),
                        "critical": critical
                    }, room=sid)
                    sent_count += 1
            
            logger.info(f"전체 브로드캐스트 완료 - 이벤트: {event_name}, 전송 수: {sent_count}")
            return sent_count
        except Exception as e:
            logger.error(f"전체 브로드캐스트 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            if raise_exception:
                raise
            return 0
    
    async def send_to_specific_user(self, user_id: str, data: Dict[str, Any], event_type: str = WSMessageType.NOTIFICATION):
        """특정 사용자에게 메시지 전송
        
        Args:
            user_id: 메시지를 받을 사용자 ID
            data: 전송할 데이터
            event_type: 이벤트 타입 (기본값: NOTIFICATION)
        """
        try:
            if not user_id or user_id not in self.user_connections:
                logger.warning(f"사용자 연결 없음: {user_id}")
                return False
            
            logger.info(f"특정 사용자에게 메시지 전송 - 사용자: {user_id}, 이벤트: {event_type}")
            
            # 사용자의 모든 연결에 메시지 전송
            for sid in self.user_connections[user_id]:
                await self.sio.emit(event_type, data, room=sid)
            
            return True
        except Exception as e:
            logger.error(f"특정 사용자 메시지 전송 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False
    
    async def broadcast_json(self, data: Dict[str, Any], event_type: str = WSMessageType.NOTIFICATION):
        """모든 연결된 클라이언트에게 JSON 데이터 브로드캐스트
        
        Args:
            data: 브로드캐스트할 JSON 데이터
            event_type: 이벤트 타입 (기본값: NOTIFICATION)
        
        Note:
            이 메서드는 모든 연결된 클라이언트에게 메시지를 전송합니다.
            특정 CVE 구독자에게만 메시지를 전송하려면 broadcast_to_cve 또는 broadcast_cve_update 메서드를 사용하세요.
        """
        try:
            # 모든 연결된 사용자에게 메시지 전송
            for user_id, sids in self.user_connections.items():
                for sid in sids:
                    await self.sio.emit(event_type, {
                        "data": data,
                        "timestamp": get_current_time()
                    }, room=sid)
            
            logger.info(f"JSON 브로드캐스트 완료 - 이벤트: {event_type}, 연결 수: {len(self.sid_to_user)}")
            return True
        except Exception as e:
            logger.error(f"JSON 브로드캐스트 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False
    
    def get_participants(self):
        """현재 연결된 모든 사용자 목록 반환
        
        Returns:
            list: 연결된 사용자 ID 목록
            
        Note:
            이 메서드는 단순히 연결된 사용자 ID 목록만 반환합니다.
            더 자세한 연결 정보가 필요한 경우 get_connection_info 메서드를 사용하세요.
            활성 연결 여부만 확인하려면 has_active_connections 메서드를 사용하세요.
        """
        try:
            return list(self.user_connections.keys())
        except Exception as e:
            logger.error(f"참가자 목록 조회 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return []
    
    async def get_connection_info(self, user_id=None):
        """연결 정보 조회"""
        try:
            total_connections = len(self.sid_to_user)
            active_users = len(self.user_connections)
            
            if user_id:
                user_connections = len(self.user_connections.get(user_id, []))
                return {
                    "total_connections": total_connections,
                    "active_users": active_users,
                    "user_connections": user_connections
                }
            else:
                return {
                    "total_connections": total_connections,
                    "active_users": active_users
                }
        except Exception as e:
            logger.error(f"연결 정보 조회 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return {}
    
    def has_active_connections(self, user_id=None):
        """활성 연결 확인"""
        try:
            if user_id:
                return user_id in self.user_connections and len(self.user_connections[user_id]) > 0
            else:
                return len(self.sid_to_user) > 0
        except Exception as e:
            logger.error(f"활성 연결 확인 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False
    
    async def _cleanup_user_subscriptions(self, user_id):
        """사용자의 모든 구독 정보 정리"""
        try:
            if not user_id:
                return
                
            logger.info(f"사용자 구독 정보 정리 - 사용자: {user_id}")
            
            # 사용자가 구독한 CVE 목록 가져오기
            subscribed_cves = self.user_subscriptions.get(user_id, set()).copy()
            
            # 각 CVE 구독 정보에서 사용자 제거
            for cve_id in subscribed_cves:
                if cve_id in self.cve_subscribers and user_id in self.cve_subscribers[cve_id]:
                    self.cve_subscribers[cve_id].remove(user_id)
                    logger.info(f"CVE 구독 정리 - 사용자: {user_id}, CVE: {cve_id}")
                    
                    # 구독자 목록 업데이트 이벤트 발송 (구독자가 있는 경우에만)
                    await self.broadcast_subscribers_updated(cve_id)
            
            # 사용자 구독 정보 제거
            if user_id in self.user_subscriptions:
                del self.user_subscriptions[user_id]
                
            # 사용자-세션 매핑 정보 제거
            if user_id in self.user_session_map:
                del self.user_session_map[user_id]
                
            logger.info(f"사용자 구독 정보 정리 완료 - 사용자: {user_id}")
        except Exception as e:
            logger.error(f"사용자 구독 정보 정리 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            
    async def _cleanup_session_by_sid(self, sid):
        """SID에 연결된 세션 정보 정리"""
        try:
            user_id = self.sid_to_user.get(sid)
            if not user_id:
                return
                
            # 사용자-세션 매핑에서 해당 SID에 대한 세션 ID 찾기
            if user_id in self.user_session_map and sid in self.user_session_map[user_id]:
                session_id = self.user_session_map[user_id][sid]
                
                # 세션 ID가 있는 경우 해당 세션의 구독 정보 정리
                if session_id and session_id in self.session_cve_subscriptions:
                    subscribed_cves = self.session_cve_subscriptions[session_id].copy()
                    
                    # 세션이 구독한 각 CVE에 대해 처리
                    for cve_id in subscribed_cves:
                        logger.info(f"세션 구독 정리 - 세션: {session_id}, CVE: {cve_id}")
                        
                        # 세션 구독 정보에서 CVE 제거
                        if cve_id in self.session_cve_subscriptions[session_id]:
                            self.session_cve_subscriptions[session_id].remove(cve_id)
                    
                    # 구독이 없는 세션 정보 제거
                    if not self.session_cve_subscriptions[session_id]:
                        del self.session_cve_subscriptions[session_id]
                
                # 사용자-세션 매핑에서 SID 제거
                del self.user_session_map[user_id][sid]
                
                # 사용자의 세션 매핑이 비어있으면 제거
                if not self.user_session_map[user_id]:
                    del self.user_session_map[user_id]
                    
                logger.info(f"세션 정보 정리 완료 - 사용자: {user_id}, 세션: {session_id}, SID: {sid}")
        except Exception as e:
            logger.error(f"세션 정보 정리 중 오류: {str(e)}")
            logger.error(traceback.format_exc())

    def start_cleanup_task(self):
        """주기적 구독 정리 작업 시작"""
        if self.cleanup_task is None or self.cleanup_task.done():
            self.cleanup_task = asyncio.create_task(self.periodic_cleanup())
            logger.info(f"주기적 구독 정리 작업 시작 (간격: {self.CLEANUP_INTERVAL}초)")
    
    async def periodic_cleanup(self):
        """주기적으로 불필요한 구독 정리"""
        try:
            while True:
                await asyncio.sleep(self.CLEANUP_INTERVAL)
                async with self.cleanup_lock:
                    logger.info("주기적 구독 정리 작업 실행 중...")
                    await self.cleanup_stale_subscriptions()
        except asyncio.CancelledError:
            logger.info("주기적 구독 정리 작업 취소됨")
        except Exception as e:
            logger.error(f"주기적 구독 정리 작업 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            # 오류 발생 시 작업 재시작
            await asyncio.sleep(10)  # 10초 후 재시작
            self.start_cleanup_task()
    
    async def cleanup_stale_subscriptions(self):
        """오래된 구독 정보 정리"""
        try:
            # 1. 활성 사용자 및 세션 확인
            active_users = set()
            active_sessions = set()
            
            # 현재 연결된 모든 사용자 확인
            for sid, user_id in self.sid_to_user.items():
                if user_id:
                    active_users.add(user_id)
                    
                    # 사용자의 활성 세션 확인
                    if user_id in self.user_session_map:
                        for session_sid, session_id in self.user_session_map[user_id].items():
                            if session_id:
                                active_sessions.add(session_id)
            
            # 2. 비활성 사용자의 구독 정보 정리
            inactive_users = set()
            for user_id in list(self.user_subscriptions.keys()):
                if user_id not in active_users:
                    inactive_users.add(user_id)
                    await self._cleanup_user_subscriptions(user_id)
                    logger.info(f"비활성 사용자 구독 정리 - 사용자: {user_id}")
            
            # 3. 비활성 세션의 구독 정보 정리
            inactive_sessions = set()
            for session_id in list(self.session_cve_subscriptions.keys()):
                if session_id not in active_sessions:
                    inactive_sessions.add(session_id)
                    
                    # 세션이 구독한 CVE 목록 복사
                    subscribed_cves = self.session_cve_subscriptions[session_id].copy()
                    
                    # 세션이 구독한 각 CVE에 대해 처리
                    for cve_id in subscribed_cves:
                        logger.info(f"비활성 세션 구독 정리 - 세션: {session_id}, CVE: {cve_id}")
                        
                        # 세션 구독 정보에서 CVE 제거
                        if cve_id in self.session_cve_subscriptions[session_id]:
                            self.session_cve_subscriptions[session_id].remove(cve_id)
                    
                    # 구독이 없는 세션 정보 제거
                    if not self.session_cve_subscriptions[session_id]:
                        del self.session_cve_subscriptions[session_id]
            
            # 4. 구독자가 없는 CVE 구독 정보 정리
            empty_cve_subscriptions = []
            for cve_id, subscribers in self.cve_subscribers.items():
                # 실제 활성 사용자만 필터링
                active_subscribers = [user_id for user_id in subscribers if user_id in active_users]
                
                # 활성 구독자가 없는 경우
                if not active_subscribers:
                    empty_cve_subscriptions.append(cve_id)
            
            # 구독자가 없는 CVE 제거
            for cve_id in empty_cve_subscriptions:
                del self.cve_subscribers[cve_id]
                logger.info(f"구독자 없는 CVE 구독 정보 제거 - CVE: {cve_id}")
                
                # 구독자 목록 업데이트 이벤트 발송
                await self.broadcast_subscribers_updated(cve_id)
            
            # 5. 정리 결과 로깅
            logger.info(f"구독 정리 완료 - 비활성 사용자: {len(inactive_users)}, 비활성 세션: {len(inactive_sessions)}, 빈 CVE 구독: {len(empty_cve_subscriptions)}")
            
        except Exception as e:
            logger.error(f"구독 정리 중 오류: {str(e)}")
            logger.error(traceback.format_exc())

    async def broadcast_subscribers_updated(self, cve_id):
        """CVE 구독자 목록 업데이트 브로드캐스트"""
        try:
            if cve_id not in self.cve_subscribers:
                logger.debug(f"구독자 없는 CVE 구독자 업데이트: {cve_id}")
                return
            
            subscribers = self.cve_subscribers[cve_id]
            logger.info(f"CVE 구독자 목록 업데이트 브로드캐스트 - CVE: {cve_id}, 구독자: {len(subscribers)}명")
            
            # 구독자 수 정보 포함
            data = {
                'cve_id': cve_id,
                'subscribers_count': len(subscribers),
                'last_modified_at': get_current_time()
            }
            
            # 모든 구독자에게 업데이트 전송
            for user_id in subscribers:
                if user_id in self.user_connections:
                    for sid in self.user_connections[user_id]:
                        await self.sio.emit('subscribers_updated', data, room=sid)
                        logger.debug(f"구독자 업데이트 전송 - 사용자: {user_id}, SID: {sid}")
        except Exception as e:
            logger.error(f"구독자 목록 업데이트 브로드캐스트 중 오류: {str(e)}")
            logger.error(traceback.format_exc())

# Socket.IO 매니저 인스턴스 생성
socketio_manager = SocketIOManager()
