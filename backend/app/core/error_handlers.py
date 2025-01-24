from fastapi import Request, status
from fastapi.responses import JSONResponse
from .exceptions import CVEHubException
import logging
from typing import Union
from pydantic import ValidationError

async def cvehub_exception_handler(request: Request, exc: CVEHubException):
    """CVEHub 커스텀 예외 처리기"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "path": request.url.path
        }
    )

async def validation_exception_handler(request: Request, exc: ValidationError):
    """Pydantic 유효성 검사 예외 처리기"""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "데이터 유효성 검사 실패",
            "errors": exc.errors(),
            "path": request.url.path
        }
    )

async def general_exception_handler(request: Request, exc: Exception):
    """일반 예외 처리기"""
    logging.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "내부 서버 오류가 발생했습니다.",
            "path": request.url.path
        }
    ) 