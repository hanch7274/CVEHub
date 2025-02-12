"""메인 애플리케이션"""
from fastapi import FastAPI, Request, status, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
import json
import logging
import traceback
import sys
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
import os
from zoneinfo import ZoneInfo

from .models.user import User, RefreshToken
from .models.cve_model import CVEModel
from .models.notification import Notification
from .models.comment import Comment
from .core.config import get_settings
from .api.api import api_router
from .api.websocket import router as websocket_router
from .core.websocket import manager
from .core.exceptions import CVEHubException
from .core.error_handlers import (
    cvehub_exception_handler,
    validation_exception_handler,
    general_exception_handler,
    request_validation_exception_handler,
    http_exception_handler
)
from pydantic import ValidationError
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from fastapi.websockets import WebSocketDisconnect, WebSocketState

# 설정 초기화
settings = get_settings()

# 로깅 포맷터에 KST 시간대 적용
class KSTFormatter(logging.Formatter):
    def converter(self, timestamp):
        dt = datetime.fromtimestamp(timestamp)
        return dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(ZoneInfo("Asia/Seoul"))
        
    def formatTime(self, record, datefmt=None):
        dt = self.converter(record.created)
        if datefmt:
            return dt.strftime(datefmt)
        return dt.strftime("%Y-%m-%d %H:%M:%S %z")

# 루트 로거 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',  # ISO 포맷에서 일반 시간 포맷으로 변경
    handlers=[logging.StreamHandler(sys.stdout)]
)

# 모든 로거에 KST 포맷터 적용
kst_formatter = KSTFormatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
for handler in logging.root.handlers:
    handler.setFormatter(kst_formatter)

# 애플리케이션 로거 설정
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="CVE 관리 및 모니터링을 위한 API",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 실제 운영 환경에서는 구체적인 origin을 지정해야 합니다
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
app.add_exception_handler(RequestValidationError, request_validation_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)

# API 라우터 등록
app.include_router(api_router)
app.include_router(websocket_router)

# 애플리케이션 시작 시 KST 타임존 설정
os.environ['TZ'] = 'Asia/Seoul'

@app.on_event("startup")
async def startup_event():
    """애플리케이션 시작 시 실행되는 이벤트"""
    try:
        # MongoDB 클라이언트 생성
        client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            maxPoolSize=settings.MAX_CONNECTIONS_COUNT,
            minPoolSize=settings.MIN_CONNECTIONS_COUNT
        )
        # Beanie 모델 초기화
        await init_beanie(
            database=client[settings.DATABASE_NAME],
            document_models=[
                User,
                CVEModel,
                Comment,
                Notification,
                RefreshToken
            ]
        )
        logger.info("Database initialized successfully")
        
        # 데이터베이스 연결 테스트
        await client.admin.command('ping')
        logger.info("Successfully connected to MongoDB")
        
        # CVE 컬렉션 데이터 수 확인
        cve_count = await CVEModel.find().count()
        logger.info(f"Total CVEs in database: {cve_count}")
        
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        logger.error(traceback.format_exc())
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

# 커스텀 JSON 인코더 클래스 정의
class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

# FastAPI의 JSONResponse에 커스텀 인코더 적용
class CustomJSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
            cls=CustomJSONEncoder
        ).encode("utf-8")

# 기본 JSONResponse를 커스텀 JSONResponse로 교체
app.router.default_response_class = CustomJSONResponse
