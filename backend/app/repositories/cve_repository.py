from typing import List, Optional, Dict, Any
from datetime import datetime
from beanie import PydanticObjectId
from .base import BaseRepository
from ..models.cve_model import CVEModel, CreateCVERequest, PatchCVERequest
from ..database import get_database
from fastapi.logger import logger
from bson import ObjectId
import traceback

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
            
            # _id 필드는 제외하고 cve_id 필드를 포함시킴
            if "_id" in projection and projection["_id"] == 1:
                # _id 필드 제외
                projection.pop("_id")
            
            # cve_id 필드가 없으면 추가
            if "cve_id" not in projection:
                projection["cve_id"] = 1
                
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
                # _id 필드 제거 (MongoDB가 자동으로 추가한 경우)
                if '_id' in doc:
                    doc.pop('_id')
                
                # 날짜 필드 디버깅 - 특정 CVE ID에 대해서만 로그 출력
                cve_id = doc.get('cve_id', '알 수 없음')
                if cve_id and 'CVE-2023-' in cve_id:
                    if 'created_at' in doc:
                        logger.info(f"[Repository] CVE ID: {cve_id}, created_at 필드: {doc['created_at']}, 타입: {type(doc['created_at'])}")
                    else:
                        logger.warning(f"[Repository] CVE ID: {cve_id}, created_at 필드 없음")
                    
                    if 'last_modified_at' in doc:
                        logger.info(f"[Repository] CVE ID: {cve_id}, last_modified_at 필드: {doc['last_modified_at']}, 타입: {type(doc['last_modified_at'])}")
                    else:
                        logger.warning(f"[Repository] CVE ID: {cve_id}, last_modified_at 필드 없음")
                
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
            
    async def find_by_cve_id(self, cve_id: str) -> Optional[CVEModel]:
        """CVE ID 문자열로 CVE를 조회합니다 (대소문자 구분 없음)."""
        try:
            logger.info(f"CVE ID 조회 시작: {cve_id}")
            
            # 1. 정확히 일치하는 경우 먼저 시도
            cve = await self.collection.find_one({"cve_id": cve_id})
            if cve:
                logger.info(f"정확히 일치하는 CVE 찾음: {cve_id}")
                try:
                    return CVEModel(**cve)
                except Exception as validation_error:
                    logger.error(f"CVE 모델 변환 중 검증 오류 (정확히 일치): {str(validation_error)}")
                    # 오류 세부 정보 로깅
                    for error in getattr(validation_error, 'errors', []):
                        logger.error(f"검증 오류 상세: {error}")
                
            # 2. 대소문자 구분 없이 검색 (MongoDB $regex 사용)
            logger.info(f"대소문자 구분 없는 정규식 검색 시도: ^{cve_id}$")
            cve = await self.collection.find_one({"cve_id": {"$regex": f"^{cve_id}$", "$options": "i"}})
            if cve:
                logger.info(f"정규식으로 CVE 찾음: {cve.get('cve_id', 'unknown')}")
                try:
                    return CVEModel(**cve)
                except Exception as validation_error:
                    logger.error(f"CVE 모델 변환 중 검증 오류 (정규식 일치): {str(validation_error)}")
                    # 오류 세부 정보 로깅
                    for error in getattr(validation_error, 'errors', []):
                        logger.error(f"검증 오류 상세: {error}")
            
            logger.warning(f"CVE를 찾을 수 없음: {cve_id}")
            return None
        except Exception as e:
            logger.error(f"CVE ID 조회 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return None

    async def get_by_status(self, status: str, skip: int = 0, limit: int = 10) -> List[CVEModel]:
        """상태별로 CVE를 조회합니다."""
        return await self.model.find({"status": status}).skip(skip).limit(limit).to_list()

    async def add_comment(self, cve_id: str, comment_data: dict) -> Optional[CVEModel]:
        """CVE에 댓글을 추가합니다."""
        cve = await self.find_by_cve_id(cve_id)
        if cve:
            if not cve.comments:
                cve.comments = []
            cve.comments.append(comment_data)
            await cve.save()
        return cve

    async def update_comment(self, cve_id: str, comment_id: str, comment_data: dict) -> Optional[CVEModel]:
        """CVE의 댓글을 수정합니다."""
        cve = await self.find_by_cve_id(cve_id)
        if cve and cve.comments:
            for comment in cve.comments:
                if str(comment.id) == comment_id:
                    comment.content = comment_data.get("content")
                    comment.last_modified_at = datetime.now()
                    await cve.save()
                    break
        return cve

    async def delete_comment(self, cve_id: str, comment_id: str, permanent: bool = False) -> Optional[CVEModel]:
        """CVE의 댓글을 삭제합니다."""
        cve = await self.find_by_cve_id(cve_id)
        if cve and cve.comments:
            for i, comment in enumerate(cve.comments):
                if str(comment.id) == comment_id:
                    if permanent:
                        # 완전 삭제
                        cve.comments.pop(i)
                    else:
                        # 소프트 삭제 (is_deleted 플래그만 설정)
                        comment.is_deleted = True
                        comment.last_modified_at = datetime.now()
                    await cve.save()
                    break
        return cve
        
    async def update_by_cve_id(self, cve_id: str, update_data: dict) -> Optional[CVEModel]:
        """
        CVE ID를 사용하여 CVE를 업데이트합니다.
        
        Args:
            cve_id: 업데이트할 CVE의 CVE ID (예: "CVE-2023-1234")
            update_data: 업데이트할 데이터
            
        Returns:
            Optional[CVEModel]: 업데이트된 CVE 모델 또는 None
        """
        try:
            # CVE ID로 문서 찾기
            cve = await self.find_by_cve_id(cve_id)
            if not cve:
                logger.warning(f"업데이트할 CVE를 찾을 수 없음: {cve_id}")
                return None
                
            # PoC 필드 자동 추가 처리
            if 'pocs' in update_data and update_data['pocs']:
                for poc in update_data['pocs']:
                    # created_by 필드가 없으면 추가
                    if 'created_by' not in poc and 'added_by' not in poc:
                        poc['created_by'] = update_data.get('last_modified_by', 'system')
                    
                    # last_modified_by 필드가 없으면 추가
                    if 'last_modified_by' not in poc:
                        poc['last_modified_by'] = update_data.get('last_modified_by', 'system')
            
            # SnortRule 필드 자동 추가 처리
            if 'snort_rules' in update_data and update_data['snort_rules']:
                for rule in update_data['snort_rules']:
                    # created_by 필드가 없으면 추가
                    if 'created_by' not in rule and 'added_by' not in rule:
                        rule['created_by'] = update_data.get('last_modified_by', 'system')
                    
                    # last_modified_by 필드가 없으면 추가
                    if 'last_modified_by' not in rule:
                        rule['last_modified_by'] = update_data.get('last_modified_by', 'system')
            
            # Reference 필드 자동 추가 처리
            if 'references' in update_data and update_data['references']:
                for ref in update_data['references']:
                    # created_by 필드가 없으면 추가
                    if 'created_by' not in ref and 'added_by' not in ref:
                        ref['created_by'] = update_data.get('last_modified_by', 'system')
                    
                    # last_modified_by 필드가 없으면 추가
                    if 'last_modified_by' not in ref:
                        ref['last_modified_by'] = update_data.get('last_modified_by', 'system')
                
            # 업데이트 데이터 적용
            for key, value in update_data.items():
                setattr(cve, key, value)
                
            # 변경사항 저장
            await cve.save()
            
            # 업데이트된 CVE 반환
            return cve
        except Exception as e:
            logger.error(f"CVE 업데이트 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            return None

    async def add_poc(self, cve_id: str, poc_data: dict) -> Optional[CVEModel]:
        """CVE에 PoC를 추가합니다."""
        cve = await self.find_by_cve_id(cve_id)
        if cve:
            if not cve.pocs:
                cve.pocs = []
            cve.pocs.append(poc_data)
            await cve.save()
        return cve

    async def add_snort_rule(self, cve_id: str, rule_data: dict) -> Optional[CVEModel]:
        """CVE에 Snort Rule을 추가합니다."""
        cve = await self.find_by_cve_id(cve_id)
        if cve:
            if not cve.snort_rules:
                cve.snort_rules = []
            cve.snort_rules.append(rule_data)
            await cve.save()
        return cve

    async def update(self, cve_id: str, update_data: dict) -> bool:
        """CVE 정보 업데이트"""
        try:
            logger.info(f"CVE 업데이트 시도: {cve_id}")
            
            # _id 필드가 있으면 제거 (MongoDB에서 _id는 변경 불가)
            if '_id' in update_data:
                logger.warning(f"업데이트 데이터에서 _id 필드 제거: {update_data['_id']}")
                update_data = update_data.copy()  # 원본 데이터 변경 방지
                del update_data['_id']
            
            # ObjectId 형식인지 확인
            is_object_id = len(cve_id) == 24 and all(c in '0123456789abcdef' for c in cve_id)
            
            # 쿼리 조건 설정
            query_condition = None
            if is_object_id:
                try:
                    from bson.objectid import ObjectId
                    query_condition = {"_id": ObjectId(cve_id)}
                    logger.debug(f"ObjectId로 쿼리 조건 설정: {query_condition}")
                except Exception as e:
                    logger.error(f"ObjectId 변환 실패: {str(e)}")
            
            # ObjectId가 아니거나 변환 실패 시 cve_id로 조회
            if not query_condition:
                query_condition = {"cve_id": cve_id}
                logger.debug(f"CVE ID로 쿼리 조건 설정: {query_condition}")
                
                # 문서가 존재하는지 확인
                doc = await self.collection.find_one(query_condition)
                if not doc:
                    logger.warning(f"문서를 찾을 수 없음: {cve_id}, 대소문자 구분 없이 시도")
                    # 대소문자 구분 없이 시도
                    import re
                    alt_query = {"cve_id": re.compile(f"^{re.escape(cve_id)}$", re.IGNORECASE)}
                    alt_doc = await self.collection.find_one(alt_query)
                    if alt_doc:
                        logger.debug(f"대소문자 구분 없이 문서 찾음: {alt_doc.get('cve_id')}")
                        query_condition = alt_query
                    else:
                        logger.warning(f"대소문자 구분 없이도 문서를 찾을 수 없음")
            
            # MongoDB 업데이트 실행
            try:
                logger.debug(f"최종 업데이트 쿼리: {query_condition}, 데이터: {update_data}")
                result = await self.collection.update_one(
                    query_condition, 
                    {"$set": update_data}
                )
                logger.info(f"업데이트 결과: matched={result.matched_count}, modified={result.modified_count}")
                return result.modified_count > 0
            except Exception as e:
                # update_one 실패 시 replace_one 시도
                logger.error(f"update_one 실패 ({cve_id}): {str(e)}")
                # replace 메서드는 더 이상 사용하지 않음
                # 대신 오류를 전파하여 상위 레벨에서 처리
                raise
        except Exception as e:
            logger.error(f"CVE 업데이트 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            # 오류 전파
            raise

    async def update_field(self, cve_id: str, update_data: dict) -> bool:
        """
        CVE의 특정 필드만 업데이트합니다.
        
        Args:
            cve_id: 업데이트할 CVE ID
            update_data: 업데이트할 필드와 값 (예: {"created_at": datetime.now()})
            
        Returns:
            bool: 업데이트 성공 여부
        """
        try:
            logger.info(f"CVE 필드 업데이트 시도: {cve_id}, 필드: {list(update_data.keys())}")
            
            # 쿼리 조건 설정 (CVE ID로 검색)
            query = {"cve_id": cve_id}
            
            # 업데이트 작업 정의
            update_operation = {"$set": update_data}
            
            # 업데이트 실행
            result = await self.collection.update_one(query, update_operation)
            
            # 업데이트 결과 확인
            if result.modified_count > 0:
                logger.info(f"CVE {cve_id}의 필드 업데이트 성공: {list(update_data.keys())}")
                return True
            else:
                logger.warning(f"CVE {cve_id}의 필드 업데이트 실패: 일치하는 문서 없음 또는 변경 사항 없음")
                return False
                
        except Exception as e:
            logger.error(f"CVE 필드 업데이트 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            return False

    async def replace(self, cve_id: str, data: dict) -> bool:
        """CVE 문서 전체 교체 (사용하지 않음)"""
        try:
            # MongoDB replace_one 실행
            logger.info(f"CVE replace 시도: {cve_id}")
            
            # 데이터 복사본 생성
            data_copy = data.copy()
            
            # _id 필드 제거 (MongoDB가 자동으로 처리하도록)
            if '_id' in data_copy:
                logger.warning(f"replace 데이터에서 _id 필드 제거: {data_copy['_id']}")
                del data_copy['_id']
            
            # 쿼리 조건 설정
            is_object_id = len(cve_id) == 24 and all(c in '0123456789abcdef' for c in cve_id)
            
            if is_object_id:
                try:
                    from bson.objectid import ObjectId
                    query_condition = {"_id": ObjectId(cve_id)}
                except Exception:
                    query_condition = {"cve_id": cve_id}
            else:
                query_condition = {"cve_id": cve_id}
            
            # 문서가 존재하는지 확인
            doc = await self.collection.find_one(query_condition)
            if not doc:
                logger.warning(f"replace: 문서를 찾을 수 없음: {cve_id}")
                return False
            
            # 기존 _id 유지
            if '_id' in doc:
                data_copy['_id'] = doc['_id']
            
            result = await self.collection.replace_one(
                query_condition, 
                data_copy,
                upsert=False  # 문서가 없으면 생성하지 않음
            )
            
            logger.info(f"Replace 결과: matched={result.matched_count}, modified={result.modified_count}")
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"CVE replace 중 오류: {str(e)}", exc_info=True)
            # 디버깅을 위한 JSON 덤프 시도
            try:
                import json
                logger.error(f"데이터 구조: {json.dumps(data)[:1000]}...")
            except:
                pass
            raise 

    async def delete_snort_rule(self, cve_id: str, rule_id: str) -> Optional[CVEModel]:
        """CVE의 Snort Rule을 삭제합니다."""
        cve = await self.find_by_cve_id(cve_id)
        if cve and cve.snort_rules:
            cve.snort_rules = [rule for rule in cve.snort_rules if str(rule.id) != rule_id]
            await cve.save()
        return cve
        
    async def delete_by_cve_id(self, cve_id: str) -> bool:
        """
        CVE ID를 사용하여 CVE를 삭제합니다.
        
        Args:
            cve_id: 삭제할 CVE의 CVE ID (예: "CVE-2023-1234")
            
        Returns:
            bool: 삭제 성공 여부
        """
        try:
            # CVE ID로 문서 찾기
            cve = await self.find_by_cve_id(cve_id)
            if not cve:
                logger.warning(f"삭제할 CVE를 찾을 수 없음: {cve_id}")
                return False
                
            # 문서 삭제
            await cve.delete()
            
            # 삭제 성공
            return True
        except Exception as e:
            logger.error(f"CVE 삭제 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            return False