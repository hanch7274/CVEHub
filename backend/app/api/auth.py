from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from ..models.user import User, UserCreate, UserInDB, Token, TokenData, UserResponse
from ..services.user import UserService
from ..core.dependencies import get_user_service
from ..core.config.auth import get_auth_settings
from ..core.auth import create_access_token, get_current_user
from beanie import PydanticObjectId

router = APIRouter()
auth_settings = get_auth_settings()

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
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        auth_settings.SECRET_KEY,
        algorithm=auth_settings.ALGORITHM
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

@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    user_service: UserService = Depends(get_user_service)
):
    """토큰 발급"""
    user = await user_service.authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email
        },
        expires_delta=auth_settings.ACCESS_TOKEN_EXPIRE_DELTA
    )
    
    # UserResponse 모델로 변환하여 반환
    user_response = UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        is_admin=user.is_admin
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_response
    }

@router.post("/register")
async def register_user(
    user_data: UserCreate,
    user_service: UserService = Depends(get_user_service)
):
    """새로운 사용자 등록"""
    try:
        await user_service.create_user(user_data)
        return {"message": "User registered successfully"}
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
