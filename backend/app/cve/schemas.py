"""
자동 생성된 API 스키마 파일 - 직접 수정하지 마세요
생성 시간: 2025-04-11 18:22:52
"""
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from pydantic import BaseModel, Field, validator
from app.common.models.base_models import BaseSchema, TimestampMixin
from .models import ChangeItem

# ---------- 요청 모델 임베디드 클래스 ----------

class ReferenceRequest(BaseModel):
    """Reference 요청 모델"""
    url: str = Field(..., description="참조 URL")
    type: str = Field(default="OTHER", description="참조 타입")
    description: Optional[str] = Field(default=None, description="참조 설명")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=None).isoformat() if v else None
        }
class PoCRequest(BaseModel):
    """PoC 요청 모델"""
    source: str = Field(..., description="PoC 소스")
    url: str = Field(..., description="PoC URL")
    description: Optional[str] = Field(default=None, description="PoC 설명")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=None).isoformat() if v else None
        }
class SnortRuleRequest(BaseModel):
    """SnortRule 요청 모델"""
    rule: str = Field(..., description="Snort Rule 내용")
    type: str = Field(..., description="Rule 타입")
    description: Optional[str] = Field(default=None, description="Rule 설명")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=None).isoformat() if v else None
        }
class CommentRequest(BaseModel):
    """Comment 요청 모델"""
    id: str = Field(default=lambda: str(ObjectId()), description="댓글 ID")
    content: str = Field(..., description="댓글 내용")
    parent_id: Optional[str] = Field(default=None, description="부모 댓글 ID")
    depth: int = Field(default=0, description="댓글 깊이")
    is_deleted: bool = Field(default=False, description="삭제 여부")
    mentions: List[str] = Field(default=[], description="멘션된 사용자 목록")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=None).isoformat() if v else None
        }

# ---------- 응답 모델 임베디드 클래스 ----------

class ReferenceResponse(BaseModel):
    """Reference 응답 모델"""
    url: str = Field(..., description="참조 URL")
    type: str = Field(default="OTHER", description="참조 타입")
    description: Optional[str] = Field(default=None, description="참조 설명")
    created_at: datetime = Field(default=lambda: datetime.now(ZoneInfo("UTC")), description="생성 시간")
    created_by: str = Field(..., description="추가한 사용자")
    last_modified_at: datetime = Field(default=lambda: datetime.now(ZoneInfo("UTC")), description="마지막 수정 시간")
    last_modified_by: Optional[str] = Field(default=None, description="마지막 수정자")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=None).isoformat() if v else None
        }
        from_attributes = True
class PoCResponse(BaseModel):
    """PoC 응답 모델"""
    source: str = Field(..., description="PoC 소스")
    url: str = Field(..., description="PoC URL")
    description: Optional[str] = Field(default=None, description="PoC 설명")
    created_at: datetime = Field(default=lambda: datetime.now(ZoneInfo("UTC")), description="생성 시간")
    created_by: str = Field(..., description="추가한 사용자")
    last_modified_at: datetime = Field(default=lambda: datetime.now(ZoneInfo("UTC")), description="마지막 수정 시간")
    last_modified_by: Optional[str] = Field(default=None, description="마지막 수정자")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=None).isoformat() if v else None
        }
        from_attributes = True
class SnortRuleResponse(BaseModel):
    """SnortRule 응답 모델"""
    rule: str = Field(..., description="Snort Rule 내용")
    type: str = Field(..., description="Rule 타입")
    description: Optional[str] = Field(default=None, description="Rule 설명")
    created_at: datetime = Field(default=lambda: datetime.now(ZoneInfo("UTC")), description="생성 시간")
    created_by: str = Field(..., description="추가한 사용자")
    last_modified_at: datetime = Field(default=lambda: datetime.now(ZoneInfo("UTC")), description="마지막 수정 시간")
    last_modified_by: Optional[str] = Field(default=None, description="마지막 수정자")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=None).isoformat() if v else None
        }
        from_attributes = True
class CommentResponse(BaseModel):
    """Comment 응답 모델"""
    id: str = Field(default=lambda: str(ObjectId()), description="댓글 ID")
    content: str = Field(..., description="댓글 내용")
    created_by: str = Field(..., description="작성자 이름")
    parent_id: Optional[str] = Field(default=None, description="부모 댓글 ID")
    depth: int = Field(default=0, description="댓글 깊이")
    is_deleted: bool = Field(default=False, description="삭제 여부")
    created_at: datetime = Field(default=lambda: datetime.now(ZoneInfo("UTC")), description="생성 시간")
    last_modified_at: Optional[datetime] = Field(default=None, description="마지막 수정 시간")
    last_modified_by: Optional[str] = Field(default=None, description="마지막 수정자")
    mentions: List[str] = Field(default=[], description="멘션된 사용자 목록")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=None).isoformat() if v else None
        }
        from_attributes = True

