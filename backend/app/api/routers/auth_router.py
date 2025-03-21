"""
인증(Authentication) 관련 API 라우터
"""
from fastapi import APIRouter, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordRequestForm
from typing import Optional
from app.schemas.user import UserCreate, Token, UserResponse, RefreshTokenRequest, LogoutRequest
from app.services.user import UserService
from app.core.dependencies import get_user_service
from app.models.user import User
from app.core.auth import get_current_user
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    user_service: UserService = Depends(get_user_service)
):
    """
    로그인 및 토큰 발급
    
    - **username**: 사용자 이메일 (OAuth2 규약에 따라 username으로 받습니다)
    - **password**: 사용자 비밀번호
    
    Returns:
    - **access_token**: 액세스 토큰
    - **refresh_token**: 리프레시 토큰
    - **token_type**: 토큰 타입 (항상 "bearer")
    - **user**: 사용자 정보
    """
    logger.info(f"로그인 시도: {form_data.username}")
    
    try:
        # 사용자 인증 및 토큰 발급
        token = await user_service.authenticate_user(form_data.username, form_data.password)
        if not token:
            logger.warning(f"로그인 실패: {form_data.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="이메일 또는 비밀번호가 올바르지 않습니다",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        logger.info(f"로그인 성공: {form_data.username}")
        return token
    except Exception as e:
        logger.error(f"로그인 중 오류 발생: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"로그인 중 오류가 발생했습니다: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

@router.post("/refresh", response_model=Token)
async def refresh_access_token(
    refresh_request: RefreshTokenRequest,
    user_service: UserService = Depends(get_user_service)
):
    """
    토큰 갱신
    
    - **refresh_token**: 리프레시 토큰
    
    Returns:
    - **access_token**: 새로운 액세스 토큰
    - **refresh_token**: 새로운 리프레시 토큰
    - **token_type**: 토큰 타입 (항상 "bearer")
    - **user**: 사용자 정보
    """
    logger.info("토큰 갱신 요청")
    logger.debug(f"리프레시 토큰: {refresh_request.refresh_token[:10]}...")
    
    try:
        # 리프레시 토큰 검증
        user = await user_service.verify_refresh_token(refresh_request.refresh_token)
        if not user:
            logger.warning("유효하지 않은 리프레시 토큰")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효하지 않은 리프레시 토큰입니다",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # 기존 리프레시 토큰 무효화
        await user_service.revoke_refresh_token(refresh_request.refresh_token)
        
        # 새로운 액세스 토큰 생성
        access_token = user_service._create_access_token(
            data={
                "sub": user.id,
                "email": user.email
            }
        )
        
        # 새로운 리프레시 토큰 생성
        new_refresh_token, _ = await user_service._create_refresh_token(user.id)
        
        logger.info(f"토큰 갱신 성공: {user.email}")
        
        return Token(
            access_token=access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
            user=user
        )
    except Exception as e:
        logger.error(f"토큰 갱신 중 오류 발생: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"토큰 갱신 중 오류가 발생했습니다: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

@router.post("/logout")
async def logout(
    logout_request: LogoutRequest,
    user_service: UserService = Depends(get_user_service)
):
    """
    로그아웃
    
    - **refresh_token**: 무효화할 리프레시 토큰
    """
    logger.info("로그아웃 요청")
    
    try:
        success = await user_service.revoke_refresh_token(logout_request.refresh_token)
        if success:
            logger.info("로그아웃 성공")
            return {"message": "성공적으로 로그아웃되었습니다"}
        else:
            logger.warning("로그아웃 실패: 토큰을 찾을 수 없음")
            return {"message": "로그아웃 처리되었습니다"}
    except Exception as e:
        logger.error(f"로그아웃 중 오류 발생: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"로그아웃 중 오류가 발생했습니다: {str(e)}"
        )

@router.post("/signup", response_model=Token)
async def signup_user(
    user_data: UserCreate,
    user_service: UserService = Depends(get_user_service)
):
    """
    새로운 사용자를 등록하고 자동으로 로그인합니다.
    
    - **user_data**: 사용자 등록 정보
    
    Returns:
    - **access_token**: 액세스 토큰
    - **refresh_token**: 리프레시 토큰
    - **token_type**: 토큰 타입 (항상 "bearer")
    - **user**: 사용자 정보
    """
    logger.info(f"사용자 등록 요청: {user_data.username}, {user_data.email}")
    
    try:
        # 사용자 생성
        user = await user_service.create_user(user_data)
        if not user:
            logger.error("사용자 생성 실패")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="사용자 생성에 실패했습니다"
            )
        
        # 액세스 토큰 생성
        access_token = user_service._create_access_token(
            data={
                "sub": user.id,
                "email": user.email
            }
        )
        
        # 리프레시 토큰 생성
        refresh_token, _ = await user_service._create_refresh_token(user.id)
        
        logger.info(f"사용자 등록 성공: {user.username}, {user.email}")
        
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user=user
        )
    except ValueError as e:
        logger.warning(f"사용자 등록 중 검증 오류: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"사용자 등록 중 오류 발생: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"사용자 등록 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    현재 인증된 사용자의 정보를 반환합니다.
    
    Returns:
    - **id**: 사용자 ID
    - **username**: 사용자 이름
    - **email**: 사용자 이메일
    - **is_admin**: 관리자 여부
    """
    logger.info(f"현재 사용자 정보 요청: {current_user.username}")
    
    try:
        return UserResponse(
            id=str(current_user.id),
            username=current_user.username,
            email=current_user.email,
            is_admin=current_user.is_admin,
            is_active=current_user.is_active,
            created_at=current_user.created_at,
            last_modified_at=current_user.last_modified_at
        )
    except Exception as e:
        logger.error(f"사용자 정보 반환 중 오류 발생: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"사용자 정보를 가져오는 중 오류가 발생했습니다: {str(e)}"
        )
