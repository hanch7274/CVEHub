"""라우터 모듈 패키지"""

from fastapi import APIRouter
from app.auth.router import router as auth_router
from app.cve.router import router as cve_router
from app.notification.router import router as notification_router
from app.crawler.router import router as crawler_router
from app.cache.router import router as cache_router
from app.activity.router import router as activity_router

api_router = APIRouter()

# 인증 관련 라우터
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])

# CVE 관련 라우터
api_router.include_router(cve_router, prefix="/cves", tags=["cves"])

# 알림 관련 라우터
api_router.include_router(notification_router, prefix="/notifications", tags=["notifications"])

# 크롤러 관련 라우터
api_router.include_router(crawler_router, prefix="/crawler", tags=["crawler"])

# 캐시 관련 라우터
api_router.include_router(cache_router, prefix="/cache", tags=["cache"])

# 활동 관련 라우터
api_router.include_router(activity_router, prefix="", tags=["activities"])