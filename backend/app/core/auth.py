"""인증 관련 핵심 기능"""
from fastapi import Depends, HTTPException, status
from typing import Optional
from ..models.user import User, TokenData
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from .config.auth import get_auth_settings
from ..models.user import UserResponse
import logging

logger = logging.getLogger(__name__)

# 설정 초기화
auth_settings = get_auth_settings()

# JWT 설정
SECRET_KEY = "your-secret-key-here"  # 실제 운영 환경에서는 환경 변수로 관리
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7일

# 비밀번호 해싱
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "user": {
                    "username": "johndoe",
                    "email": "johndoe@example.com",
                    "is_admin": False
                }
            }
        }

class TokenData(BaseModel):
    email: Optional[str] = None

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """비밀번호 검증"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """비밀번호 해싱"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """액세스 토큰을 생성합니다."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        auth_settings.SECRET_KEY,
        algorithm=auth_settings.ALGORITHM
    )
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """현재 인증된 사용자를 반환합니다."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            auth_settings.SECRET_KEY,
            algorithms=[auth_settings.ALGORITHM]
        )
        email: str = payload.get("email")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    user = await User.find_one({"email": token_data.email})
    if user is None:
        raise credentials_exception
    return user

async def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """현재 로그인한 사용자가 관리자인지 확인합니다."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다"
        )
    return current_user
