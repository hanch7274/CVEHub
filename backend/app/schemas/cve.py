"""
CVE 관련 스키마 정의
"""
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
from zoneinfo import ZoneInfo

# ----- 기본 모델 -----

class Reference(BaseModel):
    """참조 정보 모델"""
    name: str
    url: str
    
class PoCBase(BaseModel):
    """PoC(Proof of Concept) 기본 모델"""
    source: str
    url: str
    description: Optional[str] = None
    
class SnortRuleBase(BaseModel):
    """Snort 룰 기본 모델"""
    rule: str
    type: str
    description: Optional[str] = None
    date_added: Optional[datetime] = None
    added_by: Optional[str] = None
    
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

# ----- 요청 모델 -----

class CreatePoCRequest(PoCBase):
    """PoC 생성 요청 모델"""
    pass

class CreateSnortRuleRequest(SnortRuleBase):
    """Snort 룰 생성 요청 모델"""
    pass

class CreateCVERequest(BaseModel):
    """CVE 생성 요청 모델"""
    cve_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "신규등록"
    references: List[Dict[str, str]] = []
    pocs: List[CreatePoCRequest] = []
    snort_rules: List[CreateSnortRuleRequest] = []

    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=ZoneInfo("Asia/Seoul")).isoformat() if v else None
        }

class PatchCVERequest(BaseModel):
    """CVE 부분 업데이트 요청 모델"""
    cve_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    references: Optional[List[Reference]] = None
    pocs: Optional[List[CreatePoCRequest]] = None
    snort_rules: Optional[List[CreateSnortRuleRequest]] = None

    class Config:
        extra = "allow"
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class BulkUpsertCVERequest(BaseModel):
    """다중 CVE 업서트 요청 모델"""
    cves: List[CreateCVERequest]
    crawler_name: Optional[str] = None

# ----- 응답 모델 -----

class CVEListItem(BaseModel):
    """CVE 목록 아이템 모델"""
    id: str
    cve_id: str
    title: Optional[str] = None
    status: str
    created_at: datetime
    last_modified_date: Optional[datetime] = None
    description: Optional[str] = None

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
    created_at: datetime
    last_modified_date: Optional[datetime] = None
    references: List[Reference] = []
    pocs: List[PoCBase] = []
    snort_rules: List[SnortRuleBase] = []
    modification_history: List[ModificationHistory] = []
    created_by: Optional[str] = None
    last_modified_by: Optional[str] = None
    
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
