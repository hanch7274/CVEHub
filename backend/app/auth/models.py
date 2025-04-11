"""
자동 생성된 Auth Beanie 모델 파일 - 직접 수정하지 마세요
생성 시간: 2025-04-11 18:22:52
"""
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from zoneinfo import ZoneInfo
from beanie import Document, PydanticObjectId
from pydantic import Field, BaseModel, EmailStr, validator
from bson import ObjectId
from app.common.models.base_models import BaseSchema, TimestampMixin, UserBaseMixin, BaseDocument

# ---------- 유틸리티 함수 ----------

def serialize_datetime(dt: datetime) -> str:
    """날짜를 ISO 8601 형식의 문자열로 직렬화"""
    return dt.replace(tzinfo=ZoneInfo("UTC")).isoformat().replace('+00:00', 'Z') if dt else None

# ---------- 기본 요청/응답 스키마 모델 ----------

class UserBase(UserBaseMixin, BaseSchema):
    """UserBase 모델 - 기본 사용자 정보"""
    username: str = Field(..., description="사용자 이름")
    email: EmailStr = Field(..., description="이메일")
    is_active: bool = Field(True, description="활성화 여부")
    is_admin: bool = Field(False, description="관리자 여부")
    class Config:
        json_schema_extra = {
            "example": {'username': 'johndoe', 'email': 'johndoe@example.com', 'is_active': True, 'is_admin': False}
        }

class UserCreate(UserBase):
    """UserCreate 모델 - 요청 모델"""
    password: str = Field(..., description="비밀번호")
    class Config:
        json_schema_extra = {
            "example": {'username': 'johndoe', 'email': 'johndoe@example.com', 'password': 'password123', 'is_active': True, 'is_admin': False}
        }

class UserUpdate(BaseSchema):
    """UserUpdate 모델 - 요청 모델"""
    email: Optional[EmailStr] = Field(None, description="이메일")
    full_name: Optional[str] = Field(None, description="전체 이름")
    is_active: Optional[bool] = Field(None, description="활성화 여부")
    is_admin: Optional[bool] = Field(None, description="관리자 여부")
    password: Optional[str] = Field(None, description="비밀번호")
    class Config:
        json_schema_extra = {
            "example": {'email': 'johndoe-updated@example.com', 'full_name': 'John Doe Updated', 'is_active': True, 'is_admin': False, 'password': 'newpassword123'}
        }

class UserResponse(UserBase, TimestampMixin):
    """UserResponse 모델 - 응답 모델"""
    id: str = Field(..., description="사용자 ID")
    full_name: Optional[str] = Field(None, description="전체 이름")
    class Config:
        json_schema_extra = {
            "example": {'id': '507f1f77bcf86cd799439011', 'username': 'johndoe', 'email': 'johndoe@example.com', 'full_name': 'John Doe', 'is_active': True, 'is_admin': False, 'created_at': '2023-01-01T00:00:00Z', 'last_modified_at': '2023-01-01T00:00:00Z'}
        }

class UserInDB(UserBase):
    """UserInDB 모델 - 내부용 모델"""
    id: str = Field(..., description="사용자 ID")
    hashed_password: str = Field(..., description="해시된 비밀번호")
    full_name: Optional[str] = Field(None, description="전체 이름")
    created_at: datetime = Field(..., description="생성 시간")
    last_modified_at: datetime = Field(..., description="마지막 수정 시간")

class UserSearchResponse(BaseSchema):
    """UserSearchResponse 모델 - 응답 모델"""
    username: str = Field(..., description="사용자 이름")
    displayName: str = Field(..., description="표시 이름")
    class Config:
        json_schema_extra = {
            "example": {'username': 'johndoe', 'displayName': 'John Doe'}
        }

# ---------- 토큰 관련 모델 ----------

class TokenData(BaseSchema):
    """TokenData 모델 - 내부용 모델"""
    sub: Optional[str] = Field(None, description="토큰 주체 (사용자 ID)")
    email: Optional[str] = Field(None, description="사용자 이메일")
    token_type: Optional[str] = Field(None, description="토큰 타입")
    exp: Optional[int] = Field(None, description="만료 시간")

class Token(BaseSchema):
    """Token 모델 - 응답 모델"""
    access_token: str = Field(..., description="액세스 토큰")
    refresh_token: str = Field(..., description="리프레시 토큰")
    token_type: str = Field(..., description="토큰 타입")
    user: UserResponse = Field(..., description="사용자 정보")
    class Config:
        json_schema_extra = {
            "example": {'access_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', 'refresh_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', 'token_type': 'bearer', 'user': {'id': '507f1f77bcf86cd799439011', 'username': 'johndoe', 'email': 'johndoe@example.com', 'is_active': True, 'is_admin': False}}
        }

class RefreshTokenRequest(BaseSchema):
    """RefreshTokenRequest 모델 - 요청 모델"""
    refresh_token: str = Field(..., description="리프레시 토큰")
    class Config:
        json_schema_extra = {
            "example": {'refresh_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'}
        }

class LoginRequest(BaseSchema):
    """LoginRequest 모델 - 요청 모델"""
    username: str = Field(..., description="사용자 이름 또는 이메일")
    password: str = Field(..., description="비밀번호")
    class Config:
        json_schema_extra = {
            "example": {'username': 'johndoe@example.com', 'password': 'password123'}
        }

class LogoutRequest(BaseSchema):
    """LogoutRequest 모델 - 요청 모델"""
    refresh_token: str = Field(..., description="리프레시 토큰")
    class Config:
        json_schema_extra = {
            "example": {'refresh_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'}
        }

# ---------- 문서 모델 (데이터베이스 모델) ----------

class User(BaseDocument):
    """User 문서 모델"""
    username: str = Field(..., description="사용자 이름")
    email: EmailStr = Field(..., description="이메일")
    hashed_password: str = Field(..., description="해시된 비밀번호")
    full_name: Optional[str] = Field(None, description="전체 이름")
    is_active: bool = Field(True, description="활성화 여부")
    is_admin: bool = Field(False, description="관리자 여부")
    class Settings:
        name = "users"
        indexes = [
            "username",            "email"        ]

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
    """RefreshToken 문서 모델"""
    user_id: PydanticObjectId = Field(..., description="사용자 ID")
    token: str = Field(..., description="토큰")
    expires_at: datetime = Field(..., description="만료 시간")
    is_revoked: bool = Field(False, description="취소 여부")
    class Settings:
        name = "refresh_tokens"
        indexes = [
            "user_id",            "token",            "expires_at"        ]

