"""
사용자 활동 라우터
"""
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from app.activity.service import ActivityService
from app.activity.models import ActivityListResponse
from app.auth.service import get_current_user
import functools
import logging

router = APIRouter(
    prefix="/activities",
    tags=["activities"]
)

logger = logging.getLogger(__name__)

def activity_api_error_handler(func):
    """활동 API 엔드포인트 예외 처리 데코레이터"""
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            result = await func(*args, **kwargs)
            if result is None:
                # 서비스에서 오류가 발생하여 None이 반환된 경우
                logger.error(f"{func.__name__} 실행 중 서비스 계층에서 오류가 발생했습니다.")
                raise HTTPException(
                    status_code=500, 
                    detail=f"{func.__name__} 실행 중 서비스 계층에서 오류가 발생했습니다."
                )
            return result
        except HTTPException:
            # FastAPI HTTP 예외는 그대로 전달
            raise
        except ValueError as val_err:
            # 값 검증 오류
            logger.warning(f"값 검증 오류 in {func.__name__}: {str(val_err)}")
            raise HTTPException(status_code=400, detail=str(val_err))
        except Exception as e:
            # 일반 예외는 서버 오류로 처리
            logger.error(f"Error in {func.__name__}: {str(e)}")
            raise HTTPException(
                status_code=500, 
                detail=f"{func.__name__} 중 오류 발생: {str(e)}"
            )
    return wrapper

@router.get("/me", response_model=ActivityListResponse)
@activity_api_error_handler
async def get_my_activities(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    현재 로그인한 사용자의 활동 내역을 조회합니다.
    """
    activity_service = ActivityService()
    return await activity_service.get_activities_by_username(
        username=current_user["username"],
        page=page,
        limit=limit
    )

@router.get("/users/{username}", response_model=ActivityListResponse)
@activity_api_error_handler
async def get_user_activities(
    username: str,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    특정 사용자의 활동 내역을 조회합니다.
    """
    activity_service = ActivityService()
    return await activity_service.get_activities_by_username(
        username=username,
        page=page,
        limit=limit
    )

@router.get("/targets/{target_type}/{target_id}", response_model=ActivityListResponse)
@activity_api_error_handler
async def get_target_activities(
    target_type: str,
    target_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    대상 객체(CVE, PoC 등)의 활동 내역을 조회합니다.
    """
    activity_service = ActivityService()
    return await activity_service.get_activities_by_target(
        target_type=target_type,
        target_id=target_id,
        page=page,
        limit=limit
    )

@router.get("/", response_model=ActivityListResponse)
@activity_api_error_handler
async def get_all_activities(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    username: Optional[str] = None,
    target_type: Optional[str] = None,
    action: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    모든 활동 내역을 조회합니다. 필터링도 가능합니다.
    """
    activity_service = ActivityService()
    
    filter_data = {}
    if username:
        filter_data["username"] = username
    if target_type:
        filter_data["target_type"] = target_type
    if action:
        filter_data["action"] = action
    
    return await activity_service.get_all_activities(
        filter_data=filter_data,
        page=page,
        limit=limit
    )
