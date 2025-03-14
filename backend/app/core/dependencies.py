from functools import lru_cache
from ..services.user import UserService
from ..services.cve_service import CVEService
from ..services.notification import NotificationService
from ..services.update_history_service import UpdateHistoryService
from ..services.crawler_service import CrawlerService

@lru_cache()
def get_user_service() -> UserService:
    """UserService 인스턴스를 반환합니다."""
    return UserService()

@lru_cache()
def get_cve_service() -> CVEService:
    """CVEService 인스턴스를 반환합니다."""
    return CVEService()

@lru_cache()
def get_notification_service() -> NotificationService:
    """NotificationService 인스턴스를 반환합니다."""
    return NotificationService() 

@lru_cache()
def get_update_history_service() -> UpdateHistoryService:
    """UpdateHistoryService 인스턴스를 반환합니다."""
    return UpdateHistoryService()

@lru_cache()
def get_crawler_service() -> CrawlerService:
    """CrawlerService 인스턴스를 반환합니다."""
    cve_service = get_cve_service()
    return CrawlerService(cve_service=cve_service)