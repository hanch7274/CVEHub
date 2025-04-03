"""
사용자 활동 라우터
"""
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, Query
from app.activity.service import ActivityService
from app.activity.models import ActivityListResponse
from app.auth.service import get_current_user

router = APIRouter(
    prefix="/activities",
    tags=["activities"]
)

@router.get("/me", response_model=ActivityListResponse)
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
async def get_all_activities(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    username: Optional[str] = None,
    target_type: Optional[str] = None,
    activity_type: Optional[str] = None,
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
    if activity_type:
        filter_data["activity_type"] = activity_type
    
    return await activity_service.get_all_activities(
        filter_data=filter_data,
        page=page,
        limit=limit
    )
