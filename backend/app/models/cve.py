from datetime import datetime
from typing import List, Optional, Literal
from beanie import Document
from pydantic import BaseModel, Field
from zoneinfo import ZoneInfo

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
    # YYYYMMDDHHmmSSfff 형식 (년월일시분초밀리초)
    id: str = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y%m%d%H%M%S%f")[:17])
    content: str
    username: str  # 작성자 이름
    parent_id: Optional[str] = None  # 부모 댓글 ID
    depth: int = 0  # 댓글 깊이 (0: 최상위, 1: 대댓글, 2: 대대댓글, ...)
    is_deleted: bool = False  # 삭제 여부
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")))
    updated_at: Optional[datetime] = None

class ModificationHistory(BaseModel):
    modified_by: str
    modified_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")))

class CVEModel(Document):
    cve_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "미할당"  # 미할당, 분석중, 분석완료, 대응완료
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
                "status": "미할당",
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
