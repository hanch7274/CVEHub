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

from app.core.config import get_settings
from app.socketio.router import router as socketio_router
from app.core.exceptions import CVEHubException
from app.core.error_handlers import (
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
from app.system.models import SystemConfig
from .database import init_db, get_database
from app.cve.models import CVEModel, CreateCVERequest, PatchCVERequest
from app.api import api_router  # 새 위치에서 임포트
from app.core.scheduler import CrawlerScheduler

# 설정 초기화
settings = get_settings()
app = FastAPI()
app.include_router(api_router)

# 로깅 포맷터에 KST 시간대 적용
class KSTFormatter(logging.Formatter):
    def converter(self, timestamp):
        # 명시적으로 KST 시간대 사용
        dt = datetime.fromtimestamp(timestamp, ZoneInfo("Asia/Seoul"))
        return dt
        
    def formatTime(self, record, datefmt=None):
        dt = self.converter(record.created)
        if datefmt:
            return dt.strftime(datefmt)
        return dt.strftime("%Y-%m-%d %H:%M:%S %z")

# 루트 로거 설정
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',  
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
    allow_origins=settings.CORS_ORIGINS,  # config.py의 설정 사용
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
app.include_router(socketio_router)

# 애플리케이션 시작 시 KST 타임존 설정
os.environ['TZ'] = 'Asia/Seoul'

@app.on_event("startup")
async def startup_event():
    """애플리케이션 시작 시 실행되는 이벤트"""
    try:
        # 데이터베이스 초기화 (database.py의 함수 사용)
        await init_db()
        logger.info("Database initialized successfully")
        
        # 데이터베이스 연결 테스트
        db = get_database()
        await db.client.admin.command('ping')
        logger.info("Successfully connected to MongoDB")
        
        # SocketManager 초기화 - 명시적으로 UserService 주입
        from .core.dependencies import initialize_socket_manager, get_user_service
        user_service = get_user_service()
        socket_manager = initialize_socket_manager()
        logger.info("SocketManager initialized successfully")
        
        # Socket.IO 앱 생성 및 마운트 - CORS 설정 명시적 적용
        import socketio
        from .core.config import get_settings
        settings = get_settings()
        
        # 로그에 CORS 설정 출력
        logger.info(f"Socket.IO CORS 설정: {settings.CORS_ORIGINS}")
        
        # Socket.IO 앱 생성 및 마운트 - 명시적 경로 설정
        sio_app = socketio.ASGIApp(socket_manager.sio)
        socket_io_path = "/socket.io"
        app.mount(socket_io_path, sio_app)
        logger.info(f"Socket.IO app mounted successfully at path: {socket_io_path}")
        
        # 마운트된 경로 확인 로깅 
        logger.info(f"Socket.IO 연결 URL: http://localhost:8000{socket_io_path}")
        logger.info(f"Socket.IO WebSocket URL: ws://localhost:8000{socket_io_path}")
        
        # CVE 컬렉션 데이터 수 확인
        cve_count = await CVEModel.find().count()
        logger.info(f"Total CVEs in database: {cve_count}")
        
        # 스케줄러 초기화 및 시작
        scheduler = CrawlerScheduler()
        # 데이터베이스 초기화가 아닌 스케줄러 상태 초기화만 수행
        await scheduler.init_scheduler_state()
        scheduler.start()
        
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
            # UTC 시간대 정보를 명시적으로 추가하여 ISO 포맷으로 반환
            if obj.tzinfo is None:
                obj = obj.replace(tzinfo=ZoneInfo("UTC"))
            # 항상 Z로 끝나는 ISO 형식으로 통일 (밀리초 포함)
            iso_format = obj.isoformat().replace('+00:00', 'Z')
            # 디버깅 로그 추가
            print(f"CustomJSONEncoder: datetime 변환 - 원본: {obj}, 변환결과: {iso_format}")
            return iso_format
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
