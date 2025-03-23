"""
CVE 관련 응답 스키마 정의
"""
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
from zoneinfo import ZoneInfo

from .cve_base_schemas import Reference, PoCBase, SnortRuleBase, ModificationHistory

# ----- 응답 모델 -----

class CVEListItem(BaseModel):
    """CVE 목록 아이템 모델"""
    id: str
    cve_id: str
    title: Optional[str] = None
    status: str
    created_at: datetime
    last_modified_at: Optional[datetime] = None
    severity: Optional[str] = None
    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=ZoneInfo("UTC")).isoformat() if v else None
        }

class CVEListResponse(BaseModel):
    """CVE 목록 응답 모델"""
    total: int
    items: List[CVEListItem]
    page: int = 1
    limit: int = 10
    
class CVEDetailResponse(BaseModel):
    """CVE 상세 응답 모델"""
    id: str
    cve_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    status: str
    severity: Optional[str] = None
    created_at: datetime
    last_modified_at: Optional[datetime] = None
    references: List[Reference] = []
    pocs: List[PoCBase] = []
    snort_rules: List[SnortRuleBase] = []
    modification_history: List[ModificationHistory] = []
    created_by: Optional[str] = None
    last_modified_by: Optional[str] = None
    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=ZoneInfo("UTC")).isoformat() if v else None
        }
    
class CVEOperationResponse(BaseModel):
    """CVE 작업 결과 응답 모델"""
    success: bool
    message: str
    cve_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class BulkOperationResponse(BaseModel):
    """다중 CVE 작업 결과 응답 모델"""
    success: Dict[str, Any]
    errors: Dict[str, Any]
    total_processed: int

class CVESearchResponse(BaseModel):
    """CVE 검색 결과 응답 모델"""
    total: int
    items: List[CVEListItem]
    query: str

class CVECommentResponse(BaseModel):
    """CVE 댓글 관련 응답 모델"""
    success: bool
    message: str
    cve_id: str
    comment_id: Optional[str] = None
