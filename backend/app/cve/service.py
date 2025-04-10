#app/cve/service.py
"""
CVE 서비스 구현
모든 CVE 관련 비즈니스 로직 포함
"""
from typing import List, Optional, Tuple, Dict, Any, Union
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from beanie import PydanticObjectId
from pymongo import DESCENDING
import logging
import traceback
import re
import asyncio
from pydantic import ValidationError
import json
from bson import ObjectId
from functools import wraps

from app.cve.models import (
    CVEModel, ChangeItem
)
from app.cve.schemas import (
    CreateCVERequest, PatchCVERequest
)
from app.activity.models import ActivityAction, ActivityTargetType
from app.activity.service import ActivityService
from app.cve.repository import CVERepository
from app.common.utils.datetime_utils import get_utc_now, format_datetime, normalize_datetime_fields
from app.common.utils.change_detection import detect_object_changes
from app.socketio.manager import socketio_manager, WSMessageType

# 로거 설정
logger = logging.getLogger(__name__)

# 클래스 외부로 이동한 데코레이터 함수
def track_cve_activity(action, extract_title=None, ignore_fields=None):
    """CVE 활동을 추적하는 데코레이터"""
    def decorator(func):
        @wraps(func)
        async def wrapper(self, cve_id, *args, **kwargs):
            # 사용자 이름 추출 시도
            username = None
            for arg in args:
                if isinstance(arg, str) and not arg.startswith('CVE-'):
                    username = arg
                    break
            
            for key, value in kwargs.items():
                if key in ['username', 'updated_by', 'created_by', 'deleted_by'] and isinstance(value, str):
                    username = value
                    break
            
            if not username:
                username = "system"
            
            # 변경 전 객체 조회 (업데이트/삭제 작업의 경우)
            old_cve = None
            if action != ActivityAction.CREATE:
                old_cve = await self.get_cve_detail(cve_id, as_model=True)
            
            # 원래 함수 실행
            result = await func(self, cve_id, *args, **kwargs)
            
            # 작업 성공 시 활동 기록
            if result:
                # 변경 후 객체 조회 (생성/업데이트 작업의 경우)
                new_cve = None
                if action != ActivityAction.DELETE:
                    if isinstance(result, dict) and 'cve_id' in result:
                        new_cve_id = result['cve_id']
                    else:
                        new_cve_id = cve_id
                    new_cve = await self.get_cve_detail(new_cve_id, as_model=True)
                
                # 제목 추출
                title = None
                if extract_title and callable(extract_title):
                    title = extract_title(old_cve, new_cve, result)
                elif new_cve:
                    title = new_cve.title or cve_id
                elif old_cve:
                    title = old_cve.title or cve_id
                else:
                    title = cve_id
                
                # 추가 변경 사항 준비
                additional_changes = []
                
                # 상태 정보 추가
                if new_cve:
                    additional_changes.append(ChangeItem(
                        field="severity_context",
                        field_name="심각도",
                        action="context",
                        detail_type="simple",
                        after=new_cve.severity,
                        summary=f"심각도: {new_cve.severity}"
                    ))
                    
                    additional_changes.append(ChangeItem(
                        field="status_context",
                        field_name="상태",
                        action="context",
                        detail_type="simple",
                        after=new_cve.status,
                        summary=f"상태: {new_cve.status}"
                    ))
                elif old_cve:
                    additional_changes.append(ChangeItem(
                        field="severity_context",
                        field_name="이전 심각도",
                        action="context",
                        detail_type="simple",
                        after=old_cve.severity,
                        summary=f"이전 심각도: {old_cve.severity}"
                    ))
                    
                    additional_changes.append(ChangeItem(
                        field="status_context",
                        field_name="이전 상태",
                        action="context",
                        detail_type="simple",
                        after=old_cve.status,
                        summary=f"이전 상태: {old_cve.status}"
                    ))
                
                # 활동 생성
                await self.activity_service.track_object_changes(
                    username=username,
                    action=action,
                    target_type=ActivityTargetType.CVE,
                    target_id=cve_id,
                    old_obj=old_cve.dict() if old_cve else None,
                    new_obj=new_cve.dict() if new_cve else None,
                    target_title=title,
                    ignore_fields=ignore_fields or ['last_modified_at', '_id', 'id'],
                    additional_changes=additional_changes
                )
            
            return result
        return wrapper
    return decorator

