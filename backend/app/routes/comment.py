from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException, Depends
from ..models.cve import CVEModel, Comment
from ..auth.user import get_current_user

router = APIRouter()

@router.post("/cve/{cve_id}/comments")
async def add_comment(
    cve_id: str,
    content: str,
    current_user: str = Depends(get_current_user)
):
    """새로운 댓글을 추가합니다."""
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        raise HTTPException(status_code=404, detail="CVE not found")

    comment = Comment(
        content=content,
        author=current_user,
        createdAt=datetime.now()
    )
    
    cve.comments.append(comment)
    await cve.save()
    
    return comment

@router.get("/cve/{cve_id}/comments")
async def get_comments(cve_id: str):
    """CVE의 모든 댓글을 조회합니다."""
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        raise HTTPException(status_code=404, detail="CVE not found")
    
    return cve.comments

@router.put("/cve/{cve_id}/comments/{comment_index}")
async def update_comment(
    cve_id: str,
    comment_index: int,
    content: str,
    current_user: str = Depends(get_current_user)
):
    """기존 댓글을 수정합니다."""
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        raise HTTPException(status_code=404, detail="CVE not found")
    
    if comment_index < 0 or comment_index >= len(cve.comments):
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # 자신의 댓글만 수정 가능
    if cve.comments[comment_index].author != current_user:
        raise HTTPException(
            status_code=403,
            detail="You can only edit your own comments"
        )
    
    cve.comments[comment_index].content = content
    cve.comments[comment_index].updatedAt = datetime.now()
    cve.comments[comment_index].isEdited = True
    
    await cve.save()
    return cve.comments[comment_index]

@router.delete("/cve/{cve_id}/comments/{comment_index}")
async def delete_comment(
    cve_id: str,
    comment_index: int,
    current_user: str = Depends(get_current_user)
):
    """댓글을 삭제합니다."""
    cve = await CVEModel.find_one({"cveId": cve_id})
    if not cve:
        raise HTTPException(status_code=404, detail="CVE not found")
    
    if comment_index < 0 or comment_index >= len(cve.comments):
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # 자신의 댓글만 삭제 가능
    if cve.comments[comment_index].author != current_user:
        raise HTTPException(
            status_code=403,
            detail="You can only delete your own comments"
        )
    
    deleted_comment = cve.comments.pop(comment_index)
    await cve.save()
    
    return {"message": "Comment deleted successfully"}
