import os
import logging
import traceback
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from pymongo import IndexModel, ASCENDING, DESCENDING, TEXT
from .models.cve_model import CVEModel
from .models.user_model import User, RefreshToken
from .models.notification_model import Notification
from .core.config import get_settings
from passlib.context import CryptContext
from .models.cve_model import Comment
from .models.system_config_model import SystemConfig
from .models.activity_model import UserActivity

# 비밀번호 해싱을 위한 context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()

# MongoDB 클라이언트 생성
client = AsyncIOMotorClient(
    settings.MONGODB_URL,
    uuidRepresentation="standard"
)

db = client[settings.DATABASE_NAME]

# 데이터베이스 객체 export
__all__ = ["get_database", "init_db", "db"]

# 데이터베이스 객체를 외부에서 사용할 수 있도록 함수 제공
def get_database():
    return db

async def init_db():
    """데이터베이스 초기화"""
    try:
        # 현재 컬렉션 목록 확인
        collections = await db.list_collection_names()
        logging.info(f"Current collections before initialization: {collections}")
        
        # Beanie 초기화 - 기존 인덱스를 제거하고 새로 생성하도록 옵션 추가
        await init_beanie(
            database=db,
            document_models=[
                User,
                CVEModel,
                Comment,
                Notification,
                RefreshToken,
                SystemConfig,
                UserActivity
            ],
            allow_index_dropping=True  # 기존 인덱스를 제거하도록 설정
        )
        
        logging.info("Database initialized successfully with beanie ODM")
        
        # 초기화 후 컬렉션 목록 확인
        collections = await db.list_collection_names()
        logging.info(f"Available collections after initialization: {collections}")
        
        return client
        
    except Exception as e:
        logging.error(f"Failed to initialize database: {e}")
        logging.error(f"Traceback: {traceback.format_exc()}")
        raise
