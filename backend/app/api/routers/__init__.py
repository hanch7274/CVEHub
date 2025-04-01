"""라우터 모듈 패키지"""

from fastapi import APIRouter
from app.api.routers.user_router import router as user_router
from app.api.routers.auth_router import router as auth_router
from app.api.routers.cve_router import router as cve_router
from app.api.routers.comment_router import router as comment_router
from app.api.routers.notification_router import router as notification_router
from app.api.routers.crawler_router import router as crawler_router
from app.api.routers.cache_router import router as cache_router
from app.api.routers.activity_router import router as activity_router

api_router = APIRouter()

# 사용자 관련 라우터
api_router.include_router(user_router, prefix="/users", tags=["users"])

# 인증 관련 라우터
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])

# CVE 관련 라우터
api_router.include_router(cve_router, prefix="/cves", tags=["cves"])

# 댓글 관련 라우터
api_router.include_router(comment_router, prefix="/comments", tags=["comments"])

# 알림 관련 라우터
api_router.include_router(notification_router, prefix="/notifications", tags=["notifications"])

# 크롤러 관련 라우터
api_router.include_router(crawler_router, prefix="/crawler", tags=["crawler"])

# 캐시 관련 라우터
api_router.include_router(cache_router, prefix="/cache", tags=["cache"])

# 활동 관련 라우터
api_router.include_router(activity_router, prefix="", tags=["activities"])