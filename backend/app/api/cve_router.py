from fastapi import APIRouter, HTTPException, Query, status as http_status, Depends
from typing import List, Optional
from ..models.cve_model import CVEModel, PoC, SnortRule, Reference, ModificationHistory
from ..models.user import User
from datetime import datetime
from pydantic import BaseModel, Field, ValidationError
from zoneinfo import ZoneInfo
from pymongo import DESCENDING
from ..services.cve_service import CVEService
from ..core.dependencies import get_cve_service
from ..core.auth import get_current_user, get_current_admin_user
from ..core.websocket import manager, DateTimeEncoder
import logging
import json
import traceback

logger = logging.getLogger(__name__)
router = APIRouter()
cve_service = CVEService()

# ----- 요청 모델 정의 -----

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

class BulkUpsertCVERequest(BaseModel):
    cves: List[CreateCVERequest]
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
        extra = "allow"
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

# ----- 기존 단일 CVE API 엔드포인트 (유지) -----

@router.get("/", response_model=dict)
async def get_cves(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    search: str = Query(default=None),
    current_user: User = Depends(get_current_user)
):
    try:
        query = {}
        if search:
            query = {
                "$or": [
                    {"cve_id": {"$regex": search, "$options": "i"}},
                    {"title": {"$regex": search, "$options": "i"}},
                    {"description": {"$regex": search, "$options": "i"}}
                ]
            }
        total = await CVEModel.find(query).count()
        cves = await CVEModel.find(query, fetch_links=False).sort([
            ("last_modified_date", DESCENDING),
            ("cve_id", DESCENDING)
        ]).skip(skip).limit(limit).to_list()
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
    except Exception as e:
        logger.error(f"Error in get_cves: {str(e)}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/{cve_id}", response_model=CVEModel)
async def get_cve(
    cve_id: str,
    cve_service: CVEService = Depends(get_cve_service)
):
    cve = await cve_service.get_cve(cve_id)
    if not cve:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="CVE not found"
        )
    return cve

