from fastapi import APIRouter, HTTPException, Depends, status, Body, Query
from typing import List, Optional
from ..models.notification import Notification, NotificationCreate
from ..models.user import User
from ..api.auth import get_current_user
from datetime import datetime
from zoneinfo import ZoneInfo
import logging
from beanie import PydanticObjectId
from ..core.websocket import manager
from ..services.notification import NotificationService
from ..core.dependencies import get_notification_service

router = APIRouter()
notification_service = NotificationService()

@router.post("/", response_model=Notification)
async def create_notification(
    notification_data: NotificationCreate = Body(...),
    current_user: User = Depends(get_current_user)
):
    """새로운 알림을 생성합니다."""
    try:
        notification = await Notification.create_notification(
            recipient_id=notification_data.recipient_id,
            sender_id=notification_data.sender_id,
            cve_id=notification_data.cve_id,
            comment_id=notification_data.comment_id,
            content=notification_data.content
        )
        logging.info(f"Created notification: {notification.id}")

        # 읽지 않은 알림 개수 조회
        unread_count = await Notification.find(
            {"recipient_id": notification_data.recipient_id, "is_read": False}
        ).count()

        # 웹소켓 메시지 전송
        if manager.is_connected(str(notification_data.recipient_id)):
            logging.info(f"Sending WebSocket notification to user {notification_data.recipient_id}")
            message = {
                "type": "notification",
                "data": {
                    "notification": notification.dict(),
                    "unreadCount": unread_count
                }
            }
            # 수신자의 모든 활성 연결에 메시지 전송
            for websocket in manager.active_connections.get(str(notification_data.recipient_id), []):
                await manager.send_personal_message(message, websocket)
        else:
            logging.info(f"User {notification_data.recipient_id} is not connected to WebSocket")

        return notification
    except Exception as e:
        logging.error(f"Error creating notification: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="알림을 생성하는 중 오류가 발생했습니다."
        )

@router.get("/")
async def get_notifications(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    is_read: bool = None,
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service)
):
    """사용자의 알림 목록을 조회합니다."""
    try:
        notifications, total = await notification_service.get_user_notifications(
            current_user.id,
            skip,
            limit,
            is_read
        )
        return {
            "items": notifications,
            "total": total,
            "page": skip // limit + 1,
            "size": limit,
            "pages": (total + limit - 1) // limit
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/unread-count")
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service)
):
    """현재 로그인한 사용자의 읽지 않은 알림 개수를 조회합니다."""
    try:
        count = await notification_service.get_unread_count(current_user.id)
        return {"count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service)
):
    """알림을 읽음 처리합니다."""
    try:
        notification = await notification_service.mark_as_read(
            PydanticObjectId(notification_id),
            current_user.id
        )
        if not notification:
            raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")
        return notification
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/read-all")
async def mark_all_as_read(
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service)
):
    """모든 알림을 읽음 처리합니다."""
    try:
        await notification_service.mark_all_as_read(current_user.id)
        return {"message": "모든 알림이 읽음 처리되었습니다."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
