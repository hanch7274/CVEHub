import pytest
from httpx import AsyncClient
from datetime import datetime
from zoneinfo import ZoneInfo
from ...models.cve_model import CreateCVERequest, PatchCVERequest
from ...core.config import get_app_settings
from ...main import app

settings = get_app_settings()

@pytest.mark.asyncio
async def test_create_cve(test_client: AsyncClient, test_user):
    """CVE 생성 API 테스트"""
    cve_data = {
        "cve_id": "CVE-2024-0001",
        "title": "Test CVE",
        "description": "Test Description",
        "status": "신규등록",
        "published_date": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
        "references": [],
        "pocs": [],
        "snort_rules": []
    }
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post(
            "/cves",
            json=cve_data,
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
    
    assert response.status_code == 200
    data = response.json()
    assert data["cve_id"] == "CVE-2024-0001"
    assert data["title"] == "Test CVE"

@pytest.mark.asyncio
async def test_get_cves(test_client: AsyncClient, test_user):
    """CVE 목록 조회 API 테스트"""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get(
            "/cves",
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
    
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "size" in data

@pytest.mark.asyncio
async def test_get_cve(test_client: AsyncClient, test_user):
    """CVE 상세 조회 API 테스트"""
    # 테스트용 CVE 생성
    cve_data = {
        "cve_id": "CVE-2024-0002",
        "title": "Test CVE 2",
        "description": "Test Description 2",
        "status": "신규등록",
        "published_date": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
        "references": [],
        "pocs": [],
        "snort_rules": []
    }
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # CVE 생성
        create_response = await ac.post(
            "/cves",
            json=cve_data,
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
        created_cve = create_response.json()
        
        # CVE 조회
        response = await ac.get(
            f"/cves/{created_cve['cve_id']}",
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
    
    assert response.status_code == 200
    data = response.json()
    assert data["cve_id"] == "CVE-2024-0002"
    assert data["title"] == "Test CVE 2"

@pytest.mark.asyncio
async def test_update_cve(test_client: AsyncClient, test_user):
    """CVE 수정 API 테스트"""
    # 테스트용 CVE 생성
    cve_data = {
        "cve_id": "CVE-2024-0003",
        "title": "Test CVE 3",
        "description": "Test Description 3",
        "status": "신규등록",
        "published_date": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
        "references": [],
        "pocs": [],
        "snort_rules": []
    }
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # CVE 생성
        create_response = await ac.post(
            "/cves",
            json=cve_data,
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
        created_cve = create_response.json()
        
        # CVE 수정
        update_data = {
            "title": "Updated Test CVE 3",
            "status": "분석중"
        }
        response = await ac.patch(
            f"/cves/{created_cve['cve_id']}",
            json=update_data,
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
    
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Updated Test CVE 3"
    assert data["status"] == "분석중"

@pytest.mark.asyncio
async def test_delete_cve(test_client: AsyncClient, test_user):
    """CVE 삭제 API 테스트"""
    # 테스트용 CVE 생성
    cve_data = {
        "cve_id": "CVE-2024-0004",
        "title": "Test CVE 4",
        "description": "Test Description 4",
        "status": "신규등록",
        "published_date": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
        "references": [],
        "pocs": [],
        "snort_rules": []
    }
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # CVE 생성
        create_response = await ac.post(
            "/cves",
            json=cve_data,
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
        created_cve = create_response.json()
        
        # CVE 삭제
        response = await ac.delete(
            f"/cves/{created_cve['cve_id']}",
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
    
    assert response.status_code == 200
    
    # 삭제된 CVE 조회 시도
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get(
            f"/cves/{created_cve['cve_id']}",
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
    
    assert response.status_code == 404

@pytest.mark.asyncio
async def test_search_cves(test_client: AsyncClient, test_user):
    """CVE 검색 API 테스트"""
    # 테스트용 CVE들 생성
    cve_data1 = {
        "cve_id": "CVE-2024-0005",
        "title": "Security Vulnerability",
        "description": "Test Description 5",
        "status": "신규등록",
        "published_date": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
        "references": [],
        "pocs": [],
        "snort_rules": []
    }
    cve_data2 = {
        "cve_id": "CVE-2024-0006",
        "title": "Another Issue",
        "description": "Security related description",
        "status": "신규등록",
        "published_date": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
        "references": [],
        "pocs": [],
        "snort_rules": []
    }
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # CVE들 생성
        await ac.post(
            "/cves",
            json=cve_data1,
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
        await ac.post(
            "/cves",
            json=cve_data2,
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
        
        # 검색 수행
        response = await ac.get(
            "/cves/search",
            params={"query": "Security"},
            headers={"Authorization": f"Bearer {test_user.token}"}
        )
    
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) >= 2
    assert data["total"] >= 2 