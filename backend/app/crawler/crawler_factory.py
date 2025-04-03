import logging
from typing import Dict, List, Optional, Any, Type
from .crawler_base import BaseCrawlerService

logger = logging.getLogger(__name__)

class CrawlerRegistry:
    """
    크롤러 등록 및 관리를 위한 레지스트리 클래스
    """
    _registry = {}

    @classmethod
    def register(cls, crawler_type: str, crawler_class: Type[BaseCrawlerService]) -> None:
        """
        크롤러 클래스를 등록합니다.
        
        Args:
            crawler_type: 크롤러 유형 (소문자로 정규화됨)
            crawler_class: 크롤러 클래스 (BaseCrawlerService 상속)
        """
        cls._registry[crawler_type.lower()] = crawler_class
        logger.info(f"크롤러 등록: {crawler_type}")

    @classmethod
    def get_crawler_class(cls, crawler_type: str) -> Optional[Type[BaseCrawlerService]]:
        """
        등록된 크롤러 클래스를 반환합니다.
        
        Args:
            crawler_type: 크롤러 유형
            
        Returns:
            등록된 크롤러 클래스 또는 None
        """
        return cls._registry.get(crawler_type.lower())

    @classmethod
    def get_registered_types(cls) -> List[str]:
        """
        등록된 모든 크롤러 유형을 반환합니다.
        
        Returns:
            등록된 크롤러 유형 목록
        """
        return list(cls._registry.keys())

    @classmethod
    def create_crawler(cls, crawler_type: str) -> Optional[BaseCrawlerService]:
        """
        지정된 유형의 크롤러 인스턴스를 생성합니다.
        
        Args:
            crawler_type: 크롤러 유형
            
        Returns:
            생성된 크롤러 인스턴스 또는 None
        """
        crawler_class = cls.get_crawler_class(crawler_type)
        if not crawler_class:
            logger.warning(f"미등록 크롤러 유형: {crawler_type}")
            return None
            
        try:
            return crawler_class()
        except Exception as e:
            logger.error(f"크롤러 생성 오류: {str(e)}")
            return None

    @classmethod
    def discover_crawlers(cls) -> None:
        """
        자동으로 크롤러 클래스를 발견하고 등록합니다.
        현재 디렉토리의 크롤러 모듈을 검색합니다.
        """
        try:
            import importlib
            import inspect
            import pkgutil
            import app.crawler.crawlers as crawlers_pkg
            
            for _, modname, _ in pkgutil.iter_modules(crawlers_pkg.__path__):
                try:
                    module = importlib.import_module(f"app.crawler.crawlers.{modname}")
                    
                    for name, obj in inspect.getmembers(module):
                        if (inspect.isclass(obj) and 
                            issubclass(obj, BaseCrawlerService) and 
                            obj != BaseCrawlerService):
                            
                            # 크롤러 ID 추출 (클래스 이름에서 'CrawlerService' 제거)
                            crawler_id = name.replace('CrawlerService', '').lower()
                            cls.register(crawler_id, obj)
                            logger.info(f"자동 등록된 크롤러: {crawler_id} ({name})")
                            
                except Exception as e:
                    logger.error(f"모듈 {modname} 로딩 중 오류: {str(e)}")
        except Exception as e:
            logger.error(f"크롤러 자동 발견 중 오류: {str(e)}")