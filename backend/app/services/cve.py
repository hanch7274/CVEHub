from typing import List, Optional, Tuple
from datetime import datetime
from beanie import PydanticObjectId
from ..repositories.cve import CVERepository
from ..models.cve import CVEModel, CreateCVERequest, PatchCVERequest, Comment, CommentCreate, CommentUpdate, PoC, SnortRule
from ..models.notification import Notification
from ..core.websocket import manager

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
            await manager.broadcast({
                "type": "cve_created",
                "data": {
                    "cve_id": cve.cve_id,
                    "title": cve.title,
                    "created_by": current_user
                }
            })
        return cve

    async def update_cve(
        self, 
        cve_id: str, 
        cve_data: PatchCVERequest,
        current_user: str = "anonymous",
        is_crawler: bool = False,
        crawler_name: Optional[str] = None
    ) -> Optional[CVEModel]:
        """CVE를 수정합니다."""
        cve = await self.repository.get_by_cve_id(cve_id)
        if not cve:
            return None

        updated_cve = await self.repository.update(str(cve.id), cve_data)
        if updated_cve:
            # 웹소켓을 통해 CVE 업데이트 알림
            await manager.broadcast({
                "type": "cve_updated",
                "data": {
                    "cve_id": updated_cve.cve_id,
                    "title": updated_cve.title,
                    "updated_by": current_user
                }
            })
        return updated_cve

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

                cve = await self.update_cve(
                    cve_id,
                    PatchCVERequest(**cve_data),
                    is_crawler=True,
                    crawler_name=crawler_name
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
                results["errors"]["details"].append({
                    "cve_id": cve_data.get("cve_id", "Unknown"),
                    "error": str(e)
                })
                results["errors"]["count"] += 1

        return results 