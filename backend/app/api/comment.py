import logging
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body, status
from pydantic import BaseModel, Field, validator
from ..models.cve_model import CVEModel, Comment
from ..models.user import User
from ..models.notification import Notification, NotificationCreate
from ..core.auth import get_current_user
from zoneinfo import ZoneInfo
import traceback
import re
from beanie import PydanticObjectId
from bson import ObjectId
from ..core.websocket import manager, WSMessageType
from fastapi.logger import logger
from pydantic import ValidationError
from ..api.notification import create_notification
from ..models.notification import Notification
from ..services.notification import NotificationService
from ..core.dependencies import get_notification_service

# 로거 설정
logger = logging.getLogger(__name__)

# 댓글 생성 요청 모델
class CommentCreate(BaseModel):
    content: str = Field(..., description="댓글 내용")
    parent_id: Optional[str] = Field(None, description="부모 댓글 ID (답글인 경우)")
    mentions: List[str] = Field(default=[], description="멘션된 사용자 목록")
    is_deleted: bool = Field(default=False, description="삭제 여부")

    @validator('content')
    def validate_content(cls, v):
        if not v.strip():
            raise ValueError("댓글 내용은 비워둘 수 없습니다.")
        return v.strip()

    @validator('mentions')
    def validate_mentions(cls, v):
        # 중복 제거 및 유효성 검사
        return list(set(filter(None, v)))

# 댓글 수정 요청 모델
class CommentUpdate(BaseModel):
    content: str = Field(..., description="수정할 댓글 내용")

# 댓글 응답 모델
class CommentResponse(BaseModel):
    id: PydanticObjectId = Field(..., description="댓글 ID")
    cve_id: str = Field(..., description="CVE ID")
    content: str = Field(..., description="댓글 내용")
    username: str = Field(..., description="작성자 사용자명")
    user_id: PydanticObjectId = Field(..., description="작성자 ID")
    parent_id: Optional[PydanticObjectId] = Field(None, description="부모 댓글 ID")
    created_at: datetime = Field(..., description="생성 시간")
    updated_at: Optional[datetime] = Field(None, description="수정 시간")
    is_deleted: bool = Field(False, description="삭제 여부")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            PydanticObjectId: lambda v: str(v)
        }

router = APIRouter()

def comment_to_dict(comment: Comment) -> dict:
    """Comment 객체를 JSON 직렬화 가능한 딕셔너리로 변환합니다."""
    comment_dict = comment.dict()
    comment_dict["created_at"] = comment.created_at.isoformat()
    if comment.updated_at:
        comment_dict["updated_at"] = comment.updated_at.isoformat()
    return comment_dict

async def process_mentions(content: str, cve_id: str, comment_id: PydanticObjectId,
                           sender: User, mentioned_usernames: List[str] = None):
    """댓글 내용에서 멘션된 사용자를 찾아 알림을 생성합니다."""
    try:
        logger.info(f"=== Starting process_mentions ===")
        logger.info(f"Parameters: content={content}, cve_id={cve_id}, comment_id={comment_id}, sender={sender.username}")
        
        mentions = mentioned_usernames if mentioned_usernames else re.findall(r'@(\w+)', content)
        logger.info(f"Found mentions: {mentions}")
        
        notifications_created = 0
        for username in mentions:
            try:
                mentioned_user = await User.find_one({"username": username})
                if mentioned_user and str(mentioned_user.id) != str(sender.id):  # 자기 자신 멘션 제외
                    logger.info(f"Processing mention for user: {username} (ID: {mentioned_user.id})")

                    notification, unread_count = await Notification.create_notification(
                        recipient_id=mentioned_user.id,
                        sender_id=sender.id,
                        sender_username=sender.username,
                        cve_id=cve_id,
                        comment_id=comment_id,
                        comment_content=content,
                        content=f"{sender.username}님이 댓글에서 언급했습니다."
                    )
                    if notification and notification.id:
                        notifications_created += 1
                        logger.info(f"Created notification: {notification.id} for user {username}")

                        notification_dict = notification.dict()
                        logger.info(f"Sending WebSocket notification: {notification_dict}")

                        await manager.send_notification(str(mentioned_user.id), notification_dict)
                        logger.info(f"WebSocket notification sent to user {username} (ID: {mentioned_user.id})")
                    else:
                        logger.error(f"Failed to create notification for user {username}")
                else:
                    if not mentioned_user:
                        logger.warning(f"Mentioned user not found: {username}")
                    elif str(mentioned_user.id) == str(sender.id):
                        logger.info(f"Skipping self mention for user: {username}")
            except Exception as e:
                logger.error(f"Error processing mention for user {username}: {str(e)}")
                logger.error(f"Traceback: {traceback.format_exc()}")
                continue
                
        logger.info(f"=== Finished process_mentions: Created {notifications_created} notifications ===")
        return notifications_created
                
    except Exception as e:
        logger.error(f"Error in process_mentions: {str(e)}\n{traceback.format_exc()}")
        raise

