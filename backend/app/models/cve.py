from datetime import datetime
from typing import List, Optional, Literal
from beanie import Document
from pydantic import BaseModel
from zoneinfo import ZoneInfo

class PoC(BaseModel):
    source: Literal["Etc", "Metasploit", "Nuclei-Templates"]
    url: str
    description: Optional[str] = None
    dateAdded: datetime = datetime.now(ZoneInfo("Asia/Seoul"))
    addedBy: str

class SnortRule(BaseModel):
    rule: str
    type: Literal["IPS", "ONE", "UTM", "USER_DEFINED", "EMERGING_THREATS", "SNORT_OFFICIAL"]
    description: Optional[str] = None
    dateAdded: datetime = datetime.now(ZoneInfo("Asia/Seoul"))
    addedBy: str
    lastModifiedAt: Optional[datetime] = None
    lastModifiedBy: Optional[str] = None

class Reference(BaseModel):
    url: str

class Comment(BaseModel):
    content: str
    author: str
    createdAt: datetime = datetime.now(ZoneInfo("Asia/Seoul"))
    updatedAt: Optional[datetime] = None
    isEdited: bool = False

class ModificationHistory(BaseModel):
    modifiedBy: str
    modifiedAt: datetime = datetime.now(ZoneInfo("Asia/Seoul"))

class CVEModel(Document):
    cveId: str
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "미할당"  # 미할당, 분석중, 분석완료, 대응완료
    assignedTo: Optional[str] = None
    publishedDate: datetime
    lastModifiedDate: datetime = datetime.now(ZoneInfo("Asia/Seoul"))
    createdAt: datetime = datetime.now(ZoneInfo("Asia/Seoul"))
    createdBy: str
    modificationHistory: List[ModificationHistory] = []
    pocs: List[PoC] = []
    snortRules: List[SnortRule] = []
    references: List[Reference] = []
    comments: List[Comment] = []  # 댓글 필드 추가
    notes: Optional[str] = None
    
    # 편집 잠금 관련 필드
    isLocked: bool = False
    lockedBy: Optional[str] = None
    lockTimestamp: Optional[datetime] = None
    lockExpiresAt: Optional[datetime] = None  # 30분 후 자동 잠금 해제

    class Settings:
        name = "cves"
        indexes = [
            "cveId",
            "status",
            "assignedTo",
            "publishedDate",
            "lastModifiedDate",
            "createdAt",
            "createdBy"
        ]

    class Config:
        json_schema_extra = {
            "example": {
                "cveId": "CVE-2023-1234",
                "title": "Buffer overflow vulnerability in Example Software",
                "description": "Buffer overflow vulnerability in Example Software",
                "status": "미할당",
                "publishedDate": datetime.now(ZoneInfo("Asia/Seoul")),
                "lastModifiedDate": datetime.now(ZoneInfo("Asia/Seoul")),
                "createdAt": datetime.now(ZoneInfo("Asia/Seoul")),
                "createdBy": "anonymous",
                "modificationHistory": [],
                "pocs": [],
                "snortRules": [],
                "references": [],
                "comments": []
            }
        }
