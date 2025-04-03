"""
CVE 및 Comment를 위한 통합 모델 및 스키마
모델: 데이터베이스 구조 정의
스키마: API 요청 및 응답 형식 정의
"""
from datetime import datetime
from typing import List, Optional, Literal, Any, Dict, Union
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field, validator
from zoneinfo import ZoneInfo
import re
from bson import ObjectId
from app.common.models.base_models import BaseDocument, BaseSchema, TimestampMixin

# ---------- 유틸리티 함수 ----------

def serialize_datetime(dt):
    """datetime 객체를 ISO 8601 형식의 문자열로 직렬화"""
    if not dt:
        return None
    return dt.replace(tzinfo=ZoneInfo("UTC")).isoformat().replace('+00:00', 'Z')


# ---------- 임베디드 모델 (기본 Pydantic 모델) ----------

class Reference(BaseModel):
    """참조 정보 모델"""
    url: str = Field(..., description="참조 URL")
    type: str = Field(default="OTHER", description="참조 타입")
    description: Optional[str] = Field(None, description="참조 설명")
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    created_by: str = Field(..., description="추가한 사용자")
    last_modified_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    last_modified_by: str = Field(..., description="마지막 수정자")
    
    class Config:
        json_encoders = {
            datetime: serialize_datetime
        }

class PoC(BaseModel):
    """PoC(Proof of Concept) 모델"""
    source: str = Field(..., description="PoC 소스")
    url: str = Field(..., description="PoC URL")
    description: Optional[str] = Field(None, description="PoC 설명")
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    created_by: str = Field(..., description="추가한 사용자")
    last_modified_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    last_modified_by: str = Field(..., description="마지막 수정자")
    
    class Config:
        json_encoders = {
            datetime: serialize_datetime
        }

class SnortRule(BaseModel):
    """Snort Rule 모델"""
    rule: str = Field(..., description="Snort Rule 내용")
    type: str = Field(..., description="Rule 타입")
    description: Optional[str] = Field(None, description="Rule 설명")
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    created_by: str = Field(..., description="추가한 사용자")
    last_modified_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    last_modified_by: str = Field(..., description="마지막 수정자")
    
    class Config:
        json_encoders = {
            datetime: serialize_datetime
        }

class Comment(BaseModel):
    """댓글 모델 - CVE에 임베디드됨"""
    id: str = Field(default_factory=lambda: str(ObjectId()))
    content: str
    created_by: str = Field(..., description="작성자 이름")
    parent_id: Optional[str] = None
    depth: int = 0
    is_deleted: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    last_modified_at: Optional[datetime] = None
    last_modified_by: Optional[str] = None
    mentions: List[str] = []
    
    class Config:
        json_encoders = {
            datetime: serialize_datetime
        }
    
    @classmethod
    def extract_mentions(cls, content: str) -> List[str]:
        """댓글 내용에서 멘션된 사용자명을 추출"""
        if not content:
            return []
        MENTION_PATTERN = re.compile(r'@(\w+)')
        matches = MENTION_PATTERN.findall(content)
        return [f"@{username}" for username in set(matches)]

class ChangeItem(BaseModel):
    """변경 사항을 표현하는 모델"""
    field: str  # 변경된 필드명
    field_name: str  # 필드의 한글명
    action: Literal["add", "edit", "delete"]  # 변경 유형
    detail_type: Literal["simple", "detailed"] = "detailed"  # 변경 내역 표시 방식
    before: Optional[Any] = None  # 변경 전 값
    after: Optional[Any] = None  # 변경 후 값
    items: Optional[List[dict]] = None  # 컬렉션 타입 필드의 변경 항목들
    summary: str  # 변경 요약

class ModificationHistory(BaseModel):
    """변경 이력 모델"""
    username: str  # 수정한 사용자 이름
    modified_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    changes: List[ChangeItem] = []


# ---------- 요청 모델 (API 입력) ----------

class CommentCreate(BaseSchema):
    """댓글 생성 요청 모델"""
    content: str = Field(..., description="댓글 내용")
    parent_id: Optional[str] = Field(None, description="부모 댓글 ID (답글인 경우)")
    mentions: List[str] = Field(default=[], description="멘션된 사용자 목록")
    
    @validator('content')
    def validate_content(cls, v):
        if not v.strip():
            raise ValueError("댓글 내용은 비워둘 수 없습니다.")
        return v.strip()

