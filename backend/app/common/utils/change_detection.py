"""
객체 변경 사항 감지 유틸리티
"""
from typing import List, Dict, Any, Optional, Union
from datetime import datetime

from app.common.models.base_models import ChangeLogBase

def detect_object_changes(old_obj: Any, new_obj: Any, ignore_fields: Optional[List[str]] = None) -> List[ChangeLogBase]:
    """
    두 객체 간의 변경 사항을 감지하고 ChangeLogBase 목록을 반환합니다.
    
    Args:
        old_obj: 변경 전 객체
        new_obj: 변경 후 객체
        ignore_fields: 무시할 필드 목록 (기본값: ["last_modified_at", "last_modified_by"])
        
    Returns:
        변경 사항 목록
    """
    if ignore_fields is None:
        ignore_fields = ["last_modified_at", "last_modified_by"]
        
    changes = []
    
    # Pydantic 모델이나 Document 객체 처리
    if hasattr(old_obj, 'dict') and hasattr(new_obj, 'dict'):
        old_dict = old_obj.dict()
        new_dict = new_obj.dict()
    else:
        old_dict = old_obj if isinstance(old_obj, dict) else {}
        new_dict = new_obj if isinstance(new_obj, dict) else {}
    
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
    
    # 모든 키 수집
    all_keys = set(old_dict.keys()) | set(new_dict.keys())
    
    current_user = "system"  # 실제 구현에서는 현재 인증된 사용자 정보를 가져와야 함
    
    # 각 키에 대해 변경 사항 확인
    for key in all_keys:
        if key in ignore_fields:
            continue
            
        # 필드 한글명 가져오기
        field_display = field_name_mapping.get(key, key)
        
        if key not in old_dict and key in new_dict:
            # 새로 추가된 필드
            changes.append(ChangeLogBase(
                field=key,
                action="add",
                user=current_user,
                new_value=new_dict[key],
                summary=f"{field_display} 추가됨"
            ))
        elif key in old_dict and key not in new_dict:
            # 삭제된 필드
            changes.append(ChangeLogBase(
                field=key,
                action="delete",
                user=current_user,
                old_value=old_dict[key],
                summary=f"{field_display} 삭제됨"
            ))
        elif key in old_dict and key in new_dict and old_dict[key] != new_dict[key]:
            # 컬렉션 타입 필드 특별 처리
            if isinstance(old_dict[key], list) and isinstance(new_dict[key], list):
                collection_changes = detect_collection_changes(old_dict[key], new_dict[key])
                if collection_changes["added"] or collection_changes["removed"] or collection_changes["modified"]:
                    summary = f"{field_display} "
                    details = []
                    
                    if collection_changes["added"]:
                        details.append(f"{len(collection_changes['added'])}개 추가")
                    if collection_changes["removed"]:
                        details.append(f"{len(collection_changes['removed'])}개 삭제")
                    if collection_changes["modified"]:
                        details.append(f"{len(collection_changes['modified'])}개 수정")
                        
                    summary += ", ".join(details)
                    
                    changes.append(ChangeLogBase(
                        field=key,
                        action="edit",
                        user=current_user,
                        old_value=old_dict[key],
                        new_value=new_dict[key],
                        summary=summary
                    ))
            else:
                # 일반 필드 변경
                old_value = old_dict[key]
                new_value = new_dict[key]
                
                # 간단한 값 표시를 위한 처리
                old_display = str(old_value)[:100] if old_value is not None else "없음"
                new_display = str(new_value)[:100] if new_value is not None else "없음"
                
                if len(old_display) == 100:
                    old_display += "..."
                if len(new_display) == 100:
                    new_display += "..."
                
                changes.append(ChangeLogBase(
                    field=key,
                    action="edit",
                    user=current_user,
                    old_value=old_value,
                    new_value=new_value,
                    summary=f"{field_display} 변경: '{old_display}' → '{new_display}'"
                ))
    
    return changes


def detect_collection_changes(old_collection: List, new_collection: List, id_field: str = "id") -> Dict[str, Any]:
    """
    컬렉션 타입(리스트)의 변경 사항을 감지합니다.
    
    Args:
        old_collection: 변경 전 컬렉션
        new_collection: 변경 후 컬렉션
        id_field: 객체 식별을 위한 ID 필드명
        
    Returns:
        추가, 삭제, 수정된 항목 목록을 포함하는 사전
    """
    if not old_collection:
        old_collection = []
    if not new_collection:
        new_collection = []
        
    # ID 기준으로 항목 인덱싱
    old_items = {}
    new_items = {}
    
    for i, item in enumerate(old_collection):
        item_id = item.get(id_field, i) if isinstance(item, dict) else i
        old_items[item_id] = item
        
    for i, item in enumerate(new_collection):
        item_id = item.get(id_field, i) if isinstance(item, dict) else i
        new_items[item_id] = item
    
    # 변경 사항 계산
    added_ids = set(new_items.keys()) - set(old_items.keys())
    removed_ids = set(old_items.keys()) - set(new_items.keys())
    common_ids = set(old_items.keys()) & set(new_items.keys())
    
    # 수정된 항목 찾기
    modified_ids = [id for id in common_ids if old_items[id] != new_items[id]]
    
    return {
        "added": [new_items[id] for id in added_ids],
        "removed": [old_items[id] for id in removed_ids],
        "modified": [(old_items[id], new_items[id]) for id in modified_ids]
    }