"""
사용자 인증 및 관리 통합 API 라우터
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from typing import List, Callable, Any, Awaitable
from beanie import PydanticObjectId
import functools

# 변경: 모델과 스키마 임포트 경로 수정
from .models import User, Token, UserResponse, RefreshTokenRequest, LogoutRequest, UserCreate, UserUpdate
# 변경: 통합된 service 파일에서 의존성 함수들 가져오기
from .service import UserService, get_current_user
from ..core.dependencies import get_user_service
import logging
import traceback

# 라우터 및 로거 초기화
router = APIRouter()
logger = logging.getLogger(__name__)

# ----- 에러 핸들링 데코레이터 -----

def auth_api_error_handler(func: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
    """인증 API 예외 처리 데코레이터
    
    모든 인증 관련 엔드포인트의 공통 예외 처리 로직을 중앙화합니다.
    """
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except HTTPException:
            # FastAPI HTTP 예외는 그대로 전달
            raise
        except ValueError as val_exc:
            # 검증 오류 (400 Bad Request)
            endpoint = func.__name__
            logger.warning(f"{endpoint} 중 검증 오류 발생: {str(val_exc)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(val_exc)
            )
        except Exception as e:
            # 일반 예외는 서버 오류로 처리
            endpoint = func.__name__
            logger.error(f"Error in {endpoint}: {str(e)}")
            logger.error(traceback.format_exc())
            
            # 인증 관련 엔드포인트인 경우 인증 헤더 추가
            headers = {}
            if endpoint in ["login_for_access_token", "refresh_access_token"]:
                headers["WWW-Authenticate"] = "Bearer"
                
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"{endpoint} 중 오류가 발생했습니다: {str(e)}",
                headers=headers
            )
    
    return wrapper

# ----- 인증 관련 API 엔드포인트 -----

@router.post("/token", response_model=Token)
@auth_api_error_handler
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    user_service: UserService = Depends(get_user_service)
):
    """
    로그인 및 토큰 발급
    
    - **username**: 사용자 이메일 (OAuth2 규약에 따라 username으로 받습니다)
    - **password**: 사용자 비밀번호
    """
    logger.info(f"로그인 시도: {form_data.username}")
    
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

@router.post("/refresh", response_model=Token)
@auth_api_error_handler
async def refresh_access_token(
    refresh_request: RefreshTokenRequest,
    user_service: UserService = Depends(get_user_service)
):
    """
    토큰 갱신
    
    - **refresh_token**: 리프레시 토큰
    """
    logger.info("토큰 갱신 요청")
    logger.debug(f"리프레시 토큰: {refresh_request.refresh_token[:10]}...")
    
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

@router.post("/logout")
@auth_api_error_handler
async def logout(
    logout_request: LogoutRequest,
    user_service: UserService = Depends(get_user_service)
):
    """
    로그아웃
    
    - **refresh_token**: 무효화할 리프레시 토큰
    """
    logger.info("로그아웃 요청")
    
    success = await user_service.revoke_refresh_token(logout_request.refresh_token)
    if success:
        logger.info("로그아웃 성공")
        return {"message": "성공적으로 로그아웃되었습니다"}
    else:
        logger.warning("로그아웃 실패: 토큰을 찾을 수 없음")
        return {"message": "로그아웃 처리되었습니다"}

# ----- 사용자 관리 API 엔드포인트 -----

@router.post("/signup", response_model=Token)
@auth_api_error_handler
async def signup_user(
    user_data: UserCreate,
    user_service: UserService = Depends(get_user_service)
):
    """
    새로운 사용자를 등록하고 자동으로 로그인합니다.
    
    - **user_data**: 사용자 등록 정보
    """
    logger.info(f"사용자 등록 요청: {user_data.username}, {user_data.email}")
    
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

@router.get("/me", response_model=UserResponse)
@auth_api_error_handler
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    현재 인증된 사용자의 정보를 반환합니다.
    """
    logger.info(f"현재 사용자 정보 요청: {current_user.username}")
    
    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        is_admin=current_user.is_admin,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        last_modified_at=current_user.last_modified_at
    )

@router.patch("/me")
@auth_api_error_handler
async def update_current_user(
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """현재 로그인한 사용자의 정보를 수정합니다."""
    logger.info(f"사용자 {current_user.username} 정보 수정 요청")
    user = await user_service.update_user(current_user.id, user_data)
    if not user:
        logger.error(f"사용자 {current_user.username} 정보 수정 실패: 사용자를 찾을 수 없음")
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    logger.info(f"사용자 {current_user.username} 정보 수정 성공")
    return user

@router.delete("/me")
@auth_api_error_handler
async def delete_current_user(
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """현재 로그인한 사용자의 계정을 삭제합니다."""
    logger.info(f"사용자 {current_user.username} 계정 삭제 요청")
    success = await user_service.delete_user(current_user.id)
    if not success:
        logger.error(f"사용자 {current_user.username} 계정 삭제 실패: 사용자를 찾을 수 없음")
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    logger.info(f"사용자 {current_user.username} 계정 삭제 성공")
    return {"message": "사용자 계정이 삭제되었습니다."}

@router.get("/search", response_model=List[dict])
@auth_api_error_handler
async def search_users(
    query: str = "",
    current_user: User = Depends(get_current_user)
):
    """사용자 검색 API - 멘션 자동완성을 위해 사용됩니다."""
    logger.info("=== 사용자 검색 API 호출 ===")
    logger.info(f"검색어: {query}")
    logger.info(f"현재 사용자: {current_user.username}")
    
    # 쿼리에서 @ 기호 제거
    clean_query = query.replace("@", "").strip()
    logger.info(f"정제된 검색어: {clean_query}")
    
    # 빈 쿼리이거나 '@'만 입력된 경우 모든 사용자 반환
    if not clean_query:
        users = await User.find(
            {"username": {"$ne": current_user.username}}
        ).sort("username").limit(10).to_list()
    else:
        users = await User.find(
            {
                "username": {
                    "$regex": f"^{clean_query}", 
                    "$options": "i",
                    "$ne": current_user.username
                }
            }
        ).sort("username").limit(10).to_list()
    
    logger.info(f"검색 결과: {len(users)}명의 사용자 찾음")
    result = [
        {
            "username": user.username,
            "displayName": user.username
        } 
        for user in users
    ]
    logger.debug(f"반환할 사용자 목록: {result}")
    return result

@router.get("/", response_model=List[dict])
@auth_api_error_handler
async def get_users(current_user: User = Depends(get_current_user)):
    """등록된 모든 사용자 목록을 반환합니다."""
    logger.info("=== 전체 사용자 목록 조회 API 호출 ===")
    logger.info(f"요청 사용자: {current_user.username}")
    
    # beanie를 사용하여 모든 사용자 조회
    users = await User.find_all().to_list()
    user_list = [{"username": user.username, "email": user.email} for user in users]
    
    logger.info(f"총 {len(user_list)}명의 사용자 조회됨")
    return user_list