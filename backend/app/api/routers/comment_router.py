import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from beanie import PydanticObjectId

from app.models.user import User
from app.core.auth import get_current_user
from app.schemas.comment import CommentCreate, CommentUpdate, CommentResponse
from app.services.comment_service import CommentService
from app.core.dependencies import get_notification_service
from app.services.notification import NotificationService

# 로거 설정
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/comments", tags=["comments"])

@router.post("/{cve_id}", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    cve_id: str,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service)
):
    """
    새 댓글을 생성합니다.
    
    Args:
        cve_id: 댓글을 작성할 CVE ID
        comment_data: 생성할 댓글 데이터
        current_user: 현재 인증된 사용자
        notification_service: 알림 서비스
        
    Returns:
        생성된 댓글 정보
    """
    try:
        logger.info(f"Creating comment for CVE {cve_id} by user {current_user.username}")
        
        comment, message = await CommentService.create_comment(
            cve_id=cve_id,
            content=comment_data.content,
            user=current_user,
            parent_id=comment_data.parent_id,
            mentions=comment_data.mentions
        )
        
        if not comment:
            logger.error(f"Failed to create comment: {message}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
        
        logger.info(f"Comment created successfully: {comment.id}")
        return comment
        
    except Exception as e:
        logger.error(f"Error creating comment: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"댓글 생성 중 오류가 발생했습니다: {str(e)}"
        )

@router.put("/{cve_id}/{comment_id}", response_model=CommentResponse)
async def update_comment(
    cve_id: str,
    comment_id: str,
    comment_data: CommentUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    댓글을 수정합니다.
    
    Args:
        cve_id: 댓글이 속한 CVE ID
        comment_id: 수정할 댓글 ID
        comment_data: 수정할 댓글 데이터
        current_user: 현재 인증된 사용자
        
    Returns:
        수정된 댓글 정보
    """
    try:
        logger.info(f"Updating comment {comment_id} for CVE {cve_id} by user {current_user.username}")
        
        comment, message = await CommentService.update_comment(
            cve_id=cve_id,
            comment_id=comment_id,
            content=comment_data.content,
            user=current_user
        )
        
        if not comment:
            logger.error(f"Failed to update comment: {message}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
        
        logger.info(f"Comment updated successfully: {comment_id}")
        return comment
        
    except Exception as e:
        logger.error(f"Error updating comment: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"댓글 수정 중 오류가 발생했습니다: {str(e)}"
        )

@router.delete("/{cve_id}/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    cve_id: str,
    comment_id: str,
    permanent: bool = False,
    current_user: User = Depends(get_current_user)
):
    """
    댓글을 삭제합니다.
    
    Args:
        cve_id: 댓글이 속한 CVE ID
        comment_id: 삭제할 댓글 ID
        permanent: 영구 삭제 여부 (기본값: False)
        current_user: 현재 인증된 사용자
    """
    try:
        logger.info(f"Deleting comment {comment_id} for CVE {cve_id} by user {current_user.username}")
        
        success, message = await CommentService.delete_comment(
            cve_id=cve_id,
            comment_id=comment_id,
            user=current_user,
            permanent=permanent
        )
        
        if not success:
            logger.error(f"Failed to delete comment: {message}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
        
        logger.info(f"Comment deleted successfully: {comment_id}")
        return {"message": "댓글이 성공적으로 삭제되었습니다."}
        
    except Exception as e:
        logger.error(f"Error deleting comment: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"댓글 삭제 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/{cve_id}", response_model=List[CommentResponse])
async def get_comments(cve_id: str):
    """
    CVE의 모든 댓글을 조회합니다.
    
    Args:
        cve_id: 댓글을 조회할 CVE ID
        
    Returns:
        댓글 목록
    """
    try:
        logger.info(f"Getting comments for CVE {cve_id}")
        
        comments = await CommentService.get_comments(cve_id)
        
        logger.info(f"Found {len(comments)} comments for CVE {cve_id}")
        return comments
        
    except Exception as e:
        logger.error(f"Error getting comments: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"댓글 조회 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/{cve_id}/count", response_model=int)
async def get_comment_count(cve_id: str):
    """
    CVE의 활성화된 댓글 수를 반환합니다.
    
    Args:
        cve_id: 댓글 수를 조회할 CVE ID
        
    Returns:
        활성화된 댓글 수
    """
    try:
        logger.info(f"Getting comment count for CVE {cve_id}")
        
        count = await CommentService.count_active_comments(cve_id)
        
        logger.info(f"Comment count for CVE {cve_id}: {count}")
        return count
        
    except Exception as e:
        logger.error(f"Error getting comment count: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"댓글 수 조회 중 오류가 발생했습니다: {str(e)}"
        )