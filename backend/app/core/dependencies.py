from functools import lru_cache
# 변경: 새 통합 서비스 파일 사용
from ..auth.service import UserService
from ..cve.service import CVEService
from ..comment.service import CommentService
from ..comment.repository import CommentRepository
from ..notification.service import NotificationService
from ..crawler.service import CrawlerService
from app.socketio.manager import get_socket_manager, SocketManager
from fastapi import Depends
from typing import Annotated

# 싱글톤 인스턴스를 저장할 변수
_socket_manager: SocketManager = None
_user_service: UserService = None

@lru_cache()
def get_user_service() -> UserService:
    """UserService 인스턴스를 반환합니다."""
    global _user_service
    if _user_service is None:
        # socket_manager 의존성 주입
        _user_service = UserService(socket_manager=get_socket_manager())
    return _user_service

@lru_cache()
def get_comment_repository() -> CommentRepository:
    """CommentRepository 인스턴스를 반환합니다."""
    return CommentRepository()

@lru_cache()
def get_comment_service() -> CommentService:
    """CommentService 인스턴스를 반환합니다."""
    from ..cve.repository import CVERepository
    from ..activity.service import ActivityService
    return CommentService(
        comment_repository=get_comment_repository(),
        activity_service=ActivityService(),
        cve_repository=CVERepository()
    )

@lru_cache()
def get_cve_service() -> CVEService:
    """CVEService 인스턴스를 반환합니다."""
    return CVEService(comment_service=get_comment_service())

@lru_cache()
def get_notification_service() -> NotificationService:
    """NotificationService 인스턴스를 반환합니다."""
    return NotificationService()

@lru_cache()
def get_crawler_service() -> CrawlerService:
    """CrawlerService 인스턴스를 반환합니다."""
    return CrawlerService()

def get_socket_manager() -> SocketManager:
    """
    SocketManager 인스턴스를 반환합니다.
    애플리케이션 시작 시 초기화된 인스턴스를 사용합니다.
    """
    global _socket_manager
    if _socket_manager is None:
        _socket_manager = SocketManager()
    return _socket_manager

def initialize_socket_manager() -> SocketManager:
    """
    SocketManager 인스턴스를 초기화합니다.
    애플리케이션 시작 시 호출됩니다.
    """
    global _socket_manager
    if _socket_manager is None:
        _socket_manager = SocketManager()
    return _socket_manager

# FastAPI의 Depends를 사용한 타입 어노테이션
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
CVEServiceDep = Annotated[CVEService, Depends(get_cve_service)]
CommentServiceDep = Annotated[CommentService, Depends(get_comment_service)]
CommentRepositoryDep = Annotated[CommentRepository, Depends(get_comment_repository)]
NotificationServiceDep = Annotated[NotificationService, Depends(get_notification_service)]
CrawlerServiceDep = Annotated[CrawlerService, Depends(get_crawler_service)]
SocketManagerDep = Annotated[SocketManager, Depends(get_socket_manager)]