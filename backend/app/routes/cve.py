from fastapi import APIRouter, HTTPException, Query, status as http_status, Depends
from typing import List, Optional
from app.models.cve import CVEModel, PoC, SnortRule, Reference, ModificationHistory, Comment
from app.models.user import User
from datetime import datetime
from pydantic import BaseModel
from zoneinfo import ZoneInfo
from app.routes.auth import get_current_user

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
    cve_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "미할당"
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

class CreateCommentRequest(BaseModel):
    content: str
    parent_id: Optional[str] = None

class UpdateCommentRequest(BaseModel):
    content: str

async def create_single_cve(
    cve_data: CreateCVERequest,
    current_user: str = "anonymous",
    is_crawler: bool = False,
    crawler_name: Optional[str] = None
) -> tuple[Optional[CVEModel], Optional[dict]]:
    """단일 CVE를 생성하는 내부 함수"""
    try:
        # CVE ID 중복 체크
        existing_cve = await CVEModel.find_one({"cve_id": cve_data.cve_id})
        if existing_cve:
            return None, {
                "cve_id": cve_data.cve_id,
                "error": "CVE ID already exists"
            }
        
        # CVE ID 형식 검증
        if not cve_data.cve_id.startswith("CVE-") or len(cve_data.cve_id.split("-")) != 3:
            return None, {
                "cve_id": cve_data.cve_id,
                "error": "Invalid CVE ID format"
            }

        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
        creator = f"{crawler_name} (Crawler)" if is_crawler else current_user
        
        # PoC와 Snort Rule에 작성자 정보 추가
        pocs = [
            PoC(
                **poc.dict(),
                date_added=current_time,
                added_by=creator
            )
            for poc in cve_data.pocs
        ]
        
        snort_rules = [
            SnortRule(
                **rule.dict(),
                date_added=current_time,
                added_by=creator
            )
            for rule in cve_data.snort_rules
        ]
        
        new_cve = CVEModel(
            cve_id=cve_data.cve_id,
            title=cve_data.title,
            description=cve_data.description,
            references=cve_data.references,
            pocs=pocs,
            snort_rules=snort_rules,
            published_date=cve_data.published_date,
            status=cve_data.status,  
            created_at=current_time,
            created_by=creator,
            modification_history=[]
        )
        
        await new_cve.save()
        return new_cve, None
        
    except Exception as e:
        return None, {
            "cve_id": cve_data.cve_id,
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
        existing_cve = await CVEModel.find_one({"cve_id": cve_id})
        if not existing_cve:
            return None, {
                "cve_id": cve_id,
                "error": "CVE not found"
            }

        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
        modifier = f"{crawler_name} (Crawler)" if is_crawler else current_user

        # Snort Rules 업데이트
        if "snort_rules" in cve_data:
            new_rules = [
                SnortRule(
                    **rule,
                    date_added=current_time,
                    added_by=modifier
                )
                for rule in cve_data["snort_rules"]
            ]
            existing_cve.snort_rules.extend(new_rules)

        # PoC 업데이트
        if "pocs" in cve_data:
            new_pocs = [
                PoC(
                    **poc,
                    date_added=current_time,
                    added_by=modifier
                )
                for poc in cve_data["pocs"]
            ]
            existing_cve.pocs.extend(new_pocs)

        # References 업데이트
        if "references" in cve_data:
            existing_cve.references.extend(cve_data["references"])

        # 수정 이력 추가
        modification = ModificationHistory(
            modified_by=modifier,
            modified_at=current_time
        )
        existing_cve.modification_history.append(modification)

        await existing_cve.save()
        return existing_cve, None

    except Exception as e:
        return None, {
            "cve_id": cve_id,
            "error": str(e)
        }

@router.get("/")
async def get_cves(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """모든 CVE를 조회합니다."""
    try:
        # 쿼리 필터 설정
        query = {}
        if status:
            query["status"] = status

        # 총 문서 수 계산 및 CVE 목록 조회
        total = await CVEModel.find(query).count()
        cves = await CVEModel.find(query).sort(-CVEModel.last_modified_date).skip(skip).limit(limit).to_list()

        return {
            "items": cves,
            "total": total,
            "page": skip // limit + 1,
            "pages": (total + limit - 1) // limit
        }
    except Exception as e:
        print(f"Error in get_cves: {str(e)}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"CVE 목록을 가져오는 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/{cve_id}", response_model=CVEModel)
async def get_cve(cve_id: str):
    """특정 CVE를 조회합니다."""
    try:
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"CVE with ID {cve_id} not found"
            )
        return cve
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

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
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=error["error"])
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
        existing_cve = await CVEModel.find_one({"cve_id": cve_id})
        if not existing_cve:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"CVE with ID {cve_id} not found"
            )

        # 2. 업데이트할 데이터 준비
        update_data = cve_data.dict(exclude_unset=True, exclude={"cve_id"})
        
        # snort_rules가 있으면 snort_rules로 복사
        if "snort_rules" in update_data:
            update_data["snort_rules"] = update_data.pop("snort_rules")
            
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
        if "references" in update_data:
            # Reference 객체 생성 시 _id 필드 추가
            references = []
            for ref in update_data["references"]:
                if isinstance(ref, dict):
                    references.append(Reference(**ref))
                else:
                    references.append(ref)
            existing_cve.references = references
        
        # 4. PoC와 Snort Rule 처리
        if "pocs" in update_data:
            pocs = []
            for poc in update_data["pocs"]:
                if isinstance(poc, dict):
                    poc["added_by"] = modifier
                    poc["date_added"] = current_time
                    pocs.append(PoC(**poc))
                else:
                    pocs.append(poc)
            existing_cve.pocs = pocs

        if "snort_rules" in update_data:
            snort_rules = []
            for rule in update_data["snort_rules"]:
                if isinstance(rule, dict):
                    # 기존 필드 유지하면서 새로운 필드 추가
                    rule_data = {
                        "added_by": modifier,
                        "date_added": current_time,
                        "last_modified_at": current_time,
                        "last_modified_by": modifier,
                        **rule
                    }
                    snort_rules.append(SnortRule(**rule_data))
                else:
                    snort_rules.append(rule)
            existing_cve.snort_rules = snort_rules

        # 5. 수정 이력 추가
        if not hasattr(existing_cve, "modification_history"):
            existing_cve.modification_history = []
            
        modification = ModificationHistory(
            modified_by=modifier,
            modified_at=current_time
        )
        existing_cve.modification_history.append(modification)
        existing_cve.last_modified_date = current_time

        # 6. 저장
        await existing_cve.save()
        
        # 7. 업데이트된 CVE 반환
        updated_cve = await CVEModel.find_one({"cve_id": cve_id})
        if not updated_cve:
            raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update CVE")
        
        return updated_cve

    except Exception as e:
        print(f"Error updating CVE: {str(e)}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/{cve_id}/poc", response_model=CVEModel)
