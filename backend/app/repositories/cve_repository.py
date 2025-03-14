from typing import List, Optional, Dict, Any
from datetime import datetime
from beanie import PydanticObjectId
from .base import BaseRepository
from ..models.cve_model import CVEModel, CreateCVERequest, PatchCVERequest
from ..database import get_database
from fastapi.logger import logger
from bson import ObjectId

class CVERepository(BaseRepository[CVEModel, CreateCVERequest, PatchCVERequest]):
    def __init__(self):
        super().__init__(CVEModel)
        self.db = get_database()
        self.collection = self.db.get_collection("cves")

    async def find_with_projection(
        self, 
        query: Dict[str, Any], 
        projection: Dict[str, Any], 
        skip: int = 0, 
        limit: int = 10,
        sort: List[tuple] = None
    ) -> List[Dict[str, Any]]:
        """
        지정된 projection을 사용하여 CVE를 검색합니다.
        
        Args:
            query: 검색 쿼리
            projection: 반환할 필드 (1:포함, 0:제외)
            skip: 건너뛸 문서 수
            limit: 반환할 최대 문서 수
            sort: 정렬 기준 (필드명, 방향) 튜플 리스트
            
        Returns:
            List[Dict[str, Any]]: 조회된 CVE 목록
        """
        try:
            # Beanie ORM의 projection 메소드 대신 모터 컬렉션을 직접 사용
            collection = self.model.get_motor_collection()
            
            # 정렬 조건 변환
            sort_list = None
            if sort:
                sort_list = []
                for field, direction in sort:
                    sort_list.append((field, direction))
            
            # 모든 프로젝션에 _id 필드를 포함시킴
            if not projection.get("_id", None):
                projection["_id"] = 1
                
            # 모터 컬렉션을 사용하여 쿼리 실행
            cursor = collection.find(query, projection=projection)
            
            if skip > 0:
                cursor = cursor.skip(skip)
            
            if limit > 0:
                cursor = cursor.limit(limit)
                
            if sort_list:
                cursor = cursor.sort(sort_list)
            
            # 결과를 문서 리스트로 변환
            result_docs = await cursor.to_list(length=limit)
            
            # 결과 반환 - 응답 모델 요구사항에 맞게 데이터 가공
            result = []
            for doc in result_docs:
                # _id를 문자열로 변환하고 id 필드로 복제
                if '_id' in doc:
                    if isinstance(doc['_id'], ObjectId):
                        doc['_id'] = str(doc['_id'])
                    doc['id'] = doc['_id']  # 'id' 필드 추가 (이게 중요!)
                
                # 결과 문서 추가
                result.append(doc)
                
            return result
        except Exception as e:
            logger.error(f"find_with_projection 중 오류 발생: {e}")
            raise

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