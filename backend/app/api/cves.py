from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from ..models.cve_model import CVEModel
from ..auth.user import get_current_user
from ..models.user import User
from zoneinfo import ZoneInfo
import asyncio
from pymongo import ASCENDING, DESCENDING, TEXT
import logging

router = APIRouter()

@router.get("/cves/", response_model=dict)
async def get_cves(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    search: str = Query(default=None),
    current_user: User = Depends(get_current_user)
):
    """CVE 목록을 페이지네이션하여 반환합니다."""
    try:
        # 검색 쿼리 구성
        query = {}
        if search:
            query = {
                "$or": [
                    {"cve_id": {"$regex": search, "$options": "i"}},
                    {"title": {"$regex": search, "$options": "i"}},
                    {"description": {"$regex": search, "$options": "i"}}
                ]
            }
        
        # 필요한 필드만 선택
        projection = {
            "cve_id": 1,
            "title": 1,
            "status": 1,
            "created_at": 1,
            "description": 1,
            "last_modified_date": 1,
            "_id": 1
        }

        # 성능 로깅 시작
        start_time = datetime.now()
        
        try:
            # 병렬로 total count와 items 조회
            total_future = CVEModel.find(query).count()
            items_future = CVEModel.find(
                query,
                projection=projection
            ).sort([
                ("last_modified_date", DESCENDING),
                ("created_at", DESCENDING)
            ]).skip(skip).limit(limit).to_list()
            
            # 동시에 실행
            total, items = await asyncio.gather(total_future, items_future)
            
            # 성능 측정 및 로깅
            elapsed_time = (datetime.now() - start_time).total_seconds()
            logging.info(f"CVE query executed in {elapsed_time:.3f} seconds. "
                        f"Total: {total}, Fetched: {len(items)}, "
                        f"Search: {search if search else 'None'}")
            
            return {
                "total": total,
                "items": items
            }
            
        except Exception as db_error:
            logging.error(f"Database error: {str(db_error)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="데이터베이스 조회 중 오류가 발생했습니다."
            )
            
    except Exception as e:
        logging.error(f"Error in get_cves: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
