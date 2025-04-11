"""
자동 생성된 Comment API 스키마 파일 - 직접 수정하지 마세요
생성 시간: 2025-04-11 18:22:52
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator
from app.common.models.base_models import BaseSchema

# ---------- 요청 모델 ----------

class CommentCreate(BaseSchema):
    """댓글 생성 요청 모델"""
    content: str = Field(..., description="댓글 내용")
    parent_id: Optional[str] = Field(default=None, description="부모 댓글 ID")
    mentions: List[str] = Field(default_factory=list, description="멘션된 사용자 목록")
    
    @validator('content')
    def validate_content(cls, v):
        if not v.strip():
            raise ValueError("댓글 내용은 비워둘 수 없습니다.")
        return v.strip()

class CommentUpdate(BaseSchema):
    """댓글 수정 요청 모델"""
    content: str = Field(..., description="댓글 내용")
    
    @validator('content')
    def validate_content(cls, v):
        if not v.strip():
            raise ValueError("댓글 내용은 비워둘 수 없습니다.")
        return v.strip()

# ---------- 응답 모델 ----------

class CommentResponse(BaseSchema):
    """댓글 응답 모델"""
    id: str = Field(..., description="댓글 ID")
    content: str = Field(..., description="댓글 내용")
    created_by: str = Field(..., description="작성자 이름")
    parent_id: Optional[str] = Field(default=None, description="부모 댓글 ID")
    depth: int = Field(default=0, description="댓글 깊이")
    is_deleted: bool = Field(default=False, description="삭제 여부")
    created_at: datetime = Field(..., description="생성 시간")
    last_modified_at: Optional[datetime] = Field(default=None, description="마지막 수정 시간")
    last_modified_by: Optional[str] = Field(default=None, description="마지막 수정자")
    mentions: List[str] = Field(default_factory=list, description="멘션된 사용자 목록")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=None).isoformat() if v else None
        }
        from_attributes = True

#페이지네이션 구현을 위해 남겨둠
class CommentListResponse(BaseSchema):
    """댓글 목록 응답 모델"""
    total: int = Field(..., description="총 댓글 수")
    items: List[CommentResponse] = Field(..., description="댓글 목록")
    page: int = Field(default=1, description="현재 페이지")
    limit: int = Field(default=10, description="페이지당 항목 수")

class CommentOperationResponse(BaseSchema):
    """댓글 작업 결과 응답 모델"""
    success: bool = Field(..., description="작업 성공 여부")
    message: str = Field(..., description="응답 메시지")
    comment_id: Optional[str] = Field(default=None, description="작업 대상 댓글 ID")
    data: Optional[Dict[str, Any]] = Field(default=None, description="추가 데이터")