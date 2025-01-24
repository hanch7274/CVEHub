from typing import List, Optional
from datetime import datetime
from beanie import PydanticObjectId
from .base import BaseRepository
from ..models.notification import Notification, NotificationCreate

class NotificationRepository(BaseRepository[Notification, NotificationCreate, NotificationCreate]):
    """알림 저장소"""
    
    def __init__(self):
        super().__init__(Notification)
    
    async def get_user_notifications(
        self,
        username: str,
        skip: int = 0,
        limit: int = 10,
        unread_only: bool = False
    ) -> List[Notification]:
        """사용자의 알림 목록을 조회합니다."""
        query = {"username": username}
        if unread_only:
            query["is_read"] = False
        return await self.model.find(query).sort("-created_at").skip(skip).limit(limit).to_list()
    
    async def create_notification(
        self,
        username: str,
        message: str,
        notification_type: str,
        related_id: Optional[str] = None
    ) -> Notification:
        """새로운 알림을 생성합니다."""
        notification = Notification(
            username=username,
            message=message,
            notification_type=notification_type,
            related_id=related_id
        )
        await notification.insert()
        return notification
    
    async def mark_as_read(self, notification_id: str) -> Optional[Notification]:
        """알림을 읽음 상태로 변경합니다."""
        notification = await self.model.get(notification_id)
        if notification:
            notification.is_read = True
            notification.read_at = datetime.now()
            await notification.save()
        return notification
    
    async def mark_all_as_read(self, username: str) -> bool:
        """사용자의 모든 알림을 읽음 상태로 변경합니다."""
        result = await self.model.update_many(
            {"username": username, "is_read": False},
            {"$set": {"is_read": True, "read_at": datetime.now()}}
        )
        return result.modified_count > 0
    
    async def get_unread_count(self, username: str) -> int:
        """읽지 않은 알림 수를 반환합니다."""
        return await self.model.find({"username": username, "is_read": False}).count()
    
    async def delete_old_notifications(self, cutoff_date: datetime) -> int:
        """오래된 알림을 삭제합니다."""
        result = await self.model.delete_many({"created_at": {"$lt": cutoff_date}})
        return result.deleted_count 