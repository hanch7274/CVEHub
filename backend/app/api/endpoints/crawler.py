from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from typing import List
from backend.services.scheduler import CrawlerScheduler
from backend.models.user import User
from backend.utils.auth import get_current_user

router = APIRouter()

@router.post("/run/{crawler_type}", response_model=CrawlerStatusResponse)
async def run_crawler(
    crawler_type: str,
    current_user: User = Depends(get_current_user)
):
    """특정 크롤러 실행"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자만 크롤러를 실행할 수 있습니다."
        )
    
    scheduler = CrawlerScheduler()
    success, message = await scheduler.run_specific_crawler(crawler_type)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return {
        "status": "success",
        "message": message,
        "isRunning": scheduler.is_update_running(),
        "lastUpdate": scheduler.get_last_update()
    } 