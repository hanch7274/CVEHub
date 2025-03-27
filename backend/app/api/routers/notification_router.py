"""
알림(Notification) 관련 API 라우터
"""
from fastapi import APIRouter, HTTPException, Depends, status, Body, Query, Response, Path
from typing import List, Optional
from app.models.notification_model import Notification, NotificationCreate, NotificationStatus
from app.models.user_model import User
from app.core.auth import get_current_user
from app.core.exceptions import NotFoundError, ValidationError, DatabaseError
from app.core.schemas import APIResponse, PaginatedResponse, Metadata
from app.core.socketio_manager import socketio_manager
from app.services.notification import NotificationService
from app.core.dependencies import get_notification_service
import logging
router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/", response_model=APIResponse[Notification])
async def create_notification(
    notification_data: NotificationCreate = Body(
        ...,
        description="생성할 알림 데이터",
        example={
            "recipient_id": "user123",
            "content": "새로운 CVE가 등록되었습니다.",
            "type": "cve_update"
        }
    ),
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service)
):
    """
    새로운 알림을 생성합니다.

    - **notification_data**: 생성할 알림의 상세 정보
    - 알림 생성 후 WebSocket을 통해 실시간으로 수신자에게 전송됩니다.
    """
    try:
        notification = await notification_service.create_notification(
            recipient_id=notification_data.recipient_id,
            sender_id=str(current_user.id),
            content=notification_data.content,
            type=notification_data.type,
            metadata=notification_data.metadata
        )
        await socketio_manager.emit("new_notification", notification.dict(), room=notification_data.recipient_id)
        return APIResponse(
            data=notification,
            message="알림이 성공적으로 생성되었습니다."
        )
    except Exception as e:
        logger.error(f"알림 생성 중 오류 발생: {str(e)}")
        raise DatabaseError(detail=str(e))

@router.get("/", response_model=PaginatedResponse[List[Notification]])
async def get_notifications(
    response: Response,
    skip: int = Query(0, ge=0, description="건너뛸 알림 수"),
    limit: int = Query(20, ge=1, le=100, description="한 페이지당 알림 수"),
    status: Optional[NotificationStatus] = Query(
        None,
        description="알림 상태 필터 (read/unread)"
    ),
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service)
):
    """
    사용자의 알림 목록을 조회합니다.

    응답 헤더:
    - **X-Total-Count**: 전체 알림 수
    - **X-Unread-Count**: 읽지 않은 알림 수

    페이지네이션:
    - **skip**: 건너뛸 알림 수 (기본값: 0)
    - **limit**: 한 페이지당 알림 수 (기본값: 20, 최대: 100)

    필터링:
    - **status**: 알림 상태로 필터링 (read/unread)
    """
    try:
        notifications = await notification_service.get_notifications(
            str(current_user.id),
            skip,
            limit,
            status
        )
        
        total_count = await notification_service.get_total_count(str(current_user.id))
        unread_count = await notification_service.get_unread_count(str(current_user.id))
        
        response.headers["X-Total-Count"] = str(total_count)
        response.headers["X-Unread-Count"] = str(unread_count)

        return PaginatedResponse(
            data=notifications,
            meta=Metadata(
                total=total_count,
                page=skip // limit + 1,
                pages=(total_count + limit - 1) // limit,
                has_next=skip + limit < total_count,
                has_prev=skip > 0
            ),
            message="알림 목록을 성공적으로 조회했습니다."
        )
    except Exception as e:
        logger.error(f"알림 목록 조회 중 오류 발생: {str(e)}")
        raise DatabaseError(detail=str(e))

@router.get("/unread/count", response_model=APIResponse[dict])
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service)
):
    """
    읽지 않은 알림 개수를 조회합니다.

    Returns:
        - **count**: 읽지 않은 알림 개수
    """
    try:
        count = await notification_service.get_unread_count(str(current_user.id))
        return APIResponse(
            data={"count": count},
            message="읽지 않은 알림 개수를 성공적으로 조회했습니다."
        )
    except Exception as e:
        logger.error(f"읽지 않은 알림 개수 조회 중 오류 발생: {str(e)}")
        raise DatabaseError(detail=str(e))

@router.patch("/{notification_id}/read", response_model=APIResponse[Notification])
async def mark_as_read(
    notification_id: str = Path(..., description="읽음 처리할 알림 ID"),
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service)
):
    """
    특정 알림을 읽음 상태로 변경합니다.

    Parameters:
        - **notification_id**: 읽음 처리할 알림의 ID
    """
    try:
        notification = await notification_service.mark_as_read(notification_id, str(current_user.id))
        return APIResponse(
            data=notification,
            message="알림이 읽음 상태로 변경되었습니다."
        )
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"알림 읽음 처리 중 오류 발생: {str(e)}")
        raise DatabaseError(detail=str(e))

@router.patch("/mark-all-read", response_model=APIResponse[dict])
async def mark_all_as_read(
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service)
):
    """
    사용자의 모든 알림을 읽음 상태로 변경합니다.
    """
    try:
        count = await notification_service.mark_all_as_read(str(current_user.id))
        return APIResponse(
            data={"count": count},
            message=f"{count}개의 알림이 모두 읽음 상태로 변경되었습니다."
        )
    except Exception as e:
        logger.error(f"모든 알림 읽음 처리 중 오류 발생: {str(e)}")
        raise DatabaseError(detail=str(e))

@router.patch("/mark-multiple-read", response_model=APIResponse[dict])
async def mark_multiple_as_read(
    notification_ids: List[str] = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service)
):
    """
    여러 알림을 한 번에 읽음 상태로 변경합니다.
    
    Parameters:
        - **notification_ids**: 읽음 처리할 알림 ID 목록
    """
    if not notification_ids:
        return APIResponse(
            data={"count": 0},
            message="변경할 알림이 없습니다."
        )
    
    try:
        # 알림 ID를 ObjectId로 변환
        object_ids = []
        for id_str in notification_ids:
            try:
                object_ids.append(id_str)
            except Exception:
                raise ValidationError(f"유효하지 않은 알림 ID 형식: {id_str}")
        
        count = await notification_service.mark_multiple_as_read(object_ids, str(current_user.id))
        return APIResponse(
            data={"count": count},
            message=f"{count}개의 알림이 읽음 상태로 변경되었습니다."
        )
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"다중 알림 읽음 처리 중 오류 발생: {str(e)}")
        raise DatabaseError(detail=str(e))
