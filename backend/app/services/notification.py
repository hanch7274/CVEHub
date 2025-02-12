from typing import List, Optional, Tuple
from datetime import datetime, timedelta
from beanie import PydanticObjectId
from ..models.notification import Notification
from ..core.websocket import manager

class NotificationService:
    """알림 관련 서비스"""
    
    async def get_user_notifications(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 10,
        is_read: Optional[bool] = None
    ) -> Tuple[List[Notification], int]:
        """사용자의 알림 목록을 조회합니다."""
        # 쿼리 조건 생성
        query = {"recipient_id": PydanticObjectId(user_id)}
        if is_read is not None:
            query["is_read"] = is_read

        # 알림 목록 조회
        notifications = await Notification.find(query)\
            .sort("-created_at")\
            .skip(skip)\
            .limit(limit)\
            .to_list()
            
        # 전체 개수 조회
        total = await Notification.find(query).count()
        
        return notifications, total
    
    async def create_notification(
        self,
        recipient_id: str,
        sender_id: str,
        sender_username: str,
        cve_id: str,
        comment_id: str,
        content: str,
        comment_content: Optional[str] = None
    ) -> Notification:
        """새로운 알림을 생성합니다."""
        notification = Notification(
            recipient_id=PydanticObjectId(recipient_id),
            sender_id=PydanticObjectId(sender_id),
            sender_username=sender_username,
            cve_id=cve_id,
            comment_id=PydanticObjectId(comment_id),
            content=content,
            comment_content=comment_content,
            is_read=False,
            created_at=datetime.now()
        )
        
        await notification.insert()
        
        # 웹소켓을 통해 새로운 알림 전송
        await manager.send_personal_message(
            {
                "type": "notification",
                "data": {
                    "notification": notification.dict(),
                    "unreadCount": await self.get_unread_count(recipient_id)
                }
            },
            recipient_id
        )
        
        return notification
    
    async def mark_as_read(
        self,
        notification_id: PydanticObjectId,
        user_id: str
    ) -> Optional[Notification]:
        """알림을 읽음 상태로 변경합니다."""
        notification = await Notification.get(notification_id)
        if notification and str(notification.recipient_id) == user_id:
            notification.is_read = True
            notification.read_at = datetime.now()
            await notification.save()
            
            # 웹소켓을 통해 알림 상태 변경 전송
            await manager.send_personal_message(
                {
                    "type": "notification_read",
                    "data": {
                        "notification_id": str(notification_id),
                        "unreadCount": await self.get_unread_count(user_id)
                    }
                },
                user_id
            )
            
        return notification
    
    async def mark_all_as_read(self, user_id: str) -> bool:
        """사용자의 모든 알림을 읽음 상태로 변경합니다."""
        result = await Notification.find(
            {
                "recipient_id": PydanticObjectId(user_id),
                "is_read": False
            }
        ).update({
            "$set": {
                "is_read": True,
                "read_at": datetime.now()
            }
        })
        
        if result.modified_count > 0:
            # 웹소켓을 통해 알림 상태 변경 전송
            await manager.send_personal_message(
                {
                    "type": "all_notifications_read",
                    "data": {
                        "unreadCount": 0
                    }
                },
                user_id
            )
            
        return result.modified_count > 0
    
    async def get_unread_count(self, user_id: str) -> int:
        """읽지 않은 알림 수를 반환합니다."""
        return await Notification.find(
            {
                "recipient_id": PydanticObjectId(user_id),
                "is_read": False
            }
        ).count()
    
    async def cleanup_old_notifications(self, days: int = 30) -> int:
        """오래된 알림을 삭제합니다."""
        cutoff_date = datetime.now() - timedelta(days=days)
        result = await Notification.find(
            {"created_at": {"$lt": cutoff_date}}
        ).delete()
        return result.deleted_count 