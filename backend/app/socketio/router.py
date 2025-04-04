"""
소켓 관련 HTTP 엔드포인트 라우터

소켓 연결과 관련된 HTTP 엔드포인트를 제공합니다.
주로 세션 관리, 구독 정리 등의 기능을 제공합니다.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
import logging
import traceback

from .models import SessionCleanupRequest
from .service import get_socket_service
from .manager import get_socket_manager
from ..auth.service import get_current_user
from ..core.logging_utils import get_logger

# 로거 설정
logger = get_logger(__name__)

# 라우터 생성
router = APIRouter(prefix="/socket", tags=["socket"])


@router.post("/cleanup_subscriptions")
async def cleanup_orphaned_subscriptions(
    request: SessionCleanupRequest,
    current_user = Depends(get_current_user)
):
    """
    세션 구독 정리 API
    
    사용자 세션의 고아 구독을 정리합니다. (예: 새로고침, 브라우저 종료 후 재접속 시)
    
    Args:
        request: 세션 정리 요청
        current_user: 현재 인증된 사용자
        
    Returns:
        정리 결과
    """
    try:
        # 요청 검증
        user_id_to_clean = request.user_id or str(current_user.id)
        session_id_to_clean = request.session_id
        
        logger.info(f"세션 구독 정리 요청 - 요청자: {current_user.id}, 대상 사용자: {user_id_to_clean}, 세션: {session_id_to_clean}")
        
        if not session_id_to_clean:
            logger.warning(f"세션 ID 없는 정리 요청 - 요청자: {current_user.id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="세션 ID가 필요합니다."
            )
        
        # 소켓 서비스를 통해 세션 정리 처리
        socket_service = get_socket_service()
        result = await socket_service.handle_session_cleanup(
            session_id=session_id_to_clean,
            user_id=user_id_to_clean
        )
        
        if not result.get("success", False):
            error = result.get("error", {})
            logger.warning(f"세션 정리 실패 - 코드: {error.get('code')}, 메시지: {error.get('message')}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND if error.get("code") in ["SESSION_NOT_FOUND", "USER_SESSION_NOT_FOUND"] else status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error.get("message", "알 수 없는 오류")
            )
        
        logger.info(f"세션 구독 정리 완료 - 세션: {session_id_to_clean}, 정리된 CVE 수: {result.get('cleaned_cves_count', 0)}")
        return {
            "success": True,
            "message": "세션 구독 정리가 완료되었습니다.",
            "session_id": session_id_to_clean,
            "cleaned_cves_count": result.get("cleaned_cves_count", 0)
        }
        
    except HTTPException as http_exc:
        # HTTP 예외는 그대로 전달
        raise http_exc
    except Exception as e:
        logger.error(f"세션 구독 정리 요청 처리 중 오류 발생: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"세션 구독 정리 요청 처리 중 서버 오류 발생: {str(e)}"
        )


@router.get("/status")
async def get_socket_status(current_user = Depends(get_current_user)):
    """
    소켓 서버 상태 API
    
    현재 소켓 서버의 연결, 구독 통계 정보를 제공합니다.
    관리자만 접근 가능합니다.
    
    Args:
        current_user: 현재 인증된 사용자
        
    Returns:
        소켓 서버 상태 정보
    """
    try:
        # 관리자 권한 확인
        if not current_user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="관리자만 접근 가능합니다."
            )
        
        # 소켓 저장소에서 통계 정보 조회
        from .repository import get_socket_repository
        socket_repository = get_socket_repository()
        stats = await socket_repository.get_stats()
        
        # 현재 사용자의 연결 정보 추가
        user_sessions = await socket_repository.get_user_sessions(str(current_user.id))
        stats["current_user_sessions"] = len(user_sessions)
        stats["current_user_sessions_list"] = [session.dict() for session in user_sessions]
        
        return {
            "success": True,
            "stats": stats
        }
        
    except HTTPException as http_exc:
        # HTTP 예외는 그대로 전달
        raise http_exc
    except Exception as e:
        logger.error(f"소켓 상태 조회 중 오류 발생: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"소켓 상태 조회 중 서버 오류 발생: {str(e)}"
        )
