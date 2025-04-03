"""
애플리케이션 전체에서 공유하는 기본 모델 정의
"""
from typing import Optional, List, Dict, Any, TypeVar, Generic
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from zoneinfo import ZoneInfo
from beanie import Document, PydanticObjectId

# 타입 변수 정의
T = TypeVar('T')

class BaseSchema(BaseModel):
    """모든 스키마의 기본이 되는 모델"""
    
    class Config:
        """Pydantic 설정"""
        from_attributes = True


class TimestampMixin(BaseModel):
    """생성 및 수정 시간 필드를 포함하는 믹스인"""
    created_at: Optional[datetime] = None
    last_modified_at: Optional[datetime] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=ZoneInfo("UTC")).isoformat().replace('+00:00', 'Z') if v else None
        }


class UserBaseMixin(BaseModel):
    """사용자 기본 정보를 포함하는 믹스인"""
    username: str
    email: EmailStr
    is_active: bool = True
    is_admin: bool = False


class BaseDocument(Document):
    """모든 Document의 기본이 되는 모델"""
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    last_modified_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=ZoneInfo("UTC")).isoformat().replace('+00:00', 'Z') if v else None,
            PydanticObjectId: str
        }


class PaginatedResponse(BaseSchema, Generic[T]):
    """페이지네이션된 응답의 표준 형식"""
    items: List[T]
    total: int
    page: int = 1
    limit: int = 10


class APIResponse(BaseSchema, Generic[T]):
    """표준 API 응답 형식"""
    success: bool = True
    message: Optional[str] = None
    data: Optional[T] = None


class ChangeLogBase(BaseSchema):
    """변경 로그 기본 클래스"""
    field: str
    action: str
    user: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None