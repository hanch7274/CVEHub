"""
사용자 인증 관련 모델 정의
"""
from typing import Optional, Dict, Any
from pydantic import Field, EmailStr
from beanie import PydanticObjectId
from datetime import datetime
from zoneinfo import ZoneInfo

from app.common.models.base_models import BaseSchema, TimestampMixin, UserBaseMixin, BaseDocument


# Pydantic 모델: API 요청/응답용 스키마
class UserBase(UserBaseMixin, BaseSchema):
    """사용자 기본 모델"""
    pass


class UserCreate(UserBase):
    """사용자 생성 요청 모델"""
    password: str

    class Config:
        json_schema_extra = {
            "example": {
                "username": "johndoe",
                "email": "johndoe@example.com",
                "password": "password123",
                "is_active": True,
                "is_admin": False
            }
        }


class UserUpdate(BaseSchema):
    """사용자 정보 수정 요청 모델"""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None
    password: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "email": "johndoe-updated@example.com",
                "full_name": "John Doe Updated",
                "is_active": True,
                "is_admin": False,
                "password": "newpassword123"
            }
        }


class UserResponse(UserBase, TimestampMixin):
    """사용자 정보 응답 모델"""
    id: str
    full_name: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "id": "507f1f77bcf86cd799439011",
                "username": "johndoe",
                "email": "johndoe@example.com",
                "full_name": "John Doe",
                "is_active": True,
                "is_admin": False,
                "created_at": "2023-01-01T00:00:00Z",
                "last_modified_at": "2023-01-01T00:00:00Z"
            }
        }


class UserInDB(UserBase):
    """데이터베이스 사용자 모델 (내부용)"""
    id: str
    hashed_password: str
    full_name: Optional[str] = None
    created_at: datetime
    last_modified_at: datetime


class UserSearchResponse(BaseSchema):
    """사용자 검색 응답 모델"""
    username: str
    displayName: str

    class Config:
        json_schema_extra = {
            "example": {
                "username": "johndoe",
                "displayName": "John Doe"
            }
        }


# 인증 관련 모델
class TokenData(BaseSchema):
    """토큰 데이터 모델"""
    sub: Optional[str] = None
    email: Optional[str] = None
    token_type: Optional[str] = None
    exp: Optional[int] = None


class Token(BaseSchema):
    """토큰 응답 모델"""
    access_token: str
    refresh_token: str
    token_type: str
    user: UserResponse

    class Config:
        json_schema_extra = {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "user": {
                    "id": "507f1f77bcf86cd799439011",
                    "username": "johndoe",
                    "email": "johndoe@example.com",
                    "is_active": True,
                    "is_admin": False
                }
            }
        }


class RefreshTokenRequest(BaseSchema):
    """리프레시 토큰 요청 모델"""
    refresh_token: str

    class Config:
        json_schema_extra = {
            "example": {
                "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            }
        }


class LoginRequest(BaseSchema):
    """로그인 요청 모델"""
    username: str
    password: str

    class Config:
        json_schema_extra = {
            "example": {
                "username": "johndoe@example.com",
                "password": "password123"
            }
        }


class LogoutRequest(BaseSchema):
    """로그아웃 요청 모델"""
    refresh_token: str

    class Config:
        json_schema_extra = {
            "example": {
                "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            }
        }


# Beanie Document 모델: 데이터베이스용 모델
class User(BaseDocument):
    """사용자 문서 모델"""
    username: str
    email: EmailStr
    hashed_password: str
    full_name: Optional[str] = None
    is_active: bool = True
    is_admin: bool = False
    
    class Settings:
        name = "users"
        indexes = [
            "username",
            "email",
        ]

    @property
    def is_authenticated(self) -> bool:
        """사용자 인증 여부"""
        return True if self.is_active else False

    def to_dict(self) -> Dict[str, Any]:
        """User 객체를 dictionary로 변환"""
        return {
            "id": str(self.id),
            "username": self.username,
            "email": self.email,
            "full_name": self.full_name,
            "is_active": self.is_active,
            "is_admin": self.is_admin,
            "created_at": self.created_at,
            "last_modified_at": self.last_modified_at
        }


class RefreshToken(BaseDocument):
    """리프레시 토큰 문서 모델"""
    user_id: PydanticObjectId
    token: str
    expires_at: datetime
    is_revoked: bool = False
    
    class Settings:
        name = "refresh_tokens"
        indexes = [
            "user_id",
            "token",
            "expires_at"
        ]