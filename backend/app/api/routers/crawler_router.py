"""크롤러 관련 API 엔드포인트"""
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

from app.models.user import User
from app.models.cve_model import CreateCVERequest
from app.core.auth import get_current_admin_user, get_current_user
from app.core.dependencies import get_cve_service, get_crawler_service
from app.services.cve_service import CVEService
from app.services.crawler_service import CrawlerService
from app.schemas.crawler import (
    CrawlerResponse, 
    DBStatusResponse, 
    CrawlerStatusResponse, 
    UpdatedCVEList, 
    CrawlerUpdateResult,
    AvailableCrawlers
)

# 로거 설정
logger = logging.getLogger(__name__)

router = APIRouter(tags=["crawler"])

@router.post("/bulk-create")
async def bulk_create_cves(
    cves_data: List[CreateCVERequest],
    current_user: User = Depends(get_current_admin_user),
    crawler_service: CrawlerService = Depends(get_crawler_service)
):
    """여러 CVE를 일괄 생성합니다.
    
    Args:
        cves_data: 생성할 CVE 데이터 목록
        current_user: 현재 인증된 관리자 사용자
        crawler_service: 크롤러 서비스 인스턴스
        
    Returns:
        생성 결과 정보
    """
    try:
        logger.info(f"Bulk creating {len(cves_data)} CVEs by {current_user.username}")
        
        results = await crawler_service.bulk_create_cves(
            cves_data=cves_data,
            crawler_name=current_user.username
        )
        
        return results
    except Exception as e:
        logger.error(f"Error in bulk create CVEs: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"CVE 일괄 생성 중 오류가 발생했습니다: {str(e)}"
        )

@router.post("/bulk-update")
async def bulk_update_cves(
    cves_data: List[dict],
    current_user: User = Depends(get_current_admin_user),
    crawler_service: CrawlerService = Depends(get_crawler_service)
):
    """여러 CVE를 일괄 업데이트합니다.
    
    Args:
        cves_data: 업데이트할 CVE 데이터 목록
        current_user: 현재 인증된 관리자 사용자
        crawler_service: 크롤러 서비스 인스턴스
        
    Returns:
        업데이트 결과 정보
    """
    try:
        logger.info(f"Bulk updating {len(cves_data)} CVEs by {current_user.username}")
        
        results = await crawler_service.bulk_update_cves(
            cves_data=cves_data,
            crawler_name=current_user.username
        )
        
        return results
    except Exception as e:
        logger.error(f"Error in bulk update CVEs: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"CVE 일괄 업데이트 중 오류가 발생했습니다: {str(e)}"
        )

@router.post("/crawl", response_model=CrawlerResponse)
async def trigger_crawl(
    current_user: User = Depends(get_current_admin_user),
    crawler_service: CrawlerService = Depends(get_crawler_service)
):
    """수동 크롤링을 트리거합니다.
    
    Args:
        current_user: 현재 인증된 관리자 사용자
        crawler_service: 크롤러 서비스 인스턴스
        
    Returns:
        크롤링 실행 결과
    """
    try:
        logger.info(f"Manual crawl triggered by {current_user.username}")
        
        success, message = await crawler_service.trigger_manual_crawl()
        
        if not success:
            logger.error(f"Manual crawling failed: {message}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=message
            )
        
        return CrawlerResponse(
            message="크롤링이 성공적으로 완료되었습니다",
            status="completed",
            crawler_type="nuclei"
        )
    except Exception as e:
        logger.error(f"Error in trigger crawl: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"크롤링 트리거 중 오류가 발생했습니다: {str(e)}"
        )

@router.post("/run/{crawler_type}", response_model=CrawlerResponse)
async def run_crawler(
    crawler_type: str,
    current_user: User = Depends(get_current_admin_user),
    crawler_service: CrawlerService = Depends(get_crawler_service)
):
    """지정된 크롤러를 실행합니다.
    
    Args:
        crawler_type: 실행할 크롤러 유형(nuclei 등)
        current_user: 현재 인증된 관리자 사용자
        crawler_service: 크롤러 서비스 인스턴스
        
    Returns:
        크롤러 실행 결과
    """
    try:
        logger.info(f"Running crawler {crawler_type} by {current_user.username}")
        
        result = await crawler_service.run_specific_crawler(
            crawler_type=crawler_type,
            user_id=str(current_user.id),
            quiet_mode=False
        )
        
        if not result.get("success"):
            logger.error(f"Failed to run crawler: {result.get('message')}")
            
            # 이미 실행 중인 경우는 별도 처리
            if result.get("status") == "already_running":
                return CrawlerResponse(
                    message=result.get("message"),
                    status=result.get("status"),
                    crawler_type=result.get("crawler_type")
                )
                
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result.get("message")
            )
        
        return CrawlerResponse(
            message=result.get("message"),
            status=result.get("status"),
            crawler_type=result.get("crawler_type")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in run crawler: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"크롤러 실행 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/status", response_model=CrawlerStatusResponse)
