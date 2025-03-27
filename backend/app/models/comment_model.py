from datetime import datetime
from typing import Optional, List
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from .user_model import User
from zoneinfo import ZoneInfo

class Comment(Document):
    id: Optional[PydanticObjectId] = Field(default_factory=PydanticObjectId, alias="_id")
    cve_id: str
    content: str
    username: str
    parent_id: Optional[str] = None  # parent_id를 문자열로 처리
    depth: int = 0
    is_deleted: bool = False
    created_at: datetime
    last_modified_at: Optional[datetime] = None
    mentions: List[str] = []

    class Config:
        populate_by_name = True
        json_encoders = {
            PydanticObjectId: str,
            datetime: lambda dt: dt.replace(tzinfo=ZoneInfo("UTC")).isoformat().replace('+00:00', 'Z') if dt else None
        }

    @property
    def id(self) -> str:
        return str(self.id)

    async def notify_mentioned_users(self):
        """멘션된 사용자들에게 알림을 보냅니다."""
        from .notification import Notification

        for email in self.mentions:
            user = await User.find_one({"email": email})
            if user:
                notification = Notification(
                    user_id=str(user.id),
                    type="mention",
                    content=f"{self.username}님이 댓글에서 회원님을 멘션했습니다.",
                    reference_id=str(self.id),
                    reference_type="comment"
                )
                await notification.create()

class CommentCreate(BaseModel):
    content: str
    parent_id: Optional[str] = None  # parent_id를 문자열로 처리
    mentions: List[str] = []

class CommentUpdate(BaseModel):
    content: str
    mentions: List[str] = []
