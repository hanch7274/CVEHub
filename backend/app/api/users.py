from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.core.auth import get_current_user
from app.models.user import User
from beanie import PydanticObjectId
import logging

# 로거 설정
logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/", response_model=List[dict])
async def get_users(current_user: User = Depends(get_current_user)):
    """
    등록된 모든 사용자 목록을 반환합니다.
    """
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