class CommentUpdate(BaseSchema):
    """댓글 수정 요청 모델"""
    content: str = Field(..., description="수정할 댓글 내용")

class CreateCVERequest(BaseSchema):
    """CVE 생성 요청 모델"""
    cve_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "신규등록"
    severity: Optional[str] = None
    references: List[Dict[str, str]] = []
    pocs: List[Dict[str, str]] = []
    snort_rules: List[Dict[str, str]] = []

class PatchCVERequest(BaseSchema):
    """CVE 부분 업데이트 요청 모델"""
    cve_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    severity: Optional[str] = None
    references: Optional[List[Reference]] = None
    pocs: Optional[List[PoC]] = None
    snort_rules: Optional[List[SnortRule]] = None
    
    class Config:
        extra = "allow"

class BulkUpsertCVERequest(BaseSchema):
    """다중 CVE 업서트 요청 모델"""
    cves: List[CreateCVERequest]
    crawler_name: Optional[str] = None


# ---------- 응답 모델 (API 출력) ----------

class CommentResponse(BaseSchema):
    """댓글 응답 모델"""
    id: str
    content: str
    created_by: str
    parent_id: Optional[str] = None
    created_at: datetime
    last_modified_at: Optional[datetime] = None
    is_deleted: bool = False
    mentions: List[str] = []

class CVEListItem(BaseSchema):
    """CVE 목록 아이템 모델"""
    id: Optional[str]
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
    id: Optional[str]
    cve_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    status: str
    severity: Optional[str] = None
    created_at: datetime
    last_modified_at: Optional[datetime] = None
    references: List[Reference] = []
    pocs: List[PoC] = []
    snort_rules: List[SnortRule] = []
    comments: List[CommentResponse] = []
    modification_history: List[ModificationHistory] = []
    created_by: Optional[str] = None
    last_modified_by: Optional[str] = None

class CVEOperationResponse(BaseSchema):
    """CVE 작업 결과 응답 모델"""
    success: bool
    message: str
    cve_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class BulkOperationResponse(BaseSchema):
    """다중 CVE 작업 결과 응답 모델"""
    success: Dict[str, Any]
    errors: Dict[str, Any]
    total_processed: int

class CVESearchResponse(BaseSchema):
    """CVE 검색 결과 응답 모델"""
    total: int
    items: List[CVEListItem]
    query: str


# ---------- 문서 모델 (데이터베이스 엔티티) ----------

class CVEModel(BaseDocument):
    """CVE 모델"""
    cve_id: str = Field(..., description="CVE ID")
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "신규등록"  # 신규등록, 분석중, 릴리즈 완료, 분석불가
    assigned_to: Optional[str] = None
    severity: Optional[str] = None  # 심각도 필드
    created_by: str = Field(..., description="추가한 사용자")
    last_modified_by: str = Field(..., description="마지막 수정자")
    
    # 임베디드 필드
    comments: List[Comment] = []
    pocs: List[PoC] = []
    snort_rules: List[SnortRule] = Field(default_factory=list)
    references: List[Reference] = Field(default_factory=list)
    modification_history: List[ModificationHistory] = []
    
    # 편집 잠금 관련 필드
    is_locked: bool = False
    locked_by: Optional[str] = None
    lock_timestamp: Optional[datetime] = None
    lock_expires_at: Optional[datetime] = None
    
    # 기타 필드
    notes: Optional[str] = None
    nuclei_hash: Optional[str] = None
    
    class Settings:
        name = "cves"
        id_field = "cve_id"
        indexes = [
            "status",
            "assigned_to",
            "last_modified_at",
            "created_at",
            "created_by",
            "is_locked",
            "locked_by",
            [("last_modified_at", -1)], 
            [("created_at", -1)],
            [("status", 1), ("last_modified_at", -1)],
            [
                ("cve_id", "text"), 
                ("title", "text"), 
                ("description", "text")
            ]
        ]
        unique_indexes = [
            [("cve_id", 1)]
        ]