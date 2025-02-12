from fastapi import APIRouter, HTTPException, Query, status as http_status, Depends
from typing import List, Optional
from ..models.cve_model import CVEModel, PoC, SnortRule, Reference, ModificationHistory, Comment
from ..models.user import User
from datetime import datetime
from pydantic import BaseModel, Field, ValidationError
from zoneinfo import ZoneInfo
from beanie import PydanticObjectId
from ..models.notification import Notification, NotificationCreate
from ..core.auth import get_current_user, get_current_admin_user
from ..core.websocket import manager, DateTimeEncoder
import re
from bson import ObjectId
import traceback
import logging
from ..services.cve_service import CVEService
from ..core.dependencies import get_cve_service
import json
import asyncio
from pymongo import DESCENDING

# 로거 설정
logger = logging.getLogger(__name__)

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
    date_added: Optional[datetime] = None
    added_by: Optional[str] = None

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
            datetime: lambda v: v.replace(tzinfo=ZoneInfo("Asia/Seoul")).isoformat() if v else None
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
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

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

# KST 시간 생성 유틸리티 함수
def get_kst_now():
    return datetime.now(ZoneInfo("Asia/Seoul"))

# WebSocket 알림 전송 유틸리티 함수
async def send_cve_notification(type: str, cve: CVEModel = None, cve_id: str = None, message: str = None):
    """WebSocket을 통해 CVE 관련 알림을 전송합니다."""
    try:
        data = {
            "type": type,
            "data": {
                "message": message
            }
        }
        
        if cve:
            data["data"]["cve"] = cve.dict()
        if cve_id:
            data["data"]["cveId"] = cve_id
            
        logging.info(f"Sending WebSocket notification: {data}")
        await manager.broadcast(data)
    except Exception as ws_error:
        logging.error(f"Failed to send WebSocket notification: {str(ws_error)}")
        logging.error(traceback.format_exc())

