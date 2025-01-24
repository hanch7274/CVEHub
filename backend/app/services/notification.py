from typing import List, Optional, Tuple
from datetime import datetime, timedelta
from ..repositories.notification import NotificationRepository
from ..models.notification import Notification
from ..core.websocket import manager

class NotificationService:
    """알림 관련 서비스"""
    
    def __init__(self):
        self.repository = NotificationRepository()
    
    async def get_user_notifications(
        self,
        username: str,
        skip: int = 0,
        limit: int = 10,
        unread_only: bool = False
    ) -> Tuple[List[Notification], int]:
        """사용자의 알림 목록을 조회합니다."""
        notifications = await self.repository.get_user_notifications(
            username,
            skip=skip,
            limit=limit,
            unread_only=unread_only
        )
        total = await self.repository.count({"username": username})
        if unread_only:
            total = await self.repository.count({
                "username": username,
                "is_read": False
            })
        return notifications, total
    
    async def create_notification(
        self,
        username: str,
        message: str,
        notification_type: str,
        related_id: Optional[str] = None
    ) -> Notification:
        """새로운 알림을 생성합니다."""
        notification = await self.repository.create_notification(
            username=username,
            message=message,
            notification_type=notification_type,
            related_id=related_id
        )
        
        # 웹소켓을 통해 새로운 알림 전송
        await manager.send_personal_message(
            {
                "type": "new_notification",
                "data": notification.dict()
            },
            username
        )
        
        return notification
    
    async def mark_as_read(self, notification_id: str, username: str) -> Optional[Notification]:
        """알림을 읽음 상태로 변경합니다."""
        notification = await self.repository.mark_as_read(notification_id)
        if notification:
            # 웹소켓을 통해 알림 상태 변경 전송
            await manager.send_personal_message(
                {
                    "type": "notification_read",
                    "data": {
                        "notification_id": notification_id,
                        "unread_count": await self.get_unread_count(username)
                    }
                },
                username
            )
        return notification
    
    async def mark_all_as_read(self, username: str) -> bool:
        """사용자의 모든 알림을 읽음 상태로 변경합니다."""
        success = await self.repository.mark_all_as_read(username)
        if success:
            # 웹소켓을 통해 알림 상태 변경 전송
            await manager.send_personal_message(
                {
                    "type": "all_notifications_read",
                    "data": {
                        "unread_count": 0
                    }
                },
                username
            )
        return success
    
    async def get_unread_count(self, username: str) -> int:
        """읽지 않은 알림 수를 반환합니다."""
        return await self.repository.get_unread_count(username)
    
    async def cleanup_old_notifications(self, days: int = 30) -> int:
        """오래된 알림을 삭제합니다."""
        cutoff_date = datetime.now() - timedelta(days=days)
        return await self.repository.delete_old_notifications(cutoff_date) 