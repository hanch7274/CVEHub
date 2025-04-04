"""
사용자 활동 서비스
"""
from typing import List, Dict, Any, Optional, Callable, Awaitable, TypeVar, ParamSpec, cast
from datetime import datetime
from zoneinfo import ZoneInfo
import logging
import traceback
import functools
import inspect
from .repository import ActivityRepository
from .models import UserActivity, ActivityAction, ActivityTargetType
from ..cve.models import ChangeItem
from ..common.utils.change_detection import detect_object_changes

logger = logging.getLogger(__name__)

# 제네릭 타입 정의
T = TypeVar('T')
P = ParamSpec('P')

class ActivityService:
    """사용자 활동 서비스 클래스"""
    
    def __init__(self):
        self.repository = ActivityRepository()
        
    async def create_activity(self, 
                             username: str, 
                             action: ActivityAction,
                             target_type: ActivityTargetType,
                             target_id: str,
                             target_title: Optional[str] = None,
                             changes: List[ChangeItem] = None,
                             metadata: Dict[str, Any] = None) -> Optional[UserActivity]:
        """
        사용자 활동을 생성합니다.
        
        Args:
            username: 활동을 수행한 사용자명
            action: 활동 동작 (수정, 생성 등)
            target_type: 대상 유형 (cve, poc 등)
            target_id: 대상 ID (CVE ID 등)
            target_title: 대상 제목 또는 요약 (검색 및 표시 용도)
            changes: 변경 사항 목록
            metadata: 추가 메타데이터
            
        Returns:
            생성된 활동 또는 None
        """
        try:
            # action과 target_type이 문자열이거나 Enum일 수 있으므로 각각 처리
            action_value = action if isinstance(action, str) else action.value
            target_type_value = target_type if isinstance(target_type, str) else target_type.value
            
            activity_data = {
                "username": username,
                "timestamp": datetime.now(ZoneInfo("UTC")),
                "action": action_value,
                "target_type": target_type_value,
                "target_id": target_id,
                "target_title": target_title,
                "changes": changes or [],
                "metadata": metadata or {}
            }
            
            # 활동 생성 및 반환
            activity = await self.repository.create_activity(activity_data)
            return activity
            
        except Exception as e:
            logger.error(f"활동 생성 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            return None
    
    def track_activity(self,
                      target_type: ActivityTargetType,
                      action: ActivityAction,
                      target_id_extractor: Callable[[Any, Dict[str, Any]], str],
                      target_title_extractor: Optional[Callable[[Any, Dict[str, Any]], Optional[str]]] = None,
                      changes_generator: Optional[Callable[[Any, Dict[str, Any]], List[ChangeItem]]] = None,
                      metadata_generator: Optional[Callable[[Any, Dict[str, Any]], Dict[str, Any]]] = None,
                      username_param: str = "username"):
        """
        메서드 활동을 자동으로 추적하는 데코레이터
        
        Args:
            target_type: 대상 유형 (ActivityTargetType 클래스 참조)
            action: 수행한 동작 (ActivityAction 클래스 참조)
            target_id_extractor: 함수 인자에서 target_id를 추출하는 함수
            target_title_extractor: 함수 인자에서 target_title을 추출하는 함수 (선택)
            changes_generator: 함수 인자에서 변경 사항을 생성하는 함수 (선택)
            metadata_generator: 함수 인자에서 메타데이터를 생성하는 함수 (선택)
            username_param: 사용자명을 포함하는 매개변수 이름 (기본값: "username")
        """
        def decorator(func: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
            @functools.wraps(func)
            async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
                # 원래 함수 실행
                result = await func(*args, **kwargs)
                
                try:
                    # self 객체 추출 (일반적으로 첫 번째 인자)
                    self_obj = args[0] if args else None
                    
                    # 매개변수 정보 수집
                    params = {}
                    sig = inspect.signature(func)
                    
                    # 위치 인자를 이름이 있는 매개변수로 변환
                    param_names = list(sig.parameters.keys())
                    for i, arg in enumerate(args[1:], 1):  # args[0]은 self이므로 건너뜀
                        if i < len(param_names):
                            params[param_names[i]] = arg
                    
                    # 키워드 인자 추가
                    params.update(kwargs)
                    
                    # 필수 정보 추출
                    username = params.get(username_param, "system")
                    target_id = target_id_extractor(self_obj, params)
                    
                    # 선택적 정보 추출
                    target_title = None
                    if target_title_extractor:
                        target_title = target_title_extractor(self_obj, params)
                    
                    changes = []
                    if changes_generator:
                        changes = changes_generator(self_obj, params)
                    
                    metadata = {}
                    if metadata_generator:
                        metadata = metadata_generator(self_obj, params)
                    
                    # 결과 정보 추가 (해당되는 경우)
                    if hasattr(result, 'dict') and callable(getattr(result, 'dict')):
                        # Pydantic 모델 결과
                        metadata["result"] = {"success": True, "id": str(getattr(result, 'id', None))}
                    elif isinstance(result, tuple) and len(result) >= 2:
                        # (결과, 메시지) 형태의 튜플
                        success = bool(result[0])
                        metadata["result"] = {"success": success, "message": str(result[1])}
                    elif isinstance(result, dict) and "id" in result:
                        # ID가 포함된 딕셔너리
                        metadata["result"] = {"success": True, "id": str(result.get("id"))}
                    
                    # 활동 생성
                    if hasattr(self_obj, 'activity_service') and self_obj.activity_service:
                        await self_obj.activity_service.create_activity(
                            username=username,
                            action=action.value,
                            target_type=target_type.value,
                            target_id=target_id,
                            target_title=target_title,
                            changes=changes,
                            metadata=metadata
                        )
                except Exception as e:
                    logger.error(f"활동 추적 중 오류 발생: {str(e)}")
                    logger.error(traceback.format_exc())
                
                return result
            return wrapper
        return decorator
        
    async def get_activities_by_username(self, username: str, page: int = 1, limit: int = 10) -> Dict[str, Any]:
        """
        사용자명으로 활동 목록을 조회합니다.
        
        Args:
            username: 조회할 사용자명
            page: 페이지 번호
            limit: 페이지당 항목 수
            
        Returns:
            총 개수와 활동 목록
        """
        try:
            return await self.repository.get_activities_by_username(
                username=username,
                page=page,
                limit=limit
            )
        except Exception as e:
            logger.error(f"사용자 활동 조회 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            return {
                "total": 0,
                "items": [],
                "page": page,
                "limit": limit
            }
            
    async def get_activities_by_target(self, 
                                      target_type: ActivityTargetType, 
                                      target_id: str, 
                                      page: int = 1, 
                                      limit: int = 10) -> Dict[str, Any]:
        """
        대상 유형과 ID로 활동 목록을 조회합니다.
        
        Args:
            target_type: 대상 유형 (cve, poc 등)
            target_id: 대상 ID (CVE ID 등)
            page: 페이지 번호
            limit: 페이지당 항목 수
            
        Returns:
            총 개수와 활동 목록
        """
        try:
            return await self.repository.get_activities_by_target(
                target_type=target_type.value,
                target_id=target_id,
                page=page,
                limit=limit
            )
        except Exception as e:
            logger.error(f"대상 활동 조회 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            return {
                "total": 0,
                "items": [],
                "page": page,
                "limit": limit
            }
            
    async def get_all_activities(self, 
                                 filter_data: Optional[Dict[str, Any]] = None, 
                                 page: int = 1, 
                                 limit: int = 10) -> Dict[str, Any]:
        """
        모든 또는 필터링된 활동 목록을 조회합니다.
        
        Args:
            filter_data: 필터링할 데이터
            page: 페이지 번호
            limit: 페이지당 항목 수
            
        Returns:
            총 개수와 활동 목록
        """
        try:
            return await self.repository.get_all_activities(
                filter_data=filter_data,
                page=page,
                limit=limit
            )
        except Exception as e:
            logger.error(f"활동 목록 조회 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            return {
                "total": 0,
                "items": [],
                "page": page,
                "limit": limit
            }

    async def track_object_changes(
        self, 
        username: str, 
        action: ActivityAction,
        target_type: ActivityTargetType,
        target_id: str,
        old_obj: Any, 
        new_obj: Any,
        target_title: Optional[str] = None,
        ignore_fields: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[UserActivity]:
        """
        두 객체 간의 변경 사항을 감지하고 활동 기록을 생성합니다.
        
        Args:
            username: 활동 수행 사용자
            action: 활동 동작 유형
            target_type: 대상 유형
            target_id: 대상 ID
            old_obj: 변경 전 객체
            new_obj: 변경 후 객체
            target_title: 대상 제목 (선택)
            ignore_fields: 무시할 필드 (선택)
            metadata: 추가 메타데이터 (선택)
            
        Returns:
            생성된 활동 또는 None
        """
        try:
            # 변경 사항 감지
            change_logs = detect_object_changes(old_obj, new_obj, ignore_fields)
            
            # 변경 사항이 없으면 활동 기록 생성하지 않음
            if not change_logs:
                return None
            
            # 필드 이름 매핑 (한글명 또는 사용자 친화적 이름)
            field_name_mapping = {
                "title": "제목",
                "description": "설명",
                "status": "상태",
                "assigned_to": "담당자",
                "severity": "심각도",
                "pocs": "PoC",
                "snort_rules": "Snort 규칙",
                "references": "참조 문서",
                "username": "사용자명",
                "email": "이메일",
                "is_active": "활성 상태",
                "is_admin": "관리자 여부",
                "full_name": "이름",
                "comment": "댓글",
                # 필요한 필드 추가
            }
            
            # ChangeLogBase를 ChangeItem으로 변환
            from ..cve.models import ChangeItem
            
            # 변경 사항이 여러 개인 경우를 하나의 통합된 ChangeItem으로 처리
            # 필드가 여러 개인 경우 간단히 표시하기 위해 추가 요약
            if len(change_logs) > 1:
                # 필드명 수집
                changed_fields = [field_name_mapping.get(log.field, log.field) for log in change_logs]
                
                change_item = ChangeItem(
                    field="multiple",
                    field_name="여러 필드",
                    action="edit",
                    detail_type="simple",
                    summary=f"{len(changed_fields)}개 필드 변경됨: {', '.join(changed_fields[:3])}{' 등' if len(changed_fields) > 3 else ''}"
                )
                change_items = [change_item]
            else:
                # 단일 변경인 경우 상세 정보 제공
                log = change_logs[0] if change_logs else None
                if log:
                    field_name = field_name_mapping.get(log.field, log.field)
                    change_item = ChangeItem(
                        field=log.field,
                        field_name=field_name,
                        action="edit" if log.action == "edit" else ("add" if log.action == "add" else "delete"),
                        detail_type="detailed",
                        before=log.old_value,
                        after=log.new_value,
                        summary=log.summary if hasattr(log, 'summary') else f"{field_name} 변경됨"
                    )
                    change_items = [change_item]
                else:
                    change_items = []
                
            # 활동 기록 생성
            return await self.create_activity(
                username=username,
                action=action,
                target_type=target_type,
                target_id=target_id,
                target_title=target_title or str(target_id),
                changes=change_items,
                metadata=metadata or {}
            )
        except Exception as e:
            logger.error(f"변경 사항 추적 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
            return None