@router.get("/", response_model=dict)
async def get_cves(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    search: str = Query(default=None),
    current_user: User = Depends(get_current_user)
):
    """CVE 목록을 페이지네이션하여 반환합니다."""
    try:
        # 검색 쿼리 구성
        query = {}
        if search:
            query = {
                "$or": [
                    {"cve_id": {"$regex": search, "$options": "i"}},
                    {"title": {"$regex": search, "$options": "i"}},
                    {"description": {"$regex": search, "$options": "i"}}
                ]
            }

        try:
            # 전체 개수 조회
            total = await CVEModel.find(query).count()
            
            # CVE 목록 조회
            cves = await CVEModel.find(
                query,
                fetch_links=False
            ).sort([
                ("last_modified_date", DESCENDING),
                ("created_at", DESCENDING)
            ]).skip(skip).limit(limit).to_list()

            # 필요한 필드만 선택하여 응답
            items = [{
                "cve_id": cve.cve_id,
                "title": cve.title,
                "status": cve.status,
                "created_at": cve.created_at,
                "description": cve.description,
                "last_modified_date": cve.last_modified_date,
                "_id": str(cve.id)
            } for cve in cves]
            
            return {
                "total": total,
                "items": items
            }
            
        except ValidationError as ve:
            logger.error(f"Validation error: {str(ve)}")
            return {
                "total": 0,
                "items": []
            }
            
    except Exception as e:
        logger.error(f"Error in get_cves: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

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
    try:
        # DateTimeEncoder를 사용하여 로깅
        logging.info(f"Received CVE creation request: {json.dumps(cve_data.dict(), indent=2, cls=DateTimeEncoder)}")
        
        cve_dict = cve_data.dict()
        current_time = datetime.now(ZoneInfo("Asia/Seoul"))

        # 필수 필드 검증
        if not cve_dict.get('cve_id'):
            raise HTTPException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="CVE ID is required"
            )

        # 기본값 설정
        cve_dict.setdefault('status', '신규등록')
        cve_dict.setdefault('created_at', current_time)
        cve_dict.setdefault('last_modified_date', current_time)
        
        # 생성자 정보 추가
        additional_data = {
            "created_by": current_user.username,
            "modification_history": [{
                "username": current_user.username,
                "modified_at": current_time,
                "changes": [{
                    "field": "status",
                    "field_name": "상태",
                    "action": "add",
                    "summary": "CVE 생성"
                }]
            }]
        }
        cve_dict.update(additional_data)

        # 서비스 호출
        cve = await cve_service.create_cve(cve_dict, current_user.username)
        if not cve:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Failed to create CVE"
            )

        return cve

    except ValidationError as ve:
        logging.error(f"Validation error: {str(ve)}")
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        logging.error(f"Error creating CVE: {str(e)}")
        logging.error(traceback.format_exc())
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.patch("/{cve_id}", response_model=CVEModel)
async def update_cve(
    cve_id: str,
    update_data: PatchCVERequest,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE를 업데이트합니다."""
    try:
        logging.info(f"Updating CVE {cve_id}")
        update_dict = update_data.dict(exclude_unset=True)
        logging.debug(f"Raw update data: {update_dict}")

        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
        changes = []

        # 업데이트 타입에 따른 변경 이력 생성
        if "pocs" in update_dict:
            old_pocs = await cve_service.get_cve(cve_id)
            old_pocs_count = len(old_pocs.pocs) if old_pocs and old_pocs.pocs else 0
            new_pocs_count = len(update_dict["pocs"])

            action = "add" if new_pocs_count > old_pocs_count else (
                "delete" if new_pocs_count < old_pocs_count else "edit"
            )
            
            action_summary = {
                "add": "PoC가 추가됨",
                "delete": "PoC가 삭제됨",
                "edit": "PoC가 수정됨"
            }

            for poc in update_dict["pocs"]:
                poc["date_added"] = current_time
                poc["added_by"] = current_user.username
            
            changes.append({
                "field": "pocs",
                "field_name": "PoC",
                "action": action,
                "detail_type": "simple",
                "summary": action_summary[action]
            })
        
        if "snort_rules" in update_dict:
            old_rules = await cve_service.get_cve(cve_id)
            old_rules_count = len(old_rules.snort_rules) if old_rules and old_rules.snort_rules else 0
            new_rules_count = len(update_dict["snort_rules"])

            action = "add" if new_rules_count > old_rules_count else (
                "delete" if new_rules_count < old_rules_count else "edit"
            )
            
            action_summary = {
                "add": "Snort Rule이 추가됨",
                "delete": "Snort Rule이 삭제됨",
                "edit": "Snort Rule이 수정됨"
            }

            for rule in update_dict["snort_rules"]:
                rule["date_added"] = current_time
                rule["added_by"] = current_user.username
            
            changes.append({
                "field": "snort_rules",
                "field_name": "Snort Rules",
                "action": action,
                "detail_type": "simple",
                "summary": action_summary[action]
            })

        if "references" in update_dict:
            old_refs = await cve_service.get_cve(cve_id)
            old_refs_count = len(old_refs.references) if old_refs and old_refs.references else 0
            new_refs_count = len(update_dict["references"])

            action = "add" if new_refs_count > old_refs_count else (
                "delete" if new_refs_count < old_refs_count else "edit"
            )
            
            action_summary = {
                "add": "Reference가 추가됨",
                "delete": "Reference가 삭제됨",
                "edit": "Reference가 수정됨"
            }

            for ref in update_dict["references"]:
                ref["date_added"] = current_time
                ref["added_by"] = current_user.username
            
            changes.append({
                "field": "references",
                "field_name": "References",
                "action": action,
                "detail_type": "simple",
                "summary": action_summary[action]
            })

        # 변경 이력 추가
        if changes:
            history_entry = {
                "username": current_user.username,
                "modified_at": current_time,
                "changes": changes
            }
            update_dict["modification_history"] = [history_entry]

        cve = await cve_service.update_cve(cve_id, update_dict, current_user)
        if not cve:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"CVE {cve_id} not found"
            )

        # WebSocket 브로드캐스트 - 발신자 ID 전달
        message = {
            "type": "cve_updated",
            "data": {
                "message": f"CVE가 업데이트되었습니다: {cve_id}",
                "cve": cve.dict()
            },
            "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')
        }
        await manager.broadcast_to_cve(cve_id, message, str(current_user.id))
        
        logger.info(f"Successfully updated CVE {cve_id}")
        return cve

    except Exception as e:
        logger.error(f"Error updating CVE {cve_id}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

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

    # WebSocket 알림 전송
    await send_cve_notification(
        type="cve_deleted",
        cve_id=cve_id,
        message=f"CVE가 삭제되었습니다: {cve_id}"
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

@router.post("/{cve_id}/lock")
async def acquire_lock(
    cve_id: str,
    current_user: User = Depends(get_current_user)
) -> dict:
    """CVE 편집 락을 획득합니다."""
    success, message = await cve_service.acquire_lock(cve_id, current_user.username)
    if not success:
        raise HTTPException(
            status_code=http_status.HTTP_423_LOCKED,
            detail=message
        )
    return {"message": "Lock acquired successfully"}

@router.delete("/{cve_id}/lock")
async def release_lock(
    cve_id: str,
    current_user: User = Depends(get_current_user)
) -> dict:
    """CVE 편집 락을 해제합니다."""
    if await cve_service.release_lock(cve_id, current_user.username):
        return {"message": "Lock released successfully"}
    raise HTTPException(
        status_code=http_status.HTTP_400_BAD_REQUEST,
        detail="Failed to release lock"
    )