async def add_poc(cve_id: str, poc: CreatePoCRequest):
    try:
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="CVE not found")
        
        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
        new_poc = PoC(
            **poc.dict(),
            date_added=current_time,
            added_by="anonymous"
        )
        
        cve.pocs.append(new_poc)
        await cve.save()
        return cve
    except Exception as e:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.post("/{cve_id}/snort-rule", response_model=CVEModel)
async def add_snort_rule(cve_id: str, rule: CreateSnortRuleRequest):
    try:
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="CVE not found")
        
        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
        new_rule = SnortRule(
            **rule.dict(),
            date_added=current_time,
            added_by="anonymous"
        )
        
        cve.snort_rules.append(new_rule)
        await cve.save()
        return cve
    except Exception as e:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.get("/search", response_model=dict)
async def search_cves(
    query: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """CVE를 검색합니다."""
    try:
        # 검색 쿼리 생성
        search_query = {
            "$or": [
                {"cve_id": {"$regex": query, "$options": "i"}},
                {"title": {"$regex": query, "$options": "i"}},
                {"description": {"$regex": query, "$options": "i"}}
            ]
        }
        
        # 전체 검색 결과 수 조회
        total = await CVEModel.find(search_query).count()
        
        # CVE 목록 조회 (페이지네이션 적용)
        items = await CVEModel.find(search_query).sort(-CVEModel.last_modified_date).skip(skip).limit(limit).to_list()
        
        return {
            "total": total,
            "items": items,
            "page": skip // limit + 1,
            "pages": (total + limit - 1) // limit
        }
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"CVE 검색 중 오류가 발생했습니다: {str(e)}"
        )

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
            crawler_name=cves_data.crawler_name
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
        cve_id = cve_data.get("cve_id")
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
            crawler_name=cves_data.crawler_name
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
    cve = await CVEModel.find_one({"cve_id": cve_id})
    if not cve:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="CVE not found"
        )
    
    if rule_index >= len(cve.snort_rules):
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Snort rule not found"
        )
    
    current_time = datetime.now(ZoneInfo("Asia/Seoul"))
    
    # 규칙 업데이트
    cve.snort_rules[rule_index] = SnortRule(
        rule=rule_data.rule,
        type=rule_data.type,
        description=rule_data.description,
        date_added=cve.snort_rules[rule_index].date_added,  # 원래 추가 날짜 유지
        added_by=cve.snort_rules[rule_index].added_by,  # 원래 작성자 유지
        last_modified_at=current_time
    )
    
    # 수정 이력 추가
    modification = {
        "modified_at": current_time,
        "modified_by": "anonymous",
        "modified_fields": ["snort_rules"]
    }

    # 데이터 업데이트
    try:
        updated_cve = await CVEModel.find_one_and_update(
            {"cve_id": cve_id},
            {
                "$set": {f"snort_rules.{rule_index}": cve.snort_rules[rule_index].dict()},
                "$push": {"modification_history": modification}
            },
            return_document=True
        )
        
        if not updated_cve:
            raise HTTPException(
                status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update CVE"
            )
            
        return updated_cve.snort_rules[rule_index]

    except Exception as mongo_error:
        print(f"MongoDB error: {str(mongo_error)}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(mongo_error)}"
        )

