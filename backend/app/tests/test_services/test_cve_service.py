import pytest
from datetime import datetime
from ...models.cve import CreateCVERequest, PatchCVERequest
from ...core.exceptions import NotFoundException
from zoneinfo import ZoneInfo

@pytest.mark.asyncio
async def test_create_cve(test_cve_service):
    """CVE 생성 테스트"""
    cve_data = CreateCVERequest(
        cve_id="CVE-2024-0001",
        title="Test CVE",
        description="Test Description",
        status="신규등록",
        published_date=datetime.now(ZoneInfo("Asia/Seoul")),
        references=[],
        pocs=[],
        snort_rules=[]
    )
    
    cve = await test_cve_service.create_cve(cve_data)
    assert cve is not None
    assert cve.cve_id == "CVE-2024-0001"
    assert cve.title == "Test CVE"

@pytest.mark.asyncio
async def test_get_cve(test_cve_service):
    """CVE 조회 테스트"""
    # 테스트용 CVE 생성
    cve_data = CreateCVERequest(
        cve_id="CVE-2024-0002",
        title="Test CVE 2",
        description="Test Description 2",
        status="신규등록",
        published_date=datetime.now(ZoneInfo("Asia/Seoul")),
        references=[],
        pocs=[],
        snort_rules=[]
    )
    created_cve = await test_cve_service.create_cve(cve_data)
    
    # CVE 조회
    cve = await test_cve_service.get_cve(created_cve.cve_id)
    assert cve is not None
    assert cve.cve_id == "CVE-2024-0002"
    assert cve.title == "Test CVE 2"

@pytest.mark.asyncio
async def test_update_cve(test_cve_service):
    """CVE 수정 테스트"""
    # 테스트용 CVE 생성
    cve_data = CreateCVERequest(
        cve_id="CVE-2024-0003",
        title="Test CVE 3",
        description="Test Description 3",
        status="신규등록",
        published_date=datetime.now(ZoneInfo("Asia/Seoul")),
        references=[],
        pocs=[],
        snort_rules=[]
    )
    created_cve = await test_cve_service.create_cve(cve_data)
    
    # CVE 수정
    update_data = PatchCVERequest(
        title="Updated Test CVE 3",
        status="분석중"
    )
    updated_cve = await test_cve_service.update_cve(created_cve.cve_id, update_data)
    
    assert updated_cve is not None
    assert updated_cve.title == "Updated Test CVE 3"
    assert updated_cve.status == "분석중"

@pytest.mark.asyncio
async def test_delete_cve(test_cve_service):
    """CVE 삭제 테스트"""
    # 테스트용 CVE 생성
    cve_data = CreateCVERequest(
        cve_id="CVE-2024-0004",
        title="Test CVE 4",
        description="Test Description 4",
        status="신규등록",
        published_date=datetime.now(ZoneInfo("Asia/Seoul")),
        references=[],
        pocs=[],
        snort_rules=[]
    )
    created_cve = await test_cve_service.create_cve(cve_data)
    
    # CVE 삭제
    success = await test_cve_service.delete_cve(created_cve.cve_id)
    assert success is True
    
    # 삭제된 CVE 조회 시도
    deleted_cve = await test_cve_service.get_cve(created_cve.cve_id)
    assert deleted_cve is None

@pytest.mark.asyncio
async def test_search_cves(test_cve_service):
    """CVE 검색 테스트"""
    # 테스트용 CVE들 생성
    cve_data1 = CreateCVERequest(
        cve_id="CVE-2024-0005",
        title="Security Vulnerability",
        description="Test Description 5",
        status="신규등록",
        published_date=datetime.now(ZoneInfo("Asia/Seoul")),
        references=[],
        pocs=[],
        snort_rules=[]
    )
    cve_data2 = CreateCVERequest(
        cve_id="CVE-2024-0006",
        title="Another Issue",
        description="Security related description",
        status="신규등록",
        published_date=datetime.now(ZoneInfo("Asia/Seoul")),
        references=[],
        pocs=[],
        snort_rules=[]
    )
    
    await test_cve_service.create_cve(cve_data1)
    await test_cve_service.create_cve(cve_data2)
    
    # 검색 수행
    results, total = await test_cve_service.search_cves("Security", 0, 10)
    assert len(results) >= 2
    assert total >= 2 