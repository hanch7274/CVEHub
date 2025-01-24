"""크롤러 관련 API 엔드포인트"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from ..models.user import User
from ..models.cve import CreateCVERequest
from ..services.cve import CVEService
from ..core.dependencies import get_cve_service
from ..core.auth import get_current_admin_user

router = APIRouter()

@router.post("/bulk-create")
async def bulk_create_cves(
    cves_data: List[CreateCVERequest],
    current_user: User = Depends(get_current_admin_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """여러 CVE를 일괄 생성합니다."""
    results = await cve_service.bulk_create_cves(
        cves_data,
        crawler_name=current_user.username
    )
    return results

@router.post("/bulk-update")
async def bulk_update_cves(
    cves_data: List[dict],
    current_user: User = Depends(get_current_admin_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """여러 CVE를 일괄 업데이트합니다."""
    results = await cve_service.bulk_update_cves(
        cves_data,
        crawler_name=current_user.username
    )
    return results 