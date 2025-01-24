import pytest
from httpx import AsyncClient
from datetime import datetime
from beanie import PydanticObjectId
from ...core.config import get_app_settings
from ...main import app

settings = get_app_settings()

@pytest.mark.asyncio
async def test_get_notifications(test_client: AsyncClient, test_user):
    """알림 목록 조회 API 테스트"""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get(
            "/notifications",
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
    
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "size" in data

@pytest.mark.asyncio
async def test_create_notification(test_client: AsyncClient, test_user):
    """알림 생성 API 테스트"""
    notification_data = {
        "recipient_id": str(test_user.id),
        "sender_id": str(PydanticObjectId()),
        "content": "테스트 알림",
        "cve_id": "CVE-2024-0001",
        "comment_id": None
    }
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post(
            "/notifications",
            json=notification_data,
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
    
    assert response.status_code == 200
    data = response.json()
    assert data["content"] == "테스트 알림"
    assert data["recipient_id"] == str(test_user.id)
    assert data["is_read"] == False

@pytest.mark.asyncio
async def test_get_unread_count(test_client: AsyncClient, test_user):
    """읽지 않은 알림 수 조회 API 테스트"""
    # 테스트용 알림 생성
    notification_data = {
        "recipient_id": str(test_user.id),
        "sender_id": str(PydanticObjectId()),
        "content": "새로운 알림",
        "cve_id": "CVE-2024-0001",
        "comment_id": None
    }
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # 알림 생성
        await ac.post(
            "/notifications",
            json=notification_data,
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
        
        # 읽지 않은 알림 수 조회
        response = await ac.get(
            "/notifications/unread-count",
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
    
    assert response.status_code == 200
    data = response.json()
    assert "count" in data
    assert data["count"] > 0

@pytest.mark.asyncio
async def test_mark_as_read(test_client: AsyncClient, test_user):
    """알림 읽음 처리 API 테스트"""
    # 테스트용 알림 생성
    notification_data = {
        "recipient_id": str(test_user.id),
        "sender_id": str(PydanticObjectId()),
        "content": "읽음 처리할 알림",
        "cve_id": "CVE-2024-0001",
        "comment_id": None
    }
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # 알림 생성
        create_response = await ac.post(
            "/notifications",
            json=notification_data,
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
        created_notification = create_response.json()
        
        # 알림 읽음 처리
        response = await ac.patch(
            f"/notifications/{created_notification['id']}/read",
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
    
    assert response.status_code == 200
    data = response.json()
    assert data["is_read"] == True

@pytest.mark.asyncio
async def test_mark_all_as_read(test_client: AsyncClient, test_user):
    """모든 알림 읽음 처리 API 테스트"""
    # 테스트용 알림들 생성
    notification_data = {
        "recipient_id": str(test_user.id),
        "sender_id": str(PydanticObjectId()),
        "content": "읽음 처리할 알림",
        "cve_id": "CVE-2024-0001",
        "comment_id": None
    }
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # 알림들 생성
        for _ in range(3):
            await ac.post(
                "/notifications",
                json=notification_data,
                headers={"Authorization": f"Bearer {test_user.token}"}
            )
        
        # 모든 알림 읽음 처리
        response = await ac.patch(
            "/notifications/read-all",
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
        
        # 읽지 않은 알림 수 확인
        unread_response = await ac.get(
            "/notifications/unread-count",
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
    
    assert response.status_code == 200
    assert unread_response.status_code == 200
    assert unread_response.json()["count"] == 0 