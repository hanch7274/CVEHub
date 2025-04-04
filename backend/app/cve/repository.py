from typing import List, Optional, Dict, Any, Union, Tuple
from datetime import datetime
from beanie import PydanticObjectId
from ..common.repositories.base import BaseRepository
from .models import CVEModel, CreateCVERequest, PatchCVERequest
from app.database import get_database
from fastapi.logger import logger
from bson import ObjectId
import traceback
import functools
import time
import re

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

class CVERepository(BaseRepository[CVEModel, CreateCVERequest, PatchCVERequest]):
    def __init__(self):
        super().__init__(CVEModel)
        self.db = get_database()
        self.collection = self.db.get_collection("cves")

    @log_db_operation("CVE 프로젝션 조회")
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

    @log_db_operation("CVE 검색")
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
            
    @log_db_operation("CVE ID로 조회")
    async def find_by_cve_id(self, cve_id: str) -> Optional[CVEModel]:
        """CVE ID 문자열로 CVE를 조회합니다 (대소문자 구분 없음)."""
        try:           
            # 정규식을 사용하여 대소문자 구분 없이 검색
            query = {"cve_id": {"$regex": f"^{re.escape(cve_id)}$", "$options": "i"}}
            document = await self.collection.find_one(query)
            
            if not document:
                return None
                
            # 모델로 변환
            try:
                return CVEModel(**document)
            except Exception as validation_error:
                logger.error(f"CVE 모델 변환 중 검증 오류: {str(validation_error)}")
                # 오류 세부 정보 로깅
                for error in getattr(validation_error, 'errors', []):
                    logger.error(f"검증 오류 상세: {error}")
                return None
        except Exception as e:
            logger.error(f"CVE ID 조회 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return None
            
    @log_db_operation("CVE ID로 투영 조회")
    async def find_by_cve_id_with_projection(self, cve_id: str, projection: Dict[str, Any]) -> Optional[CVEModel]:
        """
        CVE ID로 CVE를 조회하되, 지정된 필드만 가져옵니다.
        
        Args:
            cve_id: 조회할 CVE ID
            projection: 가져올 필드 (MongoDB projection 형식)
            
        Returns:
            Optional[CVEModel]: 조회된 CVE 모델 또는 None
        """
        try:
            # 대소문자 구분 없이 검색 (MongoDB $regex 사용)
            query = {"cve_id": {"$regex": f"^{re.escape(cve_id)}$", "$options": "i"}}
            document = await self.collection.find_one(query, projection)
            
            if not document:
                return None
                
            try:
                return CVEModel(**document)
            except Exception as validation_error:
                logger.error(f"CVE 모델 변환 중 검증 오류 (projection): {str(validation_error)}")
                # 불완전한 모델을 handling하기 위한 추가 로직
                # _id 필드는 항상 포함되는지 확인
                if "_id" not in document and projection.get("_id", 1) != 0:
                    document["_id"] = PydanticObjectId()
                
                # 필수 필드가 없는 경우 기본값 추가
                base_fields = {
                    "cve_id": cve_id,
                    "title": document.get("title", ""),
                    "severity": document.get("severity", "Unknown"),
                    "status": document.get("status", "Unknown")
                }
                
                # 누락된 필요 필드 추가
                for field, default in base_fields.items():
                    if field not in document:
                        document[field] = default
                
                try:
                    return CVEModel(**document)
                except Exception as e:
                    logger.error(f"CVE 모델 변환 재시도 실패: {str(e)}")
                    return None
        except Exception as e:
            logger.error(f"CVE ID projection 조회 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return None

    @log_db_operation("상태별 CVE 조회")
    async def get_by_status(self, status: str, skip: int = 0, limit: int = 10) -> List[CVEModel]:
        """상태별로 CVE를 조회합니다."""
        return await self.model.find({"status": status}).skip(skip).limit(limit).to_list()
    
    @log_db_operation("문서 업데이트")
    async def update_document(self, 
                           cve_id: str, 
                           update_data: Dict[str, Any],
                           update_type: str = "set") -> Optional[CVEModel]:
        """
        통합 업데이트 메서드 - 다양한 업데이트 유형 지원
        
        Args:
            cve_id: 업데이트할 CVE ID
            update_data: 업데이트할 데이터
            update_type: 업데이트 유형 (set, push, pull 등)
            
        Returns:
            Optional[CVEModel]: 업데이트된 CVE 모델 또는 None
        """
        try:
            query = {"cve_id": {"$regex": f"^{re.escape(cve_id)}$", "$options": "i"}}
            
            # 업데이트 작업 유형에 따른 MongoDB 연산자 결정
            update_op = {f"${update_type}": update_data}
            
            result = await self.collection.update_one(query, update_op)
            
            if result.matched_count == 0:
                logger.warning(f"업데이트할 CVE를 찾을 수 없음: {cve_id}")
                return None
                
            if result.modified_count == 0:
                logger.info(f"CVE {cve_id}에 변경사항이 없음")
                
            # 업데이트된 문서 반환
            return await self.find_by_cve_id(cve_id)
        except Exception as e:
            logger.error(f"CVE 업데이트 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    @log_db_operation("특정 필드 업데이트")
    async def update_field(self, cve_id: str, field: str, value: Any) -> bool:
        """
        CVE의 특정 필드만 업데이트합니다.
        
        Args:
            cve_id: 업데이트할 CVE ID
            field: 업데이트할 필드명
            value: 새 값
            
        Returns:
            bool: 업데이트 성공 여부
        """
        try:
            update_data = {field: value}
            result = await self.update_document(cve_id, update_data)
            return result is not None
        except Exception as e:
            logger.error(f"CVE 필드 업데이트 중 오류 발생: {str(e)}")
            return False

    @log_db_operation("다중 필드 업데이트")
    async def update_fields(self, cve_id: str, fields: Dict[str, Any]) -> bool:
        """
        CVE의 여러 필드를 한 번에 업데이트합니다.
        
        Args:
            cve_id: 업데이트할 CVE ID
            fields: 업데이트할 필드와 값 (예: {"status": "분석중", "severity": "High"})
            
        Returns:
            bool: 업데이트 성공 여부
        """
        try:
            result = await self.update_document(cve_id, fields)
            return result is not None
        except Exception as e:
            logger.error(f"CVE 다중 필드 업데이트 중 오류 발생: {str(e)}")
            return False

    @log_db_operation("CVE 존재 확인")
    async def check_cve_exists(self, cve_id: str) -> bool:
        """
        CVE ID가 데이터베이스에 이미 존재하는지 확인합니다.
        
        Args:
            cve_id: 확인할 CVE ID
            
        Returns:
            bool: CVE ID가 존재하면 True, 아니면 False
        """
        try:
            # 성능 향상을 위해 전체 문서가 아닌 ID만 확인
            query = {"cve_id": {"$regex": f"^{re.escape(cve_id)}$", "$options": "i"}}
            result = await self.collection.find_one(query, {"_id": 1})
            return result is not None
        except Exception as e:
            logger.error(f"CVE 존재 확인 중 오류 발생: {str(e)}")
            return False

    @log_db_operation("댓글 추가")
    async def add_comment(self, cve_id: str, comment_data: dict) -> Optional[CVEModel]:
        """CVE에 댓글을 추가합니다."""
        try:
            result = await self.update_document(cve_id, {"comments": comment_data}, update_type="push")
            return result
        except Exception as e:
            logger.error(f"댓글 추가 중 오류 발생: {str(e)}")
            return None

    @log_db_operation("댓글 업데이트")
    async def update_comment(self, cve_id: str, comment_id: str, comment_data: dict) -> Optional[CVEModel]:
        """CVE의 댓글을 수정합니다."""
        try:
            # 특정 댓글 찾기 위한 조건과 업데이트 필드 설정
            query = {"cve_id": {"$regex": f"^{re.escape(cve_id)}$", "$options": "i"}, 
                    "comments.id": comment_id}
            
            update_fields = {}
            for field, value in comment_data.items():
                update_fields[f"comments.$.{field}"] = value
            
            # MongoDB 업데이트 실행
            result = await self.collection.update_one(query, {"$set": update_fields})
            
            if result.matched_count == 0:
                logger.warning(f"업데이트할 댓글을 찾을 수 없음: {comment_id}")
                return None
                
            # 업데이트된 CVE 반환
            return await self.find_by_cve_id(cve_id)
        except Exception as e:
            logger.error(f"댓글 업데이트 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return None

    @log_db_operation("댓글 삭제")
    async def delete_comment(self, cve_id: str, comment_id: str, permanent: bool = False) -> Optional[CVEModel]:
        """CVE의 댓글을 삭제합니다."""
        try:
            if permanent:
                # 완전 삭제 - $pull 연산자 사용
                query = {"cve_id": {"$regex": f"^{re.escape(cve_id)}$", "$options": "i"}}
                result = await self.collection.update_one(
                    query, 
                    {"$pull": {"comments": {"id": comment_id}}}
                )
            else:
                # 소프트 삭제 - 해당 댓글만 업데이트
                return await self.update_comment(cve_id, comment_id, {
                    "is_deleted": True,
                    "last_modified_at": datetime.now()
                })
            
            if result.matched_count == 0:
                logger.warning(f"삭제할 댓글을 찾을 수 없음: {comment_id}")
                return None
                
            # 업데이트된 CVE 반환
            return await self.find_by_cve_id(cve_id)
        except Exception as e:
            logger.error(f"댓글 삭제 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return None

    @log_db_operation("CVE ID로 업데이트")
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
            # 새로운 update_document 메서드 사용
            return await self.update_document(cve_id, update_data)
        except Exception as e:
            logger.error(f"CVE 업데이트 중 오류 발생: {str(e)}")
            return None

    @log_db_operation("PoC 추가")
    async def add_poc(self, cve_id: str, poc_data: dict) -> Optional[CVEModel]:
        """CVE에 PoC를 추가합니다."""
        try:
            return await self.update_document(cve_id, {"pocs": poc_data}, update_type="push")
        except Exception as e:
            logger.error(f"PoC 추가 중 오류 발생: {str(e)}")
            return None

    @log_db_operation("Snort Rule 추가")
    async def add_snort_rule(self, cve_id: str, rule_data: dict) -> Optional[CVEModel]:
        """CVE에 Snort Rule을 추가합니다."""
        try:
            return await self.update_document(cve_id, {"snort_rules": rule_data}, update_type="push")
        except Exception as e:
            logger.error(f"Snort Rule 추가 중 오류 발생: {str(e)}")
            return None

    @log_db_operation("업데이트")
    async def update(self, cve_id: str, update_data: dict) -> bool:
        """
        CVE 정보 업데이트 - 하위 호환성 유지
        """
        try:
            logger.info(f"CVE 업데이트 시도: {cve_id}")
            
            # _id 필드가 있으면 제거 (MongoDB에서 _id는 변경 불가)
            if '_id' in update_data:
                logger.warning(f"업데이트 데이터에서 _id 필드 제거: {update_data['_id']}")
                update_data = update_data.copy()  # 원본 데이터 변경 방지
                del update_data['_id']
            
            # 통합 update_document 메서드 사용
            result = await self.update_document(cve_id, update_data)
            return result is not None
        except Exception as e:
            logger.error(f"CVE 업데이트 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    @log_db_operation("문서 교체")
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
            query = {"cve_id": {"$regex": f"^{re.escape(cve_id)}$", "$options": "i"}}
            
            # 문서가 존재하는지 확인
            doc = await self.collection.find_one(query)
            if not doc:
                logger.warning(f"replace: 문서를 찾을 수 없음: {cve_id}")
                return False
            
            # 기존 _id 유지
            if '_id' in doc:
                data_copy['_id'] = doc['_id']
            
            result = await self.collection.replace_one(
                query, 
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

    @log_db_operation("Snort Rule 삭제")
    async def delete_snort_rule(self, cve_id: str, rule_id: str) -> Optional[CVEModel]:
        """CVE의 Snort Rule을 삭제합니다."""
        try:
            query = {"cve_id": {"$regex": f"^{re.escape(cve_id)}$", "$options": "i"}}
            pull_query = {"$pull": {"snort_rules": {"id": rule_id}}}
            
            result = await self.collection.update_one(query, pull_query)
            
            if result.matched_count == 0:
                logger.warning(f"삭제할 Snort Rule을 찾을 수 없음: {rule_id}")
                return None
                
            # 업데이트된 CVE 반환
            return await self.find_by_cve_id(cve_id)
        except Exception as e:
            logger.error(f"Snort Rule 삭제 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return None
        
    @log_db_operation("CVE 삭제")
    async def delete_by_cve_id(self, cve_id: str) -> bool:
        """
        CVE ID를 사용하여 CVE를 삭제합니다.
        
        Args:
            cve_id: 삭제할 CVE의 CVE ID (예: "CVE-2023-1234")
            
        Returns:
            bool: 삭제 성공 여부
        """
        try:
            # 대소문자 구분 없는 삭제 쿼리
            query = {"cve_id": {"$regex": f"^{re.escape(cve_id)}$", "$options": "i"}}
            result = await self.collection.delete_one(query)
            
            if result.deleted_count == 0:
                logger.warning(f"삭제할 CVE를 찾을 수 없음: {cve_id}")
                return False
                
            logger.info(f"CVE 삭제 성공: {cve_id}")
            return True
        except Exception as e:
            logger.error(f"CVE 삭제 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            return False