async def count_active_comments(cve_id: str) -> int:
    """CVE의 활성화된 댓글 수를 계산합니다."""
    try:
        logger.debug("=== Count Active Comments Debug ===")
        logger.debug(f"Counting active comments for CVE: {cve_id}")
        
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            logger.warning(f"CVE not found: {cve_id}")
            return 0

        if not hasattr(cve, 'comments'):
            logger.debug("No comments field found in CVE document")
            return 0

        active_comments = [comment for comment in cve.comments if not comment.is_deleted]
        count = len(active_comments)
        logger.debug(f"Found {count} active comments out of {len(cve.comments)} total comments")
        
        return count
        
    except Exception as e:
        logger.error(f"Error counting active comments for CVE {cve_id}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise

async def send_comment_update(cve_id: str):
    """댓글 수 업데이트를 WebSocket으로 전송합니다."""
    try:
        active_count = await count_active_comments(cve_id)
        data = {
            "type": "comment_update",
            "data": {
                "cveId": cve_id,
                "activeCommentCount": active_count
            }
        }
        await manager.broadcast(data)
        logger.info(f"Sent comment update for CVE {cve_id} with count {active_count}")
    except Exception as e:
        logger.error(f"Error sending comment update for CVE {cve_id}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")

MAX_COMMENT_DEPTH = 10  # 최대 댓글 깊이 설정 (원한다면 3 등으로 조정 가능)

@router.post("/{cve_id}/comments", response_model=CVEModel)
async def create_comment(
    cve_id: str,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service)
):
    """댓글 생성 API"""
    try:
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(status_code=404, detail="CVE not found")

        # 부모 댓글 ID가 있는 경우 문자열로 변환
        parent_id = str(comment_data.parent_id) if comment_data.parent_id else None

        # 댓글 깊이 계산 (CommentCreate에는 depth 필드가 없으므로 로컬 변수 사용)
        depth = 0
        if parent_id:
            parent_comment = next(
                (comment for comment in cve.comments if str(comment.id) == parent_id),
                None
            )
            if not parent_comment:
                raise HTTPException(status_code=404, detail="Parent comment not found")

            depth = parent_comment.depth + 1
            if depth >= MAX_COMMENT_DEPTH:
                raise HTTPException(
                    status_code=400,
                    detail=f"Maximum comment depth ({MAX_COMMENT_DEPTH}) exceeded"
                )

        # 댓글 생성
        comment = Comment(
            cve_id=cve_id,
            content=comment_data.content,
            username=current_user.username,
            parent_id=parent_id,
            depth=depth,
            created_at=datetime.now(ZoneInfo("Asia/Seoul")),
            mentions=comment_data.mentions
        )
        
        # CVE 문서에 댓글 추가
        if not hasattr(cve, 'comments'):
            cve.comments = []
        cve.comments.append(comment)
        await cve.save()
        
        logger.info(f"Comment created: {comment.id} for CVE: {cve_id}")

        # 멘션된 사용자들에게 알림 전송 (생략 또는 구현)
        # await process_mentions(
        #     content=comment_data.content,
        #     cve_id=cve_id,
        #     comment_id=comment.id,
        #     sender=current_user,
        #     mentioned_usernames=comment_data.mentions
        # )

        # 업데이트된 CVE 문서 반환
        return cve

    except Exception as e:
        logger.error(f"Error creating comment: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"댓글 생성 중 오류가 발생했습니다: {str(e)}"
        )

