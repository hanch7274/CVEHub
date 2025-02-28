from typing import List, Optional
from datetime import datetime
from beanie import PydanticObjectId
from .base import BaseRepository
from ..models.cve_model import CVEModel, CreateCVERequest, PatchCVERequest
from ..database import get_database
from fastapi.logger import logger

class CVERepository(BaseRepository[CVEModel, CreateCVERequest, PatchCVERequest]):
    def __init__(self):
        super().__init__(CVEModel)
        self.db = get_database()
        self.collection = self.db.get_collection("cves")

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

    async def update(self, cve_id: str, data: dict) -> bool:
        """CVE 업데이트"""
        try:
            # 업데이트 로그 추가
            logger.info(f"CVE 업데이트 시도: {cve_id}")
            
            # 내부 데이터 처리를 위한 방어적 복사
            update_data = data.copy()
            
            # MongoDB 업데이트 실행
            try:
                result = await self.collection.update_one(
                    {"cve_id": cve_id}, 
                    {"$set": update_data}
                )
                logger.info(f"업데이트 결과: matched={result.matched_count}, modified={result.modified_count}")
                return result.modified_count > 0
            except Exception as e:
                # update_one 실패 시 replace_one 시도
                logger.error(f"update_one 실패 ({cve_id}): {str(e)}, replace_one 시도")
                return await self.replace(cve_id, update_data)
        except Exception as e:
            logger.error(f"CVE 업데이트 중 오류: {str(e)}")
            # 오류 전파
            raise

    async def replace(self, cve_id: str, data: dict) -> bool:
        """CVE 문서 전체 교체"""
        try:
            # MongoDB replace_one 실행
            logger.info(f"CVE replace 시도: {cve_id}")
            
            # _id 필드는 특별 처리
            if '_id' in data and isinstance(data['_id'], str):
                from bson.objectid import ObjectId
                data['_id'] = ObjectId(data['_id'])
            
            result = await self.collection.replace_one(
                {"cve_id": cve_id}, 
                data,
                upsert=True
            )
            
            logger.info(f"Replace 결과: matched={result.matched_count}, modified={result.modified_count}, upserted_id={result.upserted_id}")
            return True
        except Exception as e:
            logger.error(f"CVE replace 중 오류: {str(e)}", exc_info=True)
            # 디버깅을 위한 JSON 덤프 시도
            try:
                import json
                logger.error(f"데이터 구조: {json.dumps(data)[:1000]}...")
            except:
                pass
            raise 