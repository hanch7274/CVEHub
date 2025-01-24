from datetime import datetime
from typing import List, Optional, Literal
from beanie import Document
from pydantic import BaseModel, Field
from zoneinfo import ZoneInfo
import re
from bson import ObjectId

class PoC(BaseModel):
    source: Literal["Etc", "Metasploit", "Nuclei-Templates"]
    url: str
    description: Optional[str] = None
    date_added: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")))
    added_by: str = "anonymous"

class SnortRule(BaseModel):
    rule: str
    type: Literal["IPS", "ONE", "UTM", "USER_DEFINED", "EMERGING_THREATS", "SNORT_OFFICIAL"]
    description: Optional[str] = None
    date_added: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")))
    added_by: str = "anonymous"
    last_modified_at: Optional[datetime] = None
    last_modified_by: Optional[str] = None

class Reference(BaseModel):
    url: str

class Comment(BaseModel):
    id: str = Field(default_factory=lambda: str(ObjectId()))  # ObjectId 사용
    content: str
    username: str  # 작성자 이름
    parent_id: Optional[str] = None  # 부모 댓글 ID
    depth: int = 0  # 댓글 깊이 (0: 최상위, 1: 대댓글, 2: 대대댓글, ...)
    is_deleted: bool = False  # 삭제 여부
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")))
    updated_at: Optional[datetime] = None

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

class ModificationHistory(BaseModel):
    modified_by: str
    modified_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")))

class CVEModel(Document):
    cve_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "신규등록"  # 신규등록, 분석중, 릴리즈 완료, 분석불가
    assigned_to: Optional[str] = None
    published_date: datetime
    last_modified_date: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")))
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")))
    created_by: str = "anonymous"
    modification_history: List[ModificationHistory] = []
    pocs: List[PoC] = []
    snort_rules: List[SnortRule] = []
    references: List[Reference] = []
    comments: List[Comment] = []  # 댓글 필드 추가
    notes: Optional[str] = None
    
    # 편집 잠금 관련 필드
    is_locked: bool = False
    locked_by: Optional[str] = None
    lock_timestamp: Optional[datetime] = None
    lock_expires_at: Optional[datetime] = None  # 30분 후 자동 잠금 해제

    class Settings:
        name = "cves"
        indexes = [
            "cve_id",
            "status",
            "assigned_to",
            "published_date",
            "last_modified_date",
            "created_at",
            "created_by"
        ]

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }
        json_schema_extra = {
            "example": {
                "cve_id": "CVE-2023-1234",
                "title": "Buffer overflow vulnerability in Example Software",
                "description": "Buffer overflow vulnerability in Example Software",
                "status": "신규등록",
                "published_date": datetime.now(ZoneInfo("Asia/Seoul")),
                "last_modified_date": datetime.now(ZoneInfo("Asia/Seoul")),
                "created_at": datetime.now(ZoneInfo("Asia/Seoul")),
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
    published_date: datetime
    references: List[Reference] = []
    notes: Optional[str] = None

class PatchCVERequest(BaseModel):
    """CVE 수정 요청 모델"""
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
