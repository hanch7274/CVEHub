"""메인 애플리케이션"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import traceback
import sys
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from .models.user import User, RefreshToken
from .models.cve import CVEModel
from .models.notification import Notification
from .models.comment import Comment
from .core.config.app import get_app_settings
from .core.config.db import get_db_settings
from .api import cve, notification, user, crawler, auth, comment
from .core.exceptions import CVEHubException
from .core.error_handlers import (
    cvehub_exception_handler,
    validation_exception_handler,
    general_exception_handler
)
from pydantic import ValidationError
from .core.websocket import router as websocket_router

# 설정 초기화
app_settings = get_app_settings()
db_settings = get_db_settings()

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
    title="CVEHub API",
    description="CVE 관리 및 모니터링을 위한 API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"}
        )

@app.middleware("http")
async def catch_exceptions_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        logging.error(f"Exception occurred: {e}")
        logging.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"detail": str(e)}
        )

# 예외 처리기 등록
app.add_exception_handler(CVEHubException, cvehub_exception_handler)
app.add_exception_handler(ValidationError, validation_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

# API 라우터 등록
app.include_router(cve.router, prefix="/cves", tags=["cve"])
app.include_router(comment.router, prefix="/cves", tags=["comment"])
app.include_router(notification.router, prefix="/notification", tags=["notification"])
app.include_router(user.router, prefix="/user", tags=["user"])
app.include_router(crawler.router, prefix="/crawler", tags=["crawler"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(websocket_router)

@app.on_event("startup")
async def startup_event():
    """애플리케이션 시작 시 실행되는 이벤트"""
    try:
        # MongoDB 클라이언트 생성
        client = AsyncIOMotorClient(
            db_settings.MONGODB_URL,
            maxPoolSize=db_settings.MAX_CONNECTIONS_COUNT,
            minPoolSize=db_settings.MIN_CONNECTIONS_COUNT
        )
        # Beanie 모델 초기화
        await init_beanie(
            database=client[db_settings.MONGODB_DB_NAME],
            document_models=[
                User,
                CVEModel,
                Comment,
                Notification,
                RefreshToken
            ]
        )
        logging.info("Database initialized successfully")
    except Exception as e:
        logging.error(f"Failed to initialize database: {e}")
        raise

@app.get("/")
async def root():
    """API 루트 엔드포인트"""
    return {
        "message": "Welcome to CVEHub API",
        "version": "1.0.0",
        "docs_url": "/docs",
        "redoc_url": "/redoc"
    }
