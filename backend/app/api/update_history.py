from fastapi import APIRouter, Depends, Query, HTTPException, status
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Callable
from ..models.cve_model import CVEModel, ModificationHistory
from ..models.user import User
from ..core.auth import get_current_user
from beanie import PydanticObjectId
from zoneinfo import ZoneInfo
import logging
from functools import wraps

router = APIRouter()
logger = logging.getLogger(__name__)

def create_date_range_pipeline(start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
    """날짜 범위에 대한 기본 파이프라인을 생성합니다."""
    return [
        {
            "$match": {
                "modification_history.modified_at": {
                    "$gte": start_date,
                    "$lte": end_date
                }
            }
        },
        {
            "$unwind": "$modification_history"
        },
        {
            "$match": {
                "modification_history.modified_at": {
                    "$gte": start_date,
                    "$lte": end_date
                }
            }
        }
    ]

async def handle_aggregation_request(pipeline: List[Dict[str, Any]], error_msg: str) -> List[Dict[str, Any]]:
    """MongoDB 집계 파이프라인을 실행하고 오류를 처리합니다."""
    try:
        result = await CVEModel.aggregate(pipeline).to_list()
        return result
    except Exception as e:
        logger.error(f"{error_msg}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"{error_msg}: {str(e)}"
        )

@router.get("/recent", response_model=List[Dict[str, Any]])
async def get_recent_updates(
    days: int = Query(7, ge=1, le=30),
    crawlers_only: bool = Query(False, description="크롤러에 의한 업데이트만 표시"),
    username: Optional[str] = Query(None, description="특정 사용자의 업데이트만 표시"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """최근 업데이트 이력을 조회합니다."""
    
    # 날짜 범위 설정
    end_date = datetime.now(ZoneInfo("Asia/Seoul"))
    start_date = end_date - timedelta(days=days)
    
    # 로깅
    logger.info(f"Fetching updates from {start_date} to {end_date}, crawlers_only={crawlers_only}, username={username}")
    
    # 기본 파이프라인 생성
    pipeline = create_date_range_pipeline(start_date, end_date)
    
    # 크롤러 필터링 (필요시)
    if crawlers_only:
        pipeline.append({
            "$match": {
                "modification_history.username": {
                    "$in": ["Nuclei-Crawler", "Metasploit-Crawler"]
                }
            }
        })
    
    # 사용자 필터링 (필요시)
    if username:
        pipeline.append({
            "$match": {
                "modification_history.username": username
            }
        })
    
    # 결과 프로젝션 및 정렬
    pipeline.extend([
        {
            "$project": {
                "_id": 0,
                "cve_id": 1,
                "title": 1,
                "status": 1,
                "username": "$modification_history.username",
                "modified_at": "$modification_history.modified_at",
                "changes": "$modification_history.changes"
            }
        },
        {
            "$sort": {
                "modified_at": -1
            }
        }
    ])
    
    # 페이지네이션
    pipeline.extend([
        {"$skip": (page - 1) * limit},
        {"$limit": limit}
    ])
    
    # 집계 실행 및 오류 처리
    updates = await handle_aggregation_request(
        pipeline,
        "업데이트 이력 조회 중 오류가 발생했습니다"
    )
    logger.info(f"Found {len(updates)} update records")
    return updates

@router.get("/stats", response_model=Dict[str, Any])
async def get_update_statistics(
    days: int = Query(30, ge=1, le=90),
    current_user: User = Depends(get_current_user)
):
    """업데이트 관련 통계 정보를 조회합니다."""
    
    # 날짜 범위 설정
    end_date = datetime.now(ZoneInfo("Asia/Seoul"))
    start_date = end_date - timedelta(days=days)
    
    try:
        # 기본 파이프라인 생성
        base_pipeline = create_date_range_pipeline(start_date, end_date)
        
        # 전체 업데이트 수
        total_updates_pipeline = base_pipeline + [{"$count": "total"}]
        total_results = await handle_aggregation_request(
            total_updates_pipeline, 
            "전체 업데이트 수 조회 중 오류가 발생했습니다"
        )
        total_updates = total_results[0]["total"] if total_results else 0
        
        # 사용자별 업데이트 수
        user_updates_pipeline = base_pipeline + [
            {
                "$group": {
                    "_id": "$modification_history.username",
                    "count": {"$sum": 1}
                }
            },
            {
                "$sort": {"count": -1}
            }
        ]
        user_results = await handle_aggregation_request(
            user_updates_pipeline,
            "사용자별 업데이트 수 조회 중 오류가 발생했습니다"
        )
        
        # 필드별 업데이트 수
        field_updates_pipeline = base_pipeline + [
            {
                "$unwind": "$modification_history.changes"
            },
            {
                "$group": {
                    "_id": "$modification_history.changes.field_name",
                    "count": {"$sum": 1}
                }
            },
            {
                "$sort": {"count": -1}
            }
        ]
        field_results = await handle_aggregation_request(
            field_updates_pipeline,
            "필드별 업데이트 수 조회 중 오류가 발생했습니다"
        )
        
        # 일별 업데이트 수
        daily_updates_pipeline = base_pipeline + [
            {
                "$group": {
                    "_id": {
                        "$dateToString": {"format": "%Y-%m-%d", "date": "$modification_history.modified_at"}
                    },
                    "count": {"$sum": 1}
                }
            },
            {
                "$sort": {"_id": 1}
            }
        ]
        daily_results = await handle_aggregation_request(
            daily_updates_pipeline,
            "일별 업데이트 수 조회 중 오류가 발생했습니다"
        )
        
        return {
            "total_updates": total_updates,
            "by_user": user_results,
            "by_field": field_results,
            "daily": daily_results
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching update statistics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"통계 정보 조회 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/cve/{cve_id}", response_model=List[Dict[str, Any]])
async def get_cve_update_history(
    cve_id: str,
    current_user: User = Depends(get_current_user)
):
    """특정 CVE의 업데이트 이력을 조회합니다."""
    
    try:
        # CVE 존재 여부 확인
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"CVE ID '{cve_id}'를 찾을 수 없습니다"
            )
        
        # 해당 CVE의 모든 수정 이력 반환
        result = [
            {
                "username": history.username,
                "modified_at": history.modified_at,
                "changes": history.changes
            }
            for history in cve.modification_history
        ]
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching CVE update history: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"CVE 업데이트 이력 조회 중 오류가 발생했습니다: {str(e)}"
        ) 