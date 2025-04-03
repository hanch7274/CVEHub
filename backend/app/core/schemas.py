from typing import TypeVar, Generic, Optional, Any, Dict, List
from pydantic import BaseModel, Field
from datetime import datetime

T = TypeVar('T')

class PaginationParams(BaseModel):
    skip: int = Field(0, ge=0, description="건너뛸 항목 수")
    limit: int = Field(20, ge=1, le=100, description="반환할 항목 수")

class Metadata(BaseModel):
    total: Optional[int] = None
    page: Optional[int] = None
    pages: Optional[int] = None
    has_next: Optional[bool] = None
    has_prev: Optional[bool] = None

class APIResponse(BaseModel, Generic[T]):
    success: bool = True
    message: Optional[str] = None
    data: Optional[T] = None
    meta: Optional[Metadata] = None
    error: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=datetime.now)

    class Config:
        arbitrary_types_allowed = True

class ErrorResponse(BaseModel):
    success: bool = False
    message: str
    error_code: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=datetime.now)

class PaginatedResponse(APIResponse, Generic[T]):
    data: List[T]
    meta: Metadata 