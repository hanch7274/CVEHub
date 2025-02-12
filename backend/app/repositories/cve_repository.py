from typing import List, Optional
from datetime import datetime
from beanie import PydanticObjectId
from .base import BaseRepository
from ..models.cve_model import CVEModel, CreateCVERequest, PatchCVERequest

class CVERepository(BaseRepository[CVEModel, CreateCVERequest, PatchCVERequest]):
    def __init__(self):
        super().__init__(CVEModel)

    async def search_cves(self, query: str, skip: int = 0, limit: int = 10) -> List[CVEModel]:
        """CVE를 검색합니다."""
        search_query = {
            "$or": [
                {"cve_id": {"$regex": query, "$options": "i"}},
                {"title": {"$regex": query, "$options": "i"}},
                {"description": {"$regex": query, "$options": "i"}}
            ]
        }
        return await self.model.find(search_query).skip(skip).limit(limit).to_list()

    async def get_by_cve_id(self, cve_id: str) -> Optional[CVEModel]:
        """CVE ID로 CVE를 조회합니다."""
        return await self.get_by_field("cve_id", cve_id)

    async def get_by_status(self, status: str, skip: int = 0, limit: int = 10) -> List[CVEModel]:
        """상태별로 CVE를 조회합니다."""
        return await self.model.find({"status": status}).skip(skip).limit(limit).to_list()

    async def add_comment(self, cve_id: str, comment_data: dict) -> Optional[CVEModel]:
        """CVE에 댓글을 추가합니다."""
        cve = await self.get_by_cve_id(cve_id)
        if cve:
            if not cve.comments:
                cve.comments = []
            cve.comments.append(comment_data)
            await cve.save()
        return cve

    async def update_comment(self, cve_id: str, comment_id: str, comment_data: dict) -> Optional[CVEModel]:
        """CVE의 댓글을 수정합니다."""
        cve = await self.get_by_cve_id(cve_id)
        if cve and cve.comments:
            for comment in cve.comments:
                if str(comment.id) == comment_id:
                    comment.content = comment_data.get("content")
                    comment.updated_at = datetime.now()
                    await cve.save()
                    break
        return cve

    async def delete_comment(self, cve_id: str, comment_id: str, permanent: bool = False) -> Optional[CVEModel]:
        """CVE의 댓글을 삭제합니다."""
        cve = await self.get_by_cve_id(cve_id)
        if cve and cve.comments:
            if permanent:
                cve.comments = [c for c in cve.comments if str(c.id) != comment_id]
            else:
                for comment in cve.comments:
                    if str(comment.id) == comment_id:
                        comment.is_deleted = True
                        break
            await cve.save()
        return cve

    async def add_poc(self, cve_id: str, poc_data: dict) -> Optional[CVEModel]:
        """CVE에 PoC를 추가합니다."""
        cve = await self.get_by_cve_id(cve_id)
        if cve:
            if not cve.pocs:
                cve.pocs = []
            cve.pocs.append(poc_data)
            await cve.save()
        return cve

    async def add_snort_rule(self, cve_id: str, rule_data: dict) -> Optional[CVEModel]:
        """CVE에 Snort Rule을 추가합니다."""
        cve = await self.get_by_cve_id(cve_id)
        if cve:
            if not cve.snort_rules:
                cve.snort_rules = []
            cve.snort_rules.append(rule_data)
            await cve.save()
        return cve 