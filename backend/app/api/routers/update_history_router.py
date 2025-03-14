"""
업데이트 이력 관련 API 라우터
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from app.models.user import User
from app.core.auth import get_current_user
from app.core.dependencies import get_update_history_service
from app.services.update_history_service import UpdateHistoryService
from app.schemas.update_history import (
    RecentUpdatesResponse, 
    RecentUpdateEntry,
    UpdateStatisticsResponse,
    CVEUpdateHistoryResponse,
    UpdateHistoryEntry
)
from zoneinfo import ZoneInfo
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/recent", response_model=RecentUpdatesResponse)
async def get_recent_updates(
    days: int = Query(7, ge=1, le=30, description="최근 몇 일간의 데이터를 조회할지"),
    crawlers_only: bool = Query(False, description="크롤러에 의한 업데이트만 표시"),
    username: Optional[str] = Query(None, description="특정 사용자의 업데이트만 표시"),
    page: int = Query(1, ge=1, description="페이지 번호"),
    limit: int = Query(50, ge=1, le=100, description="페이지당 항목 수"),
    current_user: User = Depends(get_current_user),
    update_history_service: UpdateHistoryService = Depends(get_update_history_service)
):
    """
    최근 업데이트 이력을 조회합니다.
    
    - **days**: 최근 몇 일간의 데이터를 조회할지 (기본값: 7일, 최대: 30일)
    - **crawlers_only**: 크롤러에 의한 업데이트만 표시할지 여부 (기본값: False)
    - **username**: 특정 사용자의 업데이트만 표시할 사용자 이름 (선택 사항)
    - **page**: 페이지 번호 (기본값: 1)
    - **limit**: 페이지당 항목 수 (기본값: 50, 최대: 100)
    
    Returns:
    - 최근 업데이트 목록
    """
    
    try:
        result = await update_history_service.get_recent_updates(
            days=days,
            crawlers_only=crawlers_only,
            username=username,
            page=page,
            limit=limit
        )
        
        return RecentUpdatesResponse(
            updates=result["updates"],
            total=result["total"],
            page=result["page"],
            limit=result["limit"]
        )
    except Exception as e:
        logger.error(f"업데이트 이력 조회 중 오류 발생: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"업데이트 이력 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get("/stats", response_model=UpdateStatisticsResponse)
async def get_update_statistics(
    days: int = Query(30, ge=1, le=90, description="최근 몇 일간의 데이터를 조회할지"),
    current_user: User = Depends(get_current_user),
    update_history_service: UpdateHistoryService = Depends(get_update_history_service)
):
    """
    업데이트 관련 통계 정보를 조회합니다.
    
    - **days**: 최근 몇 일간의 데이터를 조회할지 (기본값: 30일, 최대: 90일)
    
    Returns:
    - 전체 업데이트 수
    - 사용자별 업데이트 수
    - 필드별 업데이트 수
    - 일별 업데이트 수
    """
    
    try:
        result = await update_history_service.get_update_statistics(days=days)
        
        return UpdateStatisticsResponse(
            total_updates=result["total_updates"],
            by_user=result["by_user"],
            by_field=result["by_field"],
            daily=result["daily"]
        )
    except Exception as e:
        logger.error(f"업데이트 통계 조회 중 오류 발생: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"업데이트 통계 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get("/cve/{cve_id}", response_model=CVEUpdateHistoryResponse)
async def get_cve_update_history(
    cve_id: str,
    current_user: User = Depends(get_current_user),
    update_history_service: UpdateHistoryService = Depends(get_update_history_service)
):
    """
    특정 CVE의 업데이트 이력을 조회합니다.
    
    - **cve_id**: 조회할 CVE의 ID
    
    Returns:
    - CVE ID
    - 업데이트 이력 목록 (사용자 이름, 수정 시간, 변경 내용)
    """
    
    try:
        result = await update_history_service.get_cve_update_history(cve_id=cve_id)
        
        return CVEUpdateHistoryResponse(
            cve_id=result["cve_id"],
            update_history=result["update_history"]
        )
    except Exception as e:
        logger.error(f"CVE 업데이트 이력 조회 중 오류 발생: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR if "찾을 수 없습니다" not in str(e) else status.HTTP_404_NOT_FOUND,
            detail=f"CVE 업데이트 이력 조회 중 오류가 발생했습니다: {str(e)}"
        )
