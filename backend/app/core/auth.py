"""인증 관련 핵심 기능"""
from fastapi import Depends, HTTPException, status
from typing import Optional, Tuple
from ..models.user import User, TokenData, RefreshToken, UserResponse
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer
from .config import get_settings
import logging
import secrets

logger = logging.getLogger(__name__)
settings = get_settings()

# 비밀번호 해싱을 위한 context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 토큰 검증을 위한 객체
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

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
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    return encoded_jwt

async def create_refresh_token(user_id: str) -> Tuple[str, datetime]:
    """리프레시 토큰을 생성하고 저장합니다."""
    logger.debug("=== Create Refresh Token Debug ===")
    logger.debug(f"Creating refresh token for user_id: {user_id}")
    
    expires_at = datetime.utcnow() + settings.REFRESH_TOKEN_EXPIRE_DELTA
    token = secrets.token_urlsafe(32)
    
    refresh_token = RefreshToken(
        user_id=user_id,
        token=token,
        expires_at=expires_at
    )
    await refresh_token.insert()
    
    logger.debug(f"Created refresh token: {token[:10]}... (expires at {expires_at})")
    return token, expires_at

async def verify_refresh_token(token: str) -> Optional[User]:
    """리프레시 토큰을 검증하고 사용자를 반환합니다."""
    logger.debug("=== Verify Refresh Token Debug ===")
    logger.debug(f"Verifying refresh token: {token[:10]}...")
    
    refresh_token = await RefreshToken.find_one({
        "token": token,
        "is_revoked": False,
        "expires_at": {"$gt": datetime.utcnow()}
    })
    
    if not refresh_token:
        logger.error("Refresh token not found or invalid")
        return None
    
    logger.debug(f"Found valid refresh token for user_id: {refresh_token.user_id}")
    user = await User.get(refresh_token.user_id)
    
    if not user:
        logger.error(f"User not found for user_id: {refresh_token.user_id}")
        return None
    
    logger.debug(f"User found: {user.email}")
    return user

async def revoke_refresh_token(token: str):
    """리프레시 토큰을 무효화합니다."""
    logger.debug("=== Revoke Refresh Token Debug ===")
    logger.debug(f"Attempting to revoke token: {token[:10]}...")
    
    refresh_token = await RefreshToken.find_one({"token": token})
    if refresh_token:
        refresh_token.is_revoked = True
        await refresh_token.save()
        logger.debug("Token successfully revoked")
    else:
        logger.warning("Token not found for revocation")

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
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        email: str = payload.get("email")
        token_type: str = payload.get("type")
        
        if email is None or token_type != "access":
            raise credentials_exception
            
        token_data = TokenData(email=email, token_type=token_type)
    except JWTError:
        raise credentials_exception
    
    user = await User.find_one({"email": token_data.email})
    if user is None:
        raise credentials_exception
    return user

async def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """현재 인증된 사용자가 관리자인지 확인합니다."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges"
        )
    return current_user

async def verify_token(token: str) -> Optional[User]:
    """토큰을 검증하고 사용자 정보를 반환합니다."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        email: str = payload.get("email")
        if email is None:
            logger.error("토큰에 email 필드가 없습니다.")
            return None
            
        user = await User.find_one({"email": email})
        if not user:
            logger.error(f"사용자를 찾을 수 없습니다: {email}")
            return None
            
        return user
    except JWTError as e:
        logger.error(f"토큰 검증 중 오류: {str(e)}")
        return None
