from datetime import datetime
from typing import Optional
from beanie import Document, PydanticObjectId, Indexed
from pydantic import BaseModel, Field
import pytz
import logging
import traceback

KST = pytz.timezone('Asia/Seoul')

class Notification(Document):
    recipient_id: Indexed(PydanticObjectId)  # 알림을 받을 사용자 ID
    sender_id: PydanticObjectId     # 알림을 발생시킨 사용자 ID
    sender_username: Optional[str] = None  # 알림을 발생시킨 사용자 이름
    cve_id: str                     # 관련 CVE ID
    comment_id: PydanticObjectId    # 관련 댓글 ID
    comment_content: Optional[str] = None  # 댓글 내용
    content: str                    # 알림 내용
    is_read: bool = Field(default=False)  # 읽음 여부
    created_at: Indexed(datetime) = Field(default_factory=lambda: datetime.now(KST))  # 생성 시간

    class Settings:
        name = "notifications"
        indexes = [
            [("recipient_id", 1)],
            [("created_at", -1)]
        ]
        use_state_management = True
        use_revision = True
        validate_on_save = True

    class Config:
        json_encoders = {
            PydanticObjectId: str,
            datetime: lambda dt: dt.strftime('%Y-%m-%d %H:%M:%S')
        }
        allow_population_by_field_name = True
        
    def dict(self, *args, **kwargs):
        """JSON 직렬화를 위한 딕셔너리 반환"""
        d = super().dict(*args, **kwargs)
        d['id'] = str(self.id)  # MongoDB의 _id를 id로 변환
        return d

    @classmethod
    async def create_notification(cls, **kwargs):
        """알림을 생성하고 저장합니다."""
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
                
            return saved_notification
            
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
