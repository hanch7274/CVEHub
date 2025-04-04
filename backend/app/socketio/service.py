"""
소켓 통신 비즈니스 로직 서비스

알림 전송, 구독 관리, 메시지 처리 등 소켓 통신의 핵심 비즈니스 로직을 제공합니다.
"""
from typing import Dict, List, Set, Optional, Any, Union, Tuple, Type, cast
import asyncio
import json
import traceback
from datetime import datetime
from zoneinfo import ZoneInfo

from .models import WSMessageType, SocketSession, SocketError, SocketMessage
from .repository import get_socket_repository
from .interfaces import SocketRepositoryInterface, NotificationServiceInterface
from ..core.logging_utils import get_logger
from ..auth.models import User
from ..notification.models import Notification, NotificationType
from app.core.dependencies import get_user_service

# 로거 설정
logger = get_logger(__name__)


class SocketService:
    """소켓 통신 비즈니스 로직 서비스"""
    
    def __init__(self, repository=None, notification_service=None):
        """서비스 초기화
        
        Args:
            repository: 소켓 저장소 인터페이스 (선택적)
            notification_service: 알림 서비스 인터페이스 (선택적)
        """
        self.logger = logger
        self.repository = repository or get_socket_repository()
        
        # 알림 서비스는 필요할 때 지연 로딩
        self._notification_service = notification_service
        
        # 이벤트 핸들러 레지스트리
        self._event_handlers = {}
        
        # 기본 이벤트 핸들러 등록
        self._register_default_handlers()
        
    async def _get_subscriber_details(self, subscriber_ids: Set[str]) -> List[Dict[str, Any]]:
        """주어진 구독자 ID 목록에서 구독자 상세 정보를 가져옵니다.
        
        Args:
            subscriber_ids: 구독자 ID 집합
            
        Returns:
            구독자 상세 정보 목록 (사용자 객체 리스트)
        """
        subscribers = []
        
        if not subscriber_ids:
            return subscribers
            
        try:
            user_service = get_user_service()
            
            for username in subscriber_ids:
                if username:  # None이 아닌 경우만 처리
                    try:
                        user = await user_service.get_user_by_username(username)
                        if user:
                            subscribers.append({
                                "id": str(user.id),
                                "username": user.username,
                                "displayName": user.full_name,
                                "profileImage": ""
                            })
                    except Exception as e:
                        self.logger.warning(f"사용자 정보 조회 실패 - 사용자명: {username}, 오류: {str(e)}")
        except Exception as e:
            self.logger.error(f"구독자 상세 정보 조회 중 오류: {str(e)}")
            self.logger.error(traceback.format_exc())
            
        return subscribers
        
    def _register_default_handlers(self):
        """기본 이벤트 핸들러를 등록합니다."""
        # 핑 이벤트 핸들러
        self.register_event_handler(WSMessageType.PING, self._handle_ping)
        
        # 구독 이벤트 핸들러
        self.register_event_handler(WSMessageType.SUBSCRIBE_CVE, self._handle_cve_subscribe)
        self.register_event_handler(WSMessageType.UNSUBSCRIBE_CVE, self._handle_cve_unsubscribe)
    
    def register_event_handler(self, event_type: WSMessageType, handler_func):
        """이벤트 핸들러를 등록합니다."""
        self._event_handlers[event_type] = handler_func
        self.logger.debug(f"이벤트 핸들러 등록됨 - 이벤트: {event_type}")
    
    async def handle_event(self, sid: str, event_type: WSMessageType, data: Any = None) -> Dict[str, Any]:
        """이벤트를 처리합니다."""
        try:
            # 이벤트 핸들러 확인
            handler = self._event_handlers.get(event_type)
            if not handler:
                self.logger.warning(f"등록되지 않은 이벤트 핸들러 - 이벤트: {event_type}")
                return {
                    "success": False,
                    "error": {
                        "code": "UNKNOWN_EVENT",
                        "message": f"Unknown event type: {event_type}"
                    }
                }
            
            # 이벤트 핸들러 호출
            return await handler(sid, data)
        except Exception as e:
            self.logger.error(f"이벤트 처리 중 오류 발생 - 이벤트: {event_type}, 오류: {str(e)}")
            self.logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": {
                    "code": "EVENT_HANDLER_ERROR",
                    "message": str(e)
                }
            }
    
    async def _handle_ping(self, sid: str, data: Any = None) -> Dict[str, Any]:
        """핑 이벤트를 처리합니다."""
        timestamp = data.get("timestamp") if isinstance(data, dict) else None
        return {
            "success": True,
            "type": WSMessageType.PONG,
            "timestamp": timestamp,
            "server_time": datetime.now(ZoneInfo("UTC")).isoformat()
        }
    
    async def _handle_cve_subscribe(self, sid: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """CVE 구독 이벤트를 처리합니다."""
        try:
            if not isinstance(data, dict) or "cve_id" not in data:
                return {
                    "success": False,
                    "error": {
                        "code": "INVALID_REQUEST",
                        "message": "Invalid subscribe request, cve_id is required"
                    }
                }
            
            cve_id = data["cve_id"]
            
            # 세션 확인
            session = await self.repository.get_session(sid)
            if not session:
                return {
                    "success": False,
                    "error": {
                        "code": "SESSION_NOT_FOUND",
                        "message": "Session not found"
                    }
                }
            
            # CVE 구독 추가
            result = await self.repository.add_cve_subscription(sid, cve_id)
            
            # 구독자 정보 한 번만 조회
            subscriber_ids = await self.repository.get_cve_subscribers(cve_id)
            subscribers = await self._get_subscriber_details(subscriber_ids)
            
            # 기존 구독자들에게 구독자 업데이트 알림
            if result and session.username and subscriber_ids:
                await self.broadcast_to_users(
                    event_type=WSMessageType.CVE_SUBSCRIBERS_UPDATED,
                    data={
                        "cve_id": cve_id,
                        "subscriber_count": len(subscriber_ids),
                        "subscribers": subscribers
                    },
                    user_names=subscriber_ids,
                    exclude_user_name=session.username
                )
            
            self.logger.info(f"CVE 구독 완료: {cve_id}, 구독자 수: {len(subscriber_ids)}")
            
            return {
                "success": True,
                "cve_id": cve_id,
                "subscribed": True,
                "username": session.username,
                "subscriber_count": len(subscriber_ids),
                "subscribers": subscribers,
                "type": WSMessageType.SUBSCRIPTION_STATUS,
                "status": "subscribed" if result else "failed"
            }
        except Exception as e:
            self.logger.error(f"CVE 구독 처리 중 오류 발생 - 오류: {str(e)}")
            self.logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": {
                    "code": "SUBSCRIPTION_ERROR",
                    "message": str(e)
                }
            }
    
    async def _handle_cve_unsubscribe(self, sid: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """CVE 구독 해제 이벤트를 처리합니다."""
        try:
            if not isinstance(data, dict) or "cve_id" not in data:
                return {
                    "success": False,
                    "error": {
                        "code": "INVALID_REQUEST",
                        "message": "Invalid unsubscribe request, cve_id is required"
                    }
                }
            
            cve_id = data["cve_id"]
            
            # 세션 확인
            session = await self.repository.get_session(sid)
            if not session:
                return {
                    "success": False,
                    "error": {
                        "code": "SESSION_NOT_FOUND",
                        "message": "Session not found"
                    }
                }
            
            # 기존 구독자 수 확인
            old_subscriber_ids = await self.repository.get_cve_subscribers(cve_id)

            # 세션과 구독 상태 확인
            result = await self.repository.remove_cve_subscription(sid, cve_id)
            
            # 구독자 변경사항 알림
            if result:
                new_subscriber_ids = await self.repository.get_cve_subscribers(cve_id)
                
                # 구독자 상세 정보 가져오기
                new_subscribers = []
                if new_subscriber_ids:
                    try:
                        user_service = get_user_service()
                        
                        for username in new_subscriber_ids:
                            if username:  # None이 아닌 경우만 처리
                                try:
                                    user = await user_service.get_user_by_username(username)
                                    if user:
                                        new_subscribers.append({
                                            "id": str(user.id),
                                            "username": user.username,
                                            "displayName": user.full_name,
                                            "profileImage": ""
                                        })
                                except Exception as e:
                                    self.logger.warning(f"사용자 정보 조회 실패 - 사용자명: {username}, 오류: {str(e)}")
                    except Exception as e:
                        self.logger.error(f"구독자 상세 정보 조회 중 오류: {str(e)}")
                        self.logger.error(traceback.format_exc())
                
                if old_subscriber_ids != new_subscriber_ids:
                    await self.broadcast_to_users(
                        event_type=WSMessageType.CVE_SUBSCRIBERS_UPDATED,
                        data={
                            "cve_id": cve_id,
                            "subscriber_count": len(new_subscriber_ids),
                            "subscribers": new_subscribers
                        },
                        user_names=new_subscriber_ids
                    )
            
            # 구독자 상세 정보 가져오기
            subscriber_ids = await self.repository.get_cve_subscribers(cve_id)
            subscribers = await self._get_subscriber_details(subscriber_ids)
            
            self.logger.info(f"CVE 구독 해제 완료: {cve_id}, 구독자 수: {len(subscriber_ids)}")
            
            return {
                "success": True,
                "cve_id": cve_id,
                "subscribed": False,
                "username": session.username,
                "subscriber_count": len(subscriber_ids),
                "subscribers": subscribers,  # 구독자 상세 정보 추가
                "type": WSMessageType.SUBSCRIPTION_STATUS,
                "status": "unsubscribed" if result else "failed"
            }
        except Exception as e:
            self.logger.error(f"CVE 구독 해제 처리 중 오류 발생 - 오류: {str(e)}")
            self.logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": {
                    "code": "UNSUBSCRIPTION_ERROR",
                    "message": str(e)
                }
            }
    
    async def broadcast_to_users(
        self, 
        event_type: WSMessageType, 
        data: Any, 
        user_names: Set[str],
        exclude_user_name: Optional[str] = None,
        manager = None
    ) -> int:
        """여러 사용자에게 메시지를 브로드캐스트합니다."""
        if not manager:
            from .manager import get_socket_manager
            manager = get_socket_manager()
        
        sent_count = 0
        for user_name in user_names:
            if exclude_user_name and user_name == exclude_user_name:
                continue
            
            sessions = await self.repository.get_user_sessions(user_name)
            for session in sessions:
                try:
                    if await manager.emit(event_type, data, room=session.sid):
                        sent_count += 1
                except Exception as e:
                    self.logger.error(f"브로드캐스트 중 오류 발생 - 사용자: {user_name}, SID: {session.sid}, 오류: {str(e)}")
        
        return sent_count
    
    async def broadcast_to_cve_subscribers(
        self, 
        event_type: WSMessageType, 
        data: Any, 
        cve_id: str,
        exclude_user_name: Optional[str] = None,
        manager = None
    ) -> int:
        """CVE 구독자들에게 메시지를 브로드캐스트합니다."""
        subscribers = await self.repository.get_cve_subscribers(cve_id)
        return await self.broadcast_to_users(
            event_type=event_type,
            data=data,
            user_names=subscribers,
            exclude_user_name=exclude_user_name,
            manager=manager
        )
    
    async def create_and_deliver_notification(
        self, 
        notification_type: NotificationType, 
        recipient_id: str, 
        content: str, 
        sender_id: Optional[str] = None, 
        cve_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        manager = None
    ) -> Dict[str, Any]:
        """알림을 생성하고 실시간으로 전송합니다."""
        try:
            # 알림 서비스 지연 로딩
            if not self._notification_service:
                from ..notification.service import get_notification_service
                self._notification_service = get_notification_service()
            
            # 알림 생성 및 저장
            notification, unread_count = await self._notification_service.create_notification(
                notification_type=notification_type,
                recipient_id=recipient_id,
                content=content,
                sender_id=sender_id,
                cve_id=cve_id,
                metadata=metadata
            )
            
            # 읽지 않은 알림 수 조회
            unread_count = await self._notification_service.get_unread_count(recipient_id)
            
            # 알림 전송
            if manager is None:
                # 지연 임포트로 순환 참조 방지
                from app.socketio.manager import socketio_manager
                manager = socketio_manager
            
            # 사용자가 온라인 상태인 경우 실시간 알림 전송
            await manager.emit(
                WSMessageType.NOTIFICATION,
                {
                    "notification": notification.dict(),
                    "unreadCount": unread_count
                },
                room=recipient_id
            )
            
            # 전송 성공 시 delivered 상태 업데이트
            notification.delivered = True
            await notification.save()
            
            return {
                "success": True,
                "notification_id": str(notification.id),
                "unread_count": unread_count
            }
        except Exception as e:
            self.logger.error(f"알림 생성 및 전송 중 오류 발생: {str(e)}")
            self.logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": str(e)
            }
    
    async def process_mentions(
        self,
        content: str,
        sender_id: str,
        cve_id: Optional[str] = None,
        comment_id: Optional[str] = None,
        mentioned_usernames: List[str] = None,
        manager = None
    ) -> Dict[str, Any]:
        """댓글 내용에서 멘션을 처리하고 알림을 생성합니다."""
        try:
            # 멘션 추출 (없는 경우)
            if not mentioned_usernames:
                from ..comment.models import Comment
                mentioned_usernames = Comment.extract_mentions(content)
                
            if not mentioned_usernames:
                return {
                    "success": True,
                    "count": 0,
                    "processed_users": []
                }
                
            self.logger.info(f"멘션 처리 시작 - 멘션된 사용자: {mentioned_usernames}")
            
            # 발신자 정보 조회
            sender = await User.find_one({"_id": sender_id})
            if not sender:
                raise ValueError(f"발신자를 찾을 수 없음: {sender_id}")
                
            # 중복 제거 및 사용자명 정규화
            normalized_usernames = []
            for username in mentioned_usernames:
                # @ 기호 제거
                clean_username = username.replace('@', '')
                normalized_usernames.append(clean_username.lower())
                
            # 사용자 조회 - 정규식으로 대소문자 구분 없이 조회
            regex_patterns = [{"username": {"$regex": f"^{username}$", "$options": "i"}} 
                             for username in set(normalized_usernames)]
            users = await User.find({"$or": regex_patterns}).to_list()
            
            # CVE 정보 한 번만 조회 (중복 쿼리 방지)
            cve_info = None
            if cve_id:
                from ..cve.repository import CVERepository
                cve_repository = CVERepository()
                cve_info = await cve_repository.find_by_cve_id_with_projection(
                    cve_id, {"title": 1, "severity": 1}
                )
                
            # 알림 생성 작업 병렬 처리
            tasks = []
            processed_users = []
            
            for user in users:
                # 자기 자신에게는 알림 생성 안함
                if str(user.id) == str(sender_id):
                    continue
                    
                processed_users.append(user.username)
                
                # 알림 메타데이터 준비
                metadata = {
                    "comment_content": content,
                    "sender_username": sender.username
                }
                
                if comment_id:
                    metadata["comment_id"] = comment_id
                    
                if cve_info:
                    metadata["cve_title"] = cve_info.title
                
                # 알림 생성 및 전송 작업 추가
                tasks.append(
                    self.create_and_deliver_notification(
                        notification_type=NotificationType.MENTION,
                        recipient_id=str(user.id),
                        content=f"{sender.username}님이 회원님을 멘션했습니다",
                        sender_id=str(sender_id),
                        cve_id=cve_id,
                        metadata=metadata,
                        manager=manager
                    )
                )
                
            # 병렬 처리 실행
            if tasks:
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # 오류 처리
                for i, result in enumerate(results):
                    if isinstance(result, Exception):
                        self.logger.error(f"멘션 알림 생성 중 오류 - 사용자: {processed_users[i]}, 오류: {str(result)}")
                
            return {
                "success": True,
                "count": len(processed_users),
                "processed_users": processed_users
            }
                
        except Exception as e:
            self.logger.error(f"멘션 처리 중 오류 발생: {str(e)}")
            self.logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": str(e),
                "count": 0,
                "processed_users": []
            }
    
    async def handle_session_cleanup(self, session_id: str, username: Optional[str] = None) -> Dict[str, Any]:
        """세션 구독 정리를 처리합니다."""
        try:
            self.logger.info(f"세션 정리 처리 시작 - 세션 ID: {session_id}, 사용자명: {username}")
            
            # 세션 ID로 세션 목록 조회
            sessions = await self.repository.get_session_by_id(session_id)
            if not sessions:
                self.logger.warning(f"정리할 세션을 찾을 수 없음 - 세션 ID: {session_id}")
                return {
                    "success": False,
                    "error": {
                        "code": "SESSION_NOT_FOUND",
                        "message": "Session not found"
                    }
                }
            
            # 사용자명이 지정된 경우 해당 사용자의 세션만 필터링
            if username:
                sessions = [s for s in sessions if s.username == username]
                if not sessions:
                    self.logger.warning(f"정리할 사용자 세션을 찾을 수 없음 - 세션 ID: {session_id}, 사용자명: {username}")
                    return {
                        "success": False,
                        "error": {
                            "code": "USER_SESSION_NOT_FOUND",
                            "message": "User session not found"
                        }
                    }
            
            # 세션별 구독 정리
            cleaned_cves = set()
            for session in sessions:
                # 세션의 구독 정보 복사
                session_cves = session.subscribed_cves.copy()
                
                # 구독 제거
                for cve_id in session_cves:
                    await self.repository.remove_cve_subscription(session.sid, cve_id)
                    cleaned_cves.add(cve_id)
            
            self.logger.info(f"세션 정리 처리 완료 - 세션 ID: {session_id}, 정리된 CVE 수: {len(cleaned_cves)}")
            return {
                "success": True,
                "session_id": session_id,
                "cleaned_cves_count": len(cleaned_cves)
            }
        except Exception as e:
            self.logger.error(f"세션 정리 처리 중 오류 발생: {str(e)}")
            self.logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": {
                    "code": "CLEANUP_ERROR",
                    "message": str(e)
                }
            }


# 싱글톤 인스턴스
socket_service = SocketService()

# 의존성 주입을 위한 함수
def get_socket_service():
    """SocketService 인스턴스를 반환합니다."""
    global socket_service
    return socket_service


# 의존성 설정 함수
def initialize_socket_service(repository=None, notification_service=None):
    """SocketService의 의존성을 설정합니다.
    
    Args:
        repository: 소켓 저장소 인터페이스
        notification_service: 알림 서비스 인터페이스
        
    Returns:
        SocketService 인스턴스
    """
    global socket_service
    
    if repository:
        socket_service.repository = repository
    
    if notification_service:
        socket_service._notification_service = notification_service
    
    logger.info("SocketService 의존성이 설정되었습니다.")
    return socket_service
