"""사용자 관련 API 라우터"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from typing import List
from app.models.user import User, UserCreate, UserUpdate
from app.services.user import UserService
from app.core.auth import get_current_user
import logging
import traceback
from beanie import PydanticObjectId

# 라우터 및 서비스 초기화
router = APIRouter()
user_service = UserService()
logger = logging.getLogger(__name__)

# 사용자 등록 API
@router.post("/register")
async def register(user_data: UserCreate):
    """새로운 사용자를 등록합니다."""
    try:
        user = await user_service.create_user(user_data)
        if not user:
            raise HTTPException(status_code=400, detail="사용자 등록에 실패했습니다.")
        return user
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 사용자 로그인 API
@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """사용자 로그인을 처리합니다."""
    try:
        token = await user_service.authenticate_user(
            form_data.username,
            form_data.password
        )
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="잘못된 사용자 이름 또는 비밀번호입니다.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return token
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 현재 로그인한 사용자 정보 조회 API
@router.get("/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """현재 로그인한 사용자의 정보를 조회합니다."""
    return current_user

# 현재 로그인한 사용자 정보 수정 API
@router.patch("/me")
async def update_current_user(
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user)
):
    """현재 로그인한 사용자의 정보를 수정합니다."""
    try:
        user = await user_service.update_user(current_user.id, user_data)
        if not user:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
        return user
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 현재 로그인한 사용자 계정 삭제 API
@router.delete("/me")
async def delete_current_user(current_user: User = Depends(get_current_user)):
    """현재 로그인한 사용자의 계정을 삭제합니다."""
    try:
        success = await user_service.delete_user(current_user.id)
        if not success:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
        return {"message": "사용자 계정이 삭제되었습니다."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 사용자 검색 API (자동완성 기능)
@router.get("/search", response_model=List[dict])
async def search_users(
    query: str = "",
    current_user: User = Depends(get_current_user)
):
    """사용자 검색 API - 멘션 자동완성을 위해 사용됩니다."""
    logger.info("=== User Search API Called ===")
    logger.info(f"Query: {query}")
    logger.info(f"Current user: {current_user.username}")
    
    try:
        # 쿼리에서 @ 기호 제거
        clean_query = query.replace("@", "").strip()
        logger.info(f"Cleaned query: {clean_query}")
        
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
        
        logger.info(f"Found {len(users)} users")
        result = [
            {
                "username": user.username,
                "displayName": user.username
            } 
            for user in users
        ]
        logger.info(f"Returning users: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Error in search_users: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"사용자 검색 중 오류가 발생했습니다: {str(e)}"
        )

# 전체 사용자 목록 조회 API
@router.get("/", response_model=List[dict])
async def get_users(current_user: User = Depends(get_current_user)):
    """등록된 모든 사용자 목록을 반환합니다."""
    logger.info("=== Get Users API Called ===")
    logger.info(f"Request by user: {current_user.username}")
    
    try:
        # beanie를 사용하여 모든 사용자 조회
        users = await User.find_all().to_list()
        user_list = [{"username": user.username, "email": user.email} for user in users]
        
        logger.info(f"Found {len(user_list)} users")
        logger.debug(f"User list: {user_list}")
        
        return user_list
    except Exception as e:
        logger.error(f"Error fetching users: {str(e)}")
        logger.error(f"Error details: {e.__class__.__name__}")
        raise HTTPException(
            status_code=500,
            detail=f"사용자 목록을 가져오는 중 오류가 발생했습니다: {str(e)}"
        )
