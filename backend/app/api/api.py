"""API 라우터 통합"""
from fastapi import APIRouter
from . import cve_router, comment, notification, user, crawler, auth, users

# 기존의 각 모듈에 정의된 라우터들을 재사용
api_router = APIRouter()

# 각 라우터를 prefix와 tag와 함께 등록
api_router.include_router(cve_router.router, prefix="/cves", tags=["cve"])
api_router.include_router(comment.router, prefix="/cves", tags=["comment"])
api_router.include_router(notification.router, prefix="/notification", tags=["notification"])
api_router.include_router(user.router, prefix="/user", tags=["user"])
api_router.include_router(crawler.router, prefix="/crawler", tags=["crawler"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/api/users", tags=["users"]) 