@router.patch("/{cve_id}/comments/{comment_id}", response_model=dict)
async def update_comment(
    cve_id: str,
    comment_id: PydanticObjectId,
    comment_data: CommentUpdate,
    current_user: User = Depends(get_current_user)
):
    """댓글을 수정합니다."""
    try:
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(status_code=404, detail="CVE를 찾을 수 없습니다.")

        comment = None
        for c in cve.comments:
            if str(c.id) == str(comment_id):
                comment = c
                break

        if not comment:
            raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
            
        if comment.username != current_user.username and not current_user.is_admin:
            raise HTTPException(status_code=403, detail="댓글을 수정할 권한이 없습니다.")
            
        # KST 시간대
        kst_now = datetime.now(ZoneInfo("Asia/Seoul"))
            
        # 댓글 수정
        comment.content = comment_data.content
        comment.updated_at = kst_now
        await cve.save()
        
        # 웹소켓을 통해 댓글 수정 이벤트 발송
        await send_comment_update(cve_id)
        
        # 새로운 멘션 처리
        mentions = re.findall(r'@(\w+)', comment_data.content)
        if mentions:
            for username in mentions:
                if username == current_user.username:
                    continue
                mentioned_user = await User.find_one({"username": username})
                if mentioned_user:
                    notification = await Notification(
                        recipient_id=mentioned_user.id,
                        sender_id=current_user.id,
                        sender_username=current_user.username,
                        cve_id=cve_id,
                        comment_id=comment_id,
                        comment_content=comment_data.content,
                        content=f"{current_user.username}님이 수정된 댓글에서 회원님을 언급했습니다.",
                        type="mention"
                    ).create()

                    if notification:
                        notification_data = {
                            "type": "notification",
                            "data": {
                                "notification": notification.dict(),
                                "unreadCount": await Notification.count_unread(str(mentioned_user.id))
                            }
                        }
                        await manager.send_personal_message(
                            notification_data,
                            str(mentioned_user.id)
                        )

        # 활성화된 댓글 수
        active_count = await count_active_comments(cve_id)

        # 댓글 목록 딕셔너리 변환
        comments = []
        for c in cve.comments:
            comment_dict = {
                "id": c.id,
                "content": c.content,
                "username": c.username,
                "created_at": c.created_at,
                "updated_at": c.updated_at,
                "is_deleted": c.is_deleted,
                "parent_id": c.parent_id,
                "depth": c.depth
            }
            comments.append(comment_dict)
        
        return {
            "comment": comment,
            "comments": comments,
            "count": active_count
        }
    except Exception as e:
        logger.error(f"Error updating comment: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"댓글 수정 중 오류가 발생했습니다: {str(e)}"
        )

@router.delete("/{cve_id}/comments/{comment_id}")
async def delete_comment(
    cve_id: str,
    comment_id: str,
    permanent: bool = False,
    current_user: User = Depends(get_current_user)
):
    """댓글을 삭제합니다."""
    try:
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(status_code=404, detail="CVE를 찾을 수 없습니다.")

        comment = None
        comment_index = None
        for i, c in enumerate(cve.comments):
            if str(c.id) == comment_id:
                comment = c
                comment_index = i
                break

        if not comment:
            raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")

        # 권한 체크
        if str(comment.username) != current_user.username and not current_user.is_admin:
            raise HTTPException(status_code=403, detail="댓글을 삭제할 권한이 없습니다.")

        if permanent:
            # 관리자만 영구 삭제 가능
            if not current_user.is_admin:
                raise HTTPException(status_code=403, detail="영구 삭제 권한이 없습니다.")
            cve.comments.pop(comment_index)
        else:
            comment.is_deleted = True

        await cve.save()
        
        # 댓글 수 업데이트 이벤트 발송
        await send_comment_update(cve_id)

        return {"message": "댓글이 삭제되었습니다."}

    except Exception as e:
        logger.error(f"Error deleting comment: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"댓글 삭제 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/{cve_id}/comments")
async def get_comments(cve_id: str):
    """CVE의 모든 댓글을 조회합니다."""
    try:
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(
                status_code=404, 
                detail=f"CVE를 찾을 수 없습니다: {cve_id}"
            )

        if not hasattr(cve, 'comments'):
            return []

        comments = []
        for comment in cve.comments:
            comment_dict = {
                "id": comment.id,
                "content": comment.content,
                "username": comment.username,
                "created_at": comment.created_at,
                "updated_at": comment.updated_at,
                "is_deleted": comment.is_deleted,
                "parent_id": comment.parent_id,
                "depth": comment.depth
            }
            comments.append(comment_dict)
        return comments
        
    except Exception as e:
        logger.error(f"Error in get_comments: {str(e)}")
        logger.error(traceback.format_exc())
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=500, 
            detail=f"서버 오류: {str(e)}"
        )

@router.get("/{cve_id}/comments/count")
async def get_comment_count(cve_id: str):
    """CVE의 활성화된 댓글 수를 반환합니다."""
    try:
        logger.debug("=== Get Comment Count Debug ===")
        logger.debug(f"Getting comment count for CVE: {cve_id}")
        
        count = await count_active_comments(cve_id)
        logger.debug(f"Comment count result: {count}")
        
        return {"count": count}
    except Exception as e:
        logger.error(f"Error getting comment count for CVE {cve_id}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"댓글 수 조회 중 오류가 발생했습니다: {str(e)}"
        )
