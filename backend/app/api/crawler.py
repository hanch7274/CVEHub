"""크롤러 관련 API 엔드포인트"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from ..models.user import User
from ..models.cve_model import CreateCVERequest
from ..services.cve_service import CVEService
from ..core.dependencies import get_cve_service
from ..core.auth import get_current_admin_user, get_current_user
from ..services.crawler import NucleiCrawlerService

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

@router.post("/crawl")
async def trigger_crawl(current_user: User = Depends(get_current_user)):
    """수동 크롤링 트리거"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
        
    crawler = NucleiCrawlerService()
    success = await crawler.crawl()
    
    if not success:
        raise HTTPException(status_code=500, detail="Crawling failed")
        
    return {"message": "Crawling completed successfully"} 