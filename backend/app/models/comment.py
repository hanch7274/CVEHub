from datetime import datetime
from typing import Optional, List
from beanie import Document, Link
from pydantic import BaseModel, Field
from .user import User

class Comment(Document):
    cve_id: str
    content: str
    username: str
    parent_id: Optional[str] = None
    mentions: List[str] = Field(default_factory=list)  # 멘션된 사용자의 이메일 목록
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    deleted: bool = False

    class Settings:
        name = "comments"

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
    parent_id: Optional[str] = None
    mentions: List[str] = []

class CommentUpdate(BaseModel):
    content: str
    mentions: List[str] = []
