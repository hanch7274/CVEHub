from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class Comment(BaseModel):
    id: str = Field(default_factory=lambda: datetime.now().strftime("%Y%m%d%H%M%S"))
    cve_id: str
    content: str
    author: str
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: Optional[datetime] = None


class CreateCommentRequest(BaseModel):
    content: str
    author: str


class UpdateCommentRequest(BaseModel):
    content: str
