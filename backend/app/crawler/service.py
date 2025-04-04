"""크롤러 관련 비즈니스 로직을 처리하는 서비스 클래스"""
import logging
from typing import Dict, List, Any, Optional, Tuple
import asyncio

from app.cve.service import CVEService
from app.crawler.crawler_manager import CrawlerManager
from app.core.scheduler import CrawlerScheduler
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
        self.logger = logging.getLogger(__name__)
    
    async def run_specific_crawler(self, crawler_type: str, user_id: Optional[str] = None, quiet_mode: bool = False) -> Dict[str, Any]:
        """지정된 크롤러를 실행합니다.
        
        Args:
            crawler_type: 실행할 크롤러 유형
            user_id: 요청한 사용자 ID
            quiet_mode: 조용한 모드 활성화 여부
            
        Returns:
            실행 결과 정보
        """
        try:
            # 이미 실행 중인지 확인
            if self.scheduler.is_update_running():
                current_status = self.scheduler.get_current_status()
                self.logger.warning(f"Crawler already running: {current_status.get('crawler_type')}")
                return {
                    "success": False,
                    "message": f"이미 {current_status.get('crawler_type')} 크롤러가 실행 중입니다 ({current_status.get('progress')}%)",
                    "stage": "already_running",
                    "crawler_type": current_status.get('crawler_type'),
                    "progress": current_status.get('progress')
                }
            
            # 백그라운드에서 크롤러 실행
            asyncio.create_task(self.scheduler.run_specific_crawler(crawler_type, user_id, quiet_mode))
            
            self.logger.info(f"{crawler_type} crawler started in background")
            return {
                "success": True,
                "message": f"{crawler_type} 크롤러가 백그라운드에서 실행 중입니다",
                "stage": "running",
                "crawler_type": crawler_type
            }
        except Exception as e:
            self.logger.error(f"Run crawler error: {str(e)}")
            return {
                "success": False,
                "message": f"크롤러 실행 중 오류가 발생했습니다: {str(e)}",
                "stage": "error",
                "crawler_type": crawler_type if 'crawler_type' in locals() else "unknown"
            }

    async def get_crawler_status(self) -> Dict[str, Any]:
        """크롤러 상태 및 마지막 업데이트 정보를 조회합니다.
        
        Returns:
            상태 정보
        """
        return {
            "isRunning": self.scheduler.is_update_running(),
            "lastUpdate": self.scheduler.get_last_update(),
            "results": self.scheduler.get_update_results()
        }

    async def get_available_crawlers(self) -> Dict[str, Any]:
        """사용 가능한 크롤러 목록을 조회합니다.
        
        Returns:
            크롤러 목록 정보
        """
        available_crawlers = self.crawler_manager.get_available_crawlers()
        
        # 프론트엔드에 적합한 형식으로 변환
        formatted_crawlers = []
        for crawler in available_crawlers:
            formatted_crawlers.append({
                "id": crawler.get("id"),
                "name": crawler.get("name", crawler.get("id")),
                "description": crawler.get("description", ""),
                "type": crawler.get("type", "crawler"),
                "enabled": True
            })
            
        return {
            "crawlers": formatted_crawlers,
            "count": len(formatted_crawlers)
        }

    async def get_update_results(self, crawler_id: str) -> Optional[Dict[str, Any]]:
        """특정 크롤러의 최근 업데이트 결과를 가져옵니다.
        
        Args:
            crawler_id: 크롤러 ID
            
        Returns:
            업데이트 결과 또는 None
        """
        # 캐시에서 결과 조회
        cache_key = f"crawler_update_result:{crawler_id}"
        cached_result = await get_cache(cache_key)
        
        if cached_result:
            self.logger.info(f"Returning cached results for crawler: {crawler_id}")
            return {
                "crawler_id": crawler_id,
                "results": cached_result
            }
        
        # 데이터베이스 또는 스케줄러에서 결과 조회 시도
        scheduler_result = self.scheduler.get_crawler_result(crawler_id)
        if scheduler_result:
            return {
                "crawler_id": crawler_id,
                "results": scheduler_result
            }
        
        self.logger.warning(f"No update results found for crawler: {crawler_id}")
        return None
        
    async def run_all_crawlers(self, user_id: Optional[str] = None, quiet_mode: bool = False) -> Dict[str, Any]:
        """모든 사용 가능한 크롤러를 실행합니다.
        
        Args:
            user_id: 요청한 사용자 ID
            quiet_mode: 조용한 모드 활성화 여부
            
        Returns:
            실행 결과 정보
        """
        try:
            # 이미 실행 중인지 확인
            if self.scheduler.is_update_running():
                current_status = self.scheduler.get_current_status()
                self.logger.warning(f"Crawler already running: {current_status.get('crawler_type')}")
                return {
                    "success": False,
                    "message": f"이미 업데이트가 실행 중입니다 ({current_status.get('progress')}%)",
                    "stage": "already_running"
                }
            
            # 사용 가능한 크롤러 목록 가져오기
            available_crawlers = self.crawler_manager.get_available_crawlers()
            crawler_types = [crawler.get("id") for crawler in available_crawlers]
            
            if not crawler_types:
                return {
                    "success": False,
                    "message": "사용 가능한 크롤러가 없습니다",
                    "stage": "error"
                }
            
            # 백그라운드에서 모든 크롤러 실행
            asyncio.create_task(self.scheduler.run_all_crawlers(user_id, quiet_mode))
            
            self.logger.info(f"All crawlers ({len(crawler_types)}) started in background")
            return {
                "success": True,
                "message": f"모든 크롤러({len(crawler_types)}개)가 백그라운드에서 실행 중입니다",
                "stage": "running",
                "crawler_count": len(crawler_types)
            }
        except Exception as e:
            self.logger.error(f"Run all crawlers error: {str(e)}")
            return {
                "success": False,
                "message": f"크롤러 실행 중 오류가 발생했습니다: {str(e)}",
                "stage": "error"
            }