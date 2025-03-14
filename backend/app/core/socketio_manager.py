from enum import Enum
from typing import Dict, List, Optional, Set, Any
import socketio
import logging
import json
import asyncio
import traceback
from datetime import datetime
from .datetime_utils import get_current_time, get_kst_now

logger = logging.getLogger(__name__)

class WSMessageType(str, Enum):
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

class SocketIOManager:
    """Socket.IO 연결 관리자"""
    
    def __init__(self):
        """연결 관리자 초기화"""
        # Socket.IO 서버 생성
        self.sio = socketio.AsyncServer(
            async_mode='asgi',
            cors_allowed_origins='*',
            ping_timeout=60,
            ping_interval=25,
            max_http_buffer_size=1024 * 50  # 50KB 제한
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
                    
                    # SID 매핑 제거
                    if sid in self.sid_to_user:
                        del self.sid_to_user[sid]
                else:
                    logger.warning(f"알 수 없는 사용자의 연결 해제 - SID: {sid}")
            except Exception as e:
                logger.error(f"연결 해제 처리 중 오류: {str(e)}")
        
        @self.sio.event
        async def ping(sid, data):
            """클라이언트 ping 이벤트 처리"""
            try:
                user_id = self.sid_to_user.get(sid)
                if not user_id:
                    logger.warning(f"알 수 없는 SID의 ping: {sid}")
                    return
                
                # 데이터 로깅
                logger.debug(f"Ping 이벤트 수신 - 사용자: {user_id}, SID: {sid}, 데이터: {data}")
                
                # pong 응답 전송
                pong_data = {
                    "timestamp": get_current_time(),
                    "server_time": get_kst_now().isoformat(),
                    "client_id": data.get("client_id") if data and isinstance(data, dict) else None,
                    "received_at": get_kst_now().timestamp()
                }
                
                logger.debug(f"Pong 응답 전송 - 사용자: {user_id}, SID: {sid}, 데이터: {pong_data}")
                await self.sio.emit('pong', pong_data, room=sid)
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

# Socket.IO 매니저 인스턴스 생성
socketio_manager = SocketIOManager()
