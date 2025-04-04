from typing import List, Optional, Dict, Tuple, Any
from .models import Notification, NotificationType, NotificationStatus
from .repository import NotificationRepository, get_notification_repository
from app.socketio.manager import socketio_manager, WSMessageType
import logging

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self, repository: Optional[NotificationRepository] = None):
        """NotificationService 초기화
        
        Args:
            repository: NotificationRepository 인스턴스 (선택적)
        """
        self.repository = repository or get_notification_repository()
    
    async def create_notification(
        self,
        notification_type: NotificationType,
        recipient_id: str,
        content: str,
        sender_id: Optional[str] = None,
        cve_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Notification, int]:
        """알림을 생성하고 저장합니다."""
        try:
            # Repository를 통해 알림 생성
            notification = await self.repository.create(
                notification_type=notification_type,
                recipient_id=recipient_id,
                content=content,
                sender_id=sender_id,
                cve_id=cve_id,
                metadata=metadata
            )

            # 온라인 사용자에게 실시간 전송 시도
            try:
                await self._deliver_notification(notification)
            except Exception as e:
                logger.error(f"Failed to deliver notification: {str(e)}")

            # 읽지 않은 알림 개수 조회
            unread_count = await self.get_unread_count(recipient_id)

            return notification, unread_count

        except Exception as e:
            logger.error(f"Error creating notification: {str(e)}")
            raise

    async def _deliver_notification(self, notification: Notification) -> bool:
        """온라인 사용자에게 알림 전송 시도"""
        try:
            # Socket.IO를 통해 실시간 전송
            await socketio_manager.emit(
                WSMessageType.NOTIFICATION,
                {
                    "notification": notification.dict(),
                    "unreadCount": await self.get_unread_count(notification.recipient_id)
                },
                room=notification.recipient_id
            )
            
            # 전송 성공 시 delivered 상태 업데이트
            await self.repository.mark_as_delivered(notification.id)
            return True
        except Exception as e:
            logger.error(f"Delivery failed: {str(e)}")
            return False

    async def get_notifications(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 20,
        status: Optional[NotificationStatus] = None
    ) -> List[Notification]:
        """사용자의 알림 목록을 조회합니다."""
        try:
            return await self.repository.get_by_recipient(
                user_id=user_id,
                skip=skip,
                limit=limit,
                status=status
            )
        except Exception as e:
            logger.error(f"Error fetching notifications: {str(e)}")
            return []

    async def mark_as_read(self, notification_id: str, user_id: str) -> bool:
        """알림을 읽음 처리합니다."""
        try:
            return await self.repository.mark_as_read(notification_id, user_id)
        except Exception as e:
            logger.error(f"Error marking notification as read: {str(e)}")
            return False

    async def get_unread_count(self, user_id: str) -> int:
        """읽지 않은 알림 개수를 조회합니다."""
        try:
            return await self.repository.get_unread_count(user_id)
        except Exception as e:
            logger.error(f"Error counting unread notifications: {str(e)}")
            return 0

    async def mark_all_as_read(self, user_id: str) -> bool:
        """모든 알림을 읽음 처리합니다."""
        try:
            count = await self.repository.mark_all_as_read(user_id)
            return count >= 0  # 에러가 없으면 True 반환
        except Exception as e:
            logger.error(f"Error marking all notifications as read: {str(e)}")
            return False

    async def get_total_count(self, user_id: str) -> int:
        """전체 알림 개수를 조회합니다."""
        try:
            return await self.repository.get_total_count(user_id)
        except Exception as e:
            logger.error(f"Error counting total notifications: {str(e)}")
            return 0

    async def create_mention_notification(
        self,
        recipient_id: str,
        sender_id: str,
        cve_id: str,
        comment_content: str,
        sender_username: str = None,  # 발신자 사용자명 추가
    ) -> Tuple[Notification, int]:
        """멘션 알림을 생성합니다."""
        try:
            # 사용자명이 없는 경우 "사용자"로 대체
            display_name = f"@{sender_username}" if sender_username else "누군가"
            content = f"{display_name}님이 회원님을 멘션했습니다"
            
            notification = await self.repository.create(
                notification_type=NotificationType.MENTION,
                recipient_id=recipient_id,
                sender_id=sender_id,
                cve_id=cve_id,
                content=content,
                metadata={
                    "comment_content": comment_content
                }
            )
            
            # 온라인 사용자에게 실시간 전송
            await self._deliver_notification(notification)
            
            return notification, await self.get_unread_count(recipient_id)
        except Exception as e:
            logger.error(f"Error creating mention notification: {str(e)}")
            raise
            
    async def get_recent_notifications(self, user_id: str, limit: int = 5) -> List[Notification]:
        """사용자의 최근 알림을 조회합니다 (알림 드롭다운용)"""
        try:
            return await self.repository.get_recent_notifications(user_id, limit)
        except Exception as e:
            logger.error(f"Error fetching recent notifications: {str(e)}")
            return []
    
    async def get_notifications_by_type(self, user_id: str, notification_type: NotificationType, 
                                       skip: int = 0, limit: int = 20) -> List[Notification]:
        """특정 유형의 알림 목록을 조회합니다."""
        try:
            return await self.repository.get_notifications_by_type(
                user_id, notification_type, skip, limit)
        except Exception as e:
            logger.error(f"Error fetching notifications by type: {str(e)}")
            return []
    
    async def get_grouped_notifications(self, user_id: str, skip: int = 0, limit: int = 20) -> Dict[str, List[Notification]]:
        """유형별로 그룹화된 알림 목록을 반환합니다 (소셜 미디어 스타일)"""
        try:
            return await self.repository.get_grouped_notifications(user_id, skip, limit)
        except Exception as e:
            logger.error(f"Error fetching grouped notifications: {str(e)}")
            return {}