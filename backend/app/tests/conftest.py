import pytest
from fastapi.testclient import TestClient
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from ..main import app
from ..core.config import get_app_settings
from ..models.user import User
from ..models.cve_model import CVEModel
from ..models.notification import Notification
from ..models.comment import Comment
from ..services.cve_service import CVEService
from ..services.notification import NotificationService
from ..repositories.cve import CVERepository
from ..repositories.notification import NotificationRepository
import asyncio
import os
from ..core.config.auth import get_auth_settings
from jose import jwt

settings = get_app_settings()
auth_settings = get_auth_settings()

@pytest.fixture(scope="session")
def event_loop():
    """pytest-asyncio용 이벤트 루프 픽스처"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
async def test_db():
    """테스트용 데이터베이스 연결"""
    # 도커 컴포즈 환경의 MongoDB 서비스 이름 사용
    mongo_url = "mongodb://mongodb:27017"
    client = AsyncIOMotorClient(mongo_url)
    db = client["cvehub_test"]  # 테스트용 DB 이름
    
    # Beanie 모델 초기화
    await init_beanie(
        database=db,
        document_models=[
            User,
            CVEModel,
            Comment,
            Notification
        ]
    )
    
    yield db
    # 테스트 후 DB 정리
    await client.drop_database("cvehub_test")
    client.close()

@pytest.fixture(autouse=True)
async def setup_db(test_db):
    """각 테스트 전에 DB 컬렉션 초기화"""
    collections = await test_db.list_collection_names()
    for collection in collections:
        await test_db[collection].delete_many({})
    yield
    # 테스트 후 정리
    for collection in collections:
        await test_db[collection].delete_many({})

@pytest.fixture
async def test_user():
    """테스트용 사용자"""
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password="hashedpassword"
    )
    await user.save()  # DB에 저장
    # JWT 토큰 생성
    token_data = {
        "sub": str(user.id),
        "username": user.username
    }
    user.token = jwt.encode(token_data, auth_settings.SECRET_KEY, algorithm=auth_settings.ALGORITHM)
    return user

@pytest.fixture
async def test_cve_repository(test_db):
    """테스트용 CVE 리포지토리"""
    return CVERepository(test_db)

@pytest.fixture
async def test_notification_repository(test_db):
    """테스트용 알림 리포지토리"""
    return NotificationRepository(test_db)

@pytest.fixture
async def test_cve_service(test_cve_repository):
    """테스트용 CVE 서비스"""
    return CVEService(test_cve_repository)

@pytest.fixture
async def test_notification_service(test_notification_repository):
    """테스트용 알림 서비스"""
    return NotificationService(test_notification_repository)

@pytest.fixture
async def test_client():
    """테스트용 FastAPI 클라이언트"""
    async with TestClient(app) as client:
        yield client
