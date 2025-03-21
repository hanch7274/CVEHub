from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, validator
from beanie import PydanticObjectId

class CommentCreate(BaseModel):
    """댓글 생성 요청 모델"""
    content: str = Field(..., description="댓글 내용")
    parent_id: Optional[str] = Field(None, description="부모 댓글 ID (답글인 경우)")
    mentions: List[str] = Field(default=[], description="멘션된 사용자 목록")
    is_deleted: bool = Field(default=False, description="삭제 여부")

    @validator('content')
    def validate_content(cls, v):
        if not v.strip():
            raise ValueError("댓글 내용은 비워둘 수 없습니다.")
        return v.strip()

    @validator('mentions')
    def validate_mentions(cls, v):
        # 중복 제거 및 유효성 검사
        return list(set(filter(None, v)))

class CommentUpdate(BaseModel):
    """댓글 수정 요청 모델"""
    content: str = Field(..., description="수정할 댓글 내용")

class CommentResponse(BaseModel):
    """댓글 응답 모델"""
    id: PydanticObjectId = Field(..., description="댓글 ID")
    cve_id: str = Field(..., description="CVE ID")
    content: str = Field(..., description="댓글 내용")
    username: str = Field(..., description="작성자 사용자명")
    user_id: PydanticObjectId = Field(..., description="작성자 ID")
    parent_id: Optional[PydanticObjectId] = Field(None, description="부모 댓글 ID")
    created_at: datetime = Field(..., description="생성 시간")
    last_modified_at: Optional[datetime] = Field(None, description="수정 시간")
    is_deleted: bool = Field(False, description="삭제 여부")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            PydanticObjectId: lambda v: str(v)
        }