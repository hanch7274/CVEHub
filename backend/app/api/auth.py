from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from ..models.user import User, UserCreate, UserInDB, Token, TokenData, UserResponse
from ..services.user import UserService
from ..core.dependencies import get_user_service
from ..core.config import get_settings
from ..core.auth import (
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
    revoke_refresh_token,
    get_current_user
)
from beanie import PydanticObjectId
import logging

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

# 비밀번호 해싱을 위한 컨텍스트
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# OAuth2 토큰 검증을 위한 객체
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """비밀번호 검증"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """비밀번호 해싱"""
    return pwd_context.hash(password)

async def authenticate_user(email: str, password: str) -> Optional[User]:
    """사용자 인증 (이메일 기반)"""
    user = await User.find_one({"email": email})
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """액세스 토큰 생성"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({
        "exp": expire,
        "type": "access"  # 토큰 타입 명시
    })
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """현재 인증된 사용자 조회"""
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
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    user = await User.find_one({"email": token_data.email})
    if user is None:
        raise credentials_exception
    return user

@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    user_service: UserService = Depends(get_user_service)
):
    """로그인 및 토큰 발급"""
    user = await user_service.authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Access Token 생성
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "type": "access"  # 토큰 타입 명시
        }
    )
    
    # Refresh Token 생성
    refresh_token, _ = await create_refresh_token(str(user.id))
    
    # UserResponse 모델로 변환
    user_response = UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        is_admin=user.is_admin
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user_response
    }

@router.post("/refresh", response_model=Token)
async def refresh_access_token(authorization: str = Depends(oauth2_scheme)):
    """토큰 갱신"""
    logger.debug("=== Token Refresh Debug ===")
    
    # Authorization 헤더에서 토큰 추출
    refresh_token = authorization.replace("Bearer ", "")
    logger.debug(f"Received refresh token from header: {refresh_token[:10]}...")
    
    if not refresh_token:
        logger.error("No refresh token provided")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No refresh token provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = await verify_refresh_token(refresh_token)
    logger.debug(f"Verified user: {user.email if user else None}")
    
    if not user:
        logger.error("Invalid refresh token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 기존 Refresh Token 무효화
    logger.debug("Revoking old refresh token")
    await revoke_refresh_token(refresh_token)
    
    # 새로운 Access Token 생성
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "type": "access"  # 토큰 타입 명시
        }
    )
    logger.debug(f"Created new access token: {access_token[:10]}...")
    
    # 새로운 Refresh Token 생성
    new_refresh_token, expires_at = await create_refresh_token(str(user.id))
    logger.debug(f"Created new refresh token: {new_refresh_token[:10]}... (expires at {expires_at})")
    
    # UserResponse 모델로 변환
    user_response = UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        is_admin=user.is_admin
    )
    
    logger.debug("Token refresh completed successfully")
    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "user": user_response
    }

@router.post("/logout")
async def logout(refresh_token: str):
    """로그아웃"""
    await revoke_refresh_token(refresh_token)
    return {"message": "Successfully logged out"}

@router.post("/signup", response_model=Token)
async def signup_user(
    user_data: UserCreate,
    user_service: UserService = Depends(get_user_service)
):
    """새로운 사용자를 등록하고 자동으로 로그인합니다."""
    try:
        # 사용자 생성
        user = await user_service.create_user(user_data)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create user"
            )
        
        # Access Token 생성
        access_token = create_access_token(
            data={
                "sub": str(user.id),
                "email": user.email
            }
        )
        
        # Refresh Token 생성
        refresh_token, _ = await create_refresh_token(str(user.id))
        
        # UserResponse 모델로 변환
        user_response = UserResponse(
            id=str(user.id),
            username=user.username,
            email=user.email,
            is_admin=user.is_admin
        )
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": user_response
        }
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """현재 인증된 사용자의 정보를 반환합니다."""
    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        is_active=current_user.is_active,
        is_admin=current_user.is_admin
    )
