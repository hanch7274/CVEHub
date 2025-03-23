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
from ..utils.datetime_utils import get_utc_now, format_datetime, normalize_datetime_fields

# 로거 설정
logger = logging.getLogger(__name__)

class CVEService:
    """CVE 관련 서비스"""
    
    def __init__(self):
        self.repository = CVERepository()

    async def get_cve_list(
        self,
        page: int = 1,
        limit: int = 10,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        search: Optional[str] = None,
        skip: Optional[int] = None  # 호환성을 위한 파라미터
    ) -> Dict[str, Any]:
        """
        페이지네이션을 적용한 CVE 목록을 조회합니다.
        
        Args:
            page: 페이지 번호 (1부터 시작)
            limit: 페이지당 항목 수
            status: 상태 필터
            severity: 심각도 필터
            search: 검색어
            skip: 직접 건너뛸 항목 수 지정 (page와 함께 사용하지 않음)
            
        Returns:
            Dict: {
                "total": 총 항목 수, 
                "items": CVE 목록, 
                "page": 현재 페이지,
                "limit": 페이지당 항목 수
            }
        """
        try:
            logger.info(f"CVE 목록 조회 시작: page={page}, limit={limit}, status={status}, severity={severity}, search={search}, skip={skip}")
            
            # 쿼리 구성
            query = {}
            
            if status:
                query["status"] = status
                
            if severity:
                query["severity"] = severity
                
            if search:
                query["$or"] = [
                    {"cve_id": {"$regex": search, "$options": "i"}},
                    {"title": {"$regex": search, "$options": "i"}},
                    {"description": {"$regex": search, "$options": "i"}}
                ]
            
            # skip 값 계산 (직접 지정하지 않은 경우)
            if skip is None:
                skip = (page - 1) * limit
            
            # 필요한 필드만 선택
            projection = {
                "cve_id": 1,
                "title": 1,
                "status": 1,
                "created_at": 1,
                "last_modified_at": 1,
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
                    ("last_modified_at", DESCENDING),
                    ("created_at", DESCENDING)
                ]
            )
            
            # 전체 개수 카운트
            total = await self.repository.count(query)
            
            logger.debug(f"CVE 목록 조회 완료: 총 {total}개 중 {len(cves)}개 조회됨")
            
            return {
                "total": total,
                "items": cves,
                "page": page if skip is None else skip // limit + 1,
                "limit": limit
            }
        except Exception as e:
            logger.error(f"CVE 목록 조회 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise
    
    async def get_cve_detail(
        self, 
        cve_id: str, 
        as_model: bool = False,
        include_details: bool = True
    ) -> Union[Optional[CVEModel], Optional[Dict[str, Any]]]:
        """
        CVE ID로 CVE 정보를 조회합니다.
        
        Args:
            cve_id: 조회할 CVE ID
            as_model: 모델 형태로 반환할지 여부 (True: CVEModel, False: Dict)
            include_details: 상세 정보 포함 여부 (기본값: True)
            
        Returns:
            CVEModel 또는 Dict (없으면 None)
        """
        try:
            logger.info(f"CVE '{cve_id}' 정보 조회 시작")
            
            # 대소문자 구분 없이 CVE ID로 조회
            cve = await self.repository.find_by_cve_id(cve_id)
            
            if not cve:
                logger.debug(f"CVE를 찾을 수 없음: {cve_id}")
                return None
                
            logger.debug(f"CVE 찾음: {cve.id}, {cve.cve_id}")
                
            # 모델 그대로 반환 요청시
            if as_model:
                return cve
                
            # 모델을 딕셔너리로 변환
            cve_dict = cve.dict()
            
            # 날짜 필드 처리
            cve_dict = normalize_datetime_fields(cve_dict)
        
            return cve_dict
            
        except Exception as e:
            logger.error(f"CVE '{cve_id}' 정보 조회 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            return None

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
            logger.info(f"CVE 생성 시작: 사용자={username}, 크롤러={is_crawler}")
            
            # pydantic 모델을 딕셔너리로 변환
            if not isinstance(cve_data, dict):
                cve_data = cve_data.dict()
                
            # 날짜 필드 KST 설정
            current_time = get_utc_now()
                
            # 추가 필드 설정
            cve_data["created_by"] = username
            cve_data["created_at"] = current_time
            cve_data["last_modified_by"] = username
            cve_data["last_modified_at"] = current_time
            
            # 크롤러 정보 추가
            if is_crawler and crawler_name:
                cve_data["source"] = {
                    "type": "crawler",
                    "name": crawler_name,
                    "crawled_at": current_time
                }
            
            # 기존 CVE 중복 체크 (cve_id가 있는 경우)
            if "cve_id" in cve_data and cve_data["cve_id"]:
                existing_cve = await self.get_cve(cve_data["cve_id"], as_model=True)
                if existing_cve:
                    logger.warning(f"이미 존재하는 CVE ID: {cve_data['cve_id']}")
                    # 이미 존재하는 CVE ID이므로 생성하지 않고 None 반환
                    return None
            
            # CVE 생성
            new_cve = await self.repository.create(cve_data)
            
            if new_cve:
                logger.info(f"CVE 생성 성공: CVE ID={new_cve.cve_id}, MongoDB ID={new_cve.id}")
                return new_cve
            else:
                logger.error("CVE 생성 실패: Repository에서 None 반환")
                return None
        
        except Exception as e:
            logger.error(f"CVE 생성 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
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
            
            # 기존 CVE 조회
            existing_cve = await self.get_cve(cve_id, as_model=True)
            if not existing_cve:
                logger.warning(f"업데이트할 CVE를 찾을 수 없음: {cve_id}")
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
                
            # 업데이트 시간 설정
            current_time = get_utc_now()
            update_data['last_modified_at'] = current_time
            
            # 변경 기록 추적
            changes = []
            excluded_fields = ['last_modified_at', '_id', 'id']
            
            for field, new_value in update_data.items():
                if field in excluded_fields:
                    continue
                    
                if field in existing_cve.dict() and existing_cve.dict()[field] != new_value:
                    changes.append({
                        "field": field,
                        "field_name": field,
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
                    modified_at=current_time,
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
            if 'created_at' not in update_data and hasattr(existing_cve, 'created_at'):
                update_data['created_at'] = existing_cve.created_at
            
            # 업데이트 실행
            id_for_update = str(existing_cve.id)
            
            try:
                result = await self.repository.update(id_for_update, update_data)
                
                if result:
                    logger.info(f"CVE {cve_id} 업데이트 성공")
                    updated_cve = await self.get_cve(cve_id)
                    return updated_cve
                
                logger.warning(f"CVE 업데이트 실패: {cve_id}")
                return None
            except Exception as e:
                logger.error(f"repository.update 호출 중 오류: {str(e)}")
                logger.error(traceback.format_exc())
                raise
        except Exception as e:
            logger.error(f"CVE 업데이트 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    async def delete_cve(self, cve_id: str) -> bool:
        """
        CVE를 삭제합니다.
        
        Args:
            cve_id: 삭제할 CVE ID
            
        Returns:
            삭제 성공 여부
        """
        try:
            logger.info(f"CVE 삭제 시도: {cve_id}")
            
            # CVE 조회 (모델로 받기)
            cve = await self.get_cve(cve_id, as_model=True)
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
                    existing_cve = await self.get_cve(cve_id, as_model=True)
                    
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
                    "last_modified_at": 0
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
                date_fields = ["created_at", "last_modified_at"]
                
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

    async def get_cve_stats(self) -> Dict[str, int]:
        """
        CVE 통계 데이터를 계산합니다.
        
        Returns:
            각종 통계 데이터를 포함한 딕셔너리
        """
        try:
            logger.info("CVE 통계 데이터 계산 시작")
            
            # 모든 CVE 수 (MongoDB 쿼리 최적화 사용)
            total_count = await self.repository.collection.count_documents({})
            
            # 심각도 높음 (High 또는 Critical)
            high_severity_count = await self.repository.collection.count_documents({
                "$or": [
                    {"severity": {"$regex": "high", "$options": "i"}},
                    {"severity": {"$regex": "critical", "$options": "i"}}
                ]
            })
            
            # 최근 7일 내 등록된 CVE
            one_week_ago = get_utc_now() - timedelta(days=7)
            new_last_week_count = await self.repository.collection.count_documents({
                "created_at": {"$gte": one_week_ago}
            })
            
            # 분석 중인 CVE
            in_progress_count = await self.repository.collection.count_documents({
                "status": "분석중"
            })
            
            # 완료된 CVE
            completed_count = await self.repository.collection.count_documents({
                "status": "릴리즈 완료"
            })
            
            # 결과 반환
            stats = {
                "totalCount": total_count,
                "highSeverityCount": high_severity_count,
                "newLastWeekCount": new_last_week_count,
                "inProgressCount": in_progress_count,
                "completedCount": completed_count
            }
            
            logger.info(f"CVE 통계 데이터 계산 완료: {stats}")
            return stats
            
        except Exception as e:
            logger.error(f"CVE 통계 데이터 계산 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise