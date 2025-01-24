from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Query, Depends
from ..routes.auth import get_current_user
from ..models.user import User
from ..core.websocket import manager
import json
import logging
from typing import Optional
import uuid

router = APIRouter()
logger = logging.getLogger(__name__)

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
    token: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None)
):
    """웹소켓 연결을 처리하는 엔드포인트입니다."""
    if not token:
        logger.error("토큰이 제공되지 않았습니다.")
        await websocket.close(code=4001)
        return

    try:
        # 토큰 검증
        current_user = await get_current_user(token)
        if not current_user or str(current_user.id) != user_id:
            logger.error(f"토큰 검증 실패 또는 사용자 ID 불일치: {user_id}")
            await websocket.close(code=4003)
            return

        # session_id가 없으면 생성
        if not session_id:
            session_id = str(uuid.uuid4())
            logger.info(f"Generated new session ID for user {user_id}: {session_id}")

        # 웹소켓 연결
        logger.info(f"Attempting WebSocket connection for user {user_id} with session {session_id}")
        await websocket.accept()
        
        # 연결 관리자에 추가
        if not await manager.connect(websocket, user_id, session_id):
            logger.error(f"Failed to establish WebSocket connection for user {user_id}")
            await websocket.close(code=4004)
            return

        logger.info(f"WebSocket connection established for user {user_id} with session {session_id}")

        try:
            while True:
                try:
                    data = await websocket.receive_json()
                    
                    # ping 메시지 처리
                    if data.get('type') == 'ping':
                        await manager.handle_ping(websocket, user_id, session_id, data)
                        continue

                    # 기타 메시지 처리
                    message_type = data.get('type')
                    if message_type:
                        logger.info(f"Processing message type: {message_type} from user {user_id}")
                    
                except WebSocketDisconnect:
                    logger.info(f"WebSocket disconnected for user {user_id}")
                    break
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON message received from user {user_id}")
                    continue
                except Exception as e:
                    logger.error(f"Error processing message: {str(e)}")
                    continue

        finally:
            await manager.disconnect(websocket, user_id, session_id)
            logger.info(f"Cleaned up WebSocket connection for user {user_id}")

    except Exception as e:
        logger.error(f"Error in websocket connection: {str(e)}")
        try:
            await websocket.close(code=4000)
        except:
            pass
        if session_id:
            await manager.disconnect(websocket, user_id, session_id)