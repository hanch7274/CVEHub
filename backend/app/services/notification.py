from typing import List, Optional, Dict, Tuple
from datetime import datetime
from zoneinfo import ZoneInfo
from ..models.notification import Notification, NotificationType, NotificationStatus
from ..core.socketio_manager import socketio_manager, WSMessageType
import logging

logger = logging.getLogger(__name__)

class NotificationService:
    async def create_notification(
        self,
        notification_type: NotificationType,
        recipient_id: str,
        content: str,
        sender_id: Optional[str] = None,
        cve_id: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> Tuple[Notification, int]:
        """알림을 생성하고 저장합니다."""
        try:
            notification = Notification(
                type=notification_type,
                recipient_id=recipient_id,
                sender_id=sender_id,
                cve_id=cve_id,
                content=content,
                metadata=metadata or {},
                created_at=datetime.now(ZoneInfo("Asia/Seoul"))
            )

            # 데이터베이스에 저장
            await notification.insert()

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
            notification.delivered = True
            await notification.save()
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
            query = {"recipient_id": user_id}
            if status:
                query["status"] = status

            notifications = await Notification.find(query)\
                .sort(-Notification.created_at)\
                .skip(skip)\
                .limit(limit)\
                .to_list()
            
            return notifications
        except Exception as e:
            logger.error(f"Error fetching notifications: {str(e)}")
            return []

    async def mark_as_read(self, notification_id: str, user_id: str) -> bool:
        """알림을 읽음 처리합니다."""
        try:
            notification = await Notification.get(notification_id)
            if not notification or notification.recipient_id != user_id:
                return False

            notification.status = NotificationStatus.READ
            notification.read_at = datetime.now(ZoneInfo("Asia/Seoul"))
            await notification.save()
            return True
        except Exception as e:
            logger.error(f"Error marking notification as read: {str(e)}")
            return False

    async def get_unread_count(self, user_id: str) -> int:
        """읽지 않은 알림 개수를 조회합니다."""
        try:
            return await Notification.find({
                "recipient_id": user_id,
                "status": NotificationStatus.UNREAD
            }).count()
        except Exception as e:
            logger.error(f"Error counting unread notifications: {str(e)}")
            return 0

    async def mark_all_as_read(self, user_id: str) -> bool:
        """모든 알림을 읽음 처리합니다."""
        try:
            notifications = await Notification.find({
                "recipient_id": user_id,
                "status": NotificationStatus.UNREAD
            }).to_list()

            for notification in notifications:
                notification.status = NotificationStatus.READ
                notification.read_at = datetime.now(ZoneInfo("Asia/Seoul"))
                await notification.save()

            return True
        except Exception as e:
            logger.error(f"Error marking all notifications as read: {str(e)}")
            return False

    async def get_total_count(self, user_id: str) -> int:
        """전체 알림 개수를 조회합니다."""
        try:
            return await Notification.find({
                "recipient_id": user_id
            }).count()
        except Exception as e:
            logger.error(f"Error counting total notifications: {str(e)}")
            return 0

    async def create_mention_notification(
        self,
        recipient_id: str,
        sender_id: str,
        cve_id: str,
        comment_content: str,
    ) -> Tuple[Notification, int]:
        """멘션 알림을 생성합니다."""
        try:
            notification = Notification(
                type=NotificationType.MENTION,
                recipient_id=recipient_id,
                sender_id=sender_id,
                cve_id=cve_id,
                content=f"@{sender_username}님이 회원님을 멘션했습니다",
                metadata={
                    "comment_content": comment_content
                }
            )
            await notification.insert()
            
            # 온라인 사용자에게 실시간 전송
            await self._deliver_notification(notification)
            
            return notification, await self.get_unread_count(recipient_id)
        except Exception as e:
            logger.error(f"Error creating mention notification: {str(e)}")
            raise 