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
    type: Literal["IPS", "ONE", "UTM", "사용자 정의", "Emerging-Threats", "Snort Official"]
    description: Optional[str] = None
    dateAdded: datetime = datetime.now(ZoneInfo("Asia/Seoul"))
    addedBy: str
    lastModifiedAt: Optional[datetime] = None
    lastModifiedBy: Optional[str] = None

class Reference(BaseModel):
    source: str
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
    description: Optional[str] = None
    status: str = "unassigned"  # unassigned, in-progress, analyzed, completed
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
        
    class Config:
        json_schema_extra = {
            "example": {
                "cveId": "CVE-2023-1234",
                "description": "Buffer overflow vulnerability in Example Software",
                "status": "unassigned",
                "publishedDate": datetime.now(ZoneInfo("Asia/Seoul")),
                "createdAt": datetime.now(ZoneInfo("Asia/Seoul")),
                "createdBy": "user@example.com"
            }
        }
