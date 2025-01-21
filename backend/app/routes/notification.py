from fastapi import APIRouter, HTTPException, Depends, status, Body
from typing import List
from app.models.notification import Notification, NotificationCreate
from app.models.user import User
from app.routes.auth import get_current_user
from datetime import datetime
import logging

router = APIRouter()

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
        return notification
    except Exception as e:
        logging.error(f"Error creating notification: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="알림을 생성하는 중 오류가 발생했습니다."
        )

@router.get("/", response_model=List[Notification])
async def get_notifications(current_user: User = Depends(get_current_user)):
    """현재 사용자의 모든 알림을 조회합니다."""
    try:
        notifications = await Notification.find(
            {"recipient_id": current_user.id}
        ).sort("-created_at").to_list()
        logging.info(f"Retrieved {len(notifications)} notifications for user {current_user.username}")
        return notifications
    except Exception as e:
        logging.error(f"Error retrieving notifications: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="알림을 조회하는 중 오류가 발생했습니다."
        )

@router.get("/unread", response_model=int)
async def get_unread_count(current_user: User = Depends(get_current_user)):
    """현재 사용자의 읽지 않은 알림 개수를 반환합니다."""
    try:
        count = await Notification.find(
            {"recipient_id": current_user.id, "is_read": False}
        ).count()
        logging.info(f"Unread notification count for user {current_user.username}: {count}")
        return count
    except Exception as e:
        logging.error(f"Error counting unread notifications: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="읽지 않은 알림 개수를 조회하는 중 오류가 발생했습니다."
        )

@router.post("/read/{notification_id}")
async def mark_as_read(notification_id: str, current_user: User = Depends(get_current_user)):
    """특정 알림을 읽음 상태로 변경합니다."""
    try:
        logging.info(f"Attempting to mark notification {notification_id} as read")
        
        try:
            from bson import ObjectId
            notification = await Notification.get(ObjectId(notification_id))
        except Exception as e:
            logging.error(f"Invalid notification ID format: {notification_id}")
            raise HTTPException(status_code=400, detail="유효하지 않은 알림 ID입니다.")
            
        if not notification:
            logging.error(f"Notification not found: {notification_id}")
            raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")
            
        if notification.recipient_id != current_user.id:
            logging.error(f"Permission denied for user {current_user.username} to mark notification {notification_id} as read")
            raise HTTPException(status_code=403, detail="이 알림에 대한 권한이 없습니다.")
            
        notification.is_read = True
        await notification.save()
        logging.info(f"Successfully marked notification {notification_id} as read for user {current_user.username}")
        
        return {"message": "알림을 읽음 상태로 변경했습니다."}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error marking notification as read: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="알림을 읽음 상태로 변경하는 중 오류가 발생했습니다."
        )

@router.post("/read-all")
async def mark_all_as_read(current_user: User = Depends(get_current_user)):
    """현재 사용자의 모든 알림을 읽음 상태로 변경합니다."""
    try:
        result = await Notification.find(
            {"recipient_id": current_user.id, "is_read": False}
        ).update({"$set": {"is_read": True}})
        
        logging.info(f"Marked all notifications as read for user {current_user.username}")
        return {"message": "모든 알림을 읽음 상태로 변경했습니다."}
    except Exception as e:
        logging.error(f"Error marking all notifications as read: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="알림을 일괄 변경하는 중 오류가 발생했습니다."
        )
