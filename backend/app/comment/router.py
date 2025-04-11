"""
댓글 관련 API 라우터 - CVE 라우터에서 분리
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Path, status, BackgroundTasks
from typing import List, Optional, Dict, Any, Union
import logging
import traceback
import functools

from app.auth.models import User
from app.auth.service import get_current_user
from app.comment.schemas import CommentCreate, CommentUpdate, CommentResponse
from app.comment.service import CommentService
from app.core.dependencies import get_comment_service
from app.cve.service import CVEService
from app.core.dependencies import get_cve_service
from app.core.config import get_settings
from app.cve.schemas import CVEDetailResponse

# 로거 설정
logger = logging.getLogger(__name__)

# 설정 가져오기
settings = get_settings()

# 댓글 라우터
router = APIRouter()

# 예외 타입별 HTTP 상태 코드 매핑
exception_status_map = {
    ValueError: status.HTTP_400_BAD_REQUEST,
    KeyError: status.HTTP_404_NOT_FOUND,
    IndexError: status.HTTP_404_NOT_FOUND,
    PermissionError: status.HTTP_403_FORBIDDEN,
    FileNotFoundError: status.HTTP_404_NOT_FOUND,
    NotImplementedError: status.HTTP_501_NOT_IMPLEMENTED,
}

# 예외 타입별 에러 메시지 매핑
exception_message_map = {
    ValueError: "잘못된 값이 제공되었습니다",
    KeyError: "요청한 항목을 찾을 수 없습니다",
    IndexError: "색인이 범위를 벗어났습니다",
    PermissionError: "이 작업을 수행할 권한이 없습니다",
    FileNotFoundError: "파일을 찾을 수 없습니다",
    NotImplementedError: "이 기능은 아직 구현되지 않았습니다",
}

def comment_api_error_handler(func):
    """댓글 API 엔드포인트 예외 처리 데코레이터"""
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except HTTPException:
            # FastAPI HTTP 예외는 그대로 전달
            raise
        except Exception as e:
            # 로깅
            endpoint = func.__name__
            logger.error(f"댓글 API 오류 ({endpoint}): {str(e)}")
            if "current_user" in kwargs:
                user = kwargs["current_user"]
                logger.error(f"사용자: {user.username} (ID: {user.id})")
                
            # 예외 유형에 따른 상태 코드 결정
            error_status = status.HTTP_500_INTERNAL_SERVER_ERROR
            for exc_type, status_code in exception_status_map.items():
                if isinstance(e, exc_type):
                    error_status = status_code
                    break
                    
            # 예외 유형에 따른 메시지 결정
            base_message = "서버 내부 오류가 발생했습니다"
            for exc_type, message in exception_message_map.items():
                if isinstance(e, exc_type):
                    base_message = message
                    break
            
            # 상세 오류 정보 (개발 환경에서만)
            error_detail = f"{base_message}: {str(e)}"
            if settings.DEBUG:
                error_detail = f"{error_detail}\n{traceback.format_exc()}"
                
            # 표준화된 HTTP 예외 반환
            raise HTTPException(
                status_code=error_status,
                detail=error_detail
            )
    return wrapper


@router.post("/{cve_id}/comments", response_model=CVEDetailResponse)
@comment_api_error_handler
async def create_comment(
    cve_id: str,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user),
    comment_service: CommentService = Depends(get_comment_service),
    cve_service: CVEService = Depends(get_cve_service),
    background_tasks: BackgroundTasks = None
):
    """새 댓글을 생성합니다."""
    logger.info(f"댓글 생성 요청: {cve_id}")
    
    # 현재 사용자 정보 추가
    comment_dict = comment_data.dict()
    comment_dict["created_by"] = current_user.username
    
    # 댓글 생성
    comment_id = await comment_service.create_comment(cve_id, comment_dict)
    
    # 멘션 처리 (있는 경우)
    if comment_data.mentions and len(comment_data.mentions) > 0:
        logger.info(f"댓글에서 멘션 감지: {comment_data.mentions}")
        try:
            message = f"{current_user.display_name or current_user.username}님이 댓글에서 회원님을 멘션했습니다."
            await comment_service.process_mentions(
                cve_id, 
                comment_id, 
                comment_data.content, 
                comment_data.mentions, 
                current_user.username, 
                message
            )
        except Exception as e:
            # 멘션 처리 실패는 댓글 생성 실패로 이어지지 않음
            message = f"멘션 처리 중 오류 발생: {str(e)}"
            logger.error(message)
    
    # 업데이트된 CVE 상세 정보 조회
    updated_cve = await cve_service.get_cve_detail(cve_id, current_user.username)
    
    # 응답 검증 및 로깅
    if settings.DEBUG:
        if not hasattr(updated_cve, 'comments'):
            logger.error(f"응답 검증 실패: CVE 데이터에 comments 필드가 없음")
            logger.debug(f"응답 데이터: {updated_cve}")
        else:
            comment_count = len(updated_cve.comments) if updated_cve.comments else 0
            logger.debug(f"응답 검증 성공: {comment_count}개의 댓글 포함됨")
    
    # CVE 캐시 무효화 (백그라운드 작업)
    if background_tasks:
        background_tasks.add_task(cve_service.invalidate_cve_cache, cve_id)
    
    logger.info(f"댓글 생성 성공: {comment_id}")
    return updated_cve


@router.put("/{cve_id}/comments/{comment_id}", response_model=Dict[str, str])
@comment_api_error_handler
async def update_comment(
    cve_id: str,
    comment_id: str,
    comment_data: CommentUpdate,
    current_user: User = Depends(get_current_user),
    comment_service: CommentService = Depends(get_comment_service),
    cve_service: CVEService = Depends(get_cve_service),
    background_tasks: BackgroundTasks = None
):
    """댓글을 수정합니다."""
    logger.info(f"댓글 수정 요청: {comment_id} (CVE: {cve_id})")
    
    # 현재 사용자 정보 추가
    comment_dict = comment_data.dict()
    comment_dict["last_modified_by"] = current_user.username
    
    # 댓글 수정
    success = await comment_service.update_comment(cve_id, comment_id, comment_dict, current_user.username)
    
    if not success:
        message = f"댓글 수정 실패: CVE ID {cve_id} 또는 댓글 ID {comment_id}를 찾을 수 없거나 권한이 없습니다."
        logger.error(message)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    
    # CVE 캐시 무효화 (백그라운드 작업)
    if background_tasks:
        background_tasks.add_task(cve_service.invalidate_cve_cache, cve_id)
    
    logger.info(f"댓글 수정 성공: {comment_id}")
    return {"message": "댓글이 성공적으로 수정되었습니다."}


@router.delete("/{cve_id}/comments/{comment_id}", response_model=Dict[str, str])
@comment_api_error_handler
async def delete_comment(
    cve_id: str,
    comment_id: str,
    permanent: bool = False,
    current_user: User = Depends(get_current_user),
    comment_service: CommentService = Depends(get_comment_service),
    cve_service: CVEService = Depends(get_cve_service),
    background_tasks: BackgroundTasks = None
):
    """댓글을 삭제합니다."""
    logger.info(f"댓글 삭제 요청: {comment_id} (CVE: {cve_id}, 영구삭제: {permanent})")
    
    # 댓글 삭제
    success = await comment_service.delete_comment(cve_id, comment_id, current_user.username, permanent)
    
    if not success:
        message = f"댓글 삭제 실패: CVE ID {cve_id} 또는 댓글 ID {comment_id}를 찾을 수 없거나 권한이 없습니다."
        logger.error(message)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    
    # CVE 캐시 무효화 (백그라운드 작업)
    if background_tasks:
        background_tasks.add_task(cve_service.invalidate_cve_cache, cve_id)
    
    logger.info(f"댓글 삭제 성공: {comment_id}")
    return {"message": "댓글이 성공적으로 삭제되었습니다."}


@router.get("/{cve_id}/comments", response_model=List[CommentResponse])
@comment_api_error_handler
async def get_comments(
    cve_id: str,
    current_user: User = Depends(get_current_user),
    comment_service: CommentService = Depends(get_comment_service)
):
    """CVE의 모든 댓글을 조회합니다."""
    logger.info(f"CVE {cve_id}의 댓글 조회")
    
    comments = await comment_service.get_comments(cve_id)
    
    logger.info(f"CVE {cve_id}의 댓글 {len(comments)}개 조회됨")
    return comments


@router.get("/{cve_id}/comments/count", response_model=int)
@comment_api_error_handler
async def get_comment_count(
    cve_id: str,
    current_user: User = Depends(get_current_user),
    comment_service: CommentService = Depends(get_comment_service)
):
    """CVE의 활성화된 댓글 수를 반환합니다."""
    logger.info(f"CVE {cve_id}의 댓글 수 요청")
    
    count = await comment_service.count_active_comments(cve_id)
    
    logger.info(f"CVE {cve_id}의 댓글 수: {count}")
    return count
