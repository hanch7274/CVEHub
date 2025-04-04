#app/comment/service.py
"""
댓글 관련 서비스 구현
댓글 생성, 수정, 삭제 및 조회 기능 제공
"""
from typing import List, Optional, Tuple, Dict, Any, Union
from datetime import datetime
from zoneinfo import ZoneInfo
import logging
import traceback
import asyncio
from bson import ObjectId

from app.cve.models import CVEModel, Comment
from app.notification.models import Notification
from app.auth.models import User
from app.activity.models import ActivityAction, ActivityTargetType, ChangeItem
from app.activity.service import ActivityService
from app.socketio.manager import socketio_manager, WSMessageType
from app.comment.repository import CommentRepository

# 로거 설정
logger = logging.getLogger(__name__)

class CommentService:
    """댓글 관련 작업을 관리하는 서비스 클래스"""
    
    def __init__(self, comment_repository: CommentRepository, activity_service: ActivityService, cve_repository=None):
        """CommentService 초기화"""
        self.repository = comment_repository
        self.activity_service = activity_service
        self.cve_repository = cve_repository
        
    @staticmethod
    def comment_to_dict(comment: Comment) -> dict:
        """Comment 객체를 JSON 직렬화 가능한 딕셔너리로 변환"""
        comment_dict = comment.dict()
        comment_dict["created_at"] = comment.created_at.isoformat()
        if comment.last_modified_at:
            comment_dict["last_modified_at"] = comment.last_modified_at.isoformat()
        return comment_dict
    
    async def process_mentions(self, content: str, cve_id: str, comment_id: str,
                          sender: User, mentioned_usernames: List[str] = None) -> Tuple[int, List[str]]:
        """댓글 내용에서 멘션된 사용자를 찾아 알림을 생성합니다."""
        try:
            # Comment 모델의 extract_mentions 사용 (중복 코드 제거)
            mentions = mentioned_usernames or Comment.extract_mentions(content)
            if not mentions:
                return 0, []
            
            logger.info(f"발견된 멘션: {mentions}")
            
            # 멘션된 사용자들을 한 번에 조회 (N+1 쿼리 문제 해결)
            # @ 기호 제거하고 사용자명만 추출
            usernames = [m.replace('@', '') for m in mentions]
            users = await User.find({"username": {"$in": usernames}}).to_list()
            
            # 사용자별 ID 매핑 생성 (조회 최적화)
            username_to_user = {user.username: user for user in users}
            
            # 병렬 알림 처리 준비
            notifications_created = 0
            processed_users = []
            notification_tasks = []
            
            for username in usernames:
                if username in username_to_user and str(username_to_user[username].id) != str(sender.id):
                    user = username_to_user[username]
                    
                    # 비동기 작업 생성 (병렬 처리)
                    task = self._create_mention_notification(
                        user.id, sender, cve_id, comment_id, content
                    )
                    notification_tasks.append(task)
                    processed_users.append(username)
                    notifications_created += 1
            
            # 알림 작업 병렬 실행
            if notification_tasks:
                await asyncio.gather(*notification_tasks)
                
            return notifications_created, processed_users
        except Exception as e:
            logger.error(f"process_mentions 중 오류 발생: {str(e)}")
            return 0, []

    async def _create_mention_notification(self, recipient_id, sender, cve_id, comment_id, content):
        """알림 생성 헬퍼 메서드 - 중복 코드 제거 및 재사용성 향상"""
        try:
            notification, unread_count = await Notification.create_notification(
                recipient_id=recipient_id,
                sender_id=sender.id,
                sender_username=sender.username,
                cve_id=cve_id,
                comment_id=comment_id,
                comment_content=content,
                content=f"{sender.username}님이 댓글에서 언급했습니다."
            )
            
            # 웹소켓으로 실시간 알림 전송
            await socketio_manager.emit(
                "notification",
                {
                    "type": WSMessageType.NOTIFICATION,
                    "data": {
                        "notification": self.comment_to_dict(notification),
                        "unread_count": unread_count
                    }
                },
                room=str(recipient_id)
            )
            
            return notification
        except Exception as e:
            logger.error(f"알림 생성 중 오류: {str(e)}")
            return None
    
    async def count_active_comments(self, cve_id: str) -> int:
        """CVE의 활성화된 댓글 수를 계산합니다."""
        try:
            # 최적화: 전체 CVE 가져오지 않고 댓글만 조회
            projection = {"comments": 1}
            cve = await self.repository.find_by_cve_id_with_projection(cve_id, projection)
            
            if not cve or not hasattr(cve, 'comments'):
                logger.error(f"CVE를 찾을 수 없거나 댓글이 없음: {cve_id}")
                return 0
                
            # 삭제되지 않은 댓글 수 계산
            active_comments = [c for c in cve.comments if not c.is_deleted]
            logger.info(f"CVE {cve_id}의 활성 댓글 수: {len(active_comments)}개")
            return len(active_comments)
        except Exception as e:
            logger.error(f"활성 댓글 수 계산 중 오류: {str(e)}")
            return 0
    
    async def send_comment_update(self, cve_id: str) -> None:
        """댓글 수 업데이트를 Socket.IO로 전송합니다."""
        try:
            count = await self.count_active_comments(cve_id)
            await socketio_manager.emit(
                "comment_count",
                {
                    "type": WSMessageType.COMMENT_COUNT_UPDATE,
                    "data": {"cve_id": cve_id, "count": count}
                },
                broadcast=True
            )
            logger.info(f"{cve_id}의 댓글 수 업데이트 전송: {count}")
        except Exception as e:
            logger.error(f"댓글 업데이트 전송 중 오류: {str(e)}")
    
    async def create_comment(self, cve_id: str, content: str, user: User, 
                           parent_id: Optional[str] = None, 
                           mentions: List[str] = None) -> Tuple[Optional[Comment], str]:
        """새 댓글을 생성합니다."""
        try:
            # 댓글 트리 구조 확인 (depth 제한)
            MAX_COMMENT_DEPTH = 10
            depth = 0
            
            # 최적화: 부모 댓글 정보만 선택적으로 조회
            if parent_id:
                # MongoDB 투영(projection) 사용해 부모 댓글만 조회 (최적화)
                parent = await CVEModel.find_one(
                    {"cve_id": cve_id, "comments.id": parent_id},
                    {"comments.$": 1}  # 일치하는 댓글만 가져오는 projection
                )
                
                if not parent or not parent.comments:
                    logger.error(f"부모 댓글을 찾을 수 없음: {parent_id}")
                    return None, f"부모 댓글을 찾을 수 없습니다: {parent_id}"
                
                # 부모 댓글 깊이 계산
                parent_comment = parent.comments[0]
                depth = parent_comment.depth + 1
                
                if depth >= MAX_COMMENT_DEPTH:
                    logger.error(f"최대 댓글 깊이에 도달: {MAX_COMMENT_DEPTH}")
                    return None, f"최대 댓글 깊이({MAX_COMMENT_DEPTH})에 도달했습니다."
            
            # 댓글 생성
            now = datetime.now(ZoneInfo("UTC"))
            comment = Comment(
                id=str(ObjectId()),
                content=content,
                created_by=user.username,
                parent_id=parent_id,
                depth=depth,  # 계산된 깊이 저장
                created_at=now,
                last_modified_at=None,
                is_deleted=False,
                # Comment 모델의 extract_mentions 메서드 사용
                mentions=Comment.extract_mentions(content) if not mentions else mentions
            )
            
            # repository의 add_comment 메서드 사용
            result = await self.repository.add_comment(cve_id, comment.dict())
            
            if not result:
                logger.error(f"댓글 추가 실패: {cve_id}")
                return None, "댓글을 추가할 수 없습니다. CVE를 찾을 수 없거나 DB 오류가 발생했습니다."
            
            # 멘션 처리
            await self.process_mentions(
                content=content,
                cve_id=cve_id,
                comment_id=comment.id,
                sender=user,
                mentioned_usernames=mentions
            )
            
            # 댓글 수 업데이트 전송
            await self.send_comment_update(cve_id)
            
            # 활동 추적 유틸리티 메서드 사용
            await self._track_comment_activity(
                user.username,
                cve_id,
                comment.id,
                ActivityAction.COMMENT,
                content=content,
                parent_id=parent_id
            )
            
            return comment, "댓글이 성공적으로 생성되었습니다."
        except Exception as e:
            logger.error(f"댓글 생성 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return None, f"댓글 생성 중 오류가 발생했습니다: {str(e)}"
    
    async def update_comment(self, cve_id: str, comment_id: str, content: str, user: User) -> Tuple[Optional[Comment], str]:
        """댓글을 수정합니다."""
        try:
            # 최적화: 필요한 정보만 조회
            projection = {"comments.$": 1, "title": 1, "severity": 1, "status": 1}
            
            # MongoDB 투영(projection) 사용해 해당 댓글만 조회
            cve = await CVEModel.find_one(
                {"cve_id": cve_id, "comments.id": comment_id},
                projection
            )
            
            if not cve or not cve.comments:
                logger.error(f"댓글을 찾을 수 없음: {comment_id}")
                return None, f"댓글을 찾을 수 없습니다: {comment_id}"
            
            # 첫 번째 일치하는 댓글 (comments.$ 연산자 결과)
            comment = cve.comments[0]
            
            # 권한 확인
            if comment.created_by != user.username and not user.is_admin:
                logger.error(f"사용자 {user.username}의 댓글 {comment_id} 수정 권한 없음")
                return None, "댓글 수정 권한이 없습니다."
            
            # 댓글이 삭제되었는지 확인
            if comment.is_deleted:
                logger.error(f"삭제된 댓글 수정 불가: {comment_id}")
                return None, "삭제된 댓글은 수정할 수 없습니다."
            
            # 변경 전 내용 저장 (변경 감지용)
            old_content = comment.content
            old_mentions = set(comment.mentions) if comment.mentions else set()
            
            # 새 멘션 추출
            new_mentions = set(Comment.extract_mentions(content))
            
            # repository의 update_comment 메서드 사용
            now = datetime.now(ZoneInfo("UTC"))
            update_data = {
                "content": content,
                "last_modified_at": now,
                "last_modified_by": user.username,
                "mentions": list(new_mentions)
            }
            result = await self.repository.update_comment(cve_id, comment_id, update_data)
            
            if not result:
                logger.error(f"댓글 수정 실패: {comment_id}")
                return None, "댓글 수정에 실패했습니다"
            
            # 수정된 댓글 객체 생성 (응답용)
            updated_comment = Comment(
                id=comment.id,
                content=content,
                created_by=comment.created_by,
                created_at=comment.created_at,
                parent_id=comment.parent_id,
                depth=comment.depth,
                is_deleted=False,
                last_modified_at=now,
                last_modified_by=user.username,
                mentions=list(new_mentions)
            )
            
            # 멘션 처리 (새 멘션이 추가된 경우만)
            added_mentions = new_mentions - old_mentions
            if added_mentions:
                await self.process_mentions(
                    content=content,
                    cve_id=cve_id,
                    comment_id=comment_id,
                    sender=user,
                    mentioned_usernames=list(added_mentions)
                )
            
            # 활동 추적
            await self._track_comment_activity(
                user.username,
                cve_id,
                comment_id,
                ActivityAction.COMMENT_UPDATE,
                content=content,
                old_content=old_content,
                cve_title=cve.title
            )
            
            return updated_comment, "댓글이 성공적으로 수정되었습니다."
        except Exception as e:
            logger.error(f"댓글 수정 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return None, f"댓글 수정 중 오류가 발생했습니다: {str(e)}"
    
    async def delete_comment(self, cve_id: str, comment_id: str, user: User, permanent: bool = False) -> Tuple[bool, str]:
        """댓글을 삭제합니다."""
        try:
            # 최적화: 필요한 정보만 조회
            projection = {"comments.$": 1, "title": 1, "severity": 1, "status": 1}
            
            # MongoDB 투영(projection) 사용해 해당 댓글만 조회
            cve = await CVEModel.find_one(
                {"cve_id": cve_id, "comments.id": comment_id},
                projection
            )
            
            if not cve or not cve.comments:
                logger.error(f"댓글을 찾을 수 없음: {comment_id}")
                return False, f"댓글을 찾을 수 없습니다: {comment_id}"
            
            # 첫 번째 일치하는 댓글 (comments.$ 연산자 결과)
            comment = cve.comments[0]
            
            # 권한 확인
            if comment.created_by != user.username and not user.is_admin:
                logger.error(f"사용자 {user.username}의 댓글 {comment_id} 삭제 권한 없음")
                return False, "댓글 삭제 권한이 없습니다."
            
            if permanent and not user.is_admin:
                logger.error("관리자만 영구 삭제 가능")
                return False, "영구 삭제는 관리자만 가능합니다."
            
            comment_content = comment.content
            
            # repository의 delete_comment 메서드 사용
            result = await self.repository.delete_comment(cve_id, comment_id, permanent)
            
            if not result:
                logger.error(f"댓글 삭제 실패: {comment_id}")
                return False, "댓글 삭제에 실패했습니다"
            
            # 댓글 수 업데이트 전송
            await self.send_comment_update(cve_id)
            
            # 활동 추적
            await self._track_comment_activity(
                user.username,
                cve_id,
                comment_id,
                ActivityAction.COMMENT_DELETE,
                content=comment_content,
                cve_title=cve.title,
                permanent=permanent
            )
            
            return True, "댓글이 성공적으로 삭제되었습니다."
        except Exception as e:
            logger.error(f"댓글 삭제 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False, f"댓글 삭제 중 오류가 발생했습니다: {str(e)}"
    
    async def get_comments(self, cve_id: str, include_deleted: bool = False) -> List[Comment]:
        """CVE의 모든 댓글을 조회합니다."""
        try:
            # 최적화: 댓글 필드만 조회
            projection = {"comments": 1}
            cve = await self.repository.find_by_cve_id_with_projection(cve_id, projection)
            
            if not cve:
                logger.error(f"CVE를 찾을 수 없음: {cve_id}")
                return []
            
            # 삭제된 댓글 필터링 (필요한 경우)
            comments = cve.comments
            if not include_deleted:
                comments = [c for c in comments if not c.is_deleted]
            
            # 댓글 정렬 (생성 시간순)
            return sorted(comments, key=lambda x: x.created_at)
        except Exception as e:
            logger.error(f"댓글 조회 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return []
    
    async def _track_comment_activity(self, 
                                   username: str,
                                   cve_id: str, 
                                   comment_id: str,
                                   activity_type: ActivityAction,
                                   content: str = None,
                                   old_content: str = None,
                                   cve_title: str = None,
                                   parent_id: str = None,
                                   permanent: bool = False):
        """댓글 활동 추적을 위한 유틸리티 메서드 - 중복 코드 제거"""
        try:
            # 기본 메타데이터 설정
            metadata = {
                "comment_id": comment_id
            }
            
            # 추가 메타데이터 설정
            if parent_id:
                metadata["parent_id"] = parent_id
            if permanent:
                metadata["permanent"] = permanent
            
            # CVE 정보가 없는 경우 조회
            if not cve_title:
                projection = {"title": 1, "severity": 1, "status": 1}
                cve = await self.repository.find_by_cve_id_with_projection(cve_id, projection)
                if cve:
                    cve_title = cve.title or cve_id
                    metadata.update({
                        "severity": cve.severity,
                        "status": cve.status
                    })
            
            # 활동 유형에 따른 변경 내역 생성
            changes = []
            
            if activity_type == ActivityAction.COMMENT:
                changes.append(ChangeItem(
                    field="comments",
                    field_name="댓글",
                    action="add",
                    detail_type="detailed",
                    summary="댓글 추가됨",
                    items=[{"content": content}]
                ))
            elif activity_type == ActivityAction.COMMENT_UPDATE:
                changes.append(ChangeItem(
                    field="comments",
                    field_name="댓글",
                    action="edit",
                    detail_type="detailed",
                    before=old_content,
                    after=content,
                    summary="댓글 수정됨"
                ))
            elif activity_type == ActivityAction.COMMENT_DELETE:
                changes.append(ChangeItem(
                    field="comments",
                    field_name="댓글",
                    action="delete",
                    detail_type="detailed",
                    before=content,
                    summary=f"댓글 {permanent and '영구 ' or ''}삭제됨"
                ))
            
            # 활동 기록 생성
            await self.activity_service.create_activity(
                username=username,
                activity_type=activity_type,
                target_type=ActivityTargetType.CVE,
                target_id=cve_id,
                target_title=cve_title or cve_id,
                changes=changes,
                metadata=metadata
            )
            
            return True
        except Exception as e:
            logger.error(f"댓글 활동 추적 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False