from typing import List, Optional, Tuple
from datetime import datetime
from zoneinfo import ZoneInfo
from beanie import PydanticObjectId
from ..repositories.cve_repository import CVERepository
from ..models.cve_model import CVEModel, CreateCVERequest, PatchCVERequest, Comment, CommentCreate, CommentUpdate, PoC, SnortRule, ModificationHistory
from ..models.notification import Notification
from ..core.websocket import manager
import logging
import traceback
from pydantic import ValidationError

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

    async def create_cve(
        self, 
        cve_data: CreateCVERequest,
        current_user: str = "anonymous",
        is_crawler: bool = False,
        crawler_name: Optional[str] = None
    ) -> Optional[CVEModel]:
        """CVE를 생성합니다."""
        cve = await self.repository.create(cve_data)
        if cve:
            # 웹소켓을 통해 새로운 CVE 생성 알림
            await manager.broadcast("cve_created", {
                "cve_id": cve.cve_id,
                "title": cve.title,
                "created_by": current_user
            })
        return cve

    async def update_cve(self, cve_id: str, cve_data: PatchCVERequest, username: str) -> Optional[CVEModel]:
        """CVE를 업데이트합니다."""
        try:
            # 현재 CVE 데이터 조회
            current_cve = await CVEModel.find_one({"cve_id": cve_id})
            if not current_cve:
                logging.error(f"CVE not found with ID: {cve_id}")
                return None

            # 수정 이력 생성
            modification = ModificationHistory(
                modified_by=username,
                modified_at=datetime.now(ZoneInfo("Asia/Seoul"))
            )

            # PatchCVERequest를 dict로 변환
            update_dict = cve_data.dict(exclude_unset=True)
            logging.info(f"Converted update data: {update_dict}")

            # snort_rules 업데이트 처리
            if "snort_rules" in update_dict:
                logging.info(f"Updating snort_rules for CVE {cve_id}")
                logging.info(f"Current rules: {current_cve.snort_rules}")
                logging.info(f"New rules: {update_dict['snort_rules']}")
                
                # 새로운 규칙에 필수 필드 추가
                for rule in update_dict["snort_rules"]:
                    if isinstance(rule, dict):
                        if not rule.get("date_added"):
                            rule["date_added"] = datetime.now(ZoneInfo("Asia/Seoul")).isoformat()
                        if not rule.get("added_by"):
                            rule["added_by"] = username

            # 수정 이력 추가
            if not current_cve.modification_history:
                current_cve.modification_history = []
            current_cve.modification_history.append(modification)

            # 데이터 업데이트
            update_data = {
                "$set": {
                    **update_dict,
                    "modification_history": current_cve.modification_history,
                    "last_modified": modification.modified_at
                }
            }

            logging.info(f"Updating CVE {cve_id} with data: {update_data}")

            # 업데이트 수행
            await current_cve.update(update_data)
            
            # 업데이트된 CVE 반환
            updated_cve = await CVEModel.find_one({"cve_id": cve_id})
            if updated_cve:
                logging.info(f"Successfully updated CVE {cve_id}")
                logging.info(f"Updated snort_rules: {updated_cve.snort_rules}")
            else:
                logging.error(f"Failed to fetch updated CVE {cve_id}")
            return updated_cve

        except Exception as e:
            logging.error(f"Error updating CVE {cve_id}: {str(e)}")
            logging.error(traceback.format_exc())
            return None

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