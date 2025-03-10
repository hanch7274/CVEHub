from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query, status, Request
from typing import Optional, Dict
import logging
import json
import traceback
from starlette.websockets import WebSocketState
from datetime import datetime
from zoneinfo import ZoneInfo
from ..core.websocket import ConnectionManager, manager
from ..core.auth import get_current_user, verify_token, create_access_token
from ..models.user import User
import asyncio
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger(__name__)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    user = None
    client_info = f"IP: {websocket.client.host}, PORT: {websocket.client.port}"
    
    try:
        logger.info(f"웹소켓 연결 요청 - {client_info}")
        
        # 토큰 검증
        if not token:
            logger.warning(f"인증 토큰 누락 - {client_info}")
            await websocket.accept()
            await websocket.send_json({"type": "error", "detail": "Authentication token missing"})
            await websocket.close(code=1008)
            return
        
        # 토큰 디버깅 (토큰 앞/뒤 부분만 로깅)
        token_prefix = token[:15] if len(token) > 30 else token[:5]
        token_suffix = token[-15:] if len(token) > 30 else token[-5:]
        logger.debug(f"인증 토큰 시작: {token_prefix}... 끝: ...{token_suffix}")
        
        user = await verify_token(token)
        if not user:
            logger.warning(f"유효하지 않은 토큰 - {client_info}")
            await websocket.accept()
            await websocket.send_json({"type": "error", "detail": "Invalid token"})
            await websocket.close(code=1008)
            return
        
        user_id = str(user.id)
        logger.info(f"토큰 검증 성공 - 사용자: {user_id}, 이메일: {user.email}, {client_info}")
        
        # 웹소켓 연결
        connection_result = await manager.connect(websocket, user_id)
        if not connection_result:
            logger.warning(f"연결 거부됨 - 사용자: {user_id}, {client_info}")
            await websocket.close(code=1008)
            return
            
        logger.info(f"웹소켓 연결 성공 - 사용자: {user_id}, {client_info}")
        
        # 연결 확인 메시지 전송
        try:
            # 연결 확인 메시지 생성
            connection_info = await manager.get_connection_info(user_id)
            
            connect_ack_message = {
                "type": "connect_ack",
                "data": {
                    "user_id": user_id,
                    "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S'),
                    "connection_info": connection_info,
                    "message": "서버 연결이 성공적으로 수락되었습니다."
                }
            }
            
            # 연결 상태 확인 후 즉시 메시지 전송 (asyncio.create_task 사용하지 않음)
            if websocket.client_state == WebSocketState.CONNECTED:
                try:
                    await websocket.send_json(connect_ack_message)
                    logger.info(f"connect_ack 메시지 전송 성공 - 사용자: {user_id}")
                except Exception as send_error:
                    # 메시지 전송 실패해도 연결 자체는 계속 유지
                    logger.error(f"connect_ack 메시지 전송 중 오류 (무시됨) - 사용자: {user_id}, 오류: {str(send_error)}")
            else:
                logger.warning(f"connect_ack 메시지 전송 건너뜀 - 연결 상태: {websocket.client_state}, 사용자: {user_id}")
        except Exception as e:
            logger.error(f"connect_ack 메시지 처리 중 오류 발생: {str(e)}")
            logger.error(traceback.format_exc())
        
        try:
            # 메시지 처리 루프
            while True:
                # 30초 타임아웃 설정 (비동기적으로 타임아웃 발생 시 None 반환)
                try:
                    data = await asyncio.wait_for(websocket.receive_json(), timeout=30)
                except asyncio.TimeoutError:
                    # 타임아웃이 발생했지만 연결이 여전히 활성 상태인지 확인
                    if websocket.client_state != WebSocketState.CONNECTED:
                        logger.info(f"타임아웃 중 연결 종료 감지 - 사용자: {user_id}")
                        break
                    continue
                
                message_type = data.get("type", "unknown")
                
                if message_type not in ["ping", "pong"]:
                    logger.debug(f"웹소켓 메시지 수신 - 사용자: {user_id}, 타입: {message_type}")
                
                await manager.handle_message(websocket, user_id, data)
        except WebSocketDisconnect:
            logger.info(f"클라이언트 연결 종료 - 사용자: {user_id}, {client_info}")
        except Exception as loop_error:
            logger.error(f"메시지 처리 루프 중 오류: {str(loop_error)}")
            logger.error(traceback.format_exc())
        finally:
            logger.info(f"웹소켓 연결 정리 시작 - 사용자: {user_id}, {client_info}")
            await manager.disconnect(user_id, websocket)
            logger.info(f"웹소켓 연결 정리 완료 - 사용자: {user_id}, {client_info}")
    except Exception as e:
        error_type = e.__class__.__name__
        error_msg = str(e)
        logger.error(f"웹소켓 오류 [{error_type}] - {error_msg}")
        logger.error(traceback.format_exc())
        
        try:
            if user:
                user_id = str(user.id)
                logger.info(f"오류 발생으로 연결 정리 - 사용자: {user_id}, {client_info}")
                await manager.disconnect(str(user.id), websocket)
            else:
                logger.info(f"인증되지 않은 연결 정리 - {client_info}")
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.close(code=1011)
        except Exception as cleanup_error:
            logger.error(f"연결 정리 중 추가 오류: {str(cleanup_error)}")

## 세션 구독 정리 요청 모델
class CleanupRequest(BaseModel):
    session_id: str
    user_id: Optional[str] = None

@router.post("/cleanup-orphaned-subscriptions")
async def cleanup_orphaned_subscriptions(
    request: CleanupRequest,
    current_user = Depends(get_current_user)
):
    """
    사용자 세션의 고아 구독을 정리합니다.
    프론트엔드에서 새로 고침하거나 브라우저를 닫은 후 재접속할 때 호출됩니다.
    """
    try:
        user_id = str(current_user.id)
        session_id = request.session_id
        
        # 요청의 user_id가 현재 인증된 사용자와 일치하는지 확인
        if request.user_id and request.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="다른 사용자의 세션을 정리할 수 없습니다."
            )
        
        logger.info(f"세션 구독 정리 요청 - 사용자: {user_id}, 세션: {session_id}")
        
        # 웹소켓 매니저를 통해 세션 구독 정리
        await manager.unsubscribe_session_cves(session_id, user_id)
        
        # 현재 연결 정보 조회
        connection_info = await manager.get_connection_info(user_id)
        
        return {
            "success": True,
            "message": "세션 구독이 성공적으로 정리되었습니다.",
            "data": {
                "session_id": session_id,
                "user_id": user_id,
                "connection_info": connection_info
            }
        }
    except Exception as e:
        logger.error(f"세션 구독 정리 중 오류 발생: {str(e)}")
        logger.error(traceback.format_exc())
        
        return {
            "success": False,
            "message": f"세션 구독 정리 중 오류 발생: {str(e)}",
            "error": {
                "detail": str(e)
            }
        }
