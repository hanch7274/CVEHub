from datetime import datetime
from typing import Optional
from beanie import Document, PydanticObjectId, Indexed
from pydantic import BaseModel, Field
import pytz
import logging
import traceback
from zoneinfo import ZoneInfo

KST = pytz.timezone('Asia/Seoul')

class Notification(Document):
    """알림 모델"""
    username: str
    message: str
    notification_type: str  # 'comment', 'mention', 'cve_update' 등
    related_id: Optional[str] = None  # 관련 CVE ID 또는 댓글 ID
    is_read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")))
    read_at: Optional[datetime] = None
    
    class Settings:
        name = "notifications"
        indexes = [
            "username",
            "notification_type",
            "is_read",
            "created_at"
        ]
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }

    def dict(self, *args, **kwargs):
        """JSON 직렬화를 위한 딕셔너리 반환"""
        d = super().dict(*args, **kwargs)
        d['id'] = str(self.id)  # MongoDB의 _id를 id로 변환
        
        # datetime 필드들을 ISO 형식 문자열로 변환
        if self.created_at:
            d['created_at'] = self.created_at.isoformat()
            
        # updated_at 필드는 제거 (사용하지 않음)
        if 'updated_at' in d:
            del d['updated_at']
            
        return d

    @classmethod
    async def create_notification(cls, **kwargs):
        """알림을 생성하고 저장합니다. 알림과 읽지 않은 알림 개수를 반환합니다."""
        try:
            # 필수 필드 검증
            required_fields = ["recipient_id", "sender_id", "cve_id", "comment_id", "content"]
            missing_fields = [field for field in required_fields if field not in kwargs]
            if missing_fields:
                error_msg = f"Missing required fields: {', '.join(missing_fields)}"
                logging.error(error_msg)
                raise ValueError(error_msg)
            
            # 알림 객체 생성
            notification = cls(**kwargs)
            logging.info(f"Creating notification with data: recipient_id={kwargs['recipient_id']}, "
                        f"sender_id={kwargs['sender_id']}, cve_id={kwargs['cve_id']}, "
                        f"comment_id={kwargs['comment_id']}, content={kwargs['content']}")
            
            # 데이터베이스에 저장
            await notification.insert()
            logging.info(f"Successfully created notification with ID: {notification.id}")
            
            # 저장된 알림 확인
            saved_notification = await cls.get(notification.id)
            if not saved_notification:
                error_msg = f"Failed to retrieve saved notification with ID: {notification.id}"
                logging.error(error_msg)
                raise ValueError(error_msg)

            # 읽지 않은 알림 개수 조회
            unread_count = await cls.find(
                {"recipient_id": kwargs["recipient_id"], "is_read": False}
            ).count()
            
            return saved_notification, unread_count
            
        except ValueError as ve:
            logging.error(f"Validation error while creating notification: {str(ve)}")
            raise
        except Exception as e:
            error_msg = f"Unexpected error while creating notification: {str(e)}\n{traceback.format_exc()}"
            logging.error(error_msg)
            raise RuntimeError(error_msg) from e


class NotificationCreate(BaseModel):
    """알림 생성을 위한 입력 모델"""
    recipient_id: PydanticObjectId
    sender_id: PydanticObjectId
    sender_username: Optional[str] = None
    cve_id: str
    comment_id: PydanticObjectId
    comment_content: Optional[str] = None
    content: str
