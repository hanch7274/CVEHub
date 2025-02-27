"""
CVE 관련 API 엔드포인트 - 캐싱 적용
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Path
from typing import List, Dict, Any, Optional
from ..models.user import User
from ..core.auth import get_current_user
from ..services.cve_service import CVEService
from ..core.dependencies import get_cve_service
from ..core.cache import (
    get_cache, set_cache, cache_cve_detail, cache_cve_list, 
    invalidate_cve_caches, CACHE_KEY_PREFIXES
)
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/list")
async def get_cve_list(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    severity: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    CVE 목록을 가져옵니다 (캐싱 적용)
    """
    # 쿼리 파라미터로 캐시 키 생성
    query_params = {
        "page": page,
        "limit": limit,
        "severity": severity or "",
        "search": search or ""
    }
    
    cache_key = f"{CACHE_KEY_PREFIXES['cve_list']}{page}_{limit}_{severity or 'all'}_{search or 'none'}"
    
    # 캐시에서 먼저 조회
    cached_data = await get_cache(cache_key)
    if cached_data:
        logger.debug(f"캐시에서 CVE 목록 로드: {cache_key}")
        return cached_data
    
    # 캐시에 없으면 DB에서 조회
    result = await cve_service.get_cve_list(
        page=page, 
        limit=limit,
        severity=severity,
        search=search
    )
    
    # 결과 캐싱
    await cache_cve_list(query_params, result)
    
    return result

@router.get("/{cve_id}")
async def get_cve_detail(
    cve_id: str = Path(..., description="조회할 CVE ID"),
    bypass_cache: bool = Query(False, description="캐시 우회 여부"),
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    CVE 상세 정보를 가져옵니다 (캐싱 적용)
    """
    cache_key = f"{CACHE_KEY_PREFIXES['cve_detail']}{cve_id}"
    
    # 캐시 우회 옵션이 없으면 캐시에서 조회
    if not bypass_cache:
        cached_data = await get_cache(cache_key)
        if cached_data:
            logger.debug(f"캐시에서 CVE 상세 정보 로드: {cache_key}")
            return cached_data
    
    # 캐시에 없거나 우회 옵션이 설정된 경우 DB에서 조회
    result = await cve_service.get_cve_detail(cve_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"CVE ID {cve_id} not found")
    
    # 결과 캐싱
    await cache_cve_detail(cve_id, result)
    
    return result

@router.put("/{cve_id}")
async def update_cve(
    cve_id: str,
    cve_data: dict,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    CVE 정보를 업데이트합니다 (캐시 무효화 포함)
    """
    updated = await cve_service.update_cve(cve_id, cve_data, current_user)
    
    if updated:
        # 캐시 무효화
        await invalidate_cve_caches(cve_id)
        
        # 웹소켓 이벤트 발송 (이미 구현되어 있다고 가정)
        from ..core.websocket import manager
        await manager.broadcast_json({
            "type": "cve_updated",
            "data": {
                "cveId": cve_id,
                "updatedBy": current_user.username
            }
        })
    
    return {"success": updated, "message": "CVE updated successfully"} 