@router.delete("/{cve_id}")
async def delete_cve(
    cve_id: str,
):
    """CVE를 삭제합니다."""
    cve = await CVEModel.find_one({"cve_id": cve_id})
    if not cve:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="CVE not found"
        )
    
    await cve.delete()
    return {"message": f"CVE {cve_id} has been deleted"}

@router.post("/{cve_id}/comments", response_model=CVEModel)
async def create_comment(
    cve_id: str,
    comment_data: CreateCommentRequest,
    current_user: User = Depends(get_current_user)
):
    """CVE에 새 댓글을 추가합니다."""
    try:
        # 1. CVE 존재 여부 확인
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"CVE {cve_id}를 찾을 수 없습니다."
            )

        # 2. 새 댓글 생성
        new_comment = Comment(
            content=comment_data.content,
            username=current_user.username,
            parent_id=comment_data.parent_id,
            created_at=datetime.now(ZoneInfo("Asia/Seoul"))
        )

        # 3. 부모 댓글이 있는 경우 depth 설정
        if comment_data.parent_id:
            parent_comment = next(
                (c for c in cve.comments if c.id == comment_data.parent_id),
                None
            )
            if not parent_comment:
                raise HTTPException(
                    status_code=http_status.HTTP_404_NOT_FOUND,
                    detail=f"부모 댓글 {comment_data.parent_id}를 찾을 수 없습니다."
                )
            new_comment.depth = parent_comment.depth + 1

        # 4. 댓글 추가 및 CVE 업데이트
        cve.comments.append(new_comment)
        current_time = datetime.now(ZoneInfo("Asia/Seoul"))
        cve.last_modified_date = current_time
        
        # 5. 수정 이력 추가
        cve.modification_history.append(
            ModificationHistory(
                modified_by=current_user.username,
                modified_at=current_time
            )
        )
        
        await cve.save()
        return cve

    except Exception as e:
        print(f"Error in create_comment: {str(e)}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"댓글 생성 중 오류가 발생했습니다: {str(e)}"
        )

@router.patch("/{cve_id}/comments/{comment_id}", response_model=CVEModel)
async def update_comment(
    cve_id: str,
    comment_id: str,
    comment_data: UpdateCommentRequest,
    current_user: dict = Depends(get_current_user)
):
    """CVE의 특정 댓글을 수정합니다."""
    try:
        # 1. CVE 존재 여부 확인
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"CVE with ID {cve_id} not found"
            )

        # 2. 댓글 찾기
        comment = next((c for c in cve.comments if c.id == comment_id), None)
        if not comment:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"Comment with ID {comment_id} not found"
            )

        # 3. 권한 확인
        if comment.username != current_user["username"]:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="You can only update your own comments"
            )

        # 4. 댓글 수정
        comment.content = comment_data.content
        comment.updated_at = datetime.now(ZoneInfo("Asia/Seoul"))
        cve.last_modified_at = datetime.now(ZoneInfo("Asia/Seoul"))
        await cve.save()

        return cve

    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/{cve_id}/comments/{comment_id}", response_model=CVEModel)
async def delete_comment(
    cve_id: str,
    comment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """CVE의 특정 댓글을 삭제합니다."""
    try:
        # 1. CVE 존재 여부 확인
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"CVE with ID {cve_id} not found"
            )

        # 2. 댓글 찾기
        comment = next((c for c in cve.comments if c.id == comment_id), None)
        if not comment:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"Comment with ID {comment_id} not found"
            )

        # 3. 권한 확인
        if comment.username != current_user["username"]:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="You can only delete your own comments"
            )

        # 4. 댓글 삭제 (실제로 삭제하지 않고 is_deleted 플래그만 설정)
        comment.is_deleted = True
        comment.updated_at = datetime.now(ZoneInfo("Asia/Seoul"))
        cve.last_modified_at = datetime.now(ZoneInfo("Asia/Seoul"))
        await cve.save()

        return cve

    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/{cve_id}/comments")
async def get_comments(cve_id: str):
    """특정 CVE의 모든 댓글을 조회합니다."""
    try:
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"CVE {cve_id}를 찾을 수 없습니다."
            )
        
        # 삭제되지 않은 댓글만 필터링
        active_comments = [c for c in cve.comments if not c.is_deleted]
        
        return {
            "comments": active_comments,  # 삭제되지 않은 댓글만 반환
            "total": len(active_comments),  # 삭제되지 않은 댓글 수
            "active_total": len(active_comments)  # 삭제되지 않은 댓글 수 (total과 동일)
        }
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"댓글 목록을 가져오는 중 오류가 발생했습니다: {str(e)}"
        )
