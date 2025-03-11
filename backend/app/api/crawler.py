"""크롤러 관련 API 엔드포인트"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any, Optional
from ..models.user import User
from ..models.cve_model import CreateCVERequest
from ..services.cve_service import CVEService
from ..core.dependencies import get_cve_service
from ..core.auth import get_current_admin_user, get_current_user
from ..services.crawlers.nuclei_crawler import NucleiCrawlerService
import asyncio
import logging
from datetime import datetime
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# 응답 모델 정의
class CrawlerResponse(BaseModel):
    message: str
    status: str
    crawler_type: Optional[str] = None
    timestamp: datetime = datetime.now()

class DBStatusResponse(BaseModel):
    status: str
    message: str
    initialized: bool

class CrawlerStatusResponse(BaseModel):
    isRunning: bool
    lastUpdate: Dict[str, Any]
    results: Optional[Dict[str, Any]] = None

class UpdatedCVE(BaseModel):
    cve_id: str
    title: str
    created_at: Optional[datetime] = None

class UpdatedCVEList(BaseModel):
    count: int
    items: List[UpdatedCVE]

class CrawlerUpdateResult(BaseModel):
    crawler_id: str
    results: Dict[str, Any]

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
async def trigger_crawl(current_user: User = Depends(get_current_admin_user)):
    """수동 크롤링 트리거"""
    crawler = NucleiCrawlerService()
    success = await crawler.crawl()
    
    if not success:
        raise HTTPException(status_code=500, detail="Crawling failed")
        
    return CrawlerResponse(
        message="Crawling completed successfully",
        status="completed",
        crawler_type="nuclei"
    )

@router.post("/run/{crawler_type}")
async def run_crawler(
    crawler_type: str,
    current_user: User = Depends(get_current_admin_user)
):
    """
    지정된 크롤러 실행
    
    Args:
        crawler_type: 실행할 크롤러 유형(nuclei 등)
    """
    from ..services.crawler_manager import CrawlerManager
    from ..services.scheduler import CrawlerScheduler
    
    manager = CrawlerManager()
    scheduler = CrawlerScheduler()
    
    # 유효성 검사
    if crawler_type not in [c.lower() for c in manager.get_available_crawlers()]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 크롤러 유형입니다. 사용 가능한 유형: {', '.join(manager.get_available_crawlers())}"
        )
    
    # 이미 실행 중인지 확인
    if scheduler.is_update_running():
        # 진행 중인 작업 정보 반환
        current_status = scheduler.get_current_status()
        return {
            "message": f"이미 {current_status.get('crawler_type')} 크롤러가 실행 중입니다 ({current_status.get('progress')}%)",
            "status": "already_running",
            "crawler_type": current_status.get('crawler_type'),
            "progress": current_status.get('progress')
        }
    
    # 초기 진행 상황을 WebSocket으로 즉시 브로드캐스트
    from ..core.socketio_manager import socketio_manager, WSMessageType
    
    # 진행 메시지 준비
    init_message = {
        "type": WSMessageType.CRAWLER_UPDATE_PROGRESS,
        "data": {
            "crawler": crawler_type,
            "stage": "준비",
            "percent": 0,
            "message": f"{crawler_type} 업데이트를 시작합니다.",
            "timestamp": datetime.now().isoformat(),
            "isRunning": True
        }
    }
    
    # 요청한 사용자에게만 메시지 전송
    user_id = str(current_user.id)
    await socketio_manager.send_to_user(user_id, init_message)
    
    # 사용자 ID를 포함하여 백그라운드에서 크롤러 시작 (조용한 모드 비활성화)
    # 사용자 요청이므로 웹소켓 메시지가 전송되어야 함
    asyncio.create_task(scheduler.run_specific_crawler(crawler_type, user_id, quiet_mode=False))
    
    # 즉시 응답 반환
    return CrawlerResponse(
        message=f"{crawler_type} 크롤러가 백그라운드에서 실행 중입니다",
        status="running",
        crawler_type=crawler_type
    )

@router.get("/status", response_model=CrawlerStatusResponse)
async def get_crawler_status(
    current_user: User = Depends(get_current_user)
):
    """
    크롤러 상태 및 마지막 업데이트 시간 조회
    
    - 실행 중 여부
    - 크롤러별 마지막 업데이트 시간
    - 마지막 업데이트 결과
    """
    from ..services.scheduler import CrawlerScheduler
    scheduler = CrawlerScheduler()
    
    # 마지막 업데이트 결과도 같이 반환
    return CrawlerStatusResponse(
        isRunning=scheduler.is_update_running(),
        lastUpdate=scheduler.get_last_update(),
        results=scheduler.get_update_results()
    )

@router.get("/db-status", response_model=DBStatusResponse)
async def get_db_status(
    current_user: User = Depends(get_current_admin_user)
):
    """
    데이터베이스 초기화 상태 확인
    
    - 데이터베이스 연결 상태
    - 초기화 여부
    """
    from ..services.scheduler import CrawlerScheduler
    scheduler = CrawlerScheduler()
    
    # DB 상태 확인
    is_initialized = scheduler.is_db_initialized()
    
    if is_initialized:
        return DBStatusResponse(
            status="initialized",
            message="데이터베이스가 정상적으로 초기화되었습니다.",
            initialized=True
        )
    else:
        return DBStatusResponse(
            status="not_initialized",
            message="데이터베이스가 아직 초기화되지 않았습니다.",
            initialized=False
        )

@router.get("/available-crawlers")
async def get_available_crawlers(
    current_user: User = Depends(get_current_user)
):
    """
    사용 가능한 크롤러 목록 조회
    """
    from ..services.crawler_manager import CrawlerManager
    manager = CrawlerManager()
    
    return {
        "crawlers": manager.get_available_crawlers(),
        "count": len(manager.get_available_crawlers())
    }

@router.get("/update-results/{crawler_id}", response_model=CrawlerUpdateResult)
async def get_update_results(
    crawler_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    특정 크롤러의 최근 업데이트 결과를 가져옵니다.
    """
    try:
        from app.core.cache import get_cache
        
        # 캐시에서 결과 조회
        cache_key = f"crawler_update_result:{crawler_id}"
        cached_result = await get_cache(cache_key)
        
        if cached_result:
            return cached_result
        
        # 캐시에 없으면 데이터베이스에서 조회 (필요시 구현)
        # ...
        
        raise HTTPException(
            status_code=404,
            detail=f"No recent update results for crawler: {crawler_id}"
        )
    except Exception as e:
        logger.error(f"업데이트 결과 조회 오류: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving update results: {str(e)}"
        ) 