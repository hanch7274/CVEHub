from datetime import datetime
from typing import Dict
from fastapi import APIRouter, HTTPException, Depends, Body
from ..models.cve import CVEModel, Comment
from ..auth.user import get_current_user

router = APIRouter()

@router.post("/{cve_id}/comments")
async def add_comment(
    cve_id: str,
    comment_data: Dict[str, str] = Body(...),
):
    """새로운 댓글을 추가합니다."""
    content = comment_data.get("content")
    if not content:
        raise HTTPException(status_code=400, detail="Content is required")

    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        # 대소문자를 구분하지 않는 검색 시도
        cve = await CVEModel.find_one({"$or": [{"cveId": cve_id}, {"cveId": cve_id.upper()}]})
        if not cve:
            raise HTTPException(status_code=404, detail="CVE not found")

    comment = Comment(
        content=content,
        author="anonymous",  # 임시로 anonymous로 설정
        createdAt=datetime.now()
    )
    
    if not hasattr(cve, 'comments'):
        cve.comments = []
    
    cve.comments.append(comment)
    await cve.save()
    
    return comment

@router.get("/{cve_id}/comments")
async def get_comments(cve_id: str):
    """CVE의 모든 댓글을 조회합니다."""
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        # 대소문자를 구분하지 않는 검색 시도
        cve = await CVEModel.find_one({"$or": [{"cveId": cve_id}, {"cveId": cve_id.upper()}]})
        if not cve:
            raise HTTPException(status_code=404, detail="CVE not found")
    
    if not hasattr(cve, 'comments'):
        cve.comments = []
    
    return cve.comments

@router.put("/{cve_id}/comments/{comment_index}")
async def update_comment(
    cve_id: str,
    comment_index: int,
    comment_data: Dict[str, str] = Body(...),
):
    """기존 댓글을 수정합니다."""
    content = comment_data.get("content")
    if not content:
        raise HTTPException(status_code=400, detail="Content is required")

    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        # 대소문자를 구분하지 않는 검색 시도
        cve = await CVEModel.find_one({"$or": [{"cveId": cve_id}, {"cveId": cve_id.upper()}]})
        if not cve:
            raise HTTPException(status_code=404, detail="CVE not found")
    
    if not hasattr(cve, 'comments'):
        cve.comments = []
    
    if comment_index < 0 or comment_index >= len(cve.comments):
        raise HTTPException(status_code=404, detail="Comment not found")
    
    cve.comments[comment_index].content = content
    cve.comments[comment_index].updatedAt = datetime.now()
    cve.comments[comment_index].isEdited = True
    
    await cve.save()
    return cve.comments[comment_index]

@router.delete("/{cve_id}/comments/{comment_index}")
async def delete_comment(
    cve_id: str,
    comment_index: int,
):
    """댓글을 삭제합니다."""
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        # 대소문자를 구분하지 않는 검색 시도
        cve = await CVEModel.find_one({"$or": [{"cveId": cve_id}, {"cveId": cve_id.upper()}]})
        if not cve:
            raise HTTPException(status_code=404, detail="CVE not found")
    
    if not hasattr(cve, 'comments'):
        cve.comments = []
    
    if comment_index < 0 or comment_index >= len(cve.comments):
        raise HTTPException(status_code=404, detail="Comment not found")
    
    deleted_comment = cve.comments.pop(comment_index)
    await cve.save()
    
    return {"message": "Comment deleted successfully"}
