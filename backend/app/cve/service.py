#app/cve/service.py
"""
CVE 및 Comment 서비스 통합 구현
모든 CVE 및 댓글 관련 비즈니스 로직 포함
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
    CVEModel, Comment, CommentCreate, CommentUpdate, CommentResponse, 
    Reference, PoC, SnortRule, ModificationHistory, ChangeItem,
    CreateCVERequest, PatchCVERequest
)
from app.notification.models import Notification
from app.auth.models import User
from app.activity.models import ActivityAction, ActivityTargetType, UserActivity
from app.activity.service import ActivityService
from app.cve.repository import CVERepository
from app.core.socketio_manager import socketio_manager, WSMessageType
from app.common.utils.datetime_utils import get_utc_now, format_datetime, normalize_datetime_fields
from app.common.utils.change_detection import detect_object_changes

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
                
                # 변경 사항 감지 (업데이트 작업의 경우)
                changes = []
                
                if action == ActivityAction.UPDATE and old_cve and new_cve:
                    # 객체 변경 자동 감지 사용
                    changes = detect_object_changes(
                        old_obj=old_cve.dict(),
                        new_obj=new_cve.dict(),
                        ignore_fields=ignore_fields or ['last_modified_at', '_id', 'id']
                    )
                elif action == ActivityAction.CREATE:
                    changes = [ChangeItem(
                        field="cve",
                        field_name="CVE",
                        action="add",
                        detail_type="simple",
                        summary=f"새 CVE '{cve_id}' 생성"
                    )]
                elif action == ActivityAction.DELETE:
                    changes = [ChangeItem(
                        field="cve",
                        field_name="CVE",
                        action="delete",
                        detail_type="simple",
                        summary=f"CVE '{cve_id}' 삭제"
                    )]
                
                # 메타데이터 준비
                metadata = {}
                
                # CVE 정보가 있으면 메타데이터에 추가
                if new_cve:
                    metadata.update({
                        "severity": new_cve.severity,
                        "status": new_cve.status
                    })
                elif old_cve:
                    metadata.update({
                        "severity": old_cve.severity,
                        "status": old_cve.status
                    })
                
                # 활동 생성
                if changes:  # 변경 사항이 있는 경우에만 기록
                    await self.activity_service.create_activity(
                        username=username,
                        activity_type=action,
                        target_type=ActivityTargetType.CVE,
                        target_id=cve_id,
                        target_title=title,
                        changes=changes,
                        metadata=metadata
                    )
            
            return result
        return wrapper
    return decorator

class CVEService:
    """CVE 및 Comment 서비스"""
    
    def __init__(self):
        self.repository = CVERepository()
        self.activity_service = ActivityService()
        # 댓글 관리 내부 클래스 초기화
        self._comment_manager = self._CommentManager(self)

    @property
    def comments(self):
        """댓글 관련 기능에 접근하는 프로퍼티"""
        return self._comment_manager

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
            
            # id 필드가 없는 경우 cve_id 값을 복사
            if 'id' not in cve_dict and 'cve_id' in cve_dict:
                cve_dict['id'] = cve_dict['cve_id']
            
            return cve_dict
            
        except Exception as e:
            error_msg = f"CVE '{cve_id}' 정보 조회 중 오류 발생: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            raise Exception(error_msg)

    async def create_cve(self, cve_data: Union[dict, CreateCVERequest], username: str, is_crawler: bool = False, crawler_name: Optional[str] = None) -> Optional[CVEModel]:
        """새로운 CVE를 생성합니다."""
        try:
            logger.info(f"CVE 생성 시작: 사용자={username}, 크롤러={is_crawler}")
            
            # pydantic 모델을 딕셔너리로 변환
            if not isinstance(cve_data, dict):
                cve_data = cve_data.dict()
                
            # 날짜 필드 UTC 설정
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
                
                # 활동 추적 - CVE 생성 기록
                changes = [ChangeItem(
                    field="cve",
                    field_name="CVE",
                    action="add",
                    detail_type="simple",
                    summary=f"새 CVE '{new_cve.cve_id}' 생성"
                )]
                
                # 제목이 있으면 추가 정보 제공
                title = new_cve.title or "제목 없음"
                
                await self.activity_service.create_activity(
                    username=username,
                    activity_type=ActivityAction.CREATE,
                    target_type=ActivityTargetType.CVE,
                    target_id=new_cve.cve_id,
                    target_title=title,
                    changes=changes,
                    metadata={
                        "is_crawler": is_crawler,
                        "crawler_name": crawler_name if is_crawler else None,
                        "severity": new_cve.severity
                    }
                )
                
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
            
             # _id 필드가 있으면 제거 (MongoDB에서 _id는 변경 불가)
            if '_id' in update_data:
                logger.warning(f"업데이트 데이터에서 _id 필드 제거: {update_data['_id']}")
                update_data = update_data.copy()  # 원본 데이터 변경 방지
                del update_data['_id']
            
            # 임베디드 필드 메타데이터 자동 처리 - 추출하여 재사용성 향상
            update_data = self._process_embedded_metadata(update_data, updated_by or "system")
                
            # 업데이트 시간 설정
            current_time = get_utc_now()
            update_data['last_modified_at'] = current_time
            
            # 변경 기록 추적 - 객체 변경 감지 사용
            excluded_fields = ['last_modified_at', '_id', 'id']
            
            # 사용자 정의 변경 사항 처리 (객체 변경 감지에서 복잡한 케이스 처리가 어려운 경우)
            changes = self._extract_complex_changes(existing_cve, update_data)
            
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
            
            # 업데이트 실행 - cve_id를 사용하도록 변경
            try:
                # id_for_update에 cve_id 사용
                result = await self.repository.update_by_cve_id(cve_id, update_data)
                
                if result:
                    logger.info(f"CVE {cve_id} 업데이트 성공")
                    updated_cve = await self.get_cve_detail(cve_id, as_model=False)
                    
                    # 객체 변경 감지를 이용한 활동 추적
                    await self.activity_service.track_object_changes(
                        username=updated_by or "system",
                        action=ActivityAction.UPDATE,
                        target_type=ActivityTargetType.CVE,
                        target_id=cve_id,
                        old_obj=old_cve_dict,
                        new_obj=updated_cve,
                        target_title=updated_cve.get('title') or existing_cve.title or cve_id,
                        ignore_fields=excluded_fields,
                        metadata={
                            "severity": updated_cve.get('severity') or existing_cve.severity,
                            "status": updated_cve.get('status') or existing_cve.status
                        }
                    )
                    
                    return updated_cve
                else:
                    logger.warning(f"CVE 업데이트 실패: {cve_id}")
                    return None
            except Exception as e:
                logger.error(f"repository.update_by_cve_id 호출 중 오류: {str(e)}")
                logger.error(traceback.format_exc())
                raise
        except Exception as e:
            logger.error(f"CVE 업데이트 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    def _process_embedded_metadata(self, update_data: dict, updated_by: str) -> dict:
        """
        임베디드 필드(PoC, Reference 등)의 메타데이터를 처리합니다.
        별도 메서드로 추출하여 재사용성 향상.
        """
        # 시간 메타데이터 처리가 필요한 필드 목록
        metadata_fields = ['pocs', 'references', 'snort_rules']
            
        # 전달받은 데이터 복사본 생성 (원본 변경 방지)
        processed_data = update_data.copy()
            
        # 각 필드에 대해 시간 메타데이터 자동 처리
        for field in metadata_fields:
            if field in processed_data and isinstance(processed_data[field], list):
                processed_data[field] = self._process_item_metadata(processed_data[field], updated_by)
                logger.debug(f"{field} 필드의 시간 메타데이터 처리 완료 ({len(processed_data[field])} 항목)")
                
        return processed_data

    def _extract_complex_changes(self, existing_cve: CVEModel, update_data: dict) -> List[ChangeItem]:
        """
        복잡한 변경 사항을 추출하는 유틸리티 메서드 (필드별 커스텀 처리)
        주로 컬렉션 타입 필드(pocs, references, snort_rules)의 변경 사항을 추적
        """
        # 필드별 한글 이름 매핑
        field_names = {
            "title": "제목",
            "description": "설명",
            "status": "상태",
            "severity": "심각도",
            "pocs": "PoC",
            "references": "참조",
            "snort_rules": "Snort 규칙",
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
                if field in ['pocs', 'references', 'snort_rules'] and isinstance(new_value, list):
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
                    
                    # 변경 사항 요약
                    if added_items:
                        changes.append(ChangeItem(
                            field=field,
                            field_name=field_name,
                            action="add",
                            detail_type="detailed",
                            items=added_items,
                            summary=f"{field_name} {len(added_items)}개 추가"
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
            
            # 부분 업데이트 최적화 - 필요한 필드만 업데이트
            result = await self.repository.update_by_cve_id(cve_id, update_data)
            
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
        if item_type == 'pocs':
            return item1.get('url') == item2.get('url')
        elif item_type == 'references':
            return item1.get('url') == item2.get('url')
        elif item_type == 'snort_rules':
            return item1.get('rule') == item2.get('rule')
        return False
        
    def _process_item_metadata(self, items: List[dict], updated_by: str) -> List[dict]:
        """
        항목 리스트(PoC, 참조 등)의 시간 메타데이터를 자동으로 처리합니다.
        
        Args:
            items: 처리할 항목 리스트
            updated_by: 업데이트 수행 사용자
            
        Returns:
            시간 메타데이터가 추가된 항목 리스트
        """
        if not items:
            return items
            
        current_time = get_utc_now()
        processed_items = []
        
        for item in items:
            # 딕셔너리로 변환
            if not isinstance(item, dict):
                item = item.dict() if hasattr(item, 'dict') else vars(item)
            
            item_copy = item.copy()
            
            # created_at이 없거나 None이면 현재 시간 설정
            if 'created_at' not in item_copy or item_copy['created_at'] is None:
                item_copy['created_at'] = current_time
                
            # created_by가 없거나 None이면 업데이트 사용자 설정
            if 'created_by' not in item_copy or item_copy['created_by'] is None:
                item_copy['created_by'] = updated_by
                
            # last_modified_at, last_modified_by는 항상 현재 값으로 업데이트
            item_copy['last_modified_at'] = current_time
            item_copy['last_modified_by'] = updated_by
            
            processed_items.append(item_copy)
            
        return processed_items

    # 데코레이터 패턴 적용 - CVE 삭제 (간단한 동작)
    @track_cve_activity(
        action=ActivityAction.DELETE,
        extract_title=lambda old, new, result: old.title if old else None
    )
    async def delete_cve(self, cve_id: str, deleted_by: str = "system") -> bool:
        """CVE를 삭제합니다."""
        try:
            logger.info(f"CVE 삭제 시도: {cve_id}, 삭제자: {deleted_by}")
            
            # 삭제 실행 - cve.id 대신 cve_id 사용
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
    
    class _CommentManager:
        """댓글 관련 작업을 관리하는 내부 클래스"""
        
        def __init__(self, service):
            """CommentManager 초기화"""
            self.service = service  # 외부 CVEService 참조
            self.repository = service.repository
            self.activity_service = service.activity_service
            
        @staticmethod
        def comment_to_dict(comment: Comment) -> dict:
            """Comment 객체를 JSON 직렬화 가능한 딕셔너리로 변환"""
            comment_dict = comment.dict()
            comment_dict["created_at"] = comment.created_at.isoformat()
            if comment.last_modified_at:
                comment_dict["last_modified_at"] = comment.last_modified_at.isoformat()
            return comment_dict
        
        async def process_mentions(self, content: str, cve_id: str, comment_id: str,
                              sender: User, mentioned_usernames: List[str] = None) -> Tuple[int, List[str]]:
            """댓글 내용에서 멘션된 사용자를 찾아 알림을 생성합니다."""
            try:
                # Comment 모델의 extract_mentions 사용 (중복 코드 제거)
                mentions = mentioned_usernames or Comment.extract_mentions(content)
                if not mentions:
                    return 0, []
                
                logger.info(f"발견된 멘션: {mentions}")
                
                # 멘션된 사용자들을 한 번에 조회 (N+1 쿼리 문제 해결)
                # @ 기호 제거하고 사용자명만 추출
                usernames = [m.replace('@', '') for m in mentions]
                users = await User.find({"username": {"$in": usernames}}).to_list()
                
                # 사용자별 ID 매핑 생성 (조회 최적화)
                username_to_user = {user.username: user for user in users}
                
                # 병렬 알림 처리 준비
                notifications_created = 0
                processed_users = []
                notification_tasks = []
                
                for username in usernames:
                    if username in username_to_user and str(username_to_user[username].id) != str(sender.id):
                        user = username_to_user[username]
                        
                        # 비동기 작업 생성 (병렬 처리)
                        task = self._create_mention_notification(
                            user.id, sender, cve_id, comment_id, content
                        )
                        notification_tasks.append(task)
                        processed_users.append(username)
                        notifications_created += 1
                
                # 알림 작업 병렬 실행
                if notification_tasks:
                    await asyncio.gather(*notification_tasks)
                    
                return notifications_created, processed_users
            except Exception as e:
                logger.error(f"process_mentions 중 오류 발생: {str(e)}")
                return 0, []

        async def _create_mention_notification(self, recipient_id, sender, cve_id, comment_id, content):
            """알림 생성 헬퍼 메서드 - 중복 코드 제거 및 재사용성 향상"""
            try:
                notification, unread_count = await Notification.create_notification(
                    recipient_id=recipient_id,
                    sender_id=sender.id,
                    sender_username=sender.username,
                    cve_id=cve_id,
                    comment_id=comment_id,
                    comment_content=content,
                    content=f"{sender.username}님이 댓글에서 언급했습니다."
                )
                
                # 웹소켓으로 실시간 알림 전송
                await socketio_manager.emit(
                    "notification",
                    {
                        "type": WSMessageType.NOTIFICATION,
                        "data": {
                            "notification": self.comment_to_dict(notification),
                            "unread_count": unread_count
                        }
                    },
                    room=str(recipient_id)
                )
                
                return notification
            except Exception as e:
                logger.error(f"알림 생성 중 오류: {str(e)}")
                return None
        
        async def count_active_comments(self, cve_id: str) -> int:
            """CVE의 활성화된 댓글 수를 계산합니다."""
            try:
                # 최적화: 전체 CVE 가져오지 않고 댓글만 조회
                projection = {"comments": 1}
                cve = await self.repository.find_by_cve_id_with_projection(cve_id, projection)
                
                if not cve or not hasattr(cve, 'comments'):
                    logger.error(f"CVE를 찾을 수 없거나 댓글이 없음: {cve_id}")
                    return 0
                    
                # 삭제되지 않은 댓글 수 계산
                active_comments = [c for c in cve.comments if not c.is_deleted]
                logger.info(f"CVE {cve_id}의 활성 댓글 수: {len(active_comments)}개")
                return len(active_comments)
            except Exception as e:
                logger.error(f"활성 댓글 수 계산 중 오류: {str(e)}")
                return 0
        
        async def send_comment_update(self, cve_id: str) -> None:
            """댓글 수 업데이트를 Socket.IO로 전송합니다."""
            try:
                count = await self.count_active_comments(cve_id)
                await socketio_manager.emit(
                    "comment_count",
                    {
                        "type": WSMessageType.COMMENT_COUNT_UPDATE,
                        "data": {"cve_id": cve_id, "count": count}
                    },
                    broadcast=True
                )
                logger.info(f"{cve_id}의 댓글 수 업데이트 전송: {count}")
            except Exception as e:
                logger.error(f"댓글 업데이트 전송 중 오류: {str(e)}")
        
        async def create_comment(self, cve_id: str, content: str, user: User, 
                              parent_id: Optional[str] = None, 
                              mentions: List[str] = None) -> Tuple[Optional[Comment], str]:
            """새 댓글을 생성합니다."""
            try:
                # 댓글 트리 구조 확인 (depth 제한)
                MAX_COMMENT_DEPTH = 10
                depth = 0
                
                # 최적화: 부모 댓글 정보만 선택적으로 조회
                if parent_id:
                    # MongoDB 투영(projection) 사용해 부모 댓글만 조회 (최적화)
                    parent = await CVEModel.find_one(
                        {"cve_id": cve_id, "comments.id": parent_id},
                        {"comments.$": 1}  # 일치하는 댓글만 가져오는 projection
                    )
                    
                    if not parent or not parent.comments:
                        logger.error(f"부모 댓글을 찾을 수 없음: {parent_id}")
                        return None, f"부모 댓글을 찾을 수 없습니다: {parent_id}"
                    
                    # 부모 댓글 깊이 계산
                    parent_comment = parent.comments[0]
                    depth = parent_comment.depth + 1
                    
                    if depth >= MAX_COMMENT_DEPTH:
                        logger.error(f"최대 댓글 깊이에 도달: {MAX_COMMENT_DEPTH}")
                        return None, f"최대 댓글 깊이({MAX_COMMENT_DEPTH})에 도달했습니다."
                
                # 댓글 생성
                now = datetime.now(ZoneInfo("UTC"))
                comment = Comment(
                    id=str(ObjectId()),
                    content=content,
                    created_by=user.username,
                    parent_id=parent_id,
                    depth=depth,  # 계산된 깊이 저장
                    created_at=now,
                    last_modified_at=None,
                    is_deleted=False,
                    # Comment 모델의 extract_mentions 메서드 사용
                    mentions=Comment.extract_mentions(content) if not mentions else mentions
                )
                
                # 최적화: 직접 댓글 추가 (전체 CVE 로드 없이)
                result = await CVEModel.find_one({"cve_id": cve_id}).update(
                    {"$push": {"comments": comment.dict()}}
                )
                
                if not result or not result.modified_count:
                    logger.error(f"댓글 추가 실패: {cve_id}")
                    return None, "댓글을 추가할 수 없습니다. CVE를 찾을 수 없거나 DB 오류가 발생했습니다."
                
                # 멘션 처리
                await self.process_mentions(
                    content=content,
                    cve_id=cve_id,
                    comment_id=comment.id,
                    sender=user,
                    mentioned_usernames=mentions
                )
                
                # 댓글 수 업데이트 전송
                await self.send_comment_update(cve_id)
                
                # 활동 추적 유틸리티 메서드 사용
                await self._track_comment_activity(
                    user.username,
                    cve_id,
                    comment.id,
                    ActivityAction.COMMENT,
                    content=content,
                    parent_id=parent_id
                )
                
                return comment, "댓글이 성공적으로 생성되었습니다."
            except Exception as e:
                logger.error(f"댓글 생성 중 오류: {str(e)}")
                logger.error(traceback.format_exc())
                return None, f"댓글 생성 중 오류가 발생했습니다: {str(e)}"
        
        async def update_comment(self, cve_id: str, comment_id: str, content: str, user: User) -> Tuple[Optional[Comment], str]:
            """댓글을 수정합니다."""
            try:
                # 최적화: 필요한 정보만 조회
                projection = {"comments.$": 1, "title": 1, "severity": 1, "status": 1}
                
                # MongoDB 투영(projection) 사용해 해당 댓글만 조회
                cve = await CVEModel.find_one(
                    {"cve_id": cve_id, "comments.id": comment_id},
                    projection
                )
                
                if not cve or not cve.comments:
                    logger.error(f"댓글을 찾을 수 없음: {comment_id}")
                    return None, f"댓글을 찾을 수 없습니다: {comment_id}"
                
                # 첫 번째 일치하는 댓글 (comments.$ 연산자 결과)
                comment = cve.comments[0]
                
                # 권한 확인
                if comment.created_by != user.username and not user.is_admin:
                    logger.error(f"사용자 {user.username}의 댓글 {comment_id} 수정 권한 없음")
                    return None, "댓글 수정 권한이 없습니다."
                
                # 댓글이 삭제되었는지 확인
                if comment.is_deleted:
                    logger.error(f"삭제된 댓글 수정 불가: {comment_id}")
                    return None, "삭제된 댓글은 수정할 수 없습니다."
                
                # 변경 전 내용 저장 (변경 감지용)
                old_content = comment.content
                old_mentions = set(comment.mentions) if comment.mentions else set()
                
                # 새 멘션 추출
                new_mentions = set(Comment.extract_mentions(content))
                
                # 최적화: 직접 필드만 업데이트
                # MongoDB의 positional $ 연산자를 사용하여 배열 내 특정 요소만 업데이트
                now = datetime.now(ZoneInfo("UTC"))
                result = await CVEModel.find_one(
                    {"cve_id": cve_id, "comments.id": comment_id}
                ).update({
                    "$set": {
                        "comments.$.content": content,
                        "comments.$.last_modified_at": now,
                        "comments.$.last_modified_by": user.username,
                        "comments.$.mentions": list(new_mentions)
                    }
                })
                
                if not result or not result.modified_count:
                    logger.error(f"댓글 수정 실패: {comment_id}")
                    return None, "댓글 수정에 실패했습니다"
                
                # 수정된 댓글 객체 생성 (응답용)
                updated_comment = Comment(
                    id=comment.id,
                    content=content,
                    created_by=comment.created_by,
                    created_at=comment.created_at,
                    parent_id=comment.parent_id,
                    depth=comment.depth,
                    is_deleted=False,
                    last_modified_at=now,
                    last_modified_by=user.username,
                    mentions=list(new_mentions)
                )
                
                # 멘션 처리 (새 멘션이 추가된 경우만)
                added_mentions = new_mentions - old_mentions
                if added_mentions:
                    await self.process_mentions(
                        content=content,
                        cve_id=cve_id,
                        comment_id=comment_id,
                        sender=user,
                        mentioned_usernames=list(added_mentions)
                    )
                
                # 활동 추적
                await self._track_comment_activity(
                    user.username,
                    cve_id,
                    comment_id,
                    ActivityAction.COMMENT_UPDATE,
                    content=content,
                    old_content=old_content,
                    cve_title=cve.title
                )
                
                return updated_comment, "댓글이 성공적으로 수정되었습니다."
            except Exception as e:
                logger.error(f"댓글 수정 중 오류: {str(e)}")
                logger.error(traceback.format_exc())
                return None, f"댓글 수정 중 오류가 발생했습니다: {str(e)}"
        
        async def delete_comment(self, cve_id: str, comment_id: str, user: User, permanent: bool = False) -> Tuple[bool, str]:
            """댓글을 삭제합니다."""
            try:
                # 최적화: 필요한 정보만 조회
                projection = {"comments.$": 1, "title": 1, "severity": 1, "status": 1}
                
                # MongoDB 투영(projection) 사용해 해당 댓글만 조회
                cve = await CVEModel.find_one(
                    {"cve_id": cve_id, "comments.id": comment_id},
                    projection
                )
                
                if not cve or not cve.comments:
                    logger.error(f"댓글을 찾을 수 없음: {comment_id}")
                    return False, f"댓글을 찾을 수 없습니다: {comment_id}"
                
                # 첫 번째 일치하는 댓글 (comments.$ 연산자 결과)
                comment = cve.comments[0]
                
                # 권한 확인
                if comment.created_by != user.username and not user.is_admin:
                    logger.error(f"사용자 {user.username}의 댓글 {comment_id} 삭제 권한 없음")
                    return False, "댓글 삭제 권한이 없습니다."
                
                if permanent and not user.is_admin:
                    logger.error("관리자만 영구 삭제 가능")
                    return False, "영구 삭제는 관리자만 가능합니다."
                
                comment_content = comment.content
                
                result = False
                if permanent:
                    # 영구 삭제 - MongoDB의 $pull 연산자 사용 (부분 업데이트 최적화)
                    delete_result = await CVEModel.find_one({"cve_id": cve_id}).update({
                        "$pull": {"comments": {"id": comment_id}}
                    })
                    result = delete_result and delete_result.modified_count > 0
                else:
                    # 논리적 삭제 - MongoDB의 positional $ 연산자 사용 (부분 업데이트)
                    now = datetime.now(ZoneInfo("UTC"))
                    update_result = await CVEModel.find_one(
                        {"cve_id": cve_id, "comments.id": comment_id}
                    ).update({
                        "$set": {
                            "comments.$.is_deleted": True,
                            "comments.$.last_modified_at": now,
                            "comments.$.last_modified_by": user.username
                        }
                    })
                    result = update_result and update_result.modified_count > 0
                
                if not result:
                    logger.error(f"댓글 삭제 실패: {comment_id}")
                    return False, "댓글 삭제에 실패했습니다"
                
                # 댓글 수 업데이트 전송
                await self.send_comment_update(cve_id)
                
                # 활동 추적
                await self._track_comment_activity(
                    user.username,
                    cve_id,
                    comment_id,
                    ActivityAction.COMMENT_DELETE,
                    content=comment_content,
                    cve_title=cve.title,
                    permanent=permanent
                )
                
                return True, "댓글이 성공적으로 삭제되었습니다."
            except Exception as e:
                logger.error(f"댓글 삭제 중 오류: {str(e)}")
                logger.error(traceback.format_exc())
                return False, f"댓글 삭제 중 오류가 발생했습니다: {str(e)}"
        
        async def get_comments(self, cve_id: str, include_deleted: bool = False) -> List[Comment]:
            """CVE의 모든 댓글을 조회합니다."""
            try:
                # 최적화: 댓글 필드만 조회
                projection = {"comments": 1}
                cve = await self.repository.find_by_cve_id_with_projection(cve_id, projection)
                
                if not cve:
                    logger.error(f"CVE를 찾을 수 없음: {cve_id}")
                    return []
                
                # 삭제된 댓글 필터링 (필요한 경우)
                comments = cve.comments
                if not include_deleted:
                    comments = [c for c in comments if not c.is_deleted]
                
                # 댓글 정렬 (생성 시간순)
                return sorted(comments, key=lambda x: x.created_at)
            except Exception as e:
                logger.error(f"댓글 조회 중 오류: {str(e)}")
                logger.error(traceback.format_exc())
                return []
        
        async def _track_comment_activity(self, 
                                      username: str,
                                      cve_id: str, 
                                      comment_id: str,
                                      activity_type: ActivityAction,
                                      content: str = None,
                                      old_content: str = None,
                                      cve_title: str = None,
                                      parent_id: str = None,
                                      permanent: bool = False):
            """댓글 활동 추적을 위한 유틸리티 메서드 - 중복 코드 제거"""
            try:
                # 기본 메타데이터 설정
                metadata = {
                    "comment_id": comment_id
                }
                
                # 추가 메타데이터 설정
                if parent_id:
                    metadata["parent_id"] = parent_id
                if permanent:
                    metadata["permanent"] = permanent
                
                # CVE 정보가 없는 경우 조회
                if not cve_title:
                    projection = {"title": 1, "severity": 1, "status": 1}
                    cve = await self.repository.find_by_cve_id_with_projection(cve_id, projection)
                    if cve:
                        cve_title = cve.title or cve_id
                        metadata.update({
                            "severity": cve.severity,
                            "status": cve.status
                        })
                
                # 활동 유형에 따른 변경 내역 생성
                changes = []
                
                if activity_type == ActivityAction.COMMENT:
                    changes.append(ChangeItem(
                        field="comments",
                        field_name="댓글",
                        action="add",
                        detail_type="detailed",
                        summary="댓글 추가됨",
                        items=[{"content": content}]
                    ))
                elif activity_type == ActivityAction.COMMENT_UPDATE:
                    changes.append(ChangeItem(
                        field="comments",
                        field_name="댓글",
                        action="edit",
                        detail_type="detailed",
                        before=old_content,
                        after=content,
                        summary="댓글 수정됨"
                    ))
                elif activity_type == ActivityAction.COMMENT_DELETE:
                    changes.append(ChangeItem(
                        field="comments",
                        field_name="댓글",
                        action="delete",
                        detail_type="detailed",
                        before=content,
                        summary=f"댓글 {permanent and '영구 ' or ''}삭제됨"
                    ))
                
                # 활동 기록 생성
                await self.activity_service.create_activity(
                    username=username,
                    activity_type=activity_type,
                    target_type=ActivityTargetType.CVE,
                    target_id=cve_id,
                    target_title=cve_title or cve_id,
                    changes=changes,
                    metadata=metadata
                )
                
                return True
            except Exception as e:
                logger.error(f"댓글 활동 추적 중 오류: {str(e)}")
                logger.error(traceback.format_exc())
                return False