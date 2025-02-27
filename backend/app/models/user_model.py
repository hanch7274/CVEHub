"""사용자 모델 정의"""
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime

class UserModel(BaseModel):
    """사용자 모델"""
    id: Optional[str] = None
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    is_active: bool = True
    is_admin: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        """Pydantic 설정"""
        from_attributes = True 