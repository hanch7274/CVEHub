from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from ..models.cve import CVEModel
from ..auth.user import get_current_user
from ..models.user import User
from zoneinfo import ZoneInfo

router = APIRouter()

@router.get("/cves/", response_model=dict)
async def get_cves(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """CVE 목록을 페이지네이션하여 반환합니다."""
    try:
        # 전체 CVE 수 조회
        total = await CVEModel.find().count()
        
        # CVE 목록 조회 (페이지네이션 적용)
        items = await CVEModel.find().sort(-CVEModel.lastModifiedDate).skip(skip).limit(limit).to_list()
        
        return {
            "total": total,
            "items": items
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
