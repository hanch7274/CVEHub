#app/comment/service.py
"""
댓글 관련 서비스 구현
댓글 생성, 수정, 삭제 및 조회, 멘션 처리 기능 제공
"""
from typing import List, Optional, Tuple, Dict, Any, Union
from datetime import datetime
from zoneinfo import ZoneInfo
import logging
import traceback
import asyncio
from bson import ObjectId

# 수정: 임포트 경로 변경
from app.comment.models import Comment
from app.comment.schemas import CommentCreate, CommentUpdate, CommentResponse
from app.cve.models import CVEModel
from app.notification.models import Notification
from app.auth.models import User
from app.activity.models import ActivityAction, ActivityTargetType, ChangeItem
from app.activity.service import ActivityService
from app.socketio.manager import socketio_manager, WSMessageType
from app.comment.repository import CommentRepository
from app.cve.repository import CVERepository
from app.cve.service import CVEService

# 로거 설정
logger = logging.getLogger(__name__)

class CommentService:
    """댓글 관련 작업을 관리하는 서비스 클래스"""
    
    def __init__(self, comment_repository: CommentRepository, activity_service: ActivityService, cve_repository=None):
        """CommentService 초기화"""
        self.repository = comment_repository
        self.activity_service = activity_service
        
        # CVE 정보 접근을 위한 저장소 및 서비스
        self.cve_repository = cve_repository or CVERepository()
        
        # CVE 서비스 추가
        self.cve_service = CVEService() if not cve_repository else None
        
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
            # 리포지토리 메서드 사용
            return await self.repository.count_active_comments(cve_id)
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
                }
            )
            logger.info(f"{cve_id}의 댓글 수 업데이트 전송: {count}")
        except Exception as e:
            logger.error(f"댓글 업데이트 전송 중 오류: {str(e)}")
    
    async def create_comment(self, cve_id: str, comment_data: dict) -> str:
        """새 댓글을 생성합니다."""
        try:
            # 댓글 트리 구조 확인 (depth 제한)
            MAX_COMMENT_DEPTH = 10
            depth = 0
            content = comment_data.get("content")
            created_by = comment_data.get("created_by")
            parent_id = comment_data.get("parent_id")
            mentions = comment_data.get("mentions", [])
            
            # 최적화: 부모 댓글 정보만 선택적으로 조회
            if parent_id:
                # MongoDB 투영(projection) 사용해 부모 댓글만 조회 (최적화)
                parent = await CVEModel.find_one(
                    {"cve_id": cve_id, "comments.id": parent_id},
                    {"comments.$": 1}  # 일치하는 댓글만 가져오는 projection
                )
                
                if not parent or not parent.comments:
                    logger.error(f"부모 댓글을 찾을 수 없음: {parent_id}")
                    return None
                
                # 부모 댓글 깊이 계산
                parent_comment = parent.comments[0]
                depth = parent_comment.depth + 1
                
                if depth >= MAX_COMMENT_DEPTH:
                    logger.error(f"최대 댓글 깊이에 도달: {MAX_COMMENT_DEPTH}")
                    return None
            
            # 댓글 생성
            now = datetime.now(ZoneInfo("UTC"))
            comment = Comment(
                id=str(ObjectId()),
                content=content,
                created_by=created_by,
                parent_id=parent_id,
                depth=depth,  # 계산된 깊이 저장
                created_at=now,
                last_modified_at=None,
                is_deleted=False,
                # Comment 모델의 extract_mentions 메서드 사용
                mentions=Comment.extract_mentions(content) if not mentions else mentions
            )
            
            # repository의 add_comment 메서드 사용
            comment_id = await self.repository.add_comment(cve_id, comment.dict())
            
            if not comment_id:
                logger.error(f"댓글 추가 실패: {cve_id}")
                return None
            
            # 멘션 처리
            if current_user := await User.find_one({"username": created_by}):
                await self.process_mentions(
                    content=content,
                    cve_id=cve_id,
                    comment_id=comment.id,
                    sender=current_user,
                    mentioned_usernames=mentions
                )
            
            # 댓글 수 업데이트 전송
            await self.send_comment_update(cve_id)
            
            # 활동 추적 유틸리티 메서드 사용
            await self._track_comment_activity(
                created_by,
                cve_id,
                comment.id,
                ActivityAction.COMMENT,
                content=content,
                parent_id=parent_id
            )
            
            return comment_id
        except Exception as e:
            logger.error(f"댓글 생성 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return None
    
    async def update_comment(self, cve_id: str, comment_id: str, comment_data: dict, username: str) -> bool:
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
                return False
            
            # 첫 번째 일치하는 댓글 (comments.$ 연산자 결과)
            comment = cve.comments[0]
            
            # 권한 확인
            current_user = await User.find_one({"username": username})
            if not current_user:
                logger.error(f"사용자를 찾을 수 없음: {username}")
                return False
                
            if comment.created_by != username and not current_user.is_admin:
                logger.error(f"사용자 {username}의 댓글 {comment_id} 수정 권한 없음")
                return False
            
            # 댓글이 삭제되었는지 확인
            if comment.is_deleted:
                logger.error(f"삭제된 댓글 수정 불가: {comment_id}")
                return False
            
            # 변경 전 내용 저장 (변경 감지용)
            old_content = comment.content
            
            content = comment_data.get("content")
            
            # repository의 update_comment 메서드 사용
            update_data = {
                "content": content,
                "last_modified_at": datetime.now(ZoneInfo("UTC")),
                "last_modified_by": username
            }
            result = await self.repository.update_comment(cve_id, comment_id, update_data)
            
            if not result:
                logger.error(f"댓글 수정 실패: {comment_id}")
                return False
            
            # 멘션 처리
            new_mentions = Comment.extract_mentions(content)
            old_mentions = set(comment.mentions) if comment.mentions else set()
            added_mentions = set(new_mentions) - old_mentions
            
            if added_mentions and current_user:
                await self.process_mentions(
                    content=content,
                    cve_id=cve_id,
                    comment_id=comment_id,
                    sender=current_user,
                    mentioned_usernames=list(added_mentions)
                )
            
            # 활동 추적
            await self._track_comment_activity(
                username,
                cve_id,
                comment_id,
                ActivityAction.COMMENT_UPDATE,
                content=content,
                old_content=old_content,
                cve_title=cve.title
            )
            
            return True
        except Exception as e:
            logger.error(f"댓글 수정 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False
    
    async def delete_comment(self, cve_id: str, comment_id: str, username: str, permanent: bool = False) -> bool:
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
                return False
            
            # 첫 번째 일치하는 댓글 (comments.$ 연산자 결과)
            comment = cve.comments[0]
            
            # 권한 확인
            current_user = await User.find_one({"username": username})
            if not current_user:
                logger.error(f"사용자를 찾을 수 없음: {username}")
                return False
                
            if comment.created_by != username and not current_user.is_admin:
                logger.error(f"사용자 {username}의 댓글 {comment_id} 삭제 권한 없음")
                return False
            
            if permanent and not current_user.is_admin:
                logger.error("관리자만 영구 삭제 가능")
                return False
            
            comment_content = comment.content
            
            # repository의 delete_comment 메서드 사용
            result = await self.repository.delete_comment(cve_id, comment_id, permanent)
            
            if not result:
                logger.error(f"댓글 삭제 실패: {comment_id}")
                return False
            
            # 댓글 수 업데이트 전송
            await self.send_comment_update(cve_id)
            
            # 활동 추적
            await self._track_comment_activity(
                username,
                cve_id,
                comment_id,
                ActivityAction.COMMENT_DELETE,
                content=comment_content,
                cve_title=cve.title,
                permanent=permanent
            )
            
            return True
        except Exception as e:
            logger.error(f"댓글 삭제 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False
    
    async def get_comments(self, cve_id: str, include_deleted: bool = False) -> List[CommentResponse]:
        """CVE의 모든 댓글을 조회합니다."""
        try:
            # 리포지토리 메서드 사용
            comments = await self.repository.get_comments(cve_id, include_deleted)
            
            # CommentResponse 모델로 변환하여 반환
            return [CommentResponse(**comment.dict()) for comment in comments]
        except Exception as e:
            logger.error(f"댓글 조회 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return []
    
    async def _update_comment_socket(self, cve_id: str, comment_id: str, update_type: str = "default"):
        """댓글 소켓 이벤트 메서드"""
        try:
            # 소켓 이벤트 발송 전에 최신 댓글 데이터 조회
            comments = await self.get_comments(cve_id)
            
            # 소켓 이벤트 발송
            await socketio_manager.emit(
                event="comment_updated",
                data={
                    "cve_id": cve_id,
                    "comment_id": comment_id,
                    "type": update_type,
                    "comments": comments  # 전체 댓글 목록 추가
                },
                room=f"cve_{cve_id.lower()}"
            )
            return True
        except Exception as e:
            logger.error(f"댓글 업데이트 전송 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False
    
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
            
            # CVE 정보가 없는 경우 조회 (수정된 부분)
            if not cve_title:
                # 사용 가능한 방법으로 CVE 정보 가져오기
                projection = {"title": 1, "severity": 1, "status": 1}
                cve = None
                
                # 방법 1: cve_repository가 있으면 직접 조회
                if self.cve_repository:
                    try:
                        cve_dict = await self.cve_repository.find_by_cve_id_with_projection(cve_id, projection)
                        if cve_dict:
                            cve_title = cve_dict.get("title") or cve_id
                            metadata.update({
                                "severity": cve_dict.get("severity"),
                                "status": cve_dict.get("status")
                            })
                    except Exception as e:
                        logger.warning(f"CVE Repository 조회 실패, 대체 방법 시도: {str(e)}")
                
                # 방법 2: 없으면 CVE 서비스 사용
                if not cve and self.cve_service:
                    try:
                        cve_dict = await self.cve_service.get_cve_detail(cve_id, as_model=False, projection=projection)
                        if cve_dict:
                            cve_title = cve_dict.get("title") or cve_id
                            metadata.update({
                                "severity": cve_dict.get("severity"),
                                "status": cve_dict.get("status")
                            })
                    except Exception as e:
                        logger.warning(f"CVE Service 조회 실패: {str(e)}")
                
                # 방법 3: 둘 다 실패하면 cve_id만 사용
                if not cve_title:
                    cve_title = cve_id
            
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
            
            # 활동 기록 생성 (track_object_changes 메서드 사용)
            await self.activity_service.track_object_changes(
                username=username,
                action=activity_type,
                target_type=ActivityTargetType.CVE,
                target_id=cve_id,
                target_title=cve_title or cve_id,
                additional_changes=changes
            )
            
            return True
        except Exception as e:
            logger.error(f"댓글 활동 추적 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False