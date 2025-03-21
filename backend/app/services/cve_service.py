from typing import List, Optional, Tuple, Dict, Any, Union
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from beanie import PydanticObjectId
from pymongo import DESCENDING
from ..repositories.cve_repository import CVERepository
from ..models.cve_model import CVEModel, CreateCVERequest, PatchCVERequest, Comment, CommentCreate, CommentUpdate, PoC, SnortRule, ModificationHistory, ChangeItem
from ..models.notification import Notification
from ..models.user import User
from ..core.socketio_manager import socketio_manager, WSMessageType, DateTimeEncoder
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
        try:
            if status:
                cves = await self.repository.get_by_status(status, skip, limit)
                total = await self.repository.count({"status": status})
            else:
                cves = await self.repository.get_all(skip, limit)
                total = await self.repository.count()
            return cves, total
        except Exception as e:
            logger.error(f"CVE 목록 조회 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    async def get_cve_list(
        self,
        page: int = 1,
        limit: int = 10,
        severity: Optional[str] = None,
        search: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        페이지네이션을 적용한 CVE 목록을 조회합니다.
        
        Args:
            page: 페이지 번호 (1부터 시작)
            limit: 페이지당 항목 수
            severity: 심각도 필터
            search: 검색어
            
        Returns:
            Dict: {
                "total": 총 항목 수, 
                "items": CVE 목록, 
                "page": 현재 페이지,
                "limit": 페이지당 항목 수
            }
        """
        try:
            # skip 값 계산 (페이지 번호는 1부터 시작)
            skip = (page - 1) * limit
            
            # 검색 쿼리 구성
            query = {}
            if severity:
                query["severity"] = severity
                
            if search:
                query["$or"] = [
                    {"cve_id": {"$regex": search, "$options": "i"}},
                    {"title": {"$regex": search, "$options": "i"}},
                    {"description": {"$regex": search, "$options": "i"}}
                ]
            
            # 필요한 필드만 선택
            projection = {
                "cve_id": 1,
                "title": 1,
                "status": 1,
                "created_at": 1,
                "last_modified_date": 1,
                "description": 1,
                "severity": 1,
            }
            
            # DB 쿼리 실행
            cves = await self.repository.find_with_projection(
                query=query,
                projection=projection,
                skip=skip,
                limit=limit,
                sort=[
                    ("last_modified_date", DESCENDING),
                    ("created_at", DESCENDING)
                ]
            )
            
            # 전체 개수 카운트
            total = await self.repository.count(query)
            
            return {
                "total": total,
                "items": cves,
                "page": page,
                "limit": limit
            }
        except Exception as e:
            logger.error(f"CVE 목록 조회 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    async def get_cve(self, cve_id: str) -> Optional[CVEModel]:
        """
        CVE ID로 CVE를 조회합니다.
        
        Args:
            cve_id: 조회할 CVE ID
            
        Returns:
            CVE 모델 (없으면 None)
        """
        try:
            logger.debug(f"CVE ID로 조회: {cve_id}")
            
            # 대소문자 구분 없이 CVE ID로 조회
            cve = await self.repository.find_by_cve_id(cve_id)
            
            if cve:
                logger.debug(f"CVE 찾음: {cve.id}, {cve.cve_id}")
            else:
                logger.debug(f"CVE를 찾을 수 없음: {cve_id}")
            
            return cve
        except Exception as e:
            logger.error(f"CVE 조회 중 오류: {str(e)}")
            return None
            
        
    async def get_cve_detail(self, cve_id: str) -> Optional[Dict[str, Any]]:
        """
        CVE 상세 정보를 조회합니다.
        
        Args:
            cve_id: 조회할 CVE ID
            
        Returns:
            Dict: CVE 상세 정보 (없으면 None)
        """
        try:
            cve = await self.get_cve(cve_id)
            if not cve:
                return None
                
            # 모델을 딕셔너리로 변환
            cve_dict = cve.dict()
            
            # 날짜 필드 로깅 (디버깅 용도)
            date_fields = ["created_at", "last_modified_date"]
            for field in date_fields:
                if field in cve_dict:
                    logger.info(f"CVE {cve_id}의 {field} 필드 값: {cve_dict[field]} (타입: {type(cve_dict[field]).__name__})")
                    
                    # 빈 객체나 빈 문자열인 경우 로그만 남기고 값은 변경하지 않음
                    if (isinstance(cve_dict[field], dict) and len(cve_dict[field]) == 0) or \
                       (isinstance(cve_dict[field], str) and not cve_dict[field].strip()):
                        logger.warning(f"CVE {cve_id}의 {field} 필드가 비어있습니다. 데이터 확인이 필요합니다.")
            
            # 필요한 추가 정보 조회 (예: 관련 댓글 등)
            # 예시: cve_dict["related_comments"] = await self.get_cve_comments(cve_id)
            
            return cve_dict
        except Exception as e:
            logger.error(f"CVE {cve_id} 상세 조회 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    async def create_cve(self, cve_data: Union[dict, CreateCVERequest], username: str, is_crawler: bool = False, crawler_name: Optional[str] = None) -> Optional[CVEModel]:
        """
        새로운 CVE를 생성합니다.
        
        Args:
            cve_data: CVE 데이터 (dict 또는 CreateCVERequest)
            username: 생성 사용자 이름
            is_crawler: 크롤러에 의한 생성 여부
            crawler_name: 크롤러 이름 (크롤러에 의한 생성일 경우)
            
        Returns:
            생성된 CVE 모델 또는 None
        """
        try:
            # pydantic 모델을 딕셔너리로 변환
            if not isinstance(cve_data, dict):
                cve_data = cve_data.dict()
                
            # 날짜 필드 KST 설정
            current_time = datetime.now(ZoneInfo("UTC"))  # UTC 기준 시간 사용
            
            # 추가 필드 설정
            cve_data["created_by"] = username
            cve_data["created_at"] = current_time
            cve_data["last_modified_by"] = username
            cve_data["last_modified_date"] = current_time
            
            # 크롤러 정보 추가
            if is_crawler and crawler_name:
                cve_data["crawler_info"] = {
                    "name": crawler_name,
                    "timestamp": current_time
                }

            # 필수 날짜 필드 검증
            required_date_fields = ['created_at', 'last_modified_date']
            missing_date_fields = []
            
            for field in required_date_fields:
                if field not in cve_data or not cve_data[field]:
                    missing_date_fields.append(field)
                elif isinstance(cve_data[field], dict) and len(cve_data[field]) == 0:
                    missing_date_fields.append(field)
                elif isinstance(cve_data[field], str) and not cve_data[field].strip():
                    missing_date_fields.append(field)
            
            if missing_date_fields:
                raise ValueError(f"다음 날짜 필드는 필수입니다: {', '.join(missing_date_fields)}")
            
            # CVE 생성
            cve = await self.repository.create(cve_data)
            if cve:
                logging.info(f"CVE created successfully: {cve.cve_id}")
                # id 필드를 문자열로 변환하여 응답 유효성 검사 오류 해결
                cve.id = str(cve.id)
                return cve
            
            logging.error("Failed to create CVE: Repository returned None")
            return None
        
        except Exception as e:
            logging.error(f"Error in create_cve: {str(e)}")
            logging.error(traceback.format_exc())
            return None

    async def update_cve(self, cve_id: str, update_data: Union[dict, PatchCVERequest], updated_by: str = None) -> Optional[Dict[str, Any]]:
        """
        CVE 정보를 업데이트합니다.
        
        Args:
            cve_id: 업데이트할 CVE ID
            update_data: 업데이트할 데이터 (dict 또는 PatchCVERequest)
            updated_by: 업데이트한 사용자 이름
            
        Returns:
            업데이트된 CVE 정보 (없으면 None)
        """
        try:
            logger.info(f"CVE 업데이트 요청: cve_id={cve_id}, updated_by={updated_by}")
            
            # cve_id 형식 확인 로깅
            is_object_id = len(cve_id) == 24 and all(c in '0123456789abcdef' for c in cve_id)
            is_cve_format = cve_id.startswith("CVE-") and len(cve_id) > 4
            logger.debug(f"cve_id 형식: {cve_id}, ObjectId 형식: {is_object_id}, CVE 형식: {is_cve_format}")
            
            # 기존 CVE 조회
            existing_cve = await self.get_cve(cve_id)
            if not existing_cve:
                logger.warning(f"업데이트할 CVE를 찾을 수 없음: {cve_id}")
                
                # 다른 방식으로 조회 시도
                if is_cve_format:
                    logger.debug(f"CVE ID 형식으로 다시 조회 시도: {cve_id}")
                    # 대소문자 구분 없이 조회
                    try:
                        alt_cve = await self.repository.find_by_cve_id(cve_id)
                        if alt_cve:
                            logger.info(f"대소문자 구분 없이 CVE 찾음: {alt_cve.cve_id}")
                            existing_cve = alt_cve
                    except Exception as e:
                        logger.error(f"대소문자 구분 없이 조회 중 오류: {str(e)}")
                
                if not existing_cve:
                    return None
                
            logger.debug(f"기존 CVE 정보: id={existing_cve.id}, cve_id={existing_cve.cve_id}")
                
            # pydantic 모델을 딕셔너리로 변환
            if not isinstance(update_data, dict):
                update_data = update_data.dict(exclude_unset=True)
                
            # _id 필드가 있으면 제거 (MongoDB에서 _id는 변경 불가)
            if '_id' in update_data:
                logger.warning(f"업데이트 데이터에서 _id 필드 제거: {update_data['_id']}")
                update_data = update_data.copy()  # 원본 데이터 변경 방지
                del update_data['_id']
                
            # 업데이트 시간 설정 - 명시적으로 UTC 시간대 사용
            current_time = datetime.now(ZoneInfo("UTC"))
            update_data['last_modified_date'] = current_time
            
            # 변경 기록 추적
            changes = []
            # 제외할 필드 목록
            excluded_fields = ['last_modified_date', '_id', 'id']
            
            for field, new_value in update_data.items():
                if field in excluded_fields:
                    # 제외 필드는 변경 기록에서 제외
                    continue
                    
                if field in existing_cve.dict() and existing_cve.dict()[field] != new_value:
                    changes.append({
                        "field": field,
                        "field_name": field,  # 향후 필드 한글명 매핑 가능
                        "action": "edit",
                        "summary": f"{field} 필드 변경",
                        "old_value": existing_cve.dict()[field],
                        "new_value": new_value
                    })
            
            logger.debug(f"변경 필드 수: {len(changes)}")
            
            # 변경 이력 데이터 추가
            if changes:
                modification_history = ModificationHistory(
                    username=updated_by or "system",
                    modified_at=current_time,  # UTC 시간 사용
                    changes=changes
                )
                
                # 기존 modification_history 불러오기
                existing_history = existing_cve.dict().get("modification_history", [])
                
                # 업데이트 데이터에 추가
                update_data["modification_history"] = existing_history + [modification_history.dict()]
            
            # 업데이트한 사용자 정보 추가
            if updated_by:
                update_data['last_modified_by'] = updated_by
            
            # 기존 CVE의 created_at 필드 보존
            if 'created_at' not in update_data and 'created_at' in existing_cve:
                update_data['created_at'] = existing_cve['created_at']
                logger.info(f"CVE {cve_id} 업데이트: created_at 필드 보존: {update_data['created_at']}")
            
            # 업데이트 실행
            logger.debug(f"repository.update 호출: id={existing_cve.id}, cve_id={existing_cve.cve_id}")
            
            # 중요: 여기서 existing_cve.id를 문자열로 변환하여 전달
            # 이 부분이 MongoDB ObjectId를 문자열로 변환하는 부분
            id_for_update = str(existing_cve.id)
            logger.debug(f"업데이트에 사용할 ID: {id_for_update}, 타입: {type(id_for_update)}")
            
            # 업데이트 데이터에 cve_id 필드 추가 (없는 경우)
            if 'cve_id' not in update_data and hasattr(existing_cve, 'cve_id'):
                update_data['cve_id'] = existing_cve.cve_id
                logger.debug(f"업데이트 데이터에 cve_id 추가: {existing_cve.cve_id}")
            
            # 필수 날짜 필드 검증
            required_date_fields = ['last_modified_date']
            missing_date_fields = []
            
            for field in required_date_fields:
                if field not in update_data or not update_data[field]:
                    missing_date_fields.append(field)
                elif isinstance(update_data[field], dict) and len(update_data[field]) == 0:
                    missing_date_fields.append(field)
                elif isinstance(update_data[field], str) and not update_data[field].strip():
                    missing_date_fields.append(field)
            
            if missing_date_fields:
                raise ValueError(f"다음 날짜 필드는 필수입니다: {', '.join(missing_date_fields)}")
            
            # 날짜 필드 로깅
            for field in required_date_fields:
                if field in update_data:
                    logger.info(f"CVE {cve_id} 업데이트: {field} 필드 값: {update_data[field]} (타입: {type(update_data[field]).__name__})")
            
            try:
                result = await self.repository.update(id_for_update, update_data)
                logger.info(f"업데이트 결과: {result}")
                
                if result:
                    updated_cve = await self.get_cve_detail(cve_id)
                    return updated_cve
                
                logger.warning(f"CVE 업데이트 실패: {cve_id}")
                return None
            except Exception as e:
                logger.error(f"repository.update 호출 중 오류: {str(e)}")
                logger.error(traceback.format_exc())
                
                # 기존 CVE 정보 반환 (업데이트는 실패했지만 조회는 가능)
                return await self.get_cve_detail(cve_id)
        except Exception as e:
            logger.error(f"CVE 업데이트 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    async def delete_cve(self, cve_id: str) -> bool:
        """
        CVE를 삭제합니다.
        
        Args:
            cve_id: 삭제할 CVE ID 또는 MongoDB ObjectId
            
        Returns:
            삭제 성공 여부
        """
        try:
            logger.info(f"CVE 삭제 시도: {cve_id}")
            
            # ObjectId 형식인지 확인
            is_object_id = len(cve_id) == 24 and all(c in '0123456789abcdef' for c in cve_id)
            
            # ObjectId 형식이면 직접 삭제, 아니면 CVE ID로 조회 후 삭제
            if is_object_id:
                try:
                    # 직접 ObjectId로 삭제 시도
                    result = await self.repository.delete(cve_id)
                    if result:
                        logger.info(f"ObjectId로 CVE 삭제 성공: {cve_id}")
                        return True
                except Exception as e:
                    logger.warning(f"ObjectId로 CVE 삭제 실패: {cve_id}, 오류: {str(e)}")
                    # 실패하면 아래 CVE ID 조회 로직으로 계속 진행
            
            # CVE ID로 조회
            cve = await self.repository.find_by_cve_id(cve_id)
            if not cve:
                logger.warning(f"삭제할 CVE를 찾을 수 없음: {cve_id}")
                return False
                
            # 삭제 실행
            result = await self.repository.delete(str(cve.id))
            
            if result:
                logger.info(f"CVE 삭제 성공: {cve_id}")
            else:
                logger.warning(f"CVE 삭제 실패: {cve_id}")
                
            return result
        except Exception as e:
            logger.error(f"CVE 삭제 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    async def search_cves(
        self, 
        query: str,
        skip: int = 0,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        CVE를 검색합니다.
        
        Args:
            query: 검색어
            skip: 건너뛸 항목 수
            limit: 반환할 최대 항목 수
            
        Returns:
            Dict: {"total": 총 개수, "items": 검색 결과 목록}
        """
        try:
            search_query = {
                "$or": [
                    {"cve_id": {"$regex": query, "$options": "i"}},
                    {"title": {"$regex": query, "$options": "i"}},
                    {"description": {"$regex": query, "$options": "i"}}
                ]
            }
            
            # 필요한 필드만 선택
            projection = {
                "cve_id": 1,
                "title": 1,
                "status": 1,
                "created_at": 1,
                "last_modified_date": 1,
                "description": 1,
                "severity": 1,
            }
            
            # DB 쿼리 실행
            cves = await self.repository.find_with_projection(
                query=search_query,
                projection=projection,
                skip=skip,
                limit=limit,
                sort=[
                    ("last_modified_date", DESCENDING),
                    ("created_at", DESCENDING)
                ]
            )
            
            # 전체 개수 카운트
            total = await self.repository.count(search_query)
            
            return {
                "total": total,
                "items": cves
            }
        except Exception as e:
            logger.error(f"CVE 검색 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    async def bulk_upsert_cves(
        self,
        cves_data: List[Union[dict, CreateCVERequest]],
        username: str,
        crawler_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        여러 CVE를 일괄 생성 또는 업데이트합니다.
        
        Args:
            cves_data: 생성/업데이트할 CVE 데이터 리스트
            username: 작업 수행 사용자 이름
            crawler_name: 크롤러 이름 (크롤러에 의한 작업일 경우)
            
        Returns:
            Dict: {
                "success": 성공한 CVE ID 매핑,
                "errors": 실패한 CVE ID 매핑,
            }
        """
        try:
            results = {
                "success": {},
                "errors": {}
            }

            for cve_item in cves_data:
                try:
                    # dict나 객체에서 cve_id 추출
                    if isinstance(cve_item, dict):
                        cve_id = cve_item.get("cve_id")
                    else:
                        cve_id = cve_item.cve_id
                        
                    if not cve_id:
                        continue
                        
                    # 이미 존재하는 CVE인지 확인
                    existing_cve = await self.get_cve(cve_id)
                    
                    if existing_cve:
                        # 업데이트
                        updated_cve = await self.update_cve(
                            cve_id=cve_id,
                            update_data=cve_item,
                            updated_by=username
                        )
                        
                        if updated_cve:
                            results["success"][cve_id] = {
                                "status": "updated",
                                "message": "CVE가 성공적으로 업데이트되었습니다."
                            }
                    else:
                        # 생성
                        new_cve = await self.create_cve(
                            cve_data=cve_item,
                            username=username,
                            is_crawler=(crawler_name is not None),
                            crawler_name=crawler_name
                        )
                        
                        if new_cve:
                            results["success"][cve_id] = {
                                "status": "created",
                                "message": "CVE가 성공적으로 생성되었습니다."
                            }
                        else:
                            results["errors"][cve_id] = {
                                "status": "failed",
                                "message": "CVE 생성에 실패했습니다."
                            }
                            
                except Exception as item_error:
                    logger.error(f"CVE {cve_id if 'cve_id' in locals() else 'Unknown'} 처리 중 오류: {str(item_error)}")
                    logger.error(traceback.format_exc())
                    
                    error_cve_id = cve_id if 'cve_id' in locals() else "Unknown"
                    results["errors"][error_cve_id] = {
                        "status": "error",
                        "message": str(item_error)
                    }
            
            return results
            
        except Exception as e:
            logger.error(f"대량 CVE 업서트 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    async def get_total_cve_count(self) -> int:
        """
        데이터베이스에 존재하는 전체 CVE 개수를 반환합니다.
        필터링 없이 순수하게 DB에 저장된 모든 CVE의 개수를 반환합니다.
        """
        try:
            count = await self.repository.count()
            logger.info(f"전체 CVE 개수 조회 결과: {count}")
            return count
        except Exception as e:
            logger.error(f"전체 CVE 개수 조회 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    async def update_empty_date_fields(self) -> dict:
        """
        데이터베이스에 있는 모든 CVE의 빈 날짜 필드를 검사하고 로깅합니다.
        실제로 값을 변경하지는 않습니다.
        
        Returns:
            dict: 검사 결과 통계
        """
        try:
            logger.info("빈 날짜 필드 검사 작업 시작")
            
            # 모든 CVE 조회
            all_cves = await self.repository.get_all()
            
            # 검사 통계
            stats = {
                "total": len(all_cves),
                "empty_fields_found": 0,
                "cves_with_empty_fields": [],
                "fields_empty": {
                    "created_at": 0,
                    "last_modified_date": 0
                }
            }
            
            # 각 CVE에 대해 빈 날짜 필드 확인
            for cve in all_cves:
                cve_dict = cve.dict()
                cve_id = cve_dict.get("cve_id")
                
                if not cve_id:
                    logger.warning(f"CVE ID가 없는 문서 발견: {cve_dict.get('_id')}")
                    continue
                
                # 빈 필드 확인
                empty_fields = []
                date_fields = ["created_at", "last_modified_date"]
                
                for field in date_fields:
                    # 필드가 없거나, None이거나, 빈 객체이거나, 빈 문자열인 경우
                    if field in cve_dict and (
                        cve_dict[field] is None or 
                        (isinstance(cve_dict[field], dict) and len(cve_dict[field]) == 0) or
                        (isinstance(cve_dict[field], str) and not cve_dict[field].strip())
                    ):
                        empty_fields.append(field)
                        stats["fields_empty"][field] += 1
                
                # 빈 필드가 있는 경우
                if empty_fields:
                    stats["empty_fields_found"] += len(empty_fields)
                    stats["cves_with_empty_fields"].append({
                        "cve_id": cve_id,
                        "empty_fields": empty_fields
                    })
                    logger.warning(f"CVE {cve_id}에 빈 날짜 필드가 발견되었습니다: {empty_fields}")
            
            logger.info(f"빈 날짜 필드 검사 작업 완료: {stats}")
            return stats
            
        except Exception as e:
            logger.error(f"빈 날짜 필드 검사 작업 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise