from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any
from beanie import Document
from pydantic import BaseModel, Field
import pytz
from zoneinfo import ZoneInfo

KST = pytz.timezone('Asia/Seoul')

class NotificationType(str, Enum):
    MENTION = "mention"          # 멘션 알림
    CVE_UPDATE = "cve_update"    # CVE 업데이트 알림
    SYSTEM = "system"            # 시스템 알림

class NotificationStatus(str, Enum):
    UNREAD = "unread"
    READ = "read"

class Notification(Document):
    """알림 모델"""
    type: NotificationType
    recipient_id: str            # 수신자 ID
    sender_id: Optional[str]     # 발신자 ID
    cve_id: Optional[str]        # 관련 CVE ID
    content: str                 # 알림 내용
    metadata: Dict[str, Any] = Field(default_factory=dict)  # 멘션된 댓글 내용 등
    status: NotificationStatus = NotificationStatus.UNREAD
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    read_at: Optional[datetime] = None
    delivered: bool = False
    
    class Settings:
        name = "notifications"
        indexes = [
            "recipient_id",
            "type",
            "status",
            "created_at"
        ]

    class Config:
        json_encoders = {
            datetime: lambda dt: dt.isoformat()
        }

    def dict(self, *args, **kwargs):
        """JSON 직렬화를 위한 딕셔너리 반환"""
        d = super().dict(*args, **kwargs)
        d['id'] = str(self.id)  # MongoDB의 _id를 id로 변환
        
        # datetime 필드들을 ISO 형식 문자열로 변환
        if self.created_at:
            d['created_at'] = self.created_at.isoformat()
        if self.read_at:
            d['read_at'] = self.read_at.isoformat()
            
        return d

class NotificationCreate(BaseModel):
    """알림 생성을 위한 입력 모델"""
    recipient_id: str
    sender_id: Optional[str] = None
    cve_id: Optional[str] = None
    content: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
