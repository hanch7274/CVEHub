"""API 라우터 통합"""
from fastapi import APIRouter
from .routers import api_router as routers_api_router

# 통합 API 라우터
api_router = APIRouter()

# 리팩토링된 라우터 모듈의 api_router를 통합 라우터에 포함
api_router.include_router(routers_api_router)

# 비고: 모든 개별 라우터들은 app/api/routers/__init__.py에서 관리됩니다.
# 여기서는 통합 라우터만 관리하여 중복 등록을 방지합니다.