from fastapi import APIRouter, HTTPException, Query, status as http_status, Depends
from typing import List, Optional
from ..models.cve import CVEModel, PoC, SnortRule, Reference, ModificationHistory, Comment
from ..models.user import User
from datetime import datetime
from pydantic import BaseModel, Field, ValidationError
from zoneinfo import ZoneInfo
from beanie import PydanticObjectId
from ..models.notification import Notification, NotificationCreate
from ..core.auth import get_current_user, get_current_admin_user
import re
from bson import ObjectId
import traceback
import logging
from ..services.cve import CVEService
from ..core.dependencies import get_cve_service

router = APIRouter()
cve_service = CVEService()

class CreatePoCRequest(BaseModel):
    source: str
    url: str
    description: Optional[str] = None

class CreateSnortRuleRequest(BaseModel):
    rule: str
    type: str
    description: Optional[str] = None

class CreateCVERequest(BaseModel):
    cve_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "신규등록"
    published_date: datetime
    references: List[dict] = []
    pocs: List[CreatePoCRequest] = []
    snort_rules: List[CreateSnortRuleRequest] = []

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class UpdateSnortRuleRequest(BaseModel):
    rule: str
    type: str
    description: Optional[str] = None

class BulkCreateCVERequest(BaseModel):
    cves: List[CreateCVERequest]
    crawler_name: Optional[str] = None

class BulkUpdateCVERequest(BaseModel):
    cves: List[dict]
    crawler_name: Optional[str] = None

class PatchCVERequest(BaseModel):
    cve_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    references: Optional[List[Reference]] = None
    pocs: Optional[List[CreatePoCRequest]] = None
    snort_rules: Optional[List[CreateSnortRuleRequest]] = None

    class Config:
        extra = "allow"  # 추가 필드 허용

class CommentCreate(BaseModel):
    content: str
    parent_id: Optional[str] = None

    @property
    def extract_mentions(self) -> List[str]:
        """댓글 내용에서 멘션된 사용자명을 추출합니다."""
        mentions = []
        if self.content:
            # @username 패턴 찾기
            pattern = r'@(\w+)'
            mentions = list(set(re.findall(pattern, self.content)))
        return mentions

    class Config:
        json_schema_extra = {
            "example": {
                "content": "댓글 내용 @username",
                "parent_id": None
            }
        }

class CommentUpdate(BaseModel):
    content: str

    @property
    def extract_mentions(self) -> List[str]:
        """댓글 내용에서 멘션된 사용자명을 추출합니다."""
        mentions = []
        if self.content:
            # @username 패턴 찾기
            pattern = r'@(\w+)'
            mentions = list(set(re.findall(pattern, self.content)))
        return mentions

    class Config:
        json_schema_extra = {
            "example": {
                "content": "수정된 댓글 내용 @username"
            }
        }

@router.get("/")
async def get_cves(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    status: Optional[str] = None,
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE 목록을 조회합니다."""
    cves, total = await cve_service.get_cves(skip=skip, limit=limit, status=status)
    return {
        "items": cves,
        "total": total,
        "page": skip // limit + 1,
        "size": limit,
        "pages": (total + limit - 1) // limit
    }

@router.get("/{cve_id}", response_model=CVEModel)
async def get_cve(
    cve_id: str,
    cve_service: CVEService = Depends(get_cve_service)
):
    """특정 CVE를 조회합니다."""
    cve = await cve_service.get_cve(cve_id)
    if not cve:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="CVE not found"
        )
    return cve

@router.post("/", response_model=CVEModel)
async def create_cve(
    cve_data: CreateCVERequest,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """새로운 CVE를 생성합니다."""
    cve = await cve_service.create_cve(cve_data, current_user.username)
    if not cve:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Failed to create CVE"
        )
    return cve

@router.patch("/{cve_id}", response_model=CVEModel)
async def update_cve(
    cve_id: str,
    cve_data: PatchCVERequest,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE를 수정합니다."""
    cve = await cve_service.update_cve(cve_id, cve_data, current_user.username)
    if not cve:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="CVE not found"
        )
    return cve

@router.delete("/{cve_id}")
async def delete_cve(
    cve_id: str,
    current_user: User = Depends(get_current_admin_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE를 삭제합니다."""
    success = await cve_service.delete_cve(cve_id)
    if not success:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="CVE not found"
        )
    return {"message": "CVE deleted successfully"}

@router.get("/search/{query}", response_model=List[CVEModel])
async def search_cves(
    query: str,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE를 검색합니다."""
    cves, total = await cve_service.search_cves(query, skip=skip, limit=limit)
    return cves

@router.post("/{cve_id}/pocs", response_model=CVEModel)
async def add_poc(
    cve_id: str,
    poc_data: PoC,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE에 PoC를 추가합니다."""
    cve = await cve_service.add_poc(cve_id, poc_data)
    if not cve:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="CVE not found"
        )
    return cve

@router.post("/{cve_id}/snort-rules", response_model=CVEModel)
async def add_snort_rule(
    cve_id: str,
    rule_data: SnortRule,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE에 Snort Rule을 추가합니다."""
    cve = await cve_service.add_snort_rule(cve_id, rule_data)
    if not cve:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="CVE not found"
        )
    return cve
