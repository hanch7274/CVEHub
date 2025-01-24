from functools import lru_cache
from ..services.user import UserService
from ..services.cve import CVEService
from ..services.notification import NotificationService

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