async def get_crawler_status(
    current_user: User = Depends(get_current_user),
    crawler_service: CrawlerService = Depends(get_crawler_service)
):
    """크롤러 상태 및 마지막 업데이트 시간을 조회합니다.
    
    Args:
        current_user: 현재 인증된 사용자
        crawler_service: 크롤러 서비스 인스턴스
        
    Returns:
        크롤러 상태 정보
    """
    try:
        logger.info(f"Getting crawler status for user {current_user.username}")
        
        crawler_status = await crawler_service.get_crawler_status()
        
        # lastUpdate가 딕셔너리인 경우 처리
        last_update = crawler_status.get("lastUpdate")
        if isinstance(last_update, dict):
            # 딕셔너리에서 첫 번째 값을 사용하거나 None 반환
            if last_update and len(last_update) > 0:
                # 첫 번째 크롤러의 업데이트 시간 사용
                first_crawler = next(iter(last_update))
                last_update = last_update[first_crawler]
            else:
                last_update = None
        
        return CrawlerStatusResponse(
            isRunning=crawler_status.get("isRunning"),
            lastUpdate=last_update,
            results=crawler_status.get("results")
        )
    except Exception as e:
        logger.error(f"Error getting crawler status: {str(e)}")
        error_status = status.HTTP_500_INTERNAL_SERVER_ERROR
        raise HTTPException(
            status_code=error_status,
            detail=f"크롤러 상태 조회 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/db-status", response_model=DBStatusResponse)
async def get_db_status(
    current_user: User = Depends(get_current_admin_user),
    crawler_service: CrawlerService = Depends(get_crawler_service)
):
    """데이터베이스 초기화 상태를 확인합니다.
    
    Args:
        current_user: 현재 인증된 관리자 사용자
        crawler_service: 크롤러 서비스 인스턴스
        
    Returns:
        데이터베이스 상태 정보
    """
    try:
        logger.info(f"Getting DB status for admin user {current_user.username}")
        
        status_result = await crawler_service.get_db_status()
        
        return DBStatusResponse(
            status=status_result.get("status"),
            message=status_result.get("message"),
            initialized=status_result.get("initialized")
        )
    except Exception as e:
        logger.error(f"Error getting DB status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"데이터베이스 상태 조회 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/available", response_model=AvailableCrawlers)
async def get_available_crawlers(
    current_user: User = Depends(get_current_user),
    crawler_service: CrawlerService = Depends(get_crawler_service)
):
    """사용 가능한 크롤러 목록을 조회합니다.
    
    Args:
        current_user: 현재 인증된 사용자
        crawler_service: 크롤러 서비스 인스턴스
        
    Returns:
        사용 가능한 크롤러 목록
    """
    try:
        logger.info(f"Getting available crawlers for user {current_user.username}")
        
        result = await crawler_service.get_available_crawlers()
        
        return AvailableCrawlers(
            crawlers=result.get("crawlers"),
            count=result.get("count")
        )
    except Exception as e:
        logger.error(f"Error getting available crawlers: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"크롤러 목록 조회 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/results/{crawler_id}", response_model=CrawlerUpdateResult)
async def get_update_results(
    crawler_id: str,
    current_user: User = Depends(get_current_user),
    crawler_service: CrawlerService = Depends(get_crawler_service)
):
    """특정 크롤러의 최근 업데이트 결과를 가져옵니다.
    
    Args:
        crawler_id: 크롤러 ID
        current_user: 현재 인증된 사용자
        crawler_service: 크롤러 서비스 인스턴스
        
    Returns:
        업데이트 결과
    """
    try:
        logger.info(f"Getting update results for crawler {crawler_id}, user {current_user.username}")
        
        results = await crawler_service.get_update_results(crawler_id)
        
        if not results:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"크롤러 ID '{crawler_id}'에 대한 업데이트 결과를 찾을 수 없습니다"
            )
        
        return CrawlerUpdateResult(
            crawler_id=results.get("crawler_id"),
            results=results.get("results")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting update results: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"업데이트 결과 조회 중 오류가 발생했습니다: {str(e)}"
        )
