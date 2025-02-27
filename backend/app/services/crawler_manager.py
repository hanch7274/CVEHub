import logging
import asyncio
from typing import List, Dict, Optional, Tuple, Any
from .crawler_base import BaseCrawlerService
from .crawler_factory import CrawlerFactory
from .crawler_base import LoggingMixin
from .crawlers.nuclei_crawler import NucleiCrawlerService


logger = logging.getLogger(__name__)

class CrawlerManager(LoggingMixin):
    """
    다양한 크롤러를 관리하고 실행하는 매니저 클래스 (싱글톤)
    """
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(CrawlerManager, cls).__new__(cls)
            cls._instance.crawlers = {}
            cls._instance._original_case_map = {}
            cls._instance._initialized = False
            
            # try-except로 팩토리 초기화 오류 처리
            try:
                cls._instance.factory = CrawlerFactory()
                cls._instance.log_info("크롤러 팩토리 초기화 성공")
            except Exception as e:
                cls._instance.log_error(f"크롤러 팩토리 초기화 실패: {str(e)}")
                # 최소한의 빈 팩토리 객체 생성
                cls._instance.factory = type('EmptyCrawlerFactory', (), {'create_crawler': lambda *args: None})()
                
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self._initialize_crawlers()
            self._initialized = True
        
    def _initialize_crawlers(self):
        """사용 가능한 모든 크롤러 유형으로 인스턴스를 초기화합니다."""
        from .crawler_factory import CrawlerFactory  # 순환 참조 방지를 위해 지연 임포트
        
        successful_crawlers = 0
        failed_crawlers = 0
        
        for crawler_type in CrawlerFactory.get_available_crawler_types():
            try:
                # 원본 케이스 저장
                self._original_case_map[crawler_type.lower()] = crawler_type
                self.crawlers[crawler_type.lower()] = CrawlerFactory.create_crawler(crawler_type)
                logger.info(f"Initialized crawler: {crawler_type}")
                successful_crawlers += 1
            except Exception as e:
                logger.error(f"Failed to initialize {crawler_type} crawler: {str(e)}")
                failed_crawlers += 1
                # 크롤러 초기화 실패 시에도 계속 진행
                continue
        
        logger.info(f"Crawler initialization completed: {successful_crawlers} successful, {failed_crawlers} failed")
        
        if successful_crawlers == 0 and failed_crawlers > 0:
            logger.warning("All crawlers failed to initialize. Some features may not work correctly.")
    
    async def crawl_all(self) -> Dict[str, bool]:
        """
        모든 크롤러를 실행합니다.
        
        Returns:
            Dict[str, bool]: 각 크롤러의 실행 결과
        """
        results = {}
        
        for crawler_type, crawler in self.crawlers.items():
            try:
                logger.info(f"Starting crawler: {crawler_type}")
                success = await crawler.crawl()
                results[crawler_type] = success
                logger.info(f"Crawler {crawler_type} finished with success: {success}")
            except Exception as e:
                logger.error(f"Error running {crawler_type} crawler: {str(e)}")
                results[crawler_type] = False
                
        return results
    
    async def crawl_specific(self, crawler_types: List[str]) -> Dict[str, bool]:
        """
        지정된 크롤러들만 실행합니다.
        
        Args:
            crawler_types: 실행할 크롤러 유형 목록
            
        Returns:
            Dict[str, bool]: 각 크롤러의 실행 결과
        """
        results = {}
        
        for crawler_type in crawler_types:
            crawler = self.crawlers.get(crawler_type.lower())
            if not crawler:
                logger.warning(f"Crawler type not found: {crawler_type}")
                results[crawler_type] = False
                continue
                
            try:
                logger.info(f"Starting specific crawler: {crawler_type}")
                success = await crawler.crawl()
                results[crawler_type] = success
                logger.info(f"Crawler {crawler_type} finished with success: {success}")
            except Exception as e:
                logger.error(f"Error running {crawler_type} crawler: {str(e)}")
                results[crawler_type] = False
                
        return results
    
    async def crawl_single_cve(self, cve_id: str, crawler_type: str = "nuclei") -> bool:
        """
        단일 CVE를 크롤링합니다.
        
        Args:
            cve_id: 크롤링할 CVE ID
            crawler_type: 사용할 크롤러 유형 (기본값: nuclei)
            
        Returns:
            bool: 크롤링 성공 여부
        """
        crawler = self.crawlers.get(crawler_type.lower())
        if not crawler:
            logger.warning(f"Crawler type not found for single CVE crawl: {crawler_type}")
            return False
            
        try:
            # 크롤러에 crawl_single_cve 메서드가 있는지 확인
            if hasattr(crawler, 'crawl_single_cve') and callable(getattr(crawler, 'crawl_single_cve')):
                return await crawler.crawl_single_cve(cve_id)
            else:
                logger.error(f"Crawler {crawler_type} doesn't support single CVE crawling")
                return False
        except Exception as e:
            logger.error(f"Error in crawl_single_cve for {cve_id}: {str(e)}")
            return False
    
    def get_available_crawlers(self) -> List[str]:
        """사용 가능한 크롤러 목록을 반환합니다."""
        # 원본 케이스의 크롤러 이름 반환
        return list(self._original_case_map.values())
        
    def add_crawler(self, crawler_type: str) -> bool:
        """
        새 크롤러를 매니저에 추가합니다.
        
        Args:
            crawler_type: 추가할 크롤러 유형
            
        Returns:
            bool: 추가 성공 여부
        """
        try:
            self._original_case_map[crawler_type.lower()] = crawler_type
            self.crawlers[crawler_type.lower()] = CrawlerFactory.create_crawler(crawler_type)
            return True
        except Exception as e:
            logger.error(f"Failed to add crawler {crawler_type}: {str(e)}")
            return False

    async def run_crawler(self, crawler_type: str) -> Tuple[bool, str, Optional[List[Dict[str, str]]]]:
        """특정 크롤러 실행
        
        Args:
            crawler_type: 실행할 크롤러 유형
            
        Returns:
            Tuple[bool, str, Optional[List[Dict]]]: 성공 여부, 메시지, 업데이트된 데이터
        """
        try:
            # 크롤러 유형 이름 정규화
            crawler_type = crawler_type.lower()
            
            self.log_info(f"Attempting to run crawler: {crawler_type}")
            
            # 크롤러 유형 확인
            if crawler_type not in [t.lower() for t in self.get_available_crawlers()]:
                self.log_warning(f"Unknown crawler type: {crawler_type}")
                return False, f"Unknown crawler type: {crawler_type}", None
            
            # 크롤러 인스턴스 생성
            crawler = self.crawlers[crawler_type]
            if not crawler:
                self.log_error(f"Failed to create crawler instance for type: {crawler_type}")
                return False, f"Failed to create crawler instance for type: {crawler_type}", None
            
            # 크롤러 실행
            self.log_info(f"Running crawler: {crawler_type}")
            success = await crawler.crawl()
            
            # 결과 로깅
            if success:
                self.log_info(f"Crawler {crawler_type} completed successfully")
                
                # 업데이트된 CVE 데이터 조회
                from ..models.cve_model import CVEModel
                updated_cves = await CVEModel.find().sort("-created_at").limit(20).to_list()
                
                # 간소화된 CVE 정보만 반환
                simplified_cves = []
                for cve in updated_cves:
                    simplified_cves.append({
                        "cve_id": cve.cve_id,
                        "title": cve.title,
                        "created_at": cve.created_at
                    })
                
                return True, f"Crawler {crawler_type} completed successfully", simplified_cves
            else:
                self.log_warning(f"Crawler {crawler_type} failed")
                return False, f"Crawler {crawler_type} failed", None
                
        except Exception as e:
            self.log_error(f"Error running crawler {crawler_type}", e)
            return False, f"Error running crawler: {str(e)}", None
            
    async def run_all_crawlers(self) -> Dict[str, bool]:
        """모든 크롤러 동시 실행
        
        Returns:
            Dict[str, bool]: 크롤러별 성공 여부
        """
        results = {}
        types = self.get_available_crawlers()
        
        if not types:
            self.log_warning("No registered crawlers found")
            return {}
            
        self.log_info(f"Running all {len(types)} crawlers")
        
        # 병렬 실행을 위한 작업 리스트
        tasks = []
        for crawler_type in types:
            task = asyncio.create_task(self.run_crawler(crawler_type))
            tasks.append((crawler_type, task))
        
        # 모든 작업이 완료될 때까지 대기
        for crawler_type, task in tasks:
            try:
                success, _, _ = await task
                results[crawler_type] = success
            except Exception as e:
                self.log_error(f"Error running crawler {crawler_type}", e)
                results[crawler_type] = False
        
        return results

    def create_crawler(self, crawler_type: str) -> Optional[BaseCrawlerService]:
        """크롤러 인스턴스 생성 - 팩토리 위임 메소드"""
        return self.factory.create_crawler(crawler_type) 