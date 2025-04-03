from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from .exceptions import CVEHubException
import logging
from typing import Union
from pydantic import ValidationError
import traceback

async def cvehub_exception_handler(request: Request, exc: CVEHubException):
    """CVEHub 커스텀 예외 처리기"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "error_code": exc.error_code
        }
    )

async def validation_exception_handler(request: Request, exc: ValidationError):
    """Pydantic 유효성 검사 예외 처리기"""
    return JSONResponse(
        status_code=400,
        content={
            "detail": str(exc),
            "error_code": "VALIDATION_ERROR"
        }
    )

async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    """FastAPI 요청 검증 예외 처리"""
    errors = []
    for error in exc.errors():
        error_detail = {
            "loc": error["loc"],
            "msg": error["msg"],
            "type": error["type"]
        }
        errors.append(error_detail)

    return JSONResponse(
        status_code=422,
        content={
            "detail": "입력값 검증 오류가 발생했습니다.",
            "errors": errors,
            "error_code": "REQUEST_VALIDATION_ERROR"
        }
    )

async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTP 예외 처리"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "error_code": "HTTP_ERROR"
        }
    )

async def general_exception_handler(request: Request, exc: Exception):
    """일반 예외 처리기"""
    # 예외 정보 로깅
    logging.error(f"Unhandled exception occurred: {str(exc)}")
    logging.error(traceback.format_exc())

    return JSONResponse(
        status_code=500,
        content={
            "detail": "내부 서버 오류가 발생했습니다.",
            "error_code": "INTERNAL_SERVER_ERROR"
        }
    ) 