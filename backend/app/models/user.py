from typing import Optional
from pydantic import BaseModel, EmailStr
from beanie import Document
from datetime import datetime

class UserBase(BaseModel):
    """사용자 기본 모델"""
    username: str
    email: EmailStr
    is_active: bool = True

class UserCreate(UserBase):
    """사용자 생성 모델"""
    password: str

class UserInDB(UserBase):
    """데이터베이스 사용자 모델"""
    hashed_password: str

class UserResponse(UserBase):
    """사용자 응답 모델"""
    id: Optional[str] = None
    is_admin: bool = False

class Token(BaseModel):
    """토큰 모델"""
    access_token: str
    token_type: str
    user: UserResponse

    class Config:
        json_schema_extra = {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "user": {
                    "id": "123",
                    "username": "johndoe",
                    "email": "johndoe@example.com",
                    "is_admin": False,
                    "is_active": True
                }
            }
        }

class TokenData(BaseModel):
    """토큰 데이터 모델"""
    email: Optional[str] = None

class UserUpdate(BaseModel):
    """사용자 정보 수정 모델"""
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None

class User(Document):
    """사용자 문서 모델"""
    username: str
    email: EmailStr
    hashed_password: str
    is_active: bool = True
    created_at: datetime = datetime.utcnow()
    updated_at: datetime = datetime.utcnow()
    is_admin: bool = False
    
    class Settings:
        name = "users"
        indexes = [
            "username",
            "email",
        ]

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

    @property
    def is_authenticated(self) -> bool:
        """사용자 인증 여부"""
        return True if self.is_active else False

    def to_dict(self):
        """User 객체를 dictionary로 변환"""
        return {
            "username": self.username,
            "email": self.email,
            "is_admin": self.is_admin
        }
