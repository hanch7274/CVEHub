import logging
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from ..models.cve import CVEModel, Comment
from ..models.user import User
from ..models.notification import Notification, NotificationCreate
from ..routes.auth import get_current_user
from ..routes.notification import create_notification
from zoneinfo import ZoneInfo
import traceback
import re
from beanie import PydanticObjectId
from bson import ObjectId
from ..core.websocket import manager

# 로거 설정
logger = logging.getLogger("comment_router")
logger.setLevel(logging.DEBUG)

# 댓글 생성 요청 모델
class CommentCreate(BaseModel):
    content: str = Field(..., description="댓글 내용")
    parent_id: Optional[PydanticObjectId] = Field(None, description="부모 댓글 ID (답글인 경우)")
    mentions: List[str] = Field(..., description="멘션된 사용자 목록")

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
    isDeleted: bool = Field(False, description="삭제 여부")

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

async def process_mentions(content: str, cve_id: str, comment_id: PydanticObjectId, sender: User, mentioned_usernames: List[str] = None):
    """댓글 내용에서 멘션된 사용자를 찾아 알림을 생성합니다."""
    try:
        logger.info(f"=== Starting process_mentions ===")
        logger.info(f"Parameters: content={content}, cve_id={cve_id}, comment_id={comment_id}, sender={sender.username}")
        
        # 멘션된 사용자 목록 가져오기
        mentions = mentioned_usernames if mentioned_usernames else re.findall(r'@(\w+)', content)
        logger.info(f"Found mentions: {mentions}")
        
        notifications_created = 0
        for username in mentions:
            try:
                # 멘션된 사용자 찾기
                mentioned_user = await User.find_one({"username": username})
                if mentioned_user and str(mentioned_user.id) != str(sender.id):  # 자기 자신을 멘션한 경우 제외
                    logger.info(f"Processing mention for user: {username} (ID: {mentioned_user.id})")
                    
                    # 알림 생성
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
                        
                        # 웹소켓을 통해 실시간 알림 전송
                        notification_dict = notification.dict()
                        logger.info(f"Sending WebSocket notification: {notification_dict}")
                        
                        await manager.send_notification(
                            str(mentioned_user.id),
                            notification_dict
                        )
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
                logger.error(f"Error type: {type(e)}")
                logger.error(f"Full error details: {e.__dict__ if hasattr(e, '__dict__') else 'No details available'}")
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
        # CVE 문서를 찾습니다
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            logger.warning(f"CVE not found: {cve_id}")
            return 0
            
        # comments 필드가 없는 경우 0을 반환
        if not hasattr(cve, 'comments'):
            return 0
            
        # 활성화된 댓글만 필터링하여 카운트
        active_comments = [comment for comment in cve.comments if not comment.is_deleted]
        return len(active_comments)
        
    except Exception as e:
        logger.error(f"Error counting active comments for CVE {cve_id}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise

async def send_comment_update(cve_id: str):
    """댓글 수 업데이트를 WebSocket으로 전송합니다."""
    try:
        active_count = await count_active_comments(cve_id)
        data = {
            "cveId": cve_id,
            "activeCommentCount": active_count
        }
        from ..core.websocket import notify_clients
        await notify_clients("comment_update", data)
        logger.info(f"Sent comment update for CVE {cve_id} with count {active_count}")
    except Exception as e:
        logger.error(f"Error sending comment update for CVE {cve_id}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")

@router.post("/{cve_id}/comments", response_model=Comment)
async def create_comment(
    cve_id: str,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user)
):
    """CVE에 새로운 댓글을 추가합니다."""
    try:
        # CVE 문서 찾기
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(status_code=404, detail="CVE를 찾을 수 없습니다.")

        # 새 댓글 생성
        new_comment = Comment(
            content=comment_data.content,
            username=current_user.username,
            parent_id=comment_data.parent_id,
            mentions=comment_data.mentions,
            created_at=datetime.now(ZoneInfo("Asia/Seoul"))
        )

        # 멘션된 사용자들에 대한 알림 생성
        await process_mentions(
            content=comment_data.content,
            cve_id=cve_id,
            comment_id=new_comment.id,
            sender=current_user,
            mentioned_usernames=comment_data.mentions
        )

        # CVE 문서에 댓글 추가
        if not cve.comments:
            cve.comments = []
        cve.comments.append(new_comment)
        await cve.save()

        # 댓글 생성 후 WebSocket으로 업데이트 전송
        await send_comment_update(cve_id)
        return new_comment

    except Exception as e:
        logger.error(f"댓글 생성 중 오류: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"댓글 추가 중 오류가 발생했습니다: {str(e)}")

@router.put("/{cve_id}/comments/{comment_id}", response_model=CommentResponse)
async def update_comment(
    cve_id: str,
    comment_id: PydanticObjectId,
    comment_data: CommentUpdate,
    current_user: User = Depends(get_current_user)
):
    """댓글을 수정합니다."""
    try:
        comment = await Comment.get(comment_id)
        if not comment:
            raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
            
        if str(comment.user_id) != str(current_user.id) and current_user.username != "admin":
            raise HTTPException(status_code=403, detail="댓글을 수정할 권한이 없습니다.")
            
        # 댓글 수정
        comment.content = comment_data.content
        await comment.save()
        
        # 웹소켓을 통해 댓글 수정 이벤트 발송
        await send_comment_update(cve_id)
        
        # 멘션된 사용자 처리
        await process_mentions(comment_data.content, cve_id, comment.id, current_user)
        
        return comment
    except Exception as e:
        logger.error(f"Error updating comment: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="댓글 수정 중 오류가 발생했습니다.")

@router.delete("/{cve_id}/comments/{comment_id}")
async def delete_comment(
    cve_id: str,
    comment_id: PydanticObjectId,
    permanent: bool = False,
    current_user: User = Depends(get_current_user)
):
    """댓글을 삭제합니다."""
    try:
        comment = await Comment.get(comment_id)
        if not comment:
            raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
            
        if str(comment.user_id) != str(current_user.id) and current_user.username != "admin":
            raise HTTPException(status_code=403, detail="댓글을 삭제할 권한이 없습니다.")
            
        if permanent and current_user.username == "admin":
            # 관리자의 경우 영구 삭제
            await comment.delete()
        else:
            # 일반 사용자는 소프트 삭제
            comment.isDeleted = True
            await comment.save()
        
        # 댓글 삭제 후 WebSocket으로 업데이트 전송
        await send_comment_update(cve_id)
        
        return {"message": "댓글이 삭제되었습니다."}
    except Exception as e:
        logger.error(f"Error deleting comment: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="댓글 삭제 중 오류가 발생했습니다.")

@router.get("/{cve_id}/comments")
async def get_comments(cve_id: str):
    """CVE의 모든 댓글을 조회합니다."""
    try:
        print("\n=== Comment Get Debug ===")
        print(f"CVE ID: {cve_id} (type: {type(cve_id)})")

        # CVE 검색
        print("\n=== Finding CVE ===")
        query = {"cve_id": cve_id}
        print(f"First query: {query}")
        
        cve = await CVEModel.find_one(query)
        print(f"First search result: {cve is not None}")
        
        if not cve:
            # 대소문자를 구분하지 않는 검색 시도
            print(f"Trying case-insensitive search for CVE ID: {cve_id}")
            query = {"$or": [{"cve_id": cve_id}, {"cve_id": cve_id.upper()}]}
            print(f"Second query: {query}")
            
            cve = await CVEModel.find_one(query)
            print(f"Second search result: {cve is not None}")
            
            if not cve:
                # 전체 CVE 목록 확인
                print("\n=== Checking all CVEs ===")
                all_cves = await CVEModel.find({}).to_list()
                print(f"Total CVEs in database: {len(all_cves)}")
                print("Available CVE IDs:")
                for existing_cve in all_cves:
                    print(f"- {existing_cve.cve_id}")
                
                print(f"\nCVE not found with ID: {cve_id}")
                raise HTTPException(status_code=404, detail=f"CVE를 찾을 수 없습니다: {cve_id}")
        
        print(f"Found CVE: {cve.cve_id}")

        
        # 댓글 목록이 없는 경우 빈 리스트 반환
        if not hasattr(cve, 'comments'):
            return []

        # 댓글 목록을 딕셔너리로 변환하고 parent_id가 None인 경우도 명시적으로 포함
        comments = []
        for comment in cve.comments:
            comment_dict = {
                "id": comment.id,
                "content": comment.content,
                "username": comment.username,
                "created_at": comment.created_at,
                "updated_at": comment.updated_at,
                "is_deleted": comment.is_deleted,
                "parent_id": comment.parent_id,  # None이어도 명시적으로 포함
                "depth": comment.depth
            }
            comments.append(comment_dict)
            
        print(f"\nTotal comments found: {len(comments)}")
        return comments
        
    except Exception as e:
        print(f"\n=== Error in get_comments ===")
        print(f"Error type: {type(e)}")
        print(f"Error message: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")

@router.delete("/{cve_id}/comments/{comment_id}/permanent")
async def permanently_delete_comment(
    cve_id: str,
    comment_id: str,
    current_user = Depends(get_current_user)
):
    """관리자만 사용 가능한 댓글 완전 삭제 엔드포인트"""
    try:
        if current_user.username != "admin":
            raise HTTPException(
                status_code=403,
                detail="관리자만 댓글을 완전히 삭제할 수 있습니다."
            )

        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(status_code=404, detail="CVE를 찾을 수 없습니다.")

        # 댓글 찾기 및 삭제
        comment_found = False
        cve.comments = [c for c in cve.comments if c.id != comment_id]
        
        # 변경사항 저장
        await cve.save()

        return {"message": "댓글이 완전히 삭제되었습니다."}

    except Exception as e:
        logger.error(f"Error in permanently_delete_comment: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")

@router.get("/{cve_id}/comments/count")
async def get_comment_count(
    cve_id: str,
    current_user: User = Depends(get_current_user)
):
    """CVE의 활성화된 댓글 수를 반환합니다."""
    try:
        count = await count_active_comments(cve_id)
        return {"count": count}
    except Exception as e:
        logger.error(f"Error getting comment count for CVE {cve_id}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"댓글 수 조회 중 오류가 발생했습니다: {str(e)}"
        )
