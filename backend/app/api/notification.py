from fastapi import APIRouter, HTTPException, Depends, status, Body, Query, Response, Path
from typing import List, Optional
from ..models.notification import Notification, NotificationCreate, NotificationStatus
from ..models.user import User
from ..api.auth import get_current_user
from ..core.exceptions import NotFoundError, ValidationError, DatabaseError
from ..core.schemas import APIResponse, PaginatedResponse, Metadata
from datetime import datetime
from zoneinfo import ZoneInfo
import logging
from beanie import PydanticObjectId
from ..core.socketio_manager import socketio_manager
from ..services.notification import NotificationService
from ..core.dependencies import get_notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])
notification_service = NotificationService()

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
    current_user: User = Depends(get_current_user)
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
    current_user: User = Depends(get_current_user)
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
            )
        )
    except Exception as e:
        raise DatabaseError(detail=str(e))

@router.get("/unread/count", response_model=APIResponse[dict])
async def get_unread_count(current_user: User = Depends(get_current_user)):
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
        raise DatabaseError(detail=str(e))

@router.put("/{notification_id}/read", response_model=APIResponse[dict])
async def mark_as_read(
    notification_id: str = Path(..., description="읽음 처리할 알림 ID"),
    current_user: User = Depends(get_current_user)
):
    """
    특정 알림을 읽음 상태로 변경합니다.

    Parameters:
        - **notification_id**: 읽음 처리할 알림의 ID
    """
    try:
        success = await notification_service.mark_as_read(
            notification_id,
            str(current_user.id)
        )
        if not success:
            raise NotFoundError(detail="알림을 찾을 수 없습니다.")
        return APIResponse(
            data={"status": "success"},
            message="알림을 성공적으로 읽음 처리했습니다."
        )
    except Exception as e:
        raise DatabaseError(detail=str(e))

@router.put("/read-all", response_model=APIResponse[dict])
async def mark_all_as_read(current_user: User = Depends(get_current_user)):
    """
    사용자의 모든 알림을 읽음 상태로 변경합니다.
    """
    try:
        success = await notification_service.mark_all_as_read(str(current_user.id))
        return APIResponse(
            data={"status": "success"},
            message="모든 알림을 성공적으로 읽음 처리했습니다."
        )
    except Exception as e:
        raise DatabaseError(detail=str(e))

@router.post("/read-multiple")
async def mark_multiple_as_read(
    notification_ids: List[str] = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """여러 알림을 한 번에 읽음 상태로 변경합니다."""
    try:
        logging.info(f"Attempting to mark multiple notifications as read: {notification_ids}")
        
        # ObjectId 변환 및 유효성 검사
        try:
            from bson import ObjectId
            object_ids = [ObjectId(nid) for nid in notification_ids]
        except Exception as e:
            logging.error(f"Invalid notification ID format in list: {notification_ids}")
            raise HTTPException(status_code=400, detail="유효하지 않은 알림 ID가 포함되어 있습니다.")
        
        # 알림 조회 및 권한 검증
        notifications = await Notification.find({"_id": {"$in": object_ids}}).to_list()
        
        # 권한이 없는 알림이 있는지 확인
        unauthorized_notifications = [n for n in notifications if n.recipient_id != current_user.id]
        if unauthorized_notifications:
            logging.error(f"Permission denied for user {current_user.username} to mark some notifications as read")
            raise HTTPException(status_code=403, detail="일부 알림에 대한 권한이 없습니다.")
        
        # 벌크 업데이트 수행
        update_result = await Notification.find({"_id": {"$in": object_ids}}).update({"$set": {"is_read": True}})
        
        logging.info(f"Successfully marked {len(notifications)} notifications as read for user {current_user.username}")
        
        return {"message": f"{len(notifications)}개의 알림을 읽음 상태로 변경했습니다."}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error marking multiple notifications as read: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="알림을 읽음 상태로 변경하는 중 오류가 발생했습니다."
        )
