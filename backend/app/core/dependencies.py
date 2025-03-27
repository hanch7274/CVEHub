from functools import lru_cache
from ..services.user_service import UserService
from ..services.cve_service import CVEService
from ..services.notification import NotificationService
from ..services.update_history_service import UpdateHistoryService
from ..services.crawler_service import CrawlerService
from .socketio_manager import SocketIOManager
from fastapi import Depends
from typing import Annotated

# 싱글톤 인스턴스를 저장할 변수
_socketio_manager: SocketIOManager = None

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

def get_socketio_manager() -> SocketIOManager:
    """
    SocketIOManager 인스턴스를 반환합니다.
    애플리케이션 시작 시 초기화된 인스턴스를 사용합니다.
    """
    from .socketio_manager import get_socketio_manager_instance
    return get_socketio_manager_instance()

def initialize_socketio_manager():
    """
    SocketIOManager 인스턴스를 초기화합니다.
    애플리케이션 시작 시 호출됩니다.
    """
    from .socketio_manager import initialize_socketio_manager_with_user_service
    user_service = get_user_service()
    return initialize_socketio_manager_with_user_service(user_service)

# FastAPI의 Depends를 사용한 타입 어노테이션
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
CVEServiceDep = Annotated[CVEService, Depends(get_cve_service)]
NotificationServiceDep = Annotated[NotificationService, Depends(get_notification_service)]
UpdateHistoryServiceDep = Annotated[UpdateHistoryService, Depends(get_update_history_service)]
CrawlerServiceDep = Annotated[CrawlerService, Depends(get_crawler_service)]
SocketIOManagerDep = Annotated[SocketIOManager, Depends(get_socketio_manager)]