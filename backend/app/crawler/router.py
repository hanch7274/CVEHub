"""크롤러 관련 API 엔드포인트"""
import logging
import functools
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.models import User
from app.auth.service import get_current_admin_user, get_current_user
from app.core.dependencies import get_crawler_service
from app.crawler.service import CrawlerService
from app.crawler.schemas import (
    CrawlerResponse, 
    DBStatusResponse, 
    CrawlerStatusResponse, 
    CrawlerUpdateResult,
    AvailableCrawlers
)

# 로거 설정
logger = logging.getLogger(__name__)

router = APIRouter(tags=["crawler"])

def api_error_handler(func):
    """API 엔드포인트 예외 처리 데코레이터"""
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except HTTPException:
            # FastAPI HTTP 예외는 그대로 전달
            raise
        except Exception as e:
            # 로깅
            endpoint = func.__name__
            logger.error(f"Error in {endpoint}: {str(e)}")
            
            # 상세 오류 정보
            error_detail = f"{str(e)}"
            if settings.DEBUG:
                import traceback
                error_detail = f"{str(e)}\n{traceback.format_exc()}"
                
            # 표준화된 HTTP 예외 반환
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"서버 내부 오류가 발생했습니다: {error_detail}"
            )
    return wrapper

@router.post("/crawl", response_model=CrawlerResponse)
@api_error_handler
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
        stage="completed",
        crawler_type="nuclei"
    )

@router.post("/run/{crawler_type}", response_model=CrawlerResponse)
@api_error_handler
async def run_crawler(
    crawler_type: str,
    current_user: User = Depends(get_current_admin_user),
    crawler_service: CrawlerService = Depends(get_crawler_service)
):
    """지정된 크롤러를 실행합니다."""
    logger.info(f"Running crawler {crawler_type} by {current_user.username}")
    
    result = await crawler_service.run_specific_crawler(
        crawler_type=crawler_type,
        user_id=str(current_user.id),
        quiet_mode=False
    )
    
    if not result.get("success"):
        # 이미 실행 중인 경우는 별도 처리
        if result.get("stage") == "already_running":
            return CrawlerResponse(
                message=result.get("message"),
                stage=result.get("stage"),
                crawler_type=result.get("crawler_type")
            )
            
        # 오류 응답
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("message")
        )
    
    return CrawlerResponse(
        message=result.get("message"),
        stage=result.get("stage"),
        crawler_type=result.get("crawler_type")
    )

@router.get("/status", response_model=CrawlerStatusResponse)
@api_error_handler
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

@router.get("/db-status", response_model=DBStatusResponse)
@api_error_handler
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
    logger.info(f"Getting DB status for admin user {current_user.username}")
    
    status_result = await crawler_service.get_db_status()
    
    return DBStatusResponse(
        status=status_result.get("status"),
        message=status_result.get("message"),
        initialized=status_result.get("initialized")
    )

@router.get("/available", response_model=AvailableCrawlers)
@api_error_handler
async def get_available_crawlers(
    current_user: User = Depends(get_current_user),
    crawler_service: CrawlerService = Depends(get_crawler_service)
):
    """사용 가능한 크롤러 목록을 조회합니다."""
    logger.info(f"Getting available crawlers for user {current_user.username}")
    
    result = await crawler_service.get_available_crawlers()
    
    return AvailableCrawlers(
        crawlers=result.get("crawlers"),
        count=result.get("count")
    )

@router.get("/results/{crawler_id}", response_model=CrawlerUpdateResult)
@api_error_handler
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
