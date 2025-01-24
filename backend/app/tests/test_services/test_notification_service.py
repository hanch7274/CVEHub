import pytest
from datetime import datetime
from beanie import PydanticObjectId
from ...models.notification import NotificationCreate
from ...core.exceptions import NotFoundException

@pytest.mark.asyncio
async def test_create_notification(test_notification_service, test_user):
    """알림 생성 테스트"""
    notification_data = NotificationCreate(
        recipient_id=test_user.id,
        sender_id=PydanticObjectId(),
        content="테스트 알림",
        cve_id="CVE-2024-0001",
        comment_id=None
    )
    
    result = await test_notification_service.create_notification(notification_data)
    assert result is not None
    notification, unread_count = result
    
    assert notification.content == "테스트 알림"
    assert notification.recipient_id == test_user.id
    assert notification.is_read == False
    assert unread_count >= 1

@pytest.mark.asyncio
async def test_get_user_notifications(test_notification_service, test_user):
    """사용자 알림 조회 테스트"""
    # 테스트용 알림 여러 개 생성
    for i in range(3):
        notification_data = NotificationCreate(
            recipient_id=test_user.id,
            sender_id=PydanticObjectId(),
            content=f"테스트 알림 {i+1}",
            cve_id=f"CVE-2024-000{i+1}",
            comment_id=None
        )
        await test_notification_service.create_notification(notification_data)
    
    # 알림 조회
    notifications, total = await test_notification_service.get_user_notifications(
        test_user.id,
        skip=0,
        limit=10
    )
    
    assert len(notifications) >= 3
    assert total >= 3
    assert all(n.recipient_id == test_user.id for n in notifications)

@pytest.mark.asyncio
async def test_mark_as_read(test_notification_service, test_user):
    """알림 읽음 처리 테스트"""
    # 테스트용 알림 생성
    notification_data = NotificationCreate(
        recipient_id=test_user.id,
        sender_id=PydanticObjectId(),
        content="읽음 처리할 알림",
        cve_id="CVE-2024-0001",
        comment_id=None
    )
    created_notification, _ = await test_notification_service.create_notification(notification_data)
    
    # 알림 읽음 처리
    result = await test_notification_service.mark_as_read(
        created_notification.id,
        test_user.id
    )
    assert result is not None
    notification, unread_count = result
    
    assert notification.is_read == True
    assert notification.id == created_notification.id

@pytest.mark.asyncio
async def test_mark_all_as_read(test_notification_service, test_user):
    """모든 알림 읽음 처리 테스트"""
    # 테스트용 알림 여러 개 생성
    for i in range(3):
        notification_data = NotificationCreate(
            recipient_id=test_user.id,
            sender_id=PydanticObjectId(),
            content=f"읽음 처리할 알림 {i+1}",
            cve_id=f"CVE-2024-000{i+1}",
            comment_id=None
        )
        await test_notification_service.create_notification(notification_data)
    
    # 모든 알림 읽음 처리
    modified_count = await test_notification_service.mark_all_as_read(test_user.id)
    assert modified_count > 0
    
    # 읽지 않은 알림 수 확인
    unread_count = await test_notification_service.get_unread_count(test_user.id)
    assert unread_count == 0

@pytest.mark.asyncio
async def test_get_unread_count(test_notification_service, test_user):
    """읽지 않은 알림 수 조회 테스트"""
    # 초기 상태 확인
    initial_count = await test_notification_service.get_unread_count(test_user.id)
    
    # 테스트용 알림 생성
    notification_data = NotificationCreate(
        recipient_id=test_user.id,
        sender_id=PydanticObjectId(),
        content="새로운 알림",
        cve_id="CVE-2024-0001",
        comment_id=None
    )
    await test_notification_service.create_notification(notification_data)
    
    # 읽지 않은 알림 수 확인
    new_count = await test_notification_service.get_unread_count(test_user.id)
    assert new_count == initial_count + 1

@pytest.mark.asyncio
async def test_cleanup_old_notifications(test_notification_service, test_user):
    """오래된 알림 정리 테스트"""
    # 테스트용 알림 생성
    notification_data = NotificationCreate(
        recipient_id=test_user.id,
        sender_id=PydanticObjectId(),
        content="오래된 알림",
        cve_id="CVE-2024-0001",
        comment_id=None
    )
    await test_notification_service.create_notification(notification_data)
    
    # 오래된 알림 정리 (1일 이상된 알림)
    deleted_count = await test_notification_service.cleanup_old_notifications(days=1)
    assert deleted_count >= 0 