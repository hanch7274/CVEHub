from fastapi import HTTPException, status

class CVEHubException(HTTPException):
    """기본 CVEHub 예외 클래스"""
    def __init__(self, status_code: int, detail: str):
        super().__init__(status_code=status_code, detail=detail)

class NotFoundException(CVEHubException):
    """리소스를 찾을 수 없을 때 발생하는 예외"""
    def __init__(self, detail: str = "요청한 리소스를 찾을 수 없습니다."):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class UnauthorizedException(CVEHubException):
    """인증되지 않은 요청에 대한 예외"""
    def __init__(self, detail: str = "인증이 필요합니다."):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

class ForbiddenException(CVEHubException):
    """권한이 없는 요청에 대한 예외"""
    def __init__(self, detail: str = "이 작업을 수행할 권한이 없습니다."):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)

class ValidationException(CVEHubException):
    """데이터 유효성 검사 실패 시 발생하는 예외"""
    def __init__(self, detail: str = "입력 데이터가 유효하지 않습니다."):
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)

class DatabaseException(CVEHubException):
    """데이터베이스 작업 실패 시 발생하는 예외"""
    def __init__(self, detail: str = "데이터베이스 작업 중 오류가 발생했습니다."):
        super().__init__(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail)

class DuplicateException(CVEHubException):
    """중복된 데이터 생성 시도 시 발생하는 예외"""
    def __init__(self, detail: str = "이미 존재하는 데이터입니다."):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail) 