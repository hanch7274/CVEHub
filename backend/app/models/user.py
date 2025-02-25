from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from beanie import Document, PydanticObjectId
from datetime import datetime

class UserBase(BaseModel):
    """사용자 기본 모델"""
    username: str
    email: EmailStr
    is_active: bool = True
    is_admin: bool = False

class UserCreate(UserBase):
    """사용자 생성 모델"""
    password: str

class UserInDB(UserBase):
    """데이터베이스 사용자 모델"""
    hashed_password: str

class UserResponse(UserBase):
    """사용자 응답 모델"""
    id: str
    is_admin: bool = False

    class Config:
        from_attributes = True

class Token(BaseModel):
    """토큰 모델"""
    access_token: str
    refresh_token: str
    token_type: str
    user: UserResponse

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "user": {
                    "username": "johndoe",
                    "email": "johndoe@example.com",
                    "is_admin": False
                }
            }
        }

class TokenData(BaseModel):
    """토큰 데이터 모델"""
    email: Optional[str] = None
    token_type: Optional[str] = None

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
    created_at: datetime = Field(default_factory=lambda: datetime.now())
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

class RefreshToken(Document):
    user_id: PydanticObjectId
    token: str
    expires_at: datetime
    is_revoked: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now())

    class Settings:
        name = "refresh_tokens"
        indexes = [
            "user_id",
            "token",
            "expires_at"
        ]
