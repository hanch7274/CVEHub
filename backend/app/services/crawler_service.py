"""크롤러 관련 비즈니스 로직을 처리하는 서비스 클래스"""
import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import asyncio

from app.models.cve_model import CreateCVERequest
from app.models.user import User
from app.services.cve_service import CVEService
from app.services.crawlers.nuclei_crawler import NucleiCrawlerService
from app.services.crawler_manager import CrawlerManager
from app.services.scheduler import CrawlerScheduler
from app.core.socketio_manager import socketio_manager, WSMessageType
from app.core.cache import get_cache, set_cache

logger = logging.getLogger(__name__)

class CrawlerService:
    """크롤러 관련 비즈니스 로직을 처리하는 서비스 클래스"""
    
    def __init__(self, cve_service: Optional[CVEService] = None):
        """
        CrawlerService 생성자
        
        Args:
            cve_service: CVE 서비스 인스턴스 (선택적)
        """
        self.cve_service = cve_service
        self.crawler_manager = CrawlerManager()
        self.scheduler = CrawlerScheduler()
    
    async def bulk_create_cves(self, cves_data: List[CreateCVERequest], crawler_name: str) -> Dict[str, Any]:
        """여러 CVE를 일괄 생성합니다.
        
        Args:
            cves_data: 생성할 CVE 데이터 목록
            crawler_name: 크롤러 이름 (사용자명)
            
        Returns:
            생성 결과 정보
        """
        if not self.cve_service:
            raise ValueError("CVE 서비스가 초기화되지 않았습니다.")
            
        try:
            logger.info(f"Bulk creating {len(cves_data)} CVEs by {crawler_name}")
            results = await self.cve_service.bulk_create_cves(cves_data, crawler_name=crawler_name)
            logger.info(f"Bulk create completed: {results}")
            return results
        except Exception as e:
            logger.error(f"Bulk create CVEs error: {str(e)}")
            raise

    async def bulk_update_cves(self, cves_data: List[dict], crawler_name: str) -> Dict[str, Any]:
        """여러 CVE를 일괄 업데이트합니다.
        
        Args:
            cves_data: 업데이트할 CVE 데이터 목록
            crawler_name: 크롤러 이름 (사용자명)
            
        Returns:
            업데이트 결과 정보
        """
        if not self.cve_service:
            raise ValueError("CVE 서비스가 초기화되지 않았습니다.")
            
        try:
            logger.info(f"Bulk updating {len(cves_data)} CVEs by {crawler_name}")
            results = await self.cve_service.bulk_update_cves(cves_data, crawler_name=crawler_name)
            logger.info(f"Bulk update completed: {results}")
            return results
        except Exception as e:
            logger.error(f"Bulk update CVEs error: {str(e)}")
            raise

    async def trigger_manual_crawl(self) -> Tuple[bool, str]:
        """수동 크롤링을 트리거합니다.
        
        Returns:
            (성공 여부, 메시지)
        """
        try:
            logger.info("Manually triggering crawl")
            crawler = NucleiCrawlerService()
            success = await crawler.crawl()
            
            if not success:
                logger.error("Manual crawling failed")
                return False, "크롤링에 실패했습니다."
            
            logger.info("Manual crawling completed successfully")
            return True, "크롤링이 성공적으로 완료되었습니다."
        except Exception as e:
            logger.error(f"Manual crawl error: {str(e)}")
            return False, f"크롤링 중 오류가 발생했습니다: {str(e)}"

    async def run_specific_crawler(self, crawler_type: str, user_id: str = None, quiet_mode: bool = False) -> Dict[str, Any]:
        """지정된 크롤러를 실행합니다.
        
        Args:
            crawler_type: 실행할 크롤러 유형
            user_id: 요청한 사용자 ID
            quiet_mode: 조용한 모드 활성화 여부
            
        Returns:
            실행 결과 정보
        """
        try:
            # 크롤러 가용성 확인
            available_crawlers = self.crawler_manager.get_available_crawlers()
            if crawler_type.lower() not in [c.lower() for c in available_crawlers]:
                logger.error(f"Invalid crawler type: {crawler_type}")
                return {
                    "success": False,
                    "message": f"유효하지 않은 크롤러 유형입니다. 사용 가능한 유형: {', '.join(available_crawlers)}"
                }
            
            # 이미 실행 중인지 확인
            if self.scheduler.is_update_running():
                current_status = self.scheduler.get_current_status()
                logger.warning(f"Crawler already running: {current_status.get('crawler_type')}")
                return {
                    "success": False,
                    "message": f"이미 {current_status.get('crawler_type')} 크롤러가 실행 중입니다 ({current_status.get('progress')}%)",
                    "status": "already_running",
                    "crawler_type": current_status.get('crawler_type'),
                    "progress": current_status.get('progress')
                }
            
            # 초기 진행 상황 메시지
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
            
            # 요청한 사용자에게 메시지 전송
            if user_id and not quiet_mode:
                await socketio_manager.send_to_user(user_id, init_message)
            
            # 백그라운드에서 크롤러 실행
            asyncio.create_task(self.scheduler.run_specific_crawler(crawler_type, user_id, quiet_mode))
            
            logger.info(f"{crawler_type} crawler started in background")
            return {
                "success": True,
                "message": f"{crawler_type} 크롤러가 백그라운드에서 실행 중입니다",
                "status": "running",
                "crawler_type": crawler_type
            }
        except Exception as e:
            logger.error(f"Run crawler error: {str(e)}")
            return {
                "success": False,
                "message": f"크롤러 실행 중 오류가 발생했습니다: {str(e)}"
            }

    async def get_crawler_status(self) -> Dict[str, Any]:
        """크롤러 상태 및 마지막 업데이트 정보를 조회합니다.
        
        Returns:
            상태 정보
        """
        try:
            return {
                "isRunning": self.scheduler.is_update_running(),
                "lastUpdate": self.scheduler.get_last_update(),
                "results": self.scheduler.get_update_results()
            }
        except Exception as e:
            logger.error(f"Get crawler status error: {str(e)}")
            raise

    async def get_db_status(self) -> Dict[str, Any]:
        """데이터베이스 초기화 상태를 확인합니다.
        
        Returns:
            DB 상태 정보
        """
        try:
            is_initialized = self.scheduler.is_db_initialized()
            
            if is_initialized:
                return {
                    "status": "initialized",
                    "message": "데이터베이스가 정상적으로 초기화되었습니다.",
                    "initialized": True
                }
            else:
                return {
                    "status": "not_initialized",
                    "message": "데이터베이스가 아직 초기화되지 않았습니다.",
                    "initialized": False
                }
        except Exception as e:
            logger.error(f"Get DB status error: {str(e)}")
            raise

    async def get_available_crawlers(self) -> Dict[str, Any]:
        """사용 가능한 크롤러 목록을 조회합니다.
        
        Returns:
            크롤러 목록 정보
        """
        try:
            available_crawlers = self.crawler_manager.get_available_crawlers()
            
            return {
                "crawlers": available_crawlers,
                "count": len(available_crawlers)
            }
        except Exception as e:
            logger.error(f"Get available crawlers error: {str(e)}")
            raise

    async def get_update_results(self, crawler_id: str) -> Dict[str, Any]:
        """특정 크롤러의 최근 업데이트 결과를 가져옵니다.
        
        Args:
            crawler_id: 크롤러 ID
            
        Returns:
            업데이트 결과
        """
        try:
            # 캐시에서 결과 조회
            cache_key = f"crawler_update_result:{crawler_id}"
            cached_result = await get_cache(cache_key)
            
            if cached_result:
                logger.info(f"Returning cached results for crawler: {crawler_id}")
                return {
                    "crawler_id": crawler_id,
                    "results": cached_result
                }
            
            # 캐시에 없으면 데이터베이스에서 조회 (필요시 구현)
            # ...
            
            logger.error(f"No update results found for crawler: {crawler_id}")
            return None
        except Exception as e:
            logger.error(f"Get update results error: {str(e)}")
            raise
