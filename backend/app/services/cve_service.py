from typing import List, Optional, Tuple, Dict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from beanie import PydanticObjectId
from ..repositories.cve_repository import CVERepository
from ..models.cve_model import CVEModel, CreateCVERequest, PatchCVERequest, Comment, CommentCreate, CommentUpdate, PoC, SnortRule, ModificationHistory, ChangeItem
from ..models.notification import Notification
from ..models.user import User
from ..core.websocket import manager, DateTimeEncoder
import logging
import traceback
from pydantic import ValidationError
import json

# 로거 설정
logger = logging.getLogger(__name__)

class CVEService:
    """CVE 관련 서비스"""
    
    def __init__(self):
        self.repository = CVERepository()

    async def get_cves(
        self, 
        skip: int = 0, 
        limit: int = 10,
        status: Optional[str] = None
    ) -> Tuple[List[CVEModel], int]:
        """CVE 목록을 조회합니다."""
        if status:
            cves = await self.repository.get_by_status(status, skip, limit)
            total = await self.repository.count({"status": status})
        else:
            cves = await self.repository.get_all(skip, limit)
            total = await self.repository.count()
        return cves, total

    async def get_cve(self, cve_id: str) -> Optional[CVEModel]:
        """CVE를 조회합니다."""
        return await self.repository.get_by_cve_id(cve_id)

    async def create_cve(self, cve_data: dict, username: str) -> Optional[CVEModel]:
        """새로운 CVE를 생성합니다."""
        try:
            # DateTimeEncoder 사용
            logging.info(f"Creating CVE with data: {json.dumps(cve_data, indent=2, cls=DateTimeEncoder)}")
            
            # 날짜 필드 KST 설정
            current_time = datetime.now(ZoneInfo("Asia/Seoul"))
            date_fields = ["published_date", "created_at", "last_modified_date"]
            
            for field in date_fields:
                if field in cve_data:
                    date_value = cve_data[field]
                    if isinstance(date_value, str):
                        dt = datetime.fromisoformat(date_value.replace('Z', '+00:00'))
                        cve_data[field] = dt.astimezone(ZoneInfo("Asia/Seoul"))
                    elif isinstance(date_value, datetime):
                        cve_data[field] = date_value.astimezone(ZoneInfo("Asia/Seoul"))

            # CVE 생성
            cve = await self.repository.create(cve_data)
            if cve:
                logging.info(f"CVE created successfully: {cve.cve_id}")
                return cve
            
            logging.error("Failed to create CVE: Repository returned None")
            return None
        
        except Exception as e:
            logging.error(f"Error in create_cve: {str(e)}")
            logging.error(traceback.format_exc())
            return None

    async def update_cve(self, cve_id: str, data: dict, current_user=None) -> Optional[dict]:
        """CVE 정보 업데이트"""
        try:
            # 업데이트 시간 설정
            data['updated_at'] = datetime.now()
            
            # 현재 사용자 정보 추가 (옵션)
            if current_user:
                data['last_modified_by'] = current_user.username if hasattr(current_user, 'username') else str(current_user)
            
            # 업데이트 실행
            result = await self.repository.update(cve_id, data)
            
            if result:
                return await self.repository.get_by_cve_id(cve_id)
            return None
        except Exception as e:
            logger.error(f"CVE 업데이트 중 오류 발생: {str(e)}")
            raise

    async def delete_cve(self, cve_id: str) -> bool:
        """CVE를 삭제합니다."""
        cve = await self.repository.get_by_cve_id(cve_id)
        if not cve:
            return False
        return await self.repository.delete(str(cve.id))

    async def search_cves(
        self, 
        query: str,
        skip: int = 0,
        limit: int = 10
    ) -> Tuple[List[CVEModel], int]:
        """CVE를 검색합니다."""
        cves = await self.repository.search_cves(query, skip, limit)
        total = await self.repository.count({
            "$or": [
                {"cve_id": {"$regex": query, "$options": "i"}},
                {"title": {"$regex": query, "$options": "i"}},
                {"description": {"$regex": query, "$options": "i"}}
            ]
        })
        return cves, total

    async def add_comment(
        self,
        cve_id: str,
        comment_data: CommentCreate,
        current_user: str
    ) -> Optional[CVEModel]:
        """CVE에 댓글을 추가합니다."""
        comment = Comment(
            content=comment_data.content,
            username=current_user,
            parent_id=comment_data.parent_id,
            depth=comment_data.depth
        )
        return await self.repository.add_comment(cve_id, comment.dict())

    async def update_comment(
        self,
        cve_id: str,
        comment_id: str,
        comment_data: CommentUpdate
    ) -> Optional[CVEModel]:
        """CVE의 댓글을 수정합니다."""
        return await self.repository.update_comment(cve_id, comment_id, comment_data.dict())

    async def delete_comment(
        self,
        cve_id: str,
        comment_id: str,
        permanent: bool = False
    ) -> Optional[CVEModel]:
        """CVE의 댓글을 삭제합니다."""
        return await self.repository.delete_comment(cve_id, comment_id, permanent)

    async def add_poc(self, cve_id: str, poc_data: PoC) -> Optional[CVEModel]:
        """CVE에 PoC를 추가합니다."""
        return await self.repository.add_poc(cve_id, poc_data.dict())

    async def add_snort_rule(self, cve_id: str, rule_data: SnortRule) -> Optional[CVEModel]:
        """CVE에 Snort Rule을 추가합니다."""
        return await self.repository.add_snort_rule(cve_id, rule_data.dict())

    async def bulk_create_cves(
        self,
        cves_data: List[CreateCVERequest],
        crawler_name: Optional[str] = None
    ) -> dict:
        """여러 CVE를 일괄 생성합니다."""
        results = {
            "success": {"count": 0, "cves": []},
            "errors": {"count": 0, "details": []}
        }

        for cve_data in cves_data:
            try:
                cve = await self.create_cve(
                    cve_data,
                    is_crawler=True,
                    crawler_name=crawler_name
                )
                if cve:
                    results["success"]["cves"].append(cve)
                    results["success"]["count"] += 1
                else:
                    results["errors"]["details"].append({
                        "cve_id": cve_data.cve_id,
                        "error": "Failed to create CVE"
                    })
                    results["errors"]["count"] += 1
            except Exception as e:
                results["errors"]["details"].append({
                    "cve_id": cve_data.cve_id,
                    "error": str(e)
                })
                results["errors"]["count"] += 1

        return results

    async def bulk_update_cves(
        self,
        cves_data: List[dict],
        crawler_name: Optional[str] = None
    ) -> dict:
        """여러 CVE를 일괄 업데이트합니다."""
        results = {
            "success": {"count": 0, "cves": []},
            "errors": {"count": 0, "details": []}
        }

        for cve_data in cves_data:
            try:
                cve_id = cve_data.get("cve_id")
                if not cve_id:
                    raise ValueError("CVE ID is required")

                # dict를 PatchCVERequest로 변환
                try:
                    patch_request = PatchCVERequest(**cve_data)
                except ValidationError as ve:
                    results["errors"]["details"].append({
                        "cve_id": cve_id,
                        "error": f"Validation error: {str(ve)}"
                    })
                    results["errors"]["count"] += 1
                    continue

                cve = await self.update_cve(
                    cve_id,
                    patch_request,
                    username="system"
                )
                if cve:
                    results["success"]["cves"].append(cve)
                    results["success"]["count"] += 1
                else:
                    results["errors"]["details"].append({
                        "cve_id": cve_id,
                        "error": "CVE not found"
                    })
                    results["errors"]["count"] += 1
            except Exception as e:
                logging.error(f"Error in bulk update for CVE {cve_data.get('cve_id', 'Unknown')}: {str(e)}")
                logging.error(traceback.format_exc())
                results["errors"]["details"].append({
                    "cve_id": cve_data.get("cve_id", "Unknown"),
                    "error": str(e)
                })
                results["errors"]["count"] += 1

        return results

    async def acquire_lock(self, cve_id: str, username: str) -> tuple[bool, str]:
        """CVE 편집 락을 획득합니다."""
        cve = await self.get_cve(cve_id)
        if not cve:
            return False, "CVE not found"

        now = datetime.now(ZoneInfo("Asia/Seoul"))
        
        # 락이 없거나 만료된 경우
        if not cve.is_locked or (cve.lock_expires_at and cve.lock_expires_at < now):
            cve.is_locked = True
            cve.locked_by = username
            cve.lock_timestamp = now
            cve.lock_expires_at = now + timedelta(minutes=30)
            await self.repository.update(cve)
            return True, "Lock acquired"
            
        # 이미 해당 사용자가 락을 가지고 있는 경우
        if cve.locked_by == username:
            # 락 시간 갱신
            cve.lock_expires_at = now + timedelta(minutes=30)
            await self.repository.update(cve)
            return True, "Lock renewed"
            
        return False, f"CVE is currently being edited by {cve.locked_by}"

    async def release_lock(self, cve_id: str, username: str) -> bool:
        """CVE 편집 락을 해제합니다."""
        cve = await self.get_cve(cve_id)
        if not cve:
            return False

        # 락이 없거나 다른 사용자의 락인 경우
        if not cve.is_locked or cve.locked_by != username:
            return False

        cve.is_locked = False
        cve.locked_by = None
        cve.lock_timestamp = None
        cve.lock_expires_at = None
        await self.repository.update(cve)
        return True

    async def replace_cve(self, cve_id: str, data: dict) -> Optional[dict]:
        """CVE 정보 전체 교체 (update_cve가 실패할 경우 백업 방법)"""
        try:
            # 기존 _id 필드 유지를 위해 먼저 조회
            existing = await self.repository.get_by_cve_id(cve_id)
            if existing and '_id' in existing:
                data['_id'] = existing['_id']
            
            # 시간 필드 설정
            data['updated_at'] = datetime.now()
            if not data.get('created_at'):
                data['created_at'] = existing.get('created_at') if existing else datetime.now()
            
            # 문서 교체 실행
            result = await self.repository.replace(cve_id, data)
            
            return await self.repository.get_by_cve_id(cve_id)
        except Exception as e:
            logger.error(f"CVE 교체 중 오류 발생: {str(e)}")
            raise 