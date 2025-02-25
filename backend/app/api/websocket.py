from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException, status
from ..core.websocket import manager
from ..core.auth import verify_token
import logging
import json

router = APIRouter()
logger = logging.getLogger(__name__)

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    user_id = None
    try:
        logger.info(f"WebSocket connection attempt with token: {token[:10]}...")
        user = await verify_token(token)
        if not user:
            logger.error("Invalid token")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        user_id = str(user.id)
        logger.info(f"Token verified for user: {user.email}")

        await websocket.accept()
        
        if not await manager.connect(websocket, user_id):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        while True:
            message = await websocket.receive_json()
            await manager.handle_message(websocket, user_id, message)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user: {user_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
    finally:
        if user_id:
            await manager.disconnect(user_id, websocket)
