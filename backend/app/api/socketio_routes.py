#socketio_routes.py
from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import Optional, Dict
import logging
import json
import traceback
from datetime import datetime
from pydantic import BaseModel

# 의존성 주입을 위한 import 추가
from ..core.dependencies import get_socketio_manager, SocketIOManagerDep
from ..core.auth import get_current_user
import socketio

# 표준 라우터 생성
router = APIRouter(prefix="/socket", tags=["socket"])

# 로거 가져오기
logger = logging.getLogger(__name__)

# 세션 구독 정리 요청 모델
class CleanupRequest(BaseModel):
    session_id: str
    user_id: Optional[str] = None # 요청자 본인 ID를 기본으로 사용 가능

# --------------------------------------------------------------------------
# Socket.IO 이벤트 핸들러는 이제 SocketIOManager 클래스 내부에서 직접 처리합니다.
# 아래 connect, disconnect, ping 핸들러는 제거되었습니다.
# --------------------------------------------------------------------------

@router.post("/cleanup_subscriptions")
async def cleanup_orphaned_subscriptions(
    request: CleanupRequest,
    socketio_manager: SocketIOManagerDep, # 의존성 주입으로 SocketIOManager 가져오기
    current_user = Depends(get_current_user) # HTTP 요청은 여전히 인증 필요
):
    """세션 구독 정리 API

    사용자 세션의 고아 구독을 정리합니다. (예: 새로고침, 브라우저 종료 후 재접속 시)
    EventBus를 통해 비동기적으로 처리를 요청합니다.
    """
    user_id_to_clean = request.user_id or str(current_user.id)
    session_id_to_clean = request.session_id

    logger.info(f"세션 구독 정리 요청 수신 - 요청자: {current_user.id}, 대상 사용자: {user_id_to_clean}, 세션: {session_id_to_clean}")

    try:
        # 요청 검증
        if not session_id_to_clean:
            logger.warning(f"세션 ID 없는 정리 요청 - 요청자: {current_user.id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="세션 ID가 필요합니다."
            )

        # 이벤트 버스를 통해 세션 정리 이벤트 발행
        # 실제 정리는 이벤트 버스를 구독하는 핸들러가 수행합니다.
        await socketio_manager.event_bus.emit('session_cleanup', {
            'session_id': session_id_to_clean,
            'user_id': user_id_to_clean # 어떤 사용자의 세션인지 명시
        })

        # --- 제거된 부분 ---
        # 아래 직접 호출은 이벤트 버스 핸들러와 중복될 수 있으므로 제거합니다.
        # 이벤트 기반 아키텍처에서는 이벤트 발행 후 핸들러가 처리하도록 합니다.
        # await socketio_manager.unsubscribe_session_cves(session_id_to_clean, user_id_to_clean)
        # logger.debug(f"세션 구독 정리 직접 호출 완료 (이벤트 발행 후) - 사용자: {user_id_to_clean}, 세션: {session_id_to_clean}")
        # --- 제거된 부분 끝 ---

        logger.info(f"세션 구독 정리 이벤트 발행 완료 - 대상 사용자: {user_id_to_clean}, 세션: {session_id_to_clean}")
        return {
            "success": True,
            "message": "세션 구독 정리 요청이 발행되었습니다.",
            "session_id": session_id_to_clean
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

# 참고: /socket/cleanup_subscriptions 엔드포인트는 HTTP 요청이므로,
#       Socket.IO 연결 상태와는 별개로 호출될 수 있습니다.
#       EventBus 핸들러가 SocketIOManager의 상태를 안전하게 업데이트해야 합니다.