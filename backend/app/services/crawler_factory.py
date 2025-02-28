import logging
from typing import Dict, List, Optional, Any, Type
from .crawler_base import BaseCrawlerService

from .crawlers.nuclei_crawler import NucleiCrawlerService
from .crawlers.emerging_threats_crawler import EmergingThreatsCrawlerService

logger = logging.getLogger(__name__)

class CrawlerFactory:
    """
    크롤러 생성 팩토리 클래스
    필요에 따라 동적으로 크롤러 인스턴스를 생성합니다.
    """
    
    @staticmethod
    def get_available_crawler_types() -> List[str]:
        """사용 가능한 크롤러 유형 목록 반환"""
        return ["nuclei", "emerging_threats"]
    
    @classmethod
    def create_crawler(cls, crawler_type: str) -> Optional[BaseCrawlerService]:
        """
        크롤러 인스턴스를 동적으로 생성
        
        Args:
            crawler_type: 생성할 크롤러 유형
            
        Returns:
            생성된 크롤러 인스턴스 또는 None (오류 발생 시)
        """
        crawler_type = crawler_type.lower()
        
        try:
            if crawler_type == "nuclei":
                # 동적 임포트로 순환 참조 방지
                logger.info("NucleiCrawlerService 인스턴스 생성")
                return NucleiCrawlerService()
            
            # EmergingThreats 크롤러 추가
            elif crawler_type == "emerging_threats":
                logger.info("EmergingThreatsCrawlerService 인스턴스 생성")
                return EmergingThreatsCrawlerService()
            
            # 향후 메타스플로잇 크롤러 추가 시
            # elif crawler_type == "metasploit":
            #     from .crawlers.metasploit_crawler import MetasploitCrawlerService
            #     return MetasploitCrawlerService()
            
            else:
                logger.warning(f"Unknown crawler type: {crawler_type}")
                return None
                
        except ImportError as e:
            logger.error(f"Failed to import crawler module for {crawler_type}: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Error creating {crawler_type} crawler: {str(e)}")
            return None
    
    @classmethod
    def register_crawler_type(cls, type_name: str, module_path: str) -> bool:
        """
        새로운 크롤러 유형 등록 (런타임에 동적으로 등록 가능)
        
        Args:
            type_name: 등록할 크롤러 유형 이름
            module_path: 크롤러 클래스의 모듈 경로
            
        Returns:
            bool: 등록 성공 여부
        """
        try:
            # 이 메소드는 향후 동적 등록을 위한 준비입니다
            # 현재는 get_available_crawler_types와 create_crawler에서 하드코딩됩니다
            logger.info(f"Registered new crawler type: {type_name} -> {module_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to register crawler type {type_name}: {str(e)}")
            return False 