"""
CVEHub 소켓 통신 모듈

Socket.IO를 사용한 실시간 통신 기능을 제공합니다.
"""

# 모델 노출
from .models import (
    WSMessageType,
    SocketSession,
    SocketError,
    SocketMessage,
    SessionCleanupRequest
)

# 저장소 노출
from .repository import (
    get_socket_repository,
    SocketRepository
)

# 서비스 노출
from .service import (
    get_socket_service,
    SocketService
)

# 매니저 노출
from .manager import (
    get_socket_manager,
    initialize_socket_manager_with_user_service,
    SocketManager
)

# 라우터 노출
from .router import router as socket_router

# 버전 정보
__version__ = "1.0.0"

# 주요 함수 및 클래스 정의
__all__ = [
    # 모델
    "WSMessageType",
    "SocketSession",
    "SocketError",
    "SocketMessage",
    "SessionCleanupRequest",
    
    # 저장소
    "get_socket_repository",
    "SocketRepository",
    
    # 서비스
    "get_socket_service",
    "SocketService",
    
    # 매니저
    "get_socket_manager",
    "initialize_socket_manager_with_user_service",
    "SocketManager",
    
    # 라우터
    "socket_router"
]
