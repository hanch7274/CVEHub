"""라우터 모듈 패키지"""

from fastapi import APIRouter
from app.api.routers.user_router import router as user_router
from app.api.routers.auth_router import router as auth_router
from app.api.routers.cve_router import router as cve_router
from app.api.routers.comment_router import router as comment_router
from app.api.routers.notification_router import router as notification_router
from app.api.routers.crawler_router import router as crawler_router
from app.api.routers.update_history_router import router as update_history_router

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

# 업데이트 이력 관련 라우터
api_router.include_router(update_history_router, prefix="/updates", tags=["updates"])
