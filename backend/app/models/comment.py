from datetime import datetime
from typing import Optional, List
from beanie import Document
from pydantic import BaseModel, Field
from zoneinfo import ZoneInfo


class Comment(Document):
    # YYYYMMDDHHmmSSfff 형식 (년월일시분초밀리초)
    id: str = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y%m%d%H%M%S%f")[:17])
    cve_id: str
    content: str
    author: str
    parent_id: Optional[str] = None
    depth: int = 0
    likes: List[str] = []
    is_deleted: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")))
    updated_at: Optional[datetime] = None

    class Settings:
        name = "comments"
        indexes = [
            [("id", 1)],  # id 필드에 대한 인덱스 추가
            "cve_id",
            "parent_id",
            "author",
            "created_at"
        ]


class CreateCommentRequest(BaseModel):
    content: str
    parent_id: Optional[str] = None


class UpdateCommentRequest(BaseModel):
    content: str
