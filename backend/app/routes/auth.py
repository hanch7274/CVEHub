from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from passlib.context import CryptContext
from ..models.user import User, UserCreate, UserResponse
from ..auth.user import create_access_token, get_current_user, verify_password, get_password_hash
from ..core.config import settings

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class UserCreateWithAdmin(UserCreate):
    is_admin: bool = False

@router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreateWithAdmin):
    """새로운 사용자를 등록합니다."""
    # 이메일 중복 체크
    existing_user = await User.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # 사용자 이름 중복 체크
    existing_user = await User.find_one({"username": user_data.username})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # 비밀번호 해시화
    hashed_password = get_password_hash(user_data.password)
    
    # 새 사용자 생성
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        is_admin=user_data.is_admin  # admin 권한 설정
    )
    
    await new_user.create()
    
    return UserResponse(
        username=new_user.username,
        email=new_user.email,
        is_admin=new_user.is_admin
    )

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """사용자 로그인을 처리하고 JWT 토큰을 발급합니다."""
    # 1. 사용자 찾기
    user = await User.find_one({"username": form_data.username})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 2. 비밀번호 확인
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 3. JWT 토큰 생성
    # sub(subject)에는 사용자 식별자(여기서는 username)를 넣습니다
    access_token = create_access_token(
        data={"sub": user.username}
    )
    
    # 4. 토큰과 함께 사용자 정보 반환
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse(
            username=user.username,
            email=user.email,
            is_admin=user.is_admin
        )
    }

@router.post("/logout")
async def logout():
    """로그아웃 처리. 클라이언트에서 토큰을 삭제하면 되므로, 성공 메시지만 반환"""
    return {"message": "Successfully logged out"}

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: str = Depends(get_current_user)):
    """현재 로그인한 사용자의 정보를 반환합니다."""
    user = await User.find_one({"username": current_user})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserResponse(
        username=user.username,
        email=user.email,
        is_admin=user.is_admin
    )
