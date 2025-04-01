import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import re
from zoneinfo import ZoneInfo
from beanie import PydanticObjectId

from app.models.cve_model import CVEModel, Comment
from app.models.user_model import User
from app.core.socketio_manager import socketio_manager, WSMessageType
from app.models.notification_model import Notification
from app.services.activity_service import ActivityService
from app.models.activity_model import ActivityAction, ActivityTargetType

logger = logging.getLogger(__name__)

MAX_COMMENT_DEPTH = 10  # 최대 댓글 깊이 설정

class CommentService:
    """댓글 관련 비즈니스 로직을 처리하는 서비스 클래스"""
    
    activity_service = None
    
    @classmethod
    def initialize(cls, activity_service: ActivityService):
        """서비스 초기화 및 의존성 주입"""
        cls.activity_service = activity_service
        logger.info("CommentService initialized with ActivityService")
    
    @staticmethod
    def comment_to_dict(comment: Comment) -> dict:
        """Comment 객체를 JSON 직렬화 가능한 딕셔너리로 변환합니다."""
        comment_dict = comment.dict()
        comment_dict["created_at"] = comment.created_at.isoformat()
        if comment.last_modified_at:
            comment_dict["last_modified_at"] = comment.last_modified_at.isoformat()
        return comment_dict
    
    @classmethod
    async def process_mentions(cls, content: str, cve_id: str, comment_id: PydanticObjectId,
                           sender: User, mentioned_usernames: List[str] = None) -> Tuple[int, List[str]]:
        """댓글 내용에서 멘션된 사용자를 찾아 알림을 생성합니다."""
        try:
            logger.info(f"=== Starting process_mentions ===")
            logger.info(f"Parameters: content={content}, cve_id={cve_id}, comment_id={comment_id}, sender={sender.username}")
            
            mentions = mentioned_usernames if mentioned_usernames else re.findall(r'@(\w+)', content)
            logger.info(f"Found mentions: {mentions}")
            
            notifications_created = 0
            processed_users = []
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
                        
                        logger.info(f"Notification created: {notification.id}")
                        notifications_created += 1
                        processed_users.append(username)
                        
                        # Socket.IO를 통해 실시간 알림 전송
                        await socketio_manager.emit(
                            "notification",
                            {
                                "type": WSMessageType.NOTIFICATION,
                                "data": {
                                    "notification": CommentService.comment_to_dict(notification),
                                    "unread_count": unread_count
                                }
                            },
                            room=str(mentioned_user.id)
                        )
                except Exception as e:
                    logger.error(f"Error processing mention for {username}: {str(e)}")
            
            logger.info(f"Processed {notifications_created} mentions: {processed_users}")
            return notifications_created, processed_users
            
        except Exception as e:
            logger.error(f"Error in process_mentions: {str(e)}")
            return 0, []
    
    @classmethod
    async def count_active_comments(cls, cve_id: str) -> int:
        """CVE의 활성화된 댓글 수를 계산합니다."""
        try:
            # CVE 찾기
            cve = await CVEModel.find_one({"cve_id": cve_id})
            if not cve:
                logger.error(f"CVE not found: {cve_id}")
                return 0
                
            # 삭제되지 않은 댓글 수 계산
            active_comments = [c for c in cve.comments if not c.is_deleted]
            logger.info(f"Found {len(active_comments)} active comments for CVE {cve_id}")
            return len(active_comments)
        except Exception as e:
            logger.error(f"Error counting active comments: {str(e)}")
            return 0
    
    @classmethod
    async def send_comment_update(cls, cve_id: str) -> None:
        """댓글 수 업데이트를 Socket.IO로 전송합니다."""
        try:
            count = await CommentService.count_active_comments(cve_id)
            await socketio_manager.emit(
                "comment_count",
                {
                    "type": WSMessageType.COMMENT_COUNT_UPDATE,
                    "data": {"cve_id": cve_id, "count": count}
                },
                broadcast=True
            )
            logger.info(f"Sent comment count update for {cve_id}: {count}")
        except Exception as e:
            logger.error(f"Error sending comment update: {str(e)}")
    
    @classmethod
    async def create_comment(cls, cve_id: str, content: str, user: User, 
                             parent_id: Optional[str] = None, 
                             mentions: List[str] = None) -> Tuple[Optional[Comment], str]:
        """새 댓글을 생성합니다."""
        try:
            # CVE 찾기
            cve = await CVEModel.find_one({"cve_id": cve_id})
            if not cve:
                logger.error(f"CVE not found: {cve_id}")
                return None, f"CVE를 찾을 수 없습니다: {cve_id}"
            
            # 댓글 트리 구조 확인 (depth 제한)
            if parent_id:
                # 부모 댓글 찾기
                parent_comment = None
                for comment in cve.comments:
                    if str(comment.id) == parent_id:
                        parent_comment = comment
                        break
                
                if not parent_comment:
                    logger.error(f"Parent comment not found: {parent_id}")
                    return None, f"부모 댓글을 찾을 수 없습니다: {parent_id}"
                
                # 댓글 깊이 확인
                current_depth = 1
                temp_comment = parent_comment
                while temp_comment.parent_id:
                    for c in cve.comments:
                        if str(c.id) == str(temp_comment.parent_id):
                            temp_comment = c
                            current_depth += 1
                            break
                    
                    if current_depth >= MAX_COMMENT_DEPTH:
                        logger.error(f"Maximum comment depth reached: {MAX_COMMENT_DEPTH}")
                        return None, f"최대 댓글 깊이({MAX_COMMENT_DEPTH})에 도달했습니다."
            
            # 댓글 생성
            now = datetime.now(ZoneInfo("UTC"))
            comment = Comment(
                id=str(PydanticObjectId()),
                cve_id=cve_id,
                content=content,
                user_id=user.id,
                created_by=user.username,
                parent_id=PydanticObjectId(parent_id) if parent_id else None,
                created_at=now,
                last_modified_at=None,
                is_deleted=False
            )
            
            # CVE에 댓글 추가
            cve.comments.append(comment)
            await cve.save()
            
            # 멘션 처리
            await CommentService.process_mentions(
                content=content,
                cve_id=cve_id,
                comment_id=comment.id,
                sender=user,
                mentioned_usernames=mentions
            )
            
            # 댓글 수 업데이트 전송
            await CommentService.send_comment_update(cve_id)
            
            # 사용자 활동 추적
            if cls.activity_service:
                changes = [{
                    "field": "comments",
                    "field_name": "댓글",
                    "action": "add",
                    "detail_type": "detailed",
                    "summary": "댓글 추가됨",
                    "items": [{"content": content}]
                }]
                
                await cls.activity_service.create_activity(
                    username=user.username,
                    activity_type=ActivityAction.COMMENT,
                    target_type=ActivityTargetType.CVE,
                    target_id=cve_id,
                    target_title=cve.title or cve_id,
                    changes=changes,
                    metadata={
                        "comment_id": str(comment.id),
                        "parent_id": str(parent_id) if parent_id else None,
                        "severity": cve.severity,
                        "status": cve.status
                    }
                )
            
            return comment, "댓글이 성공적으로 생성되었습니다."
        except Exception as e:
            logger.error(f"Error creating comment: {str(e)}")
            return None, f"댓글 생성 중 오류가 발생했습니다: {str(e)}"
    
    @classmethod
    async def update_comment(cls, cve_id: str, comment_id: str, content: str, user: User) -> Tuple[Optional[Comment], str]:
        """댓글을 수정합니다."""
        try:
            # CVE 찾기
            cve = await CVEModel.find_one({"cve_id": cve_id})
            if not cve:
                logger.error(f"CVE not found: {cve_id}")
                return None, f"CVE를 찾을 수 없습니다: {cve_id}"
            
            # 댓글 찾기
            comment_index = None
            for idx, comment in enumerate(cve.comments):
                if str(comment.id) == comment_id:
                    comment_index = idx
                    break
            
            if comment_index is None:
                logger.error(f"Comment not found: {comment_id}")
                return None, f"댓글을 찾을 수 없습니다: {comment_id}"
            
            # 권한 확인
            if str(cve.comments[comment_index].user_id) != str(user.id) and not user.is_admin:
                logger.error(f"Permission denied for user {user.id} to update comment {comment_id}")
                return None, "댓글 수정 권한이 없습니다."
            
            # 댓글이 삭제되었는지 확인
            if cve.comments[comment_index].is_deleted:
                logger.error(f"Cannot update deleted comment: {comment_id}")
                return None, "삭제된 댓글은 수정할 수 없습니다."
            
            # 댓글 수정
            old_content = cve.comments[comment_index].content
            cve.comments[comment_index].content = content
            cve.comments[comment_index].last_modified_at = datetime.now(ZoneInfo("UTC"))
            cve.comments[comment_index].last_modified_by = user.username
            
            await cve.save()
            
            # 멘션 처리 (새 멘션이 추가된 경우)
            old_mentions = set(re.findall(r'@(\w+)', old_content))
            new_mentions = set(re.findall(r'@(\w+)', content))
            added_mentions = new_mentions - old_mentions
            
            if added_mentions:
                await CommentService.process_mentions(
                    content=content,
                    cve_id=cve_id,
                    comment_id=cve.comments[comment_index].id,
                    sender=user,
                    mentioned_usernames=list(added_mentions)
                )
            
            # 사용자 활동 추적
            if cls.activity_service:
                changes = [{
                    "field": "comments",
                    "field_name": "댓글",
                    "action": "edit",
                    "detail_type": "detailed",
                    "summary": "댓글 수정됨",
                    "before": old_content,
                    "after": content
                }]
                
                await cls.activity_service.create_activity(
                    username=user.username,
                    activity_type=ActivityAction.COMMENT_UPDATE,
                    target_type=ActivityTargetType.CVE,
                    target_id=cve_id,
                    target_title=cve.title or cve_id,
                    changes=changes,
                    metadata={
                        "comment_id": comment_id,
                        "severity": cve.severity,
                        "status": cve.status
                    }
                )
            
            return cve.comments[comment_index], "댓글이 성공적으로 수정되었습니다."
        except Exception as e:
            logger.error(f"Error updating comment: {str(e)}")
            return None, f"댓글 수정 중 오류가 발생했습니다: {str(e)}"
    
    @classmethod
    async def delete_comment(cls, cve_id: str, comment_id: str, user: User, permanent: bool = False) -> Tuple[bool, str]:
        """댓글을 삭제합니다."""
        try:
            # CVE 찾기
            cve = await CVEModel.find_one({"cve_id": cve_id})
            if not cve:
                logger.error(f"CVE not found: {cve_id}")
                return False, f"CVE를 찾을 수 없습니다: {cve_id}"
            
            # 댓글 찾기
            comment_index = None
            for idx, comment in enumerate(cve.comments):
                if str(comment.id) == comment_id:
                    comment_index = idx
                    break
            
            if comment_index is None:
                logger.error(f"Comment not found: {comment_id}")
                return False, f"댓글을 찾을 수 없습니다: {comment_id}"
            
            # 권한 확인
            if str(cve.comments[comment_index].user_id) != str(user.id) and not user.is_admin:
                logger.error(f"Permission denied for user {user.id} to delete comment {comment_id}")
                return False, "댓글 삭제 권한이 없습니다."
            
            if permanent and not user.is_admin:
                logger.error(f"Only admin can permanently delete comments")
                return False, "영구 삭제는 관리자만 가능합니다."
            
            comment_content = cve.comments[comment_index].content
            
            if permanent:
                # 영구 삭제 - 실제 배열에서 제거
                cve.comments.pop(comment_index)
            else:
                # 논리적 삭제 - is_deleted 플래그 설정
                cve.comments[comment_index].is_deleted = True
                cve.comments[comment_index].last_modified_at = datetime.now(ZoneInfo("UTC"))
                cve.comments[comment_index].last_modified_by = user.username
            
            await cve.save()
            
            # 댓글 수 업데이트 전송
            await CommentService.send_comment_update(cve_id)
            
            # 사용자 활동 추적
            if cls.activity_service:
                changes = [{
                    "field": "comments",
                    "field_name": "댓글",
                    "action": "delete",
                    "detail_type": "detailed",
                    "summary": "댓글 삭제됨",
                    "before": comment_content,
                    "after": None
                }]
                
                await cls.activity_service.create_activity(
                    username=user.username,
                    activity_type=ActivityAction.COMMENT_DELETE,
                    target_type=ActivityTargetType.CVE,
                    target_id=cve_id,
                    target_title=cve.title or cve_id,
                    changes=changes,
                    metadata={
                        "comment_id": comment_id,
                        "permanent": permanent,
                        "severity": cve.severity,
                        "status": cve.status
                    }
                )
            
            return True, "댓글이 성공적으로 삭제되었습니다."
        except Exception as e:
            logger.error(f"Error deleting comment: {str(e)}")
            return False, f"댓글 삭제 중 오류가 발생했습니다: {str(e)}"
    
    @classmethod
    async def get_comments(cls, cve_id: str) -> List[Comment]:
        """CVE의 모든 댓글을 조회합니다."""
        try:
            cve = await CVEModel.find_one({"cve_id": cve_id})
            if not cve:
                logger.error(f"CVE not found: {cve_id}")
                return []
            
            # 댓글 정렬 (생성 시간 순)
            comments = sorted(cve.comments, key=lambda x: x.created_at)
            return comments
        except Exception as e:
            logger.error(f"Error getting comments: {str(e)}")
            return []