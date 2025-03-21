from datetime import datetime
from typing import List, Optional, Literal, Any
from beanie import Document
from pydantic import BaseModel, Field
from zoneinfo import ZoneInfo
import re
from bson import ObjectId

class PoC(BaseModel):
    source: Literal["Etc", "Metasploit", "Nuclei-Templates"]
    url: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    added_by: str = Field(..., description="추가한 사용자")
    last_modified_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")), description="마지막 수정 시간")
    last_modified_by: str = Field(..., description="마지막 수정자")

class SnortRule(BaseModel):
    rule: str = Field(..., description="Snort Rule 내용")
    type: str = Field(..., description="Rule 타입")
    description: Optional[str] = Field(None, description="Rule 설명")
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    added_by: str = Field(..., description="추가한 사용자")
    last_modified_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")), description="마지막 수정 시간")
    last_modified_by: str = Field(..., description="마지막 수정자")

class Reference(BaseModel):
    url: str = Field(..., description="참조 URL")
    type: str = Field(default="OTHER", description="참조 타입")
    description: Optional[str] = Field(None, description="참조 설명")
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    added_by: str = Field(..., description="추가한 사용자")
    last_modified_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")), description="마지막 수정 시간")
    last_modified_by: str = Field(..., description="마지막 수정자")

class Comment(BaseModel):
    id: str = Field(default_factory=lambda: str(ObjectId()))  # ObjectId 사용
    content: str
    username: str  # 작성자 이름
    parent_id: Optional[str] = None  # 부모 댓글 ID
    depth: int = 0  # 댓글 깊이 (0: 최상위, 1: 대댓글, 2: 대대댓글, ...)
    is_deleted: bool = False  # 삭제 여부
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    last_modified_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")), description="마지막 수정 시간")
    last_modified_by: str = Field(..., description="마지막 수정자")

    @property
    def mentions(self) -> List[str]:
        """댓글 내용에서 멘션된 사용자명을 추출합니다."""
        if not self.content:
            return []
        # @username 패턴 찾기
        pattern = r'@(\w+)'
        matches = re.findall(pattern, self.content)
        # 중복 제거 및 @ 기호 추가
        return [f"@{username}" for username in set(matches)]

class CommentCreate(BaseModel):
    content: str
    parent_id: Optional[str] = None
    depth: int = 0
    last_modified_by: str = Field(..., description="마지막 수정자")

    @property
    def extract_mentions(self) -> List[str]:
        """댓글 내용에서 멘션된 사용자명을 추출합니다."""
        if not self.content:
            return []
        # @username 패턴 찾기
        pattern = r'@(\w+)'
        matches = re.findall(pattern, self.content)
        # 중복 제거 및 @ 기호 추가
        return [f"@{username}" for username in set(matches)]

class CommentUpdate(BaseModel):
    content: str

    @property
    def extract_mentions(self) -> List[str]:
        """댓글 내용에서 멘션된 사용자명을 추출합니다."""
        if not self.content:
            return []
        # @username 패턴 찾기
        pattern = r'@(\w+)'
        matches = re.findall(pattern, self.content)
        # 중복 제거 및 @ 기호 추가
        return [f"@{username}" for username in set(matches)]

class ChangeItem(BaseModel):
    """변경 사항을 표현하는 모델"""
    field: str  # 변경된 필드명
    field_name: str  # 필드의 한글명
    action: Literal["add", "edit", "delete"]  # 변경 유형
    detail_type: Literal["simple", "detailed"] = "detailed"  # 변경 내역 표시 방식
    before: Optional[Any] = None  # 변경 전 값 (detailed 타입일 때만 사용)
    after: Optional[Any] = None  # 변경 후 값 (detailed 타입일 때만 사용)
    items: Optional[List[dict]] = None  # 컬렉션 타입 필드의 변경 항목들
    summary: str  # 변경 요약

    class Config:
        json_schema_extra = {
            "example": [
                # simple 타입 예시
                {
                    "field": "title",
                    "field_name": "제목",
                    "action": "edit",
                    "detail_type": "simple",
                    "summary": "제목 변경됨"
                },
                # detailed 타입 예시
                {
                    "field": "status",
                    "field_name": "상태",
                    "action": "edit",
                    "detail_type": "detailed",
                    "before": "신규등록",
                    "after": "분석중",
                    "summary": "상태가 '신규등록'에서 '분석중'으로 변경됨"
                }
            ]
        }

class ModificationHistory(BaseModel):
    username: str  # 수정한 사용자 이름
    modified_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    changes: List[ChangeItem] = Field(
        description="변경사항 목록",
        example=[
            {
                "field": "status",
                "field_name": "Snort Rules",
                "action": "add",
                "items": [
                    {
                        "type": "IPS",
                        "rule": "alert tcp any any",
                        "description": "New IPS rule"
                    }
                ],
                "summary": "Snort Rule 1개 추가됨"
            }
        ]
    )
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }

class CVEModel(Document):
    cve_id: str = Field(..., description="CVE ID")
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "신규등록"  # 신규등록, 분석중, 릴리즈 완료, 분석불가
    assigned_to: Optional[str] = None
    severity: Optional[str] = None  # 심각도 필드 추가
    last_modified_date: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    created_by: str = Field(..., description="추가한 사용자")
    last_modified_by: str = Field(..., description="마지막 수정자")
    modification_history: List[ModificationHistory] = []
    pocs: List[PoC] = []
    snort_rules: List[SnortRule] = Field(default_factory=list, description="Snort Rules")
    references: List[Reference] = Field(default_factory=list, description="참조 목록")
    comments: List[Comment] = []  # 댓글 필드 추가
    notes: Optional[str] = None
    
    # 편집 잠금 관련 필드
    is_locked: bool = False
    locked_by: Optional[str] = None
    lock_timestamp: Optional[datetime] = None
    lock_expires_at: Optional[datetime] = None  # 30분 후 자동 잠금 해제

    # content_hash를 nuclei_hash로 변경
    nuclei_hash: Optional[str] = None

    class Settings:
        name = "cves"
        indexes = [
            "cve_id",
            "status",
            "assigned_to",
            "last_modified_date",
            "created_at",
            "created_by",
            "is_locked",  # 락 상태 인덱스 추가
            "locked_by",
            [("cve_id", 1)], # 고유 인덱스
            [("last_modified_date", -1)], # 내림차순 인덱스
            [("created_at", -1)], # 내림차순 인덱스
            [("status", 1), ("last_modified_date", -1)], # 복합 인덱스
            [
                ("cve_id", "text"), 
                ("title", "text"), 
                ("description", "text")
            ] # 텍스트 검색 인덱스
        ]

    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=ZoneInfo("UTC")).isoformat() if v else None,
            ObjectId: str
        }
        json_schema_extra = {
            "example": {
                "cve_id": "CVE-2023-1234",
                "title": "Buffer overflow vulnerability in Example Software",
                "description": "Buffer overflow vulnerability in Example Software",
                "status": "신규등록",
                "last_modified_date": datetime.now(ZoneInfo("UTC")),
                "created_at": datetime.now(ZoneInfo("UTC")),
                "created_by": "anonymous",
                "modification_history": [],
                "pocs": [],
                "snort_rules": [],
                "references": [],
                "comments": []
            }
        }

class CreateCVERequest(BaseModel):
    """CVE 생성 요청 모델"""
    cve_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "신규등록"
    assigned_to: Optional[str] = None
    references: List[Reference] = []
    notes: Optional[str] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=ZoneInfo("UTC")).isoformat() if v else None
        }

class PatchCVERequest(BaseModel):
    """CVE 수정 요청 모델"""
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
