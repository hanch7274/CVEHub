from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query, status, Request
from typing import Optional, Dict
import logging
from ..core.websocket import ConnectionManager
from ..core.auth import get_current_user, verify_token, create_access_token
from ..models.user import User

router = APIRouter()
manager = ConnectionManager()
logger = logging.getLogger(__name__)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    user = None
    
    try:
        # 토큰 검증
        if not token:
            await websocket.accept()
            await websocket.send_json({"type": "error", "detail": "Authentication token missing"})
            await websocket.close(code=1008)
            return
        
        user = await verify_token(token)
        if not user:
            await websocket.accept()
            await websocket.send_json({"type": "error", "detail": "Invalid token"})
            await websocket.close(code=1008)
            return
        
        user_id = str(user.id)
        
        # 웹소켓 연결
        await manager.connect(websocket, user_id)
        
        try:
            # 메시지 처리 루프
            while True:
                data = await websocket.receive_json()
                await manager.handle_message(websocket, user_id, data)
        except WebSocketDisconnect:
            logger.info(f"Client disconnected: {user_id}")
        finally:
            await manager.disconnect(user_id, websocket)
    except Exception as e:
        logger.error(f"WebSocket Error: {str(e)}")
        if user:
            await manager.disconnect(str(user.id), websocket)

# 새로운 클린업 엔드포인트 추가
@router.post("/cleanup-orphaned-subscriptions")
async def cleanup_orphaned_subscriptions(
    request: Request,
    session_id: str,
    user_id: str,
    current_user = Depends(get_current_user)
):
    """
    비정상 종료된 세션의 구독 정보를 정리하는 API 엔드포인트
    
    클라이언트가 비정상적으로 종료된 경우 활성화된 구독을 정리합니다.
    """
    client_ip = request.client.host
    logger.info(f"세션 클린업 요청 - 세션: {session_id}, 사용자: {user_id}, IP: {client_ip}")
    
    # 사용자 권한 검증: 요청한 사용자 ID와 로그인한 사용자 ID가 일치해야 함
    if str(current_user.id) != user_id:
        logger.warning(f"권한 오류: 사용자 {current_user.id}가 다른 사용자 {user_id}의 세션을 정리하려고 시도")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="다른 사용자의 세션을 정리할 권한이 없습니다."
        )
    
    # 현재는 해당 사용자의 모든 CVE 구독을 해제하는 방식으로 처리
    # 실제로는 특정 세션 ID에 해당하는 구독만 해제하는 것이 더 정확하지만, 
    # 현재 코드 구조상 세션 ID 추적이 구현되어 있지 않으므로 사용자 ID 기준으로 처리
    try:
        await manager._unsubscribe_all_cves(user_id)
        return {
            "status": "success", 
            "message": f"사용자 {user_id}의 모든 구독이 정리되었습니다.", 
            "session_id": session_id
        }
    except Exception as e:
        logger.error(f"구독 정리 중 오류 발생: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"구독 정리 중 오류가 발생했습니다: {str(e)}"
        )
