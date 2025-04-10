"""
댓글 관련 리포지토리 - CVE 리포지토리에서 분리
"""
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from bson import ObjectId
import traceback
import re
import functools
import time

from fastapi.logger import logger
from app.database import get_database
from app.comment.models import Comment


def log_db_operation(operation_name):
    """
    데이터베이스 작업을 로깅하는 데코레이터
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(self, *args, **kwargs):
            start_time = time.perf_counter()
            try:
                result = await func(self, *args, **kwargs)
                elapsed = time.perf_counter() - start_time
                logger.info(f"{operation_name} 완료: 소요 시간 {elapsed:.4f}초")
                return result
            except Exception as e:
                elapsed = time.perf_counter() - start_time
                logger.error(f"{operation_name} 실패: {str(e)} (소요 시간 {elapsed:.4f}초)")
                raise
        return wrapper
    return decorator


class CommentRepository:
    """댓글 관련 데이터베이스 작업을 처리하는 리포지토리"""
    
    def __init__(self):
        """리포지토리 초기화"""
        self.db = get_database()
        self.collection = self.db.get_collection("cves")
        
    @log_db_operation("댓글 추가")
    async def add_comment(self, cve_id: str, comment_data: dict) -> Optional[str]:
        """
        CVE에 댓글을 추가합니다.
        
        Args:
            cve_id: 댓글을 추가할 CVE ID
            comment_data: 댓글 데이터
            
        Returns:
            Optional[str]: 추가된 댓글 ID 또는 None (실패시)
        """
        try:
            # 댓글 생성
            comment = Comment(**comment_data)
            
            # mentions 필드 자동 추출
            if "content" in comment_data:
                comment.mentions = Comment.extract_mentions(comment_data["content"])
            
            # 쿼리 조건 설정 (대소문자 구분 없음)
            query = {"cve_id": {"$regex": f"^{re.escape(cve_id)}$", "$options": "i"}}
            
            # 댓글 추가 (push)
            result = await self.collection.update_one(
                query,
                {"$push": {"comments": comment.dict()}}
            )
            
            if result.matched_count == 0:
                logger.warning(f"댓글 추가 실패: CVE를 찾을 수 없음 {cve_id}")
                return None
                
            logger.info(f"댓글 추가 성공: {comment.id} (CVE: {cve_id})")
            return comment.id
            
        except Exception as e:
            logger.error(f"댓글 추가 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            raise
            
    @log_db_operation("댓글 수정")
    async def update_comment(self, cve_id: str, comment_id: str, comment_data: dict) -> bool:
        """
        CVE의 댓글을 수정합니다.
        
        Args:
            cve_id: 댓글이 속한 CVE ID
            comment_id: 수정할 댓글 ID
            comment_data: 수정할 댓글 데이터
            
        Returns:
            bool: 수정 성공 여부
        """
        try:
            # 새로운 멘션 추출
            mentions = Comment.extract_mentions(comment_data.get("content", ""))
            
            # 업데이트할 필드 설정
            update_fields = {
                "comments.$.content": comment_data.get("content"),
                "comments.$.last_modified_at": datetime.now(),
                "comments.$.last_modified_by": comment_data.get("last_modified_by"),
                "comments.$.mentions": mentions
            }
            
            # null 값 제거
            update_fields = {k: v for k, v in update_fields.items() if v is not None}
            
            # 쿼리 조건 설정 (대소문자 구분 없음)
            query = {
                "cve_id": {"$regex": f"^{re.escape(cve_id)}$", "$options": "i"},
                "comments.id": comment_id
            }
            
            # 댓글 수정
            result = await self.collection.update_one(
                query,
                {"$set": update_fields}
            )
            
            if result.matched_count == 0:
                logger.warning(f"댓글 수정 실패: CVE 또는 댓글을 찾을 수 없음 (CVE: {cve_id}, 댓글: {comment_id})")
                return False
                
            logger.info(f"댓글 수정 성공: {comment_id} (CVE: {cve_id})")
            return True
            
        except Exception as e:
            logger.error(f"댓글 수정 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            raise
            
    @log_db_operation("댓글 삭제")
    async def delete_comment(self, cve_id: str, comment_id: str, permanent: bool = False) -> bool:
        """
        CVE의 댓글을 삭제합니다.
        
        Args:
            cve_id: 댓글이 속한 CVE ID
            comment_id: 삭제할 댓글 ID
            permanent: 영구 삭제 여부 (True: 물리적 삭제, False: 논리적 삭제)
            
        Returns:
            bool: 삭제 성공 여부
        """
        try:
            # 쿼리 조건 설정 (대소문자 구분 없음)
            query = {
                "cve_id": {"$regex": f"^{re.escape(cve_id)}$", "$options": "i"},
                "comments.id": comment_id
            }
            
            if permanent:
                # 영구 삭제 (pull)
                result = await self.collection.update_one(
                    query,
                    {"$pull": {"comments": {"id": comment_id}}}
                )
            else:
                # 논리적 삭제 (is_deleted = True)
                result = await self.collection.update_one(
                    query,
                    {"$set": {"comments.$.is_deleted": True}}
                )
            
            if result.matched_count == 0:
                logger.warning(f"댓글 삭제 실패: CVE 또는 댓글을 찾을 수 없음 (CVE: {cve_id}, 댓글: {comment_id})")
                return False
                
            delete_type = "영구 삭제" if permanent else "논리적 삭제"
            logger.info(f"댓글 {delete_type} 성공: {comment_id} (CVE: {cve_id})")
            return True
            
        except Exception as e:
            logger.error(f"댓글 삭제 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            raise
            
    @log_db_operation("댓글 조회")
    async def get_comments(self, cve_id: str, include_deleted: bool = False) -> List[Comment]:
        """
        CVE의 모든 댓글을 조회합니다.
        
        Args:
            cve_id: 댓글을 조회할 CVE ID
            include_deleted: 삭제된 댓글 포함 여부
            
        Returns:
            List[Comment]: 댓글 목록
        """
        try:
            # 쿼리 조건 설정 (대소문자 구분 없음)
            query = {"cve_id": {"$regex": f"^{re.escape(cve_id)}$", "$options": "i"}}
            projection = {"_id": 0, "comments": 1}
            
            # 댓글 조회
            result = await self.collection.find_one(query, projection)
            
            if not result or "comments" not in result:
                return []
                
            # 댓글 객체 생성
            comments = [Comment(**c) for c in result["comments"]]
            
            # 삭제된 댓글 필터링 (필요한 경우)
            if not include_deleted:
                comments = [c for c in comments if not c.is_deleted]
                
            return comments
            
        except Exception as e:
            logger.error(f"댓글 조회 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return []
            
    @log_db_operation("활성 댓글 수 조회")
    async def count_active_comments(self, cve_id: str) -> int:
        """
        CVE의 활성화된 댓글 수를 반환합니다.
        
        Args:
            cve_id: 댓글 수를 조회할 CVE ID
            
        Returns:
            int: 활성화된 댓글 수
        """
        try:
            comments = await self.get_comments(cve_id, include_deleted=False)
            return len(comments)
        except Exception as e:
            logger.error(f"댓글 수 조회 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return 0