# ChangeItem 클래스 (별도 정의)
class ChangeItem(BaseModel):
    """변경 사항을 표현하는 모델"""
    field: str = Field(..., description="변경된 필드명")
    field_name: str = Field(..., description="필드의 한글명")
    action: Literal["add", "edit", "delete"] = Field(..., description="변경 유형")
    detail_type: Literal["simple", "detailed"] = Field(default="detailed", description="변경 내역 표시 방식")
    before: Optional[Any] = Field(default=[], description="변경 전 값")
    after: Optional[Any] = Field(default=[], description="변경 후 값")
    items: Optional[List[dict]] = Field(default=[], description="컬렉션 타입 필드의 변경 항목들")
    summary: str = Field(..., description="변경 요약")

# ---------- 요청 모델 ----------

class CreateCVERequest(BaseSchema):
    """CVE 생성 요청 모델"""
    cve_id: str = Field(..., description="CVE ID")
    title: Optional[str] = Field(default=[], description="CVE 제목")
    description: Optional[str] = Field(default=[], description="CVE 설명")
    status: str = Field(default="신규등록", description="CVE 상태")
    assigned_to: Optional[str] = Field(default=[], description="담당자")
    severity: Optional[str] = Field(default=[], description="심각도")
    notes: Optional[str] = Field(default=[], description="내부 참고사항")
    nuclei_hash: Optional[str] = Field(default=[], description="Nuclei 템플릿 해시")
    reference: List[ReferenceRequest] = Field(default=[], description="참조 목록")
    poc: List[PoCRequest] = Field(default=[], description="PoC 목록")
    snort_rule: List[SnortRuleRequest] = Field(default=[], description="Snort 규칙 목록")

class PatchCVERequest(BaseSchema):
    """CVE 부분 업데이트 요청 모델"""
    title: Optional[Optional[str]] = Field(default=[], description="CVE 제목")
    description: Optional[Optional[str]] = Field(default=[], description="CVE 설명")
    status: Optional[str] = Field(default=[], description="CVE 상태")
    assigned_to: Optional[Optional[str]] = Field(default=[], description="담당자")
    severity: Optional[Optional[str]] = Field(default=[], description="심각도")
    notes: Optional[Optional[str]] = Field(default=[], description="내부 참고사항")
    nuclei_hash: Optional[Optional[str]] = Field(default=[], description="Nuclei 템플릿 해시")
    reference: Optional[List[ReferenceRequest]] = Field(default=[], description="참조 목록")
    poc: Optional[List[PoCRequest]] = Field(default=[], description="PoC 목록")
    snort_rule: Optional[List[SnortRuleRequest]] = Field(default=[], description="Snort 규칙 목록")
    
    class Config:
        extra = "allow"

# ---------- 응답 모델 ----------

class CVEListItem(BaseSchema):
    """CVE 목록 아이템 모델"""
    id: Optional[str] = None
    cve_id: str
    title: Optional[str] = None
    status: str
    created_at: datetime
    last_modified_at: Optional[datetime] = None
    severity: Optional[str] = None

class CVEListResponse(BaseSchema):
    """CVE 목록 응답 모델"""
    total: int
    items: List[CVEListItem]
    page: int = 1
    limit: int = 10

class CVEDetailResponse(BaseSchema):
    """CVE 상세 응답 모델"""
    id: Optional[str] = None
    cve_id: str
    title: Optional[str] = Field(default=[], description="CVE 제목")
    description: Optional[str] = Field(default=[], description="CVE 설명")
    status: str = Field(default="신규등록", description="CVE 상태")
    assigned_to: Optional[str] = Field(default=[], description="담당자")
    severity: Optional[str] = Field(default=[], description="심각도")
    created_by: str = Field(..., description="추가한 사용자")
    last_modified_by: Optional[str] = Field(default=None, description="마지막 수정자")
    is_locked: bool = Field(default=False, description="편집 잠금 여부")
    locked_by: Optional[str] = Field(default=[], description="잠금 설정한 사용자")
    lock_timestamp: Optional[datetime] = Field(default=[], description="잠금 설정 시간")
    lock_expires_at: Optional[datetime] = Field(default=[], description="잠금 만료 시간")
    notes: Optional[str] = Field(default=[], description="내부 참고사항")
    nuclei_hash: Optional[str] = Field(default=[], description="Nuclei 템플릿 해시")
    reference: List[ReferenceResponse] = Field(default=[], description="참조 목록")
    poc: List[PoCResponse] = Field(default=[], description="PoC 목록")
    snort_rule: List[SnortRuleResponse] = Field(default=[], description="Snort 규칙 목록")
    comments: List[CommentResponse] = Field(default=[], description="댓글 목록")

class CVEOperationResponse(BaseSchema):
    """CVE 작업 결과 응답 모델"""
    success: bool = Field(..., description="작업 성공 여부")
    message: str = Field(..., description="응답 메시지")
    cve_id: Optional[str] = Field(default=None, description="작업 대상 CVE ID")
    data: Optional[Dict[str, Any]] = Field(default=None, description="추가 데이터")