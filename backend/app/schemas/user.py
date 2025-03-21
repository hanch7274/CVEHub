"""
사용자 관련 스키마 정의
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime

# 사용자 기본 정보 스키마
class UserBase(BaseModel):
    """사용자 기본 정보"""
    username: str
    email: EmailStr
    is_active: bool = True
    is_admin: bool = False

class UserCreate(UserBase):
    """사용자 생성 요청 스키마"""
    password: str

class UserUpdate(BaseModel):
    """사용자 정보 수정 요청 스키마"""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None
    password: Optional[str] = None

class UserResponse(UserBase):
    """사용자 정보 응답 스키마"""
    id: str
    created_at: Optional[datetime] = None
    last_modified_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "507f1f77bcf86cd799439011",
                "username": "johndoe",
                "email": "johndoe@example.com",
                "is_active": True,
                "is_admin": False,
                "created_at": "2023-01-01T00:00:00Z",
                "last_modified_at": "2023-01-01T00:00:00Z"
            }
        }

class UserInDB(UserBase):
    """데이터베이스 사용자 정보 스키마 (내부용)"""
    id: str
    hashed_password: str
    created_at: datetime
    last_modified_at: datetime

    class Config:
        from_attributes = True

# 인증 관련 스키마
class TokenData(BaseModel):
    """토큰 데이터 스키마"""
    sub: Optional[str] = None
    email: Optional[str] = None
    token_type: Optional[str] = None
    exp: Optional[int] = None

class Token(BaseModel):
    """토큰 응답 스키마"""
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
                    "id": "507f1f77bcf86cd799439011",
                    "username": "johndoe",
                    "email": "johndoe@example.com",
                    "is_active": True,
                    "is_admin": False
                }
            }
        }

class RefreshTokenRequest(BaseModel):
    """리프레시 토큰 요청 스키마"""
    refresh_token: str

    class Config:
        json_schema_extra = {
            "example": {
                "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            }
        }

class LoginRequest(BaseModel):
    """로그인 요청 스키마"""
    username: str
    password: str

    class Config:
        json_schema_extra = {
            "example": {
                "username": "johndoe@example.com",
                "password": "password123"
            }
        }

class LogoutRequest(BaseModel):
    """로그아웃 요청 스키마"""
    refresh_token: str

    class Config:
        json_schema_extra = {
            "example": {
                "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            }
        }

# 사용자 검색 관련 스키마
class UserSearchResponse(BaseModel):
    """사용자 검색 응답 스키마"""
    username: str
    displayName: str

    class Config:
        json_schema_extra = {
            "example": {
                "username": "johndoe",
                "displayName": "John Doe"
            }
        }
