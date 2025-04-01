"""
CVE 관련 스키마 정의 (통합 버전)
"""
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum
from zoneinfo import ZoneInfo
from bson import ObjectId

# ----- 유틸리티 함수 -----

def serialize_datetime(dt):
    """datetime 객체를 ISO 8601 형식의 문자열로 직렬화"""
    if not dt:
        return None
    return dt.replace(tzinfo=ZoneInfo("UTC")).isoformat().replace('+00:00', 'Z')

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
    
    class Config:
        json_encoders = {
            datetime: serialize_datetime
        }
    
class PoCBase(BaseModel):
    """PoC(Proof of Concept) 기본 모델"""
    source: str
    url: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None
    last_modified_at: Optional[datetime] = None
    last_modified_by: Optional[str] = None
    
    class Config:
        json_encoders = {
            datetime: serialize_datetime
        }
    
class SnortRuleBase(BaseModel):
    """Snort 룰 기본 모델"""
    rule: str
    type: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None
    last_modified_at: Optional[datetime] = None
    last_modified_by: Optional[str] = None
    
    class Config:
        json_encoders = {
            datetime: serialize_datetime
        }
    
class ChangeItem(BaseModel):
    """변경 사항 항목 모델"""
    field: str
    field_name: str
    action: str  # "add", "edit", "delete" 등
    detail_type: str = "detailed"
    summary: str
    before: Optional[Any] = None
    after: Optional[Any] = None
    items: Optional[List[dict]] = None
    
    class Config:
        json_encoders = {
            datetime: serialize_datetime
        }
    
class ModificationHistory(BaseModel):
    """변경 이력 모델"""
    username: str
    modified_at: datetime
    changes: List[ChangeItem]
    
    class Config:
        json_encoders = {
            datetime: serialize_datetime
        }

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
    severity: Optional[str] = None
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
    severity: Optional[str] = None
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
    id: Optional[str]
    cve_id: str
    title: Optional[str] = None
    status: str
    created_at: datetime
    last_modified_at: Optional[datetime] = None
    severity: Optional[str] = None
    
    class Config:
        json_encoders = {
            datetime: serialize_datetime,
            ObjectId: lambda v: str(v)
        }

class CVEListResponse(BaseModel):
    """CVE 목록 응답 모델"""
    total: int
    items: List[CVEListItem]
    page: int = 1
    limit: int = 10
    
class CVEDetailResponse(BaseModel):
    """CVE 상세 응답 모델"""
    id: Optional[str]
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
            datetime: serialize_datetime,
            ObjectId: lambda v: str(v)
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