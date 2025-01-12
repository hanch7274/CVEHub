from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from app.models.cve import CVEModel, PoC, SnortRule, Reference, ModificationHistory
from datetime import datetime
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
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "미할당"
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

class PatchCVERequest(BaseModel):
    cveId: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    affectedProducts: Optional[List[str]] = None
    references: Optional[List[Reference]] = None
    pocs: Optional[List[CreatePoCRequest]] = None
    snortRules: Optional[List[CreateSnortRuleRequest]] = None

    class Config:
        extra = "allow"  # 추가 필드 허용

async def create_single_cve(
    cve_data: CreateCVERequest,
    current_user: str = "anonymous",
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
            title=cve_data.title,
            description=cve_data.description,
            affectedProducts=cve_data.affectedProducts,
            references=cve_data.references,
            pocs=pocs,
            snortRules=snort_rules,
            publishedDate=current_time,
            status=cve_data.status,  
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
    current_user: str = "anonymous",
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

@router.get("/", response_model=List[CVEModel])
async def get_cves(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = None
):
    """모든 CVE를 조회합니다."""
    query = {}
    if status:
        query["status"] = status
    
    try:
        cves = await CVEModel.find(query).skip(skip).limit(limit).to_list()
        return cves
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{cve_id}", response_model=CVEModel)
async def get_cve(cve_id: str):
    """특정 CVE를 조회합니다."""
    try:
        cve = await CVEModel.find_one({"cveId": cve_id})
        if not cve:
            raise HTTPException(
                status_code=404,
                detail=f"CVE with ID {cve_id} not found"
            )
        return cve
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=CVEModel)
async def create_cve(
    cve_data: CreateCVERequest,
    crawler_name: Optional[str] = None,
    is_crawler: bool = False
):
    """단일 CVE를 생성합니다."""
    cve, error = await create_single_cve(
        cve_data=cve_data,
        current_user="anonymous",
        is_crawler=is_crawler,
        crawler_name=crawler_name
    )
    
    if error:
        raise HTTPException(status_code=400, detail=error["error"])
    return cve

@router.patch("/{cve_id}", response_model=CVEModel)
async def patch_cve(
    cve_id: str,
    cve_data: PatchCVERequest,
    crawler_name: Optional[str] = None,
    is_crawler: bool = False
):
    """CVE를 부분 업데이트합니다."""
    try:
        print(f"Received PATCH request for CVE {cve_id}")
        print(f"Request data: {cve_data.dict()}")
        
        # 1. CVE 존재 여부 확인
        existing_cve = await CVEModel.find_one({"cveId": cve_id})
        if not existing_cve:
            raise HTTPException(
                status_code=404,
                detail=f"CVE with ID {cve_id} not found"
            )

        # 2. 업데이트할 데이터 준비
        update_data = cve_data.dict(exclude_unset=True, exclude={"cveId"})
        print(f"Update data after processing: {update_data}")
        
        if not update_data:
            return existing_cve

        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
        modifier = f"{crawler_name} (Crawler)" if is_crawler else "anonymous"

        # 3. 기본 필드 업데이트
        if "title" in update_data:
            existing_cve.title = update_data["title"]
        if "description" in update_data:
            existing_cve.description = update_data["description"]
        if "status" in update_data:
            existing_cve.status = update_data["status"]
        if "affectedProducts" in update_data:
            existing_cve.affectedProducts = update_data["affectedProducts"]
        if "references" in update_data:
            existing_cve.references = update_data["references"]
        
        # 4. PoC와 Snort Rule 처리
        if "pocs" in update_data:
            pocs = update_data["pocs"]
            for poc in pocs:
                poc_data = PoC(
                    source=poc.get("source", "Etc"),
                    url=poc.get("url", ""),
                    description=poc.get("description"),
                    dateAdded=current_time,
                    addedBy=modifier
                )
                existing_cve.pocs.append(poc_data)

        if "snortRules" in update_data:
            rules = update_data["snortRules"]
            for rule in rules:
                rule_data = SnortRule(
                    rule=rule.get("rule", ""),
                    type=rule.get("type", "사용자 정의"),
                    description=rule.get("description"),
                    dateAdded=current_time,
                    addedBy=modifier
                )
                existing_cve.snortRules.append(rule_data)

        # 5. 수정 이력 추가
        if not hasattr(existing_cve, "modificationHistory"):
            existing_cve.modificationHistory = []
            
        modification = ModificationHistory(
            modifiedBy=modifier,
            modifiedAt=current_time,
            modifiedFields=list(update_data.keys())
        )
        existing_cve.modificationHistory.append(modification)

        # 6. 저장
        await existing_cve.save()
        
        # 7. 업데이트된 CVE 반환
        updated_cve = await CVEModel.find_one({"cveId": cve_id})
        if not updated_cve:
            raise HTTPException(status_code=500, detail="Failed to update CVE")
        
        return updated_cve

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        print(f"Error updating CVE: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )

@router.post("/{cve_id}/poc", response_model=CVEModel)
async def add_poc(cve_id: str, poc: CreatePoCRequest):
    try:
        cve = await CVEModel.find_one({"cveId": cve_id})
        if not cve:
            raise HTTPException(status_code=404, detail="CVE not found")
        
        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
        new_poc = PoC(
            **poc.dict(),
            dateAdded=current_time,
            addedBy="anonymous"
        )
        
        cve.pocs.append(new_poc)
        await cve.save()
        return cve
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{cve_id}/snort-rule", response_model=CVEModel)
async def add_snort_rule(cve_id: str, rule: CreateSnortRuleRequest):
    try:
        cve = await CVEModel.find_one({"cveId": cve_id})
        if not cve:
            raise HTTPException(status_code=404, detail="CVE not found")
        
        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
        new_rule = SnortRule(
            **rule.dict(),
            dateAdded=current_time,
            addedBy="anonymous"
        )
        
        cve.snortRules.append(new_rule)
        await cve.save()
        return cve
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/search", response_model=List[CVEModel])
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

@router.post("/bulk")
async def bulk_create_cves(
    cves_data: BulkCreateCVERequest,
):
    """여러 CVE를 일괄 생성합니다."""
    results = {
        "success": {
            "count": 0,
            "cves": []
        },
        "errors": {
            "count": 0,
            "details": []
        }
    }

    for index, cve_data in enumerate(cves_data.cves):
        cve, error = await create_single_cve(
            cve_data=cve_data,
            current_user="anonymous",
            is_crawler=True,
            crawler_name=cves_data.crawlerName
        )
        
        if error:
            error["index"] = index
            results["errors"]["details"].append(error)
            results["errors"]["count"] += 1
        else:
            results["success"]["cves"].append(cve)
            results["success"]["count"] += 1
    
    return results

@router.put("/bulk")
async def bulk_update_cves(
    cves_data: BulkUpdateCVERequest,
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

@router.put("/{cve_id}/snort-rules/{rule_index}")
async def update_snort_rule(
    cve_id: str,
    rule_index: int,
    rule_data: UpdateSnortRuleRequest,
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
        lastModifiedBy="anonymous",
        lastModifiedAt=current_time
    )
    
    # 수정 이력 추가
    modification = {
        "modifiedAt": current_time,
        "modifiedBy": "anonymous",
        "modifiedFields": ["snortRules"]
    }

    # 데이터 업데이트
    try:
        updated_cve = await CVEModel.find_one_and_update(
            {"cveId": cve_id},
            {
                "$set": {f"snortRules.{rule_index}": cve.snortRules[rule_index].dict()},
                "$push": {"modificationHistory": modification}
            },
            return_document=True
        )
        
        if not updated_cve:
            raise HTTPException(
                status_code=500,
                detail="Failed to update CVE"
            )
            
        return updated_cve.snortRules[rule_index]

    except Exception as mongo_error:
        print(f"MongoDB error: {str(mongo_error)}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(mongo_error)}"
        )

@router.delete("/{cve_id}")
async def delete_cve(
    cve_id: str,
):
    """CVE를 삭제합니다."""
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        raise HTTPException(
            status_code=404,
            detail="CVE not found"
        )
    
    await cve.delete()
    return {"message": f"CVE {cve_id} has been deleted"}
