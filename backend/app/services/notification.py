from typing import List, Optional, Tuple
from datetime import datetime, timedelta
from beanie import PydanticObjectId
from ..models.notification import Notification
from ..core.websocket import manager
from ..core.websocket import WSMessageType
import logging
import traceback
from zoneinfo import ZoneInfo

class NotificationService:
    """알림 관련 서비스"""
    
    def __init__(self):
        self.manager = manager  # WebSocket manager 인스턴스

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
        recipient_id: PydanticObjectId,
        sender_id: PydanticObjectId,
        sender_username: str,
        notification_type: str,
        cve_id: str,
        content: str,
        comment_id: Optional[PydanticObjectId] = None,
        comment_content: Optional[str] = None
    ) -> Tuple[Notification, int]:
        """알림을 생성하고 웹소켓으로 전송합니다."""
        try:
            # 알림 생성
            notification = Notification(
                recipient_id=recipient_id,
                sender_id=sender_id,
                sender_username=sender_username,
                type=notification_type,
                cve_id=cve_id,
                content=content,
                comment_id=comment_id,
                comment_content=comment_content,
                is_read=False,
                created_at=datetime.now(ZoneInfo("Asia/Seoul"))
            )
            await notification.insert()

            # 읽지 않은 알림 개수 조회
            unread_count = await self.get_unread_count(str(recipient_id))

            # 웹소켓 메시지 전송
            await self.manager.send_personal_message(
                {
                    "type": WSMessageType.NOTIFICATION,
                    "data": {
                        "notification": notification.dict(),
                        "unreadCount": unread_count
                    }
                },
                str(recipient_id)
            )

            return notification, unread_count

        except Exception as e:
            logging.error(f"Error creating notification: {str(e)}")
            logging.error(traceback.format_exc())
            raise
    
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
            await self.manager.send_personal_message(
                {
                    "type": WSMessageType.NOTIFICATION_READ,
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
            await self.manager.send_personal_message(
                {
                    "type": WSMessageType.ALL_NOTIFICATIONS_READ,
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