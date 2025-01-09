from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from app.models.cve import CVEModel, PoC, SnortRule, Reference, ModificationHistory
from datetime import datetime
from ..auth.user import get_current_user, get_current_admin_user
from pydantic import BaseModel
from zoneinfo import ZoneInfo

router = APIRouter()

class CreatePoCRequest(BaseModel):
    source: str
    url: str
    description: Optional[str] = None

class CreateSnortRuleRequest(BaseModel):
    rule: str
    type: str
    description: Optional[str] = None

class CreateCVERequest(BaseModel):
    cveId: str
    description: Optional[str] = None
    affectedProducts: List[str] = []
    references: List[dict] = []
    pocs: List[CreatePoCRequest] = []
    snortRules: List[CreateSnortRuleRequest] = []

class UpdateSnortRuleRequest(BaseModel):
    rule: str
    type: str
    description: Optional[str] = None

class BulkCreateCVERequest(BaseModel):
    cves: List[CreateCVERequest]
    crawlerName: Optional[str] = None

class BulkUpdateCVERequest(BaseModel):
    cves: List[dict]
    crawlerName: Optional[str] = None

async def create_single_cve(
    cve_data: CreateCVERequest,
    current_user: str = Depends(get_current_user),
    is_crawler: bool = False,
    crawler_name: Optional[str] = None
) -> tuple[Optional[CVEModel], Optional[dict]]:
    """단일 CVE를 생성하는 내부 함수"""
    try:
        # CVE ID 중복 체크
        existing_cve = await CVEModel.find_one({"cveId": cve_data.cveId})
        if existing_cve:
            return None, {
                "cveId": cve_data.cveId,
                "error": "CVE ID already exists"
            }
        
        # CVE ID 형식 검증
        if not cve_data.cveId.startswith("CVE-") or len(cve_data.cveId.split("-")) != 3:
            return None, {
                "cveId": cve_data.cveId,
                "error": "Invalid CVE ID format"
            }

        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
        creator = f"{crawler_name} (Crawler)" if is_crawler else current_user
        
        # PoC와 Snort Rule에 작성자 정보 추가
        pocs = [
            PoC(
                **poc.dict(),
                dateAdded=current_time,
                addedBy=creator
            )
            for poc in cve_data.pocs
        ]
        
        snort_rules = [
            SnortRule(
                **rule.dict(),
                dateAdded=current_time,
                addedBy=creator
            )
            for rule in cve_data.snortRules
        ]
        
        new_cve = CVEModel(
            cveId=cve_data.cveId,
            description=cve_data.description,
            affectedProducts=cve_data.affectedProducts,
            references=cve_data.references,
            pocs=pocs,
            snortRules=snort_rules,
            publishedDate=current_time,
            status="unassigned",
            createdAt=current_time,
            createdBy=creator,
            modificationHistory=[]
        )
        
        await new_cve.save()
        return new_cve, None
        
    except Exception as e:
        return None, {
            "cveId": cve_data.cveId,
            "error": str(e)
        }

async def update_single_cve(
    cve_id: str,
    cve_data: dict,
    current_user: str = Depends(get_current_user),
    is_crawler: bool = False,
    crawler_name: Optional[str] = None
) -> tuple[Optional[CVEModel], Optional[dict]]:
    """단일 CVE를 업데이트하는 내부 함수"""
    try:
        existing_cve = await CVEModel.find_one({"cveId": cve_id})
        if not existing_cve:
            return None, {
                "cveId": cve_id,
                "error": "CVE not found"
            }

        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
        modifier = f"{crawler_name} (Crawler)" if is_crawler else current_user

        # Snort Rules 업데이트
        if "snortRules" in cve_data:
            new_rules = [
                SnortRule(
                    **rule,
                    dateAdded=current_time,
                    addedBy=modifier
                )
                for rule in cve_data["snortRules"]
            ]
            existing_cve.snortRules.extend(new_rules)

        # PoC 업데이트
        if "pocs" in cve_data:
            new_pocs = [
                PoC(
                    **poc,
                    dateAdded=current_time,
                    addedBy=modifier
                )
                for poc in cve_data["pocs"]
            ]
            existing_cve.pocs.extend(new_pocs)

        # References 업데이트
        if "references" in cve_data:
            existing_cve.references.extend(cve_data["references"])

        # 수정 이력 추가
        modification = ModificationHistory(
            modifiedBy=modifier,
            modifiedAt=current_time
        )
        existing_cve.modificationHistory.append(modification)

        await existing_cve.save()
        return existing_cve, None

    except Exception as e:
        return None, {
            "cveId": cve_id,
            "error": str(e)
        }

@router.get("/cves", response_model=List[CVEModel])
async def get_cves(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = None
):
    query = {}
    if status:
        query["status"] = status
    
    cves = await CVEModel.find(query).skip(skip).limit(limit).to_list()
    return cves

@router.get("/cves/{cve_id}", response_model=CVEModel)
async def get_cve(cve_id: str):
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        raise HTTPException(status_code=404, detail="CVE not found")
    return cve

