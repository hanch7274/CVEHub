from typing import Dict, List, Optional, Any
from datetime import datetime
from ..models.cve_model import CVEModel, Reference, ModificationHistory
from .datetime_utils import get_utc_now

def create_reference(
    url: str,
    type: str = "OTHER",
    description: str = "",
    creator: str = "SYSTEM",
) -> Dict[str, Any]:
    """
    참조 링크(Reference) 객체를 생성합니다.
    
    Args:
        url (str): 참조 URL
        type (str): 참조 유형 (기본값: 'OTHER')
        description (str): 참조 설명
        creator (str): 생성자/추가자 이름
    
    Returns:
        Dict[str, Any]: Reference 모델에 맞는 딕셔너리
    """
    now = get_utc_now()
    return {
        "url": url,
        "type": type,
        "description": description,
        "created_at": now,
        "created_by": creator,
        "last_modified_at": now,
        "last_modified_by": creator
    }

def create_change_record(
    field: str,
    field_name: str,
    action: str,
    summary: str,
    old_value: Any = None,
    new_value: Any = None
) -> Dict[str, Any]:
    """
    변경 기록(Change) 객체를 생성합니다.
    
    Args:
        field (str): 변경된 필드 이름 (코드용)
        field_name (str): 변경된 필드 표시 이름 (사용자용)
        action (str): 변경 작업 유형 ('add', 'update', 'delete')
        summary (str): 변경 요약
        old_value (Any, optional): 이전 값
        new_value (Any, optional): 새 값
    
    Returns:
        Dict[str, Any]: Change 모델에 맞는 딕셔너리
    """
    return {
        "field": field,
        "field_name": field_name,
        "action": action,
        "summary": summary,
        "old_value": old_value,
        "new_value": new_value
    }

def create_basic_cve_data(
    cve_id: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    severity: str = "unknown",
    source: str = "SYSTEM",
    creator: str = "SYSTEM",
) -> Dict[str, Any]:
    """
    크롤러용 기본 CVE 데이터를 생성합니다.
    
    Args:
        cve_id (str): CVE ID
        title (str, optional): 제목
        description (str, optional): 설명
        severity (str, optional): 심각도
        source (str, optional): 데이터 소스
        creator (str, optional): 생성자
    
    Returns:
        Dict[str, Any]: 기본 CVE 데이터
    """
    now = get_utc_now()
    
    # 초기 변경 이력 생성
    initial_change = create_change_record(
        field="cve_id",
        field_name="CVE ID",
        action="add",
        summary=f"CVE {cve_id} 생성됨",
        new_value=cve_id
    )
    
    initial_history = {
        "username": creator,
        "modified_at": now,
        "changes": [initial_change]
    }
    
    return {
        "cve_id": cve_id,
        "title": title or cve_id,  # 제목이 없으면 CVE ID 사용
        "description": description or "",
        "severity": severity,
        "status": "신규등록",  # 기본 상태
        "source": source,
        "created_at": now,
        "last_modified_at": now,
        "created_by": creator,
        "last_modified_by": creator,
        "modification_history": [initial_history]
    }