@router.head("/{cve_id}")
async def head_cve(
    cve_id: str,
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    CVE의 메타데이터만 반환하는 HEAD 요청 처리
    클라이언트 캐싱을 위해 Last-Modified 헤더 제공
    """
    cve = await cve_service.get_cve(cve_id)
    if not cve:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="CVE not found"
        )
    
    # FastAPI는 자동으로 응답 본문을 제외하고 헤더만 반환
    # 필요한 헤더 추가
    headers = {
        "X-Last-Modified": cve.last_modified_date.isoformat() if cve.last_modified_date else datetime.now().isoformat(),
        "Content-Type": "application/json"
    }
    
    # 빈 응답 반환 (HEAD 메서드는 본문 없음)
    from fastapi.responses import Response
    return Response(headers=headers)

@router.post("/", response_model=CVEModel)
async def create_cve(
    cve_data: CreateCVERequest,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    try:
        logger.info(f"Received CVE creation request: {json.dumps(cve_data.dict(), indent=2, cls=DateTimeEncoder)}")
        cve_dict = cve_data.dict()
        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
        if not cve_dict.get('cve_id'):
            raise HTTPException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="CVE ID is required"
            )
        cve_dict.setdefault('status', '신규등록')
        cve_dict.setdefault('created_at', current_time)
        cve_dict.setdefault('last_modified_date', current_time)
        additional_data = {
            "created_by": current_user.username,
            "modification_history": [{
                "username": current_user.username,
                "modified_at": current_time,
                "changes": [{
                    "field": "cve",
                    "field_name": "CVE",
                    "action": "add",  # use "add" instead of "create"
                    "summary": "CVE 생성"
                }]
            }]
        }
        cve_dict.update(additional_data)
        cve = await cve_service.create_cve(cve_dict, current_user.username)
        if not cve:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Failed to create CVE"
            )
        return cve
    except ValidationError as ve:
        logger.error(f"Validation error: {str(ve)}")
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(f"Error creating CVE: {str(e)}")
        logger.error(traceback.format_exc())
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
    try:
        logger.info(f"Updating CVE {cve_id}")
        update_dict = update_data.dict(exclude_unset=True)
        logger.debug(f"Raw update data: {update_dict}")
        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
        changes = []
        if "title" in update_dict:
            changes.append({
                "field": "title",
                "field_name": "제목",
                "action": "edit",  # use "edit" for update
                "detail_type": "simple",
                "summary": "제목이 변경됨"
            })
        if "description" in update_dict:
            changes.append({
                "field": "description",
                "field_name": "설명",
                "action": "edit",
                "detail_type": "simple",
                "summary": "설명이 변경됨"
            })
        if "status" in update_dict:
            changes.append({
                "field": "status",
                "field_name": "상태",
                "action": "edit",
                "detail_type": "simple",
                "summary": f"상태가 '{update_dict['status']}'(으)로 변경됨"
            })
        if "pocs" in update_dict:
            old_pocs = await cve_service.get_cve(cve_id)
            old_pocs_count = len(old_pocs.pocs) if old_pocs and old_pocs.pocs else 0
            new_pocs_count = len(update_dict["pocs"])
            action = "edit" if new_pocs_count == old_pocs_count else ("add" if new_pocs_count > old_pocs_count else "delete")
            action_summary = {
                "add": "PoC가 추가됨",
                "delete": "PoC가 삭제됨",
                "edit": "PoC가 수정됨"
            }
            if old_pocs and old_pocs.pocs:
                old_poc_map = {
                    (poc.url, poc.source): {
                        "date_added": poc.date_added,
                        "added_by": poc.added_by
                    }
                    for poc in old_pocs.pocs
                }
                for poc in update_dict["pocs"]:
                    key = (poc.get("url", ""), poc.get("source", ""))
                    if key in old_poc_map:
                        poc["date_added"] = old_poc_map[key]["date_added"]
                        poc["added_by"] = old_poc_map[key]["added_by"]
                    else:
                        poc["date_added"] = current_time
                        poc["added_by"] = current_user.username
            else:
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
            action = "edit" if new_rules_count == old_rules_count else ("add" if new_rules_count > old_rules_count else "delete")
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
            action = "edit" if new_refs_count == old_refs_count else ("add" if new_refs_count > old_refs_count else "delete")
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
        logger.error(f"Error updating CVE {cve_id}: {e}")
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
    success = await cve_service.delete_cve(cve_id)
    if not success:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="CVE not found"
        )
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
    cves, total = await cve_service.search_cves(query, skip=skip, limit=limit)
    return cves

# ----- Bulk Upsert API 엔드포인트 -----

@router.post("/bulk_upsert", response_model=dict)
async def bulk_upsert_cves(
    bulk_request: BulkUpsertCVERequest,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    다중 CVE 데이터를 한 번에 upsert (생성 또는 업데이트) 합니다.
    각 CVE 데이터에 대해, DB에 존재하면 업데이트, 존재하지 않으면 새로 생성합니다.
    modification_history의 changes에서는 add 또는 edit으로 기록됩니다.
    """
    results = {"upserted": [], "errors": []}
    for cve_data in bulk_request.cves:
        try:
            cve_dict = cve_data.dict()
            current_time = datetime.now(ZoneInfo("Asia/Seoul"))
            cve_dict.setdefault("status", "신규등록")
            cve_dict.setdefault("created_at", current_time)
            cve_dict.setdefault("last_modified_date", current_time)
            
            # 존재 여부 확인
            existing_cve = await cve_service.get_cve(cve_dict["cve_id"])
            if existing_cve:
                modification_action = "edit"
                additional_data = {
                    "last_modified_date": current_time,
                    "modification_history": [{
                        "username": current_user.username,
                        "modified_at": current_time,
                        "changes": [{
                            "field": "cve",
                            "field_name": "CVE",
                            "action": modification_action,
                            "summary": "CVE 업데이트"
                        }]
                    }]
                }
                if existing_cve.modification_history:
                    additional_data["modification_history"] = existing_cve.modification_history + additional_data["modification_history"]
                cve_dict.update(additional_data)
                cve_instance = await cve_service.update_cve(cve_dict["cve_id"], cve_dict, current_user)
                if cve_instance:
                    results["upserted"].append(cve_instance.cve_id)
                else:
                    results["errors"].append(cve_dict["cve_id"])
            else:
                modification_action = "add"
                additional_data = {
                    "created_by": current_user.username,
                    "modification_history": [{
                        "username": current_user.username,
                        "modified_at": current_time,
                        "changes": [{
                            "field": "cve",
                            "field_name": "CVE",
                            "action": modification_action,
                            "summary": "CVE 생성"
                        }]
                    }]
                }
                cve_dict.update(additional_data)
                cve_instance = await cve_service.create_cve(cve_dict, current_user.username)
                if cve_instance:
                    results["upserted"].append(cve_instance.cve_id)
                else:
                    results["errors"].append(cve_dict["cve_id"])
        except Exception as e:
            logger.error(f"Bulk upsert error for {cve_data.cve_id}: {e}")
            results["errors"].append(cve_data.cve_id)
    return results

# ----- 기타 기존 엔드포인트 (PoC 추가, Snort Rule 추가, Lock 등) -----

@router.delete("/{cve_id}")
async def delete_cve(
    cve_id: str,
    current_user: User = Depends(get_current_admin_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    success = await cve_service.delete_cve(cve_id)
    if not success:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="CVE not found"
        )
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
    cves, total = await cve_service.search_cves(query, skip=skip, limit=limit)
    return cves

# WebSocket 알림 전송 유틸리티 함수
import traceback

async def send_cve_notification(type: str, cve: Optional[CVEModel] = None, cve_id: Optional[str] = None, message: Optional[str] = None):
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
        logger.info(f"Sending WebSocket notification: {json.dumps(data)}")
        await manager.broadcast(data)
    except Exception as ws_error:
        logger.error(f"Failed to send WebSocket notification: {ws_error}")
        logger.error(traceback.format_exc())
