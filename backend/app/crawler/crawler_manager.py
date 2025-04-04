import logging
import asyncio
from typing import List, Dict, Optional, Any
from .crawler_base import BaseCrawlerService
from .crawler_base import LoggingMixin


logger = logging.getLogger(__name__)

class CrawlerManager(LoggingMixin):
    """
    다양한 크롤러를 관리하고 실행하는 매니저 클래스 (싱글톤)
    """
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(CrawlerManager, cls).__new__(cls)
            cls._instance._crawlers = {}
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self._initialize()
            self._initialized = True
    
    def _initialize(self):
        """
        크롤러 매니저를 초기화합니다.
        """
        # 등록된 모든 크롤러 유형에 대해 인스턴스 생성
        from .crawler_factory import CrawlerRegistry
        
        # 먼저 자동 발견 시도
        CrawlerRegistry.discover_crawlers()
        
        for crawler_type in CrawlerRegistry.get_registered_types():
            try:
                self._crawlers[crawler_type] = CrawlerRegistry.create_crawler(crawler_type)
                self.log_info(f"크롤러 초기화됨: {crawler_type}")
            except Exception as e:
                self.log_error(f"크롤러 초기화 실패: {crawler_type}", e)
    
    def get_available_crawlers(self) -> List[Dict[str, Any]]:
        """
        사용 가능한 크롤러 목록을 반환합니다.
        
        Returns:
            크롤러 정보 목록 (ID, 이름, 설명)
        """
        crawlers = []
        
        for crawler_id, crawler in self._crawlers.items():
            if not crawler:
                continue
                
            crawler_info = {
                "id": crawler_id,
                "name": getattr(crawler, "display_name", crawler_id),
                "description": getattr(crawler, "__doc__", "").strip() or None,
                "type": crawler.__class__.__name__
            }
            
            crawlers.append(crawler_info)
            
        return crawlers
    
    def get_crawler(self, crawler_type: str) -> Optional[BaseCrawlerService]:
        """
        지정된 유형의 크롤러를 반환합니다.
        
        Args:
            crawler_type: 크롤러 유형
            
        Returns:
            크롤러 인스턴스 또는 None
        """
        return self._crawlers.get(crawler_type.lower())
        
    def create_crawler(self, crawler_type: str) -> Optional[BaseCrawlerService]:
        """
        지정된 유형의 크롤러를 생성합니다. (하위 호환성을 위한 메서드)
        내부적으로 get_crawler 메서드를 호출합니다.
        
        Args:
            crawler_type: 크롤러 유형
            
        Returns:
            크롤러 인스턴스 또는 None
        """
        return self.get_crawler(crawler_type)
    
    async def run_crawler(self, crawler_type: str, user_id: Optional[str] = None, quiet_mode: bool = False) -> Dict[str, Any]:
        """
        지정된 크롤러를 실행합니다.
        
        Args:
            crawler_type: 실행할 크롤러 유형
            user_id: 요청자 ID (선택적)
            quiet_mode: 조용한 모드 활성화 여부
            
        Returns:
            실행 결과
        """
        try:
            crawler = self.get_crawler(crawler_type)
            if not crawler:
                self.log_warning(f"크롤러를 찾을 수 없음: {crawler_type}")
                return {
                    "success": False,
                    "message": f"크롤러를 찾을 수 없습니다: {crawler_type}",
                    "stage": "error"
                }
            
            # 사용자 ID 및 조용한 모드 설정
            if user_id:
                crawler.set_requester_id(user_id)
                
            crawler.set_quiet_mode(quiet_mode)
            
            # 크롤러 실행
            self.log_info(f"크롤러 실행 시작: {crawler_type}")
            result = await crawler.crawl()
            
            # 성공 여부 확인
            success = isinstance(result, dict) and result.get("stage") == "success"
            
            if success:
                self.log_info(f"크롤러 실행 성공: {crawler_type}")
                return {
                    "success": True,
                    "message": result.get("message", "크롤러가 성공적으로 실행되었습니다"),
                    "stage": "completed",
                    "crawler_type": crawler_type,
                    "result": result
                }
            else:
                self.log_warning(f"크롤러 실행 실패: {crawler_type}")
                return {
                    "success": False,
                    "message": result.get("message", "크롤러 실행 실패"),
                    "stage": "error",
                    "crawler_type": crawler_type,
                    "result": result
                }
                
        except Exception as e:
            self.log_error(f"크롤러 실행 중 오류: {crawler_type}", e)
            return {
                "success": False,
                "message": f"크롤러 실행 중 오류가 발생했습니다: {str(e)}",
                "stage": "error",
                "crawler_type": crawler_type
            }
    
    async def run_all_crawlers(self, user_id: Optional[str] = None, quiet_mode: bool = False) -> Dict[str, Dict[str, Any]]:
        """
        모든 크롤러를 실행합니다.
        
        Args:
            user_id: 요청자 ID (선택적)
            quiet_mode: 조용한 모드 활성화 여부
            
        Returns:
            각 크롤러의 실행 결과
        """
        results = {}
        
        # 모든 크롤러 비동기 실행
        tasks = []
        for crawler_type in self._crawlers.keys():
            task = asyncio.create_task(self.run_crawler(crawler_type, user_id, quiet_mode))
            tasks.append((crawler_type, task))
        
        # 모든 작업 완료 대기
        for crawler_type, task in tasks:
            try:
                result = await task
                results[crawler_type] = result
            except Exception as e:
                self.log_error(f"크롤러 실행 중 예외 발생: {crawler_type}", e)
                results[crawler_type] = {
                    "success": False,
                    "message": f"크롤러 실행 중 예외가 발생했습니다: {str(e)}",
                    "stage": "error",
                    "crawler_type": crawler_type
                }
        
        return results
    
    async def run_specific_crawlers(self, crawler_types: List[str], user_id: Optional[str] = None, quiet_mode: bool = False) -> Dict[str, Dict[str, Any]]:
        """
        지정된 크롤러들을 실행합니다.
        
        Args:
            crawler_types: 실행할 크롤러 유형 목록
            user_id: 요청자 ID (선택적)
            quiet_mode: 조용한 모드 활성화 여부
            
        Returns:
            각 크롤러의 실행 결과
        """
        results = {}
        
        # 지정된 크롤러 비동기 실행
        tasks = []
        for crawler_type in crawler_types:
            task = asyncio.create_task(self.run_crawler(crawler_type, user_id, quiet_mode))
            tasks.append((crawler_type, task))
        
        # 모든 작업 완료 대기
        for crawler_type, task in tasks:
            try:
                result = await task
                results[crawler_type] = result
            except Exception as e:
                self.log_error(f"크롤러 실행 중 예외 발생: {crawler_type}", e)
                results[crawler_type] = {
                    "success": False,
                    "message": f"크롤러 실행 중 예외가 발생했습니다: {str(e)}",
                    "stage": "error",
                    "crawler_type": crawler_type
                }
        
        return results
    
    async def crawl_single_cve(self, cve_id: str, crawler_type: str = "nuclei") -> Dict[str, Any]:
        """
        단일 CVE를 크롤링합니다.
        
        Args:
            cve_id: 크롤링할 CVE ID
            crawler_type: 사용할 크롤러 유형 (기본값: nuclei)
            
        Returns:
            크롤링 결과
        """
        try:
            crawler = self.get_crawler(crawler_type)
            if not crawler:
                self.log_warning(f"크롤러를 찾을 수 없음: {crawler_type}")
                return {
                    "success": False,
                    "message": f"크롤러를 찾을 수 없습니다: {crawler_type}",
                    "cve_id": cve_id
                }
            
            # 크롤러에 단일 CVE 크롤링 메서드가 있는지 확인
            if hasattr(crawler, 'crawl_single_cve') and callable(getattr(crawler, 'crawl_single_cve')):
                result = await crawler.crawl_single_cve(cve_id)
                return {
                    "success": True,
                    "message": f"CVE {cve_id} 크롤링 완료",
                    "cve_id": cve_id,
                    "result": result
                }
            else:
                self.log_warning(f"크롤러에 단일 CVE 크롤링 기능이 없습니다: {crawler_type}")
                return {
                    "success": False,
                    "message": f"크롤러에 단일 CVE 크롤링 기능이 없습니다: {crawler_type}",
                    "cve_id": cve_id
                }
        except Exception as e:
            self.log_error(f"단일 CVE 크롤링 중 오류: {cve_id}", e)
            return {
                "success": False,
                "message": f"단일 CVE 크롤링 중 오류가 발생했습니다: {str(e)}",
                "cve_id": cve_id
            }