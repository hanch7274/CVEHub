"""
CVE 관련 기본 스키마 정의
"""
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
from zoneinfo import ZoneInfo

# ----- 기본 모델 -----

class Reference(BaseModel):
    """참조 정보 모델"""
    url: str
    type: str = Field(default="OTHER", description="참조 타입")
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None
    last_modified_at: Optional[datetime] = None
    last_modified_by: Optional[str] = None
    
class PoCBase(BaseModel):
    """PoC(Proof of Concept) 기본 모델"""
    source: str
    url: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None
    last_modified_at: Optional[datetime] = None
    last_modified_by: Optional[str] = None
    
class SnortRuleBase(BaseModel):
    """Snort 룰 기본 모델"""
    rule: str
    type: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None
    last_modified_at: Optional[datetime] = None
    last_modified_by: Optional[str] = None
    
class ChangeItem(BaseModel):
    """변경 사항 항목 모델"""
    field: str
    field_name: str
    action: str  # "add", "edit", "delete" 등
    summary: str
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    
class ModificationHistory(BaseModel):
    """변경 이력 모델"""
    username: str
    modified_at: datetime
    changes: List[ChangeItem]