class CVEService:
    """CVE 서비스"""
    
    def __init__(self, cve_repository: CVERepository = None, activity_service: ActivityService = None, comment_service = None):
        self.repository = cve_repository or CVERepository()
        self.activity_service = activity_service or ActivityService()
        self._comment_service = comment_service
        # 캐시 관련 설정
        self._cache_ttl = 60 * 5  # 5분 캐시 유효시간

    @property
    def comments(self):
        """댓글 관련 작업을 위한 서비스 접근자"""
        if self._comment_service is None:
            # comment_service가 주입되지 않은 경우 동적으로 생성
            from app.comment.service import CommentService
            from app.activity.service import ActivityService
            from app.comment.repository import CommentRepository
            self._comment_service = CommentService(
                cve_repository=self.repository,
                comment_repository=CommentRepository(),
                activity_service=self.activity_service or ActivityService()
            )
        return self._comment_service
    
    
    # 표준화된 결과 반환 메서드
    def _success_result(self, data, message="작업이 성공적으로 완료되었습니다"):
        """성공 결과를 표준 형식으로 반환"""
        return data, message
    
    def _error_result(self, message="작업 중 오류가 발생했습니다"):
        """오류 결과를 표준 형식으로 반환"""
        return None, message

    # === 활동 내역 추적을 위한 데코레이터 ===
    
    # ==== CVE 관련 메서드 ====
    
    async def get_cve_list(
        self,
        page: int = 1,
        limit: int = 10,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        search: Optional[str] = None,
        skip: Optional[int] = None
    ) -> Dict[str, Any]:
        """페이지네이션을 적용한 CVE 목록을 조회합니다."""
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
            
            # 필요한 필드만 선택 (성능 최적화)
            projection = {
                "cve_id": 1,
                "title": 1,
                "status": 1,
                "created_at": 1,
                "last_modified_at": 1,
                "description": 1,
                "severity": 1,
            }
            
            # DB 쿼리 실행 (최적화된 방식)
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
            
            # 전체 개수 카운트 (별도 쿼리로 최적화)
            total = await self.repository.count(query)
            
            logger.info(f"CVE 목록 조회 완료: 총 {total}개 중 {len(cves)}개 조회됨")
            
            # null 날짜 필드 처리 - 현재 시간으로 설정
            current_time = get_utc_now()
            for cve in cves:
                # 날짜 필드가 없거나 null인 경우 현재 시간으로 설정
                if 'created_at' not in cve or cve['created_at'] is None:
                    cve['created_at'] = current_time
                if 'last_modified_at' not in cve or cve['last_modified_at'] is None:
                    cve['last_modified_at'] = current_time
                
                # id 필드가 없는 경우 cve_id 값을 복사
                if 'id' not in cve and 'cve_id' in cve:
                    cve['id'] = cve['cve_id']
            
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
        include_details: bool = False,
        projection: Dict[str, Any] = None
    ) -> Union[Optional[CVEModel], Optional[Dict[str, Any]]]:
        """CVE ID로 CVE 상세 정보를 조회합니다."""
        try:
            # 프로젝션 최적화 - 필요한 필드만 조회
            if projection:
                cve = await self.repository.find_by_cve_id_with_projection(cve_id, projection)
            else:
                # 대소문자 구분 없이 CVE ID로 조회
                cve = await self.repository.find_by_cve_id(cve_id)
            
            if not cve:
                logger.info(f"CVE를 찾을 수 없음: {cve_id}")
                return None
                
            # 모델 그대로 반환 요청시
            if as_model:
                return cve
                
            # 모델을 딕셔너리로 변환
            cve_dict = cve.dict()

            # _id 필드가 있다면 제거
            if '_id' in cve_dict:
                cve_dict.pop('_id')

            # 날짜 필드 처리
            cve_dict = normalize_datetime_fields(cve_dict)
            
            # id 필드 처리 - 있으면 문자열로 변환, 없으면 cve_id 값 사용
            if 'id' in cve_dict:
                # PydanticObjectId 또는 ObjectId를 문자열로 변환
                if hasattr(cve_dict['id'], '__str__'):
                    cve_dict['id'] = str(cve_dict['id'])
            elif 'cve_id' in cve_dict:
                # id 필드가 없는 경우 cve_id 값을 사용
                cve_dict['id'] = cve_dict['cve_id']
            
            # 댓글 정보 조회 및 추가
            try:
                # 댓글 서비스 인스턴스 확인
                if self.comments:
                    # 댓글 조회
                    comments_data = await self.comments.get_comments(cve_id)
                    # 결과에 댓글 추가 ('comments' 필드명으로 통일)
                    cve_dict['comments'] = comments_data
                    logger.debug(f"CVE {cve_id}에 {len(comments_data)} 개의 댓글을 추가했습니다.")
                    
                    # 기존 'comment' 필드가 있는 경우에도 'comments' 필드로 복사
                    if 'comment' in cve_dict and isinstance(cve_dict['comment'], list) and not cve_dict['comments']:
                        logger.debug(f"기존 comment 필드의 데이터를 comments 필드로 복사합니다.")
                        cve_dict['comments'] = cve_dict['comment']
                else:
                    logger.warning(f"댓글 서비스 인스턴스가 없어 CVE {cve_id}의 댓글을 조회할 수 없습니다.")
                    cve_dict['comments'] = []
            except Exception as comment_err:
                # 댓글 조회 오류가 발생해도 CVE 정보는 반환
                logger.error(f"CVE {cve_id}의 댓글 조회 중 오류 발생: {str(comment_err)}")
                logger.error(traceback.format_exc())
                # 빈 댓글 배열 추가
                cve_dict['comments'] = []
                
            # 필드명 일관성 보장: comment는 비워두지 않고 comments 데이터와 동기화
            if 'comment' in cve_dict and ('comments' not in cve_dict or not cve_dict['comments']):
                logger.debug(f"comment 필드를 comments 필드와 동기화합니다.")
                cve_dict['comments'] = cve_dict['comment']
            elif 'comments' in cve_dict and ('comment' not in cve_dict or not cve_dict['comment']):
                logger.debug(f"comments 필드를 comment 필드와 동기화합니다.")
                cve_dict['comment'] = cve_dict['comments']
            
            return cve_dict
            
        except Exception as e:
            error_msg = f"CVE '{cve_id}' 정보 조회 중 오류 발생: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            raise Exception(error_msg)

    async def create_cve(self, cve_data: Union[dict, CreateCVERequest], username: str, is_crawler: bool = False, crawler_name: Optional[str] = None) -> Optional[CVEModel]:
        """새로운 CVE를 생성합니다."""
        # 트랜잭션 변수 선언
        new_cve = None
        
        try:
            logger.info(f"CVE 생성 시작: 사용자={username}, 크롤러={is_crawler}")
            
            # pydantic 모델을 딕셔너리로 변환
            if not isinstance(cve_data, dict):
                logger.debug(f"입력 데이터 타입: {type(cve_data)}")
                cve_data = cve_data.dict()
            
            # 디버깅: 입력 데이터 구조 확인
            logger.debug(f"CVE 데이터 키: {list(cve_data.keys())}")
            
            # 문제가 되는 필드 값 디버깅
            for field in ["assigned_to", "notes", "nuclei_hash"]:
                if field in cve_data:
                    logger.debug(f"{field} 필드 값: {cve_data[field]}")
                    logger.debug(f"{field} 필드 타입: {type(cve_data[field])}")
                    
                    # 필드 값 확인 후 문자열로 변환 처리
                    if cve_data[field] is None:
                        logger.debug(f"{field} 필드가 None입니다. 빈 문자열로 변환합니다.")
                        cve_data[field] = ""
                    elif not isinstance(cve_data[field], str):
                        logger.debug(f"{field} 필드가 문자열이 아닙니다. 문자열로 변환합니다: {cve_data[field]}")
                        cve_data[field] = str(cve_data[field]) if cve_data[field] is not None else ""
                else:
                    logger.debug(f"{field} 필드가 없습니다. 빈 문자열을 추가합니다.")
                    cve_data[field] = ""
            
            # 임베디드 필드 디버깅
            for field_name in ['reference', 'poc', 'snort_rule']:
                if field_name in cve_data:
                    logger.debug(f"{field_name} 필드 타입: {type(cve_data[field_name])}")
                    if hasattr(cve_data[field_name], '__class__'):
                        logger.debug(f"{field_name} 필드 클래스: {cve_data[field_name].__class__.__name__}")
                    if isinstance(cve_data[field_name], tuple) and len(cve_data[field_name]) > 0:
                        logger.debug(f"{field_name} 첫 항목 타입: {type(cve_data[field_name][0])}")
                        logger.debug(f"{field_name} 첫 항목 내용: {cve_data[field_name][0]}")
                else:
                    logger.debug(f"{field_name} 필드 없음")
            
            # 날짜 필드 UTC 설정
            current_time = get_utc_now()
            
            # 임베디드 필드 처리 (FieldInfo 객체 변환)
            cve_data = self._process_embedded_fields(cve_data)
            
            # CVE 객체 자체에 시간 메타데이터 추가
            cve_data = self._add_timestamp_metadata(cve_data, username, current_time)
            
            # 각 컨테이너 필드에 대해 필수 필드 추가
            for field in ["reference", "poc", "snort_rule"]:
                # 필드가 있고, None이 아니고, 비어있지 않은 경우만 처리
                if field in cve_data and cve_data[field] is not None:
                    # 빈 리스트가 아닌지 확인하고 처리
                    if isinstance(cve_data[field], list) and any(cve_data[field]):
                        # 빈 항목 필터링 (None이나 빈 dict 제거)
                        cve_data[field] = [item for item in cve_data[field] if item and isinstance(item, dict)]
                        # 메타데이터 추가
                        cve_data[field] = self._add_timestamp_metadata(cve_data[field], username, current_time)
            
            # 크롤러 정보 추가
            if is_crawler and crawler_name:
                cve_data["source"] = {
                    "type": "crawler",
                    "name": crawler_name,
                    "crawled_at": current_time
                }
            
            # 기존 CVE 중복 체크 (cve_id가 있는 경우)
            cve_id = None
            if "cve_id" in cve_data and cve_data["cve_id"]:
                cve_id = cve_data["cve_id"]
                # 최적화: 전체 CVE 가져오지 않고 존재 여부만 확인
                exists = await self.repository.check_cve_exists(cve_id)
                if exists:
                    logger.warning(f"이미 존재하는 CVE ID: {cve_id}")
                    return None
            
            # CVE 생성
            new_cve = await self.repository.create(cve_data)
        
            if new_cve:
                logger.info(f"CVE 생성 성공: CVE ID={new_cve.cve_id}")
                
                # 활동 추적을 위한 추가 변경 사항 준비
                additional_changes = []
                
                # 변경 사항 - CVE 생성
                additional_changes.append(ChangeItem(
                    field="cve",
                    field_name="CVE",
                    action="add",
                    detail_type="detailed",
                    summary=f"새 CVE '{new_cve.cve_id}' 생성"
                ))
                
                # 심각도 정보
                additional_changes.append(ChangeItem(
                    field="severity_context",
                    field_name="심각도",
                    action="context",
                    detail_type="simple",
                    after=new_cve.severity,
                    summary=f"심각도: {new_cve.severity}"
                ))
                
                # 상태 정보
                additional_changes.append(ChangeItem(
                    field="status_context",
                    field_name="상태",
                    action="context",
                    detail_type="simple",
                    after=new_cve.status,
                    summary=f"상태: {new_cve.status}"
                ))
                
                # 크롤러 정보
                if is_crawler:
                    additional_changes.append(ChangeItem(
                        field="crawler_context",
                        field_name="크롤러",
                        action="context",
                        detail_type="simple",
                        after=crawler_name,
                        summary=f"크롤러: {crawler_name}"
                    ))
                
                # 생성자 정보
                additional_changes.append(ChangeItem(
                    field="created_by_context",
                    field_name="생성자",
                    action="context",
                    detail_type="simple",
                    after=username,
                    summary=f"생성자: {username}"
                ))
                
                # PoC 정보 추가
                if new_cve.poc and len(new_cve.poc) > 0:
                    poc_items = []
                    for poc in new_cve.poc:
                        poc_items.append({
                            "source": poc.source,
                            "url": poc.url,
                            "description": poc.description
                        })
                    additional_changes.append(ChangeItem(
                        field="poc",
                        field_name="PoC",
                        action="add",
                        detail_type="detailed",
                        items=poc_items,
                        summary=f"PoC {len(new_cve.poc)}개 추가됨"
                    ))
                    
                    # PoC 개수 정보
                    additional_changes.append(ChangeItem(
                        field="poc_count",
                        field_name="PoC 수",
                        action="context",  # 'add'에서 'context'로 변경
                        detail_type="simple",
                        after=len(new_cve.poc),
                        summary=f"PoC 총 {len(new_cve.poc)}개"
                    ))
                
                # 참조문서 정보 추가
                if new_cve.reference and len(new_cve.reference) > 0:
                    ref_items = []
                    for ref in new_cve.reference:
                        ref_items.append({
                            "type": ref.type,
                            "url": ref.url,
                            "description": ref.description
                        })
                    additional_changes.append(ChangeItem(
                        field="reference",
                        field_name="참조문서",
                        action="add",
                        detail_type="detailed",
                        items=ref_items,
                        summary=f"참조문서 {len(new_cve.reference)}개 추가됨"
                    ))
                    
                    # 참조문서 개수 정보
                    additional_changes.append(ChangeItem(
                        field="reference_count",
                        field_name="참조문서 수",
                        action="context",  # 'add'에서 'context'로 변경
                        detail_type="simple",
                        after=len(new_cve.reference),
                        summary=f"참조문서 총 {len(new_cve.reference)}개"
                    ))
                
                # Snort 규칙 정보 추가
                if new_cve.snort_rule and len(new_cve.snort_rule) > 0:
                    snort_items = []
                    for snort in new_cve.snort_rule:
                        snort_items.append({
                            "type": snort.type,
                            "rule": snort.rule,
                            "description": snort.description
                        })
                    additional_changes.append(ChangeItem(
                        field="snort_rule",
                        field_name="Snort 규칙",
                        action="add",
                        detail_type="detailed",
                        items=snort_items,
                        summary=f"Snort 규칙 {len(new_cve.snort_rule)}개 추가됨"
                    ))
                    
                    # Snort 규칙 개수 정보
                    additional_changes.append(ChangeItem(
                        field="snort_rule_count",
                        field_name="Snort 규칙 수",
                        action="context",  # 'add'에서 'context'로 변경
                        detail_type="simple",
                        after=len(new_cve.snort_rule),
                        summary=f"Snort 규칙 총 {len(new_cve.snort_rule)}개"
                    ))
                
                # 활동 생성 - track_object_changes 사용
                await self.activity_service.track_object_changes(
                    username=username,
                    action=ActivityAction.CREATE,
                    target_type=ActivityTargetType.CVE,
                    target_id=new_cve.cve_id,
                    new_obj=new_cve.dict(),  # new_obj만 전달 (old_obj는 없음)
                    target_title=new_cve.cve_id,  # CVE ID를 활동 타이틀로 사용
                    additional_changes=additional_changes
                )
                
                return new_cve
            else:
                logger.error("CVE 생성 실패: Repository에서 None 반환")
                return new_cve
                
        except Exception as e:
            logger.error(f"CVE 생성 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            
            # 이미 CVE가 생성되었다면 롤백 시도
            if new_cve and hasattr(new_cve, 'cve_id'):
                try:
                    logger.warning(f"오류 발생으로 CVE 롤백 시도: {new_cve.cve_id}")
                    # 문자열 ID를 사용하여 삭제 (타입 변환 오류 방지)
                    cve_id_str = str(new_cve.cve_id) if not isinstance(new_cve.cve_id, str) else new_cve.cve_id
                    await self.repository.delete_by_cve_id(cve_id_str)
                    logger.info(f"CVE 롤백 성공: {cve_id_str}")
                except Exception as rollback_error:
                    logger.error(f"CVE 롤백 실패: {str(rollback_error)}")
            
            return None

    async def update_cve(self, cve_id: str, update_data: Union[dict, PatchCVERequest], updated_by: str = None) -> Optional[Dict[str, Any]]:
        """
        CVE 정보를 업데이트합니다. 객체 변경 감지를 통한 활동 추적 사용.
        
        Args:
            cve_id: 업데이트할 CVE ID
            update_data: 업데이트할 데이터 (dict 또는 PatchCVERequest)
            updated_by: 업데이트한 사용자 이름
            
        Returns:
            업데이트된 CVE 정보 (없으면 None)
        """
        try:
            logger.info(f"CVE 업데이트 요청: cve_id={cve_id}, updated_by={updated_by}")
            
            # 기존 CVE 조회 - 객체 변경 감지용
            existing_cve = await self.get_cve_detail(cve_id, as_model=True)
            if not existing_cve:
                logger.warning(f"업데이트할 CVE를 찾을 수 없음: {cve_id}")
                return None
                
            logger.info(f"기존 CVE 정보: cve_id={existing_cve.cve_id}")
            
            # 기존 객체 저장 (변경 감지용)
            old_cve_dict = existing_cve.dict()
                
            # pydantic 모델을 딕셔너리로 변환
            if not isinstance(update_data, dict):
                update_data = update_data.dict(exclude_unset=True)
            
            # 준비된 업데이트 데이터 생성
            processed_data = self._prepare_update_data(update_data, existing_cve, updated_by)
            
            # 업데이트 실행 - repository의 update_document 메서드 사용
            result = await self.repository.update_document(cve_id, processed_data)
            
            if not result:
                logger.warning(f"CVE 업데이트 실패: {cve_id}")
                return None
            
            # 업데이트된 CVE 가져오기
            updated_cve = await self.get_cve_detail(cve_id, as_model=False)
                
            # 추가 변경 사항 수집 - 변경 컨텍스트 정보 포함
            additional_changes = []
            
            # 상태 정보 추가 (비교용)
            severity_val = updated_cve.get('severity') or existing_cve.severity
            status_val = updated_cve.get('status') or existing_cve.status
            
            additional_changes.append(ChangeItem(
                field="severity_context",
                field_name="현재 심각도",
                action="context",
                detail_type="simple",
                after=severity_val,
                summary=f"현재 심각도: {severity_val}"
            ))
            
            additional_changes.append(ChangeItem(
                field="status_context",
                field_name="현재 상태",
                action="context",
                detail_type="simple",
                after=status_val,
                summary=f"현재 상태: {status_val}"
            ))
            
            # 변경자 정보 추가
            additional_changes.append(ChangeItem(
                field="updated_by_context",
                field_name="변경자",
                action="context",
                detail_type="simple",
                after=updated_by or "system",
                summary=f"변경자: {updated_by or 'system'}"
            ))
            
            # 컬렉션 아이템 수량 정보 비교 추가
            collections = [
                {"field": "poc", "field_name": "PoC 수", "old": len(old_cve_dict.get('poc', [])), "new": len(updated_cve.get('poc', []))},
                {"field": "reference", "field_name": "참조문서 수", "old": len(old_cve_dict.get('reference', [])), "new": len(updated_cve.get('reference', []))},
                {"field": "snort_rule", "field_name": "Snort 규칙 수", "old": len(old_cve_dict.get('snort_rule', [])), "new": len(updated_cve.get('snort_rule', []))}
            ]
            
            for collection in collections:
                if collection["old"] != collection["new"]:
                    additional_changes.append(ChangeItem(
                        field=f"{collection['field']}_count",
                        field_name=collection["field_name"],
                        action="count_change",
                        detail_type="simple",
                        before=collection["old"],
                        after=collection["new"],
                        summary=f"{collection['field_name']} {collection['old']}개에서 {collection['new']}개로 변경"
                    ))
            
            # track_object_changes 호출
            await self.activity_service.track_object_changes(
                username=updated_by or "system",
                action=ActivityAction.UPDATE,
                target_type=ActivityTargetType.CVE,
                target_id=cve_id,
                old_obj=old_cve_dict,
                new_obj=updated_cve,
                target_title=updated_cve.get('title') or existing_cve.title or cve_id,
                ignore_fields=['last_modified_at', '_id', 'id'],
                additional_changes=additional_changes
            )
                    
            return updated_cve
        except Exception as e:
            logger.error(f"CVE 업데이트 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    def _prepare_update_data(self, update_data: dict, existing_cve: CVEModel, updated_by: str) -> dict:
        """
        업데이트 데이터 전처리 및 메타데이터 추가
        
        Args:
            update_data: 원본 업데이트 데이터
            existing_cve: 기존 CVE 모델
            updated_by: 업데이트한 사용자명
            
        Returns:
            dict: 처리된 업데이트 데이터
        """
        processed_data = update_data.copy()
        
        # _id 필드 제거
        if '_id' in processed_data:
            processed_data.pop('_id')
        
        # 날짜 필드 UTC 설정
        current_time = get_utc_now()
        
        # 임베디드 필드에 시간 메타데이터 추가
        for field in ["reference", "poc", "snort_rule"]:
            # 필드가 있고, None이 아니고, 비어있지 않은 경우만 처리
            if field in processed_data and processed_data[field] is not None:
                # 빈 리스트가 아닌지 확인하고 처리
                if isinstance(processed_data[field], list) and any(processed_data[field]):
                    # 빈 항목 필터링 (None이나 빈 dict 제거)
                    processed_data[field] = [item for item in processed_data[field] if item and isinstance(item, dict)]
                    # 각 항목에 필수 필드 확인 및 추가
                    processed_data[field] = [self._ensure_required_fields(item, updated_by or "system", current_time) for item in processed_data[field]]
                    # 리스트의 각 항목에 메타데이터 추가
                    processed_data[field] = [self._add_timestamp_metadata(item, updated_by or "system", current_time) for item in processed_data[field]]
        
        # 업데이트 시간 및 사용자 설정
        processed_data['last_modified_at'] = current_time
        processed_data['last_modified_by'] = updated_by or "system"
        
        # 변경 이력 추가
        changes = self._extract_complex_changes(existing_cve, processed_data)
        if changes:
            #processed_data = self._add_modification_history(existing_cve, processed_data, changes, updated_by)
            pass
        
        return processed_data

    def _ensure_required_fields(self, item, username="system", timestamp=None):
        """
        필수 필드가 누락된 경우 기본값을 설정합니다.
        
        Args:
            item: 검사할 항목(dict)
            username: 기본 사용자명
            timestamp: 기본 타임스탬프 (None이면 현재 시간 사용)
        
        Returns:
            dict: 필수 필드가 추가된 항목
        """
        if timestamp is None:
            timestamp = get_utc_now()
        
        if not item:
            return item
        
        # 필수 필드 확인 및 추가
        if "created_at" not in item or item["created_at"] is None:
            item["created_at"] = timestamp
        
        if "created_by" not in item or item["created_by"] is None:
            item["created_by"] = username
        
        if "last_modified_at" not in item or item["last_modified_at"] is None:
            item["last_modified_at"] = timestamp
        
        if "last_modified_by" not in item or item["last_modified_by"] is None:
            item["last_modified_by"] = username
        
        return item

    def _extract_complex_changes(self, existing_cve: CVEModel, update_data: dict) -> List[ChangeItem]:
        """
        복잡한 변경 사항을 추출하는 유틸리티 메서드 (필드별 커스텀 처리)
        주로 컬렉션 타입 필드(poc, reference, snort_rule)의 변경 사항을 추적
        """
        # 필드별 한글 이름 매핑
        field_names = {
            "title": "제목",
            "description": "설명",
            "status": "상태",
            "severity": "심각도",
            "poc": "PoC",
            "reference": "참조문서",
            "snort_rule": "Snort 룰",
            "notes": "노트",
            "assigned_to": "담당자"
        }
        
        changes = []
        excluded_fields = ['last_modified_at', '_id', 'id']
        
        for field, new_value in update_data.items():
            if field in excluded_fields:
                continue
                
            if field in existing_cve.dict() and existing_cve.dict()[field] != new_value:
                field_name = field_names.get(field, field)
                
                # 필드 유형별로 변경 내역 기록 방식 다르게 처리
                if field in ['poc', 'reference', 'snort_rule'] and isinstance(new_value, list):
                    # 컬렉션 아이템 비교 로직
                    old_items = existing_cve.dict().get(field, [])
                    
                    # 새로 추가된 아이템
                    added_items = []
                    for new_item in new_value:
                        is_new = True
                        for old_item in old_items:
                            if self._is_same_item(new_item, old_item, field):
                                is_new = False
                                break
                        if is_new:
                            added_items.append(new_item)
                    
                    # 삭제된 아이템
                    removed_items = []
                    for old_item in old_items:
                        is_removed = True
                        for new_item in new_value:
                            if self._is_same_item(new_item, old_item, field):
                                is_removed = False
                                break
                        if is_removed:
                            removed_items.append(old_item)
                    
                    # 아이템 필드 정보 보강
                    if field == 'poc':
                        added_items_detail = []
                        for item in added_items:
                            added_items_detail.append({
                                "source": item.get('source', ''),
                                "url": item.get('url', ''),
                                "description": item.get('description', '')
                            })
                        removed_items_detail = []
                        for item in removed_items:
                            removed_items_detail.append({
                                "source": item.get('source', ''),
                                "url": item.get('url', ''),
                                "description": item.get('description', '')
                            })
                        added_items = added_items_detail
                        removed_items = removed_items_detail
                    elif field == 'reference':
                        added_items_detail = []
                        for item in added_items:
                            added_items_detail.append({
                                "url": item.get('url', ''),
                                "type": item.get('type', ''),
                                "description": item.get('description', '')
                            })
                        removed_items_detail = []
                        for item in removed_items:
                            removed_items_detail.append({
                                "url": item.get('url', ''),
                                "type": item.get('type', ''),
                                "description": item.get('description', '')
                            })
                        added_items = added_items_detail
                        removed_items = removed_items_detail
                    elif field == 'snort_rule':
                        added_items_detail = []
                        for item in added_items:
                            added_items_detail.append({
                                "rule_content": item.get('rule_content', ''),
                                "type": item.get('type', ''),
                                "description": item.get('description', '')
                            })
                        removed_items_detail = []
                        for item in removed_items:
                            removed_items_detail.append({
                                "rule_content": item.get('rule_content', ''),
                                "type": item.get('type', ''),
                                "description": item.get('description', '')
                            })
                        added_items = added_items_detail
                        removed_items = removed_items_detail
                    
                    # 추가된 아이템 변경 사항 추가
                    if added_items:
                        changes.append(ChangeItem(
                            field=field,
                            field_name=field_name,
                            action="add",
                            detail_type="detailed",
                            items=added_items,
                            summary=f"{field_name} {len(added_items)}개 추가됨"
                        ))
                    
                    # 삭제된 아이템 변경 사항 추가
                    if removed_items:
                        changes.append(ChangeItem(
                            field=field,
                            field_name=field_name,
                            action="remove",
                            detail_type="detailed",
                            items=removed_items,
                            summary=f"{field_name} {len(removed_items)}개 삭제됨"
                        ))
                else:
                    # 일반 필드 변경
                    changes.append(ChangeItem(
                        field=field,
                        field_name=field_name,
                        action="edit",
                        detail_type="detailed",
                        before=existing_cve.dict().get(field),
                        after=new_value,
                        summary=f"{field_name} 변경됨"
                    ))
                    
        return changes

    # 데코레이터 패턴 적용 예시 - 상태 업데이트 메서드
    @track_cve_activity(
        action=ActivityAction.UPDATE,
        extract_title=lambda old, new, result: old.title if old else (new.title if new else None),
        ignore_fields=['last_modified_at', '_id', 'id']
    )
    async def update_cve_status(self, cve_id: str, status: str, updated_by: str = None) -> Optional[Dict[str, Any]]:
        """CVE 상태만 업데이트하는 간소화된 메서드"""
        try:
            logger.info(f"CVE 상태 업데이트: cve_id={cve_id}, status={status}, updated_by={updated_by}")
            
            # 업데이트 데이터 준비
            update_data = {
                'status': status,
                'last_modified_at': get_utc_now(),
                'last_modified_by': updated_by or 'system'
            }
            
            # 부분 업데이트 최적화 - repository의 update_field 메서드 사용
            result = await self.repository.update_fields(cve_id, update_data)
            
            if result:
                # 최적화: 필요한 필드만 가져오기
                projection = {"title": 1, "status": 1, "severity": 1}
                return await self.get_cve_detail(cve_id, as_model=False, projection=projection)
            return None
        except Exception as e:
            logger.error(f"CVE 상태 업데이트 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return None

    def _is_same_item(self, item1, item2, item_type):
        """두 아이템이 동일한지 비교"""
        if item_type == 'poc':
            return item1.get('url') == item2.get('url')
        elif item_type == 'reference':
            return item1.get('url') == item2.get('url')
        elif item_type == 'snort_rule':
            return item1.get('rule') == item2.get('rule')
        return False
        
    def _add_timestamp_metadata(self, data: dict, username: str, timestamp: datetime) -> dict:
        """CVE 데이터에 시간 메타데이터를 추가합니다."""
        data["created_at"] = timestamp
        data["updated_at"] = timestamp
        data["created_by"] = username
        data["updated_by"] = username
        return data

    def _process_embedded_fields(self, data: dict) -> dict:
        """임베디드 필드를 처리하여 FieldInfo 객체를 적절히 변환합니다."""
        processed_data = {}
        
        for key, value in data.items():
            # FieldInfo 객체 처리
            if hasattr(value, '__class__') and value.__class__.__name__ == 'FieldInfo':
                logger.debug(f"FieldInfo 객체 발견: {key}")
                processed_data[key] = []
            # 리스트 처리
            elif isinstance(value, list):
                # 리스트의 각 항목 재귀적 처리
                processed_items = []
                for item in value:
                    if hasattr(item, '__class__') and item.__class__.__name__ == 'FieldInfo':
                        logger.debug(f"리스트 내 FieldInfo 객체 발견: {key}")
                        # FieldInfo는 빈 딕셔너리로 대체
                        processed_items.append({})
                    else:
                        processed_items.append(item)
                processed_data[key] = processed_items
            # 딕셔너리 처리
            elif isinstance(value, dict):
                processed_data[key] = self._process_embedded_fields(value)
            else:
                processed_data[key] = value
                
        return processed_data

    # 캐시 무효화 메서드 추가
    async def invalidate_cve_cache(self, cve_id: str) -> None:
        """
        특정 CVE의 캐시를 무효화합니다.
        
        Args:
            cve_id: 캐시를 무효화할 CVE ID
        """
        try:
            logger.info(f"CVE 캐시 무효화 시작: {cve_id}")
            
            # 구독자에게 업데이트 알림 (소켓 이벤트)
            try:
                # broadcast 매개변수 제거하고 이벤트 발송
                await socketio_manager.emit(
                    event="cve_updated",
                    data={"cve_id": cve_id},
                    room=f"cve_{cve_id.lower()}"
                )
                logger.info(f"CVE 업데이트 이벤트 발송 완료: {cve_id}")
            except Exception as e:
                logger.error(f"CVE 업데이트 이벤트 발송 실패: {str(e)}")
                logger.error(traceback.format_exc())
            
            # TODO: 실제 캐시 시스템 사용 시 여기에 캐시 무효화 코드 추가
            
            logger.info(f"CVE 캐시 무효화 완료: {cve_id}")
        except Exception as e:
            logger.error(f"CVE 캐시 무효화 중 오류: {str(e)}")
            logger.error(traceback.format_exc())

    # 데코레이터 패턴 적용 - CVE 삭제 (간단한 동작)
    @track_cve_activity(
        action=ActivityAction.DELETE,
        extract_title=lambda old, new, result: old.title if old else None
    )
    async def delete_cve(self, cve_id: str, deleted_by: str = "system") -> bool:
        """CVE를 삭제합니다."""
        try:
            logger.info(f"CVE 삭제 시도: {cve_id}, 삭제자: {deleted_by}")
            
            # 삭제 실행 - repository의 delete_by_cve_id 메서드 사용
            result = await self.repository.delete_by_cve_id(cve_id)
            
            if result:
                logger.info(f"CVE 삭제 성공: {cve_id}")
            else:
                logger.warning(f"CVE 삭제 실패: {cve_id}")
                
            return result
        except Exception as e:
            logger.error(f"CVE 삭제 중 오류 발생: {str(e)}")
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
            
            # MongoDB 집계 파이프라인 사용 (최적화)
            collection = self.repository.collection
            
            # 카운트 쿼리 병렬 실행 (성능 향상)
            tasks = [
                # 모든 CVE 수
                collection.count_documents({}),
                # 심각도 높음 (High 또는 Critical)
                collection.count_documents({
                    "$or": [
                        {"severity": {"$regex": "high", "$options": "i"}},
                        {"severity": {"$regex": "critical", "$options": "i"}}
                    ]
                }),
                # 최근 7일 내 등록된 CVE
                collection.count_documents({
                    "created_at": {"$gte": get_utc_now() - timedelta(days=7)}
                }),
                # 분석 중인 CVE
                collection.count_documents({
                    "status": "분석중"
                }),
                # 완료된 CVE
                collection.count_documents({
                    "status": "릴리즈 완료"
                })
            ]
            
            # 병렬 실행 후 결과 조합
            results = await asyncio.gather(*tasks)
            
            # 결과 반환
            stats = {
                "totalCount": results[0],
                "highSeverityCount": results[1],
                "newLastWeekCount": results[2],
                "inProgressCount": results[3],
                "completedCount": results[4]
            }
            
            logger.info(f"CVE 통계 데이터 계산 완료: {stats}")
            return stats
            
        except Exception as e:
            logger.error(f"CVE 통계 데이터 계산 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise
    
    # ==== 내부 댓글 관리 클래스 ====