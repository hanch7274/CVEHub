import os
import logging
import traceback
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.cve import CVEModel
from .models.user import User, RefreshToken
from .models.notification import Notification
from .core.config import settings
from passlib.context import CryptContext

# 비밀번호 해싱을 위한 context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# MongoDB 클라이언트 생성
client = AsyncIOMotorClient(
    settings.MONGODB_URL,
    uuidRepresentation="standard"
)

db = client[settings.MONGODB_DB_NAME]

async def init_db():
    """데이터베이스 초기화"""
    try:
        # 현재 컬렉션 목록 확인
        collections = await db.list_collection_names()
        logging.info(f"Current collections before initialization: {collections}")
        
        # Beanie 초기화
        await init_beanie(
            database=db,
            document_models=[
                User,
                CVEModel,
                Notification,
                RefreshToken
            ]
        )
        
        # 초기화 후 컬렉션 목록 확인
        collections = await db.list_collection_names()
        logging.info(f"Available collections after initialization: {collections}")
        
        return client
        
    except Exception as e:
        logging.error(f"Failed to initialize database: {e}")
        logging.error(f"Traceback: {traceback.format_exc()}")
        raise