@router.post("/cve")
async def create_cve(
    cve_data: CreateCVERequest,
    current_user: str = Depends(get_current_user)
):
    """새로운 CVE를 생성합니다."""
    cve, error = await create_single_cve(cve_data, current_user)
    if error:
        raise HTTPException(status_code=400, detail=error["error"])
    return cve

@router.put("/cve/{cve_id}")
async def update_cve(
    cve_id: str,
    cve_data: dict,
    current_user: str = Depends(get_current_user)
):
    """CVE를 업데이트합니다."""
    cve, error = await update_single_cve(cve_id, cve_data, current_user)
    if error:
        raise HTTPException(
            status_code=404 if error["error"] == "CVE not found" else 400,
            detail=error["error"]
        )
    return cve

@router.post("/cves/{cve_id}/pocs", response_model=CVEModel)
async def add_poc(cve_id: str, poc: PoC):
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        raise HTTPException(status_code=404, detail="CVE not found")
    
    cve.pocs.append(poc)
    await cve.save()
    return cve

@router.post("/cves/{cve_id}/snort-rules", response_model=CVEModel)
async def add_snort_rule(cve_id: str, rule: SnortRule):
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        raise HTTPException(status_code=404, detail="CVE not found")
    
    cve.snortRules.append(rule)
    await cve.save()
    return cve

@router.get("/cves/search/{query}", response_model=List[CVEModel])
async def search_cves(
    query: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100)
):
    # Text search in description and cveId
    cves = await CVEModel.find(
        {
            "$or": [
                {"description": {"$regex": query, "$options": "i"}},
                {"cveId": {"$regex": query, "$options": "i"}}
            ]
        }
    ).skip(skip).limit(limit).to_list()
    
    return cves

@router.post("/cves/bulk")
async def bulk_create_cves(
    cves_data: BulkCreateCVERequest,
    current_user: str = Depends(get_current_user)
):
    """여러 CVE를 일괄 생성합니다."""
    created_cves = []
    errors = []

    for index, cve_data in enumerate(cves_data.cves):
        cve, error = await create_single_cve(
            cve_data,
            current_user,
            is_crawler=True,
            crawler_name=cves_data.crawlerName
        )
        
        if error:
            error["index"] = index
            errors.append(error)
        else:
            created_cves.append(cve)
    
    return {
        "success": {
            "count": len(created_cves),
            "cves": created_cves
        },
        "errors": {
            "count": len(errors),
            "details": errors
        }
    }

@router.put("/cves/bulk")
async def bulk_update_cves(
    cves_data: BulkUpdateCVERequest,
    current_user: str = Depends(get_current_user)
):
    """여러 CVE를 일괄 업데이트합니다."""
    updated_cves = []
    errors = []

    for index, cve_data in enumerate(cves_data.cves):
        cve_id = cve_data.get("cveId")
        if not cve_id:
            errors.append({
                "index": index,
                "error": "CVE ID is required"
            })
            continue

        cve, error = await update_single_cve(
            cve_id,
            cve_data,
            current_user,
            is_crawler=True,
            crawler_name=cves_data.crawlerName
        )
        
        if error:
            error["index"] = index
            errors.append(error)
        else:
            updated_cves.append(cve)

    return {
        "success": {
            "count": len(updated_cves),
            "cves": updated_cves
        },
        "errors": {
            "count": len(errors),
            "details": errors
        }
    }

@router.put("/cve/{cve_id}/snort-rule/{rule_index}")
async def update_snort_rule(
    cve_id: str,
    rule_index: int,
    rule_data: UpdateSnortRuleRequest,
    current_user: str = Depends(get_current_user)
):
    """특정 Snort Rule을 수정합니다."""
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        raise HTTPException(
            status_code=404,
            detail="CVE not found"
        )
    
    if rule_index >= len(cve.snortRules):
        raise HTTPException(
            status_code=404,
            detail="Snort rule not found"
        )
    
    current_time = datetime.now(ZoneInfo("Asia/Seoul"))
    
    # 규칙 업데이트
    cve.snortRules[rule_index] = SnortRule(
        rule=rule_data.rule,
        type=rule_data.type,
        description=rule_data.description,
        dateAdded=cve.snortRules[rule_index].dateAdded,  # 원래 추가 날짜 유지
        addedBy=cve.snortRules[rule_index].addedBy,  # 원래 작성자 유지
        lastModifiedBy=current_user,
        lastModifiedAt=current_time
    )
    
    # 수정 이력 추가
    modification = ModificationHistory(
        modifiedBy=current_user,
        modifiedAt=current_time
    )
    cve.modificationHistory.append(modification)
    
    await cve.save()
    return cve.snortRules[rule_index]

@router.delete("/cve/{cve_id}")
async def delete_cve(
    cve_id: str,
    current_user: str = Depends(get_current_admin_user)  # admin 권한 체크
):
    """CVE를 삭제합니다. admin 권한이 필요합니다."""
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        raise HTTPException(
            status_code=404,
            detail="CVE not found"
        )
    
    await cve.delete()
    return {"message": f"CVE {cve_id} has been deleted"}
