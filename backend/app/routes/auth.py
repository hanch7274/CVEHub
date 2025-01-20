from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Form
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from ..models.user import User, UserCreate
from ..core.config import settings
from pydantic import BaseModel

router = APIRouter(tags=["auth"])

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    is_admin: Optional[bool] = None

class UserCreateWithAdmin(UserCreate):
    is_admin: bool = False

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    user = await User.find_one({"email": email})
    if user is None:
        raise credentials_exception
    return user

@router.post("/signup")
async def signup(user_data: UserCreate):
    """새로운 사용자를 등록합니다."""
    # 이메일 중복 확인
    if await User.find_one({"email": user_data.email}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # 비밀번호 해싱
    hashed_password = get_password_hash(user_data.password)
    
    # 새 사용자 생성
    new_user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hashed_password,
        is_admin=False
    )
    
    # DB에 저장
    await new_user.insert()
    
    return {
        "message": "회원가입이 완료되었습니다",
        "user": {
            "username": new_user.username,
            "email": new_user.email,
            "is_admin": new_user.is_admin
        }
    }

@router.post("/login")
async def login(email: str = Form(...), password: str = Form(...)):
    """사용자 로그인을 처리하고 JWT 토큰을 발급합니다."""
    # 1. 이메일로 사용자 찾기
    user = await User.find_one({"email": email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 2. 비밀번호 확인
    if not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 3. JWT 토큰 생성
    access_token = create_access_token(
        data={
            "sub": user.email,
            "is_admin": user.is_admin
        }
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """현재 로그인한 사용자의 정보를 반환합니다."""
    return {
        "email": current_user.email,
        "username": current_user.username,
        "is_admin": current_user.is_admin
    }

@router.post("/logout")
async def logout():
    """사용자 로그아웃을 처리합니다."""
    return {"message": "Successfully logged out"}
