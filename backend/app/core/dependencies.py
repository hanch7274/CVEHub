from functools import lru_cache
# 변경: 새 통합 서비스 파일 사용
from ..auth.service import UserService
from ..cve.service import CVEService
from ..notification.service import NotificationService
from ..crawler.service import CrawlerService
from .socketio_manager import SocketIOManager
from fastapi import Depends
from typing import Annotated

# 싱글톤 인스턴스를 저장할 변수
_socketio_manager: SocketIOManager = None
_user_service: UserService = None

@lru_cache()
def get_user_service() -> UserService:
    """UserService 인스턴스를 반환합니다."""
    global _user_service
    if _user_service is None:
        # socketio_manager 의존성 주입
        _user_service = UserService(socketio_manager=get_socketio_manager())
    return _user_service

@lru_cache()
def get_cve_service() -> CVEService:
    """CVEService 인스턴스를 반환합니다."""
    return CVEService()

@lru_cache()
def get_notification_service() -> NotificationService:
    """NotificationService 인스턴스를 반환합니다."""
    return NotificationService()

@lru_cache()
def get_crawler_service() -> CrawlerService:
    """CrawlerService 인스턴스를 반환합니다."""
    return CrawlerService()

def get_socketio_manager() -> SocketIOManager:
    """
    SocketIOManager 인스턴스를 반환합니다.
    애플리케이션 시작 시 초기화된 인스턴스를 사용합니다.
    """
    global _socketio_manager
    if _socketio_manager is None:
        _socketio_manager = SocketIOManager()
    return _socketio_manager

def initialize_socketio_manager() -> SocketIOManager:
    """
    SocketIOManager 인스턴스를 초기화합니다.
    애플리케이션 시작 시 호출됩니다.
    """
    global _socketio_manager
    if _socketio_manager is None:
        _socketio_manager = SocketIOManager()
    return _socketio_manager

# FastAPI의 Depends를 사용한 타입 어노테이션
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
CVEServiceDep = Annotated[CVEService, Depends(get_cve_service)]
NotificationServiceDep = Annotated[NotificationService, Depends(get_notification_service)]
CrawlerServiceDep = Annotated[CrawlerService, Depends(get_crawler_service)]
SocketIOManagerDep = Annotated[SocketIOManager, Depends(get_socketio_manager)]