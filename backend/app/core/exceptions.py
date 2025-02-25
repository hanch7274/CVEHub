from fastapi import HTTPException, status
from typing import Optional, Any, Dict
import logging

logger = logging.getLogger(__name__)

class CVEHubException(HTTPException):
    """기본 CVEHub 예외 클래스 - 에러 코드와 상세 메시지를 포함"""
    def __init__(
        self,
        status_code: int,
        detail: str,
        error_code: str = None,
        extra: Dict[str, Any] = None
    ):
        super().__init__(status_code=status_code, detail=detail)
        self.error_code = error_code
        self.extra = extra or {}
        
        # 에러 로깅
        logger.error(
            f"CVEHubException: {error_code or 'NO_CODE'} - {detail}",
            extra={
                "status_code": status_code,
                "error_code": error_code,
                "extra": extra
            }
        )

class NotFoundException(CVEHubException):
    """리소스를 찾을 수 없을 때 발생하는 예외"""
    def __init__(self, detail: str = "요청한 리소스를 찾을 수 없습니다.", error_code: str = "NOT_FOUND"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail, error_code=error_code)

class UnauthorizedException(CVEHubException):
    """인증되지 않은 요청에 대한 예외"""
    def __init__(self, detail: str = "인증이 필요합니다.", error_code: str = "AUTHENTICATION_ERROR"):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail, error_code=error_code)

class ForbiddenException(CVEHubException):
    """권한이 없는 요청에 대한 예외"""
    def __init__(self, detail: str = "이 작업을 수행할 권한이 없습니다.", error_code: str = "AUTHORIZATION_ERROR"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail, error_code=error_code)

class ValidationException(CVEHubException):
    """데이터 유효성 검사 실패 시 발생하는 예외"""
    def __init__(self, detail: str = "입력 데이터가 유효하지 않습니다.", error_code: str = "VALIDATION_ERROR"):
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail, error_code=error_code)

class DatabaseException(CVEHubException):
    """데이터베이스 작업 실패 시 발생하는 예외"""
    def __init__(self, detail: str = "데이터베이스 작업 중 오류가 발생했습니다.", error_code: str = "DATABASE_ERROR"):
        super().__init__(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail, error_code=error_code)

class DuplicateException(CVEHubException):
    """중복된 데이터 생성 시도 시 발생하는 예외"""
    def __init__(self, detail: str = "이미 존재하는 데이터입니다."):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)

# 자주 사용되는 에러 타입 정의
class NotFoundError(CVEHubException):
    def __init__(self, detail: str = "요청한 리소스를 찾을 수 없습니다.", error_code: str = "NOT_FOUND"):
        super().__init__(status_code=404, detail=detail, error_code=error_code)

class ValidationError(CVEHubException):
    def __init__(self, detail: str = "입력값이 올바르지 않습니다.", error_code: str = "VALIDATION_ERROR"):
        super().__init__(status_code=400, detail=detail, error_code=error_code)

class AuthenticationError(CVEHubException):
    def __init__(self, detail: str = "인증에 실패했습니다.", error_code: str = "AUTHENTICATION_ERROR"):
        super().__init__(status_code=401, detail=detail, error_code=error_code)

class AuthorizationError(CVEHubException):
    def __init__(self, detail: str = "권한이 없습니다.", error_code: str = "AUTHORIZATION_ERROR"):
        super().__init__(status_code=403, detail=detail, error_code=error_code)

class DatabaseError(CVEHubException):
    def __init__(self, detail: str = "데이터베이스 오류가 발생했습니다.", error_code: str = "DATABASE_ERROR"):
        super().__init__(status_code=500, detail=detail, error_code=error_code)

class WebSocketError(CVEHubException):
    def __init__(self, detail: str = "WebSocket 연결 오류가 발생했습니다.", error_code: str = "WEBSOCKET_ERROR"):
        super().__init__(status_code=500, detail=detail, error_code=error_code)
