from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routes import cve, auth, comment, lock, user
from app.routes.notification import router as notification_router
from app.database import init_db
import logging
import traceback
import sys
from beanie import init_beanie
from app.models.user import User
from app.models.cve import CVEModel
from app.models.notification import Notification
from app.models.comment import Comment
from app.core.config import settings

# 로깅 설정
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

# 모든 로거의 레벨을 DEBUG로 설정
for name in logging.root.manager.loggerDict:
    logging.getLogger(name).setLevel(logging.DEBUG)

app = FastAPI(
    title="CVE Hub API",
    description="API for managing CVEs, PoCs, and Snort rules",
    version="1.0.0"
)

# 미들웨어 설정
@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    """모든 요청과 응답을 로깅하는 미들웨어"""
    print(f"\n=== Request ===")
    print(f"Method: {request.method}")
    print(f"URL: {request.url}")
    
    try:
        response = await call_next(request)
        print(f"\n=== Response ===")
        print(f"Status: {response.status_code}")
        return response
    except Exception as e:
        print(f"\n=== Error ===")
        print(f"Error type: {type(e)}")
        print(f"Error message: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React 앱의 origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 전역 예외 처리
@app.middleware("http")
async def catch_exceptions_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        logger = logging.getLogger("uvicorn")
        logger.error(f"Unhandled error: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {str(e)}"}
        )

# 라우터 등록
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(comment.router, prefix="/cves", tags=["comments"])  
app.include_router(cve.router, prefix="/cves", tags=["cves"])
app.include_router(lock.router, prefix="/cves", tags=["locks"])
app.include_router(user.router, prefix="/users", tags=["users"])
app.include_router(notification_router, prefix="/notifications", tags=["notifications"])

@app.on_event("startup")
async def startup_event():
    """애플리케이션 시작 시 실행되는 이벤트"""
    try:
        # 데이터베이스 초기화
        await init_db()
        logging.info("Successfully initialized database")
    except Exception as e:
        logging.error(f"Failed to initialize database: {e}")
        logging.error(f"Traceback: {traceback.format_exc()}")
        raise e

@app.get("/")
async def root():
    return {"message": "Welcome to CVE Hub API"}
