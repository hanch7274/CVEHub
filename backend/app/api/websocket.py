from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Optional
from ..models.user import User
from ..core.websocket import manager
from jose import JWTError, jwt
from ..core.config.auth import get_auth_settings
import logging
import asyncio
from datetime import datetime, timedelta

router = APIRouter()
logger = logging.getLogger(__name__)
auth_settings = get_auth_settings()

# ACK 타임아웃 설정
ACK_TIMEOUT = 5  # seconds

async def verify_token_from_query(token: str) -> Optional[User]:
    try:
        payload = jwt.decode(
            token,
            auth_settings.SECRET_KEY,
            algorithms=[auth_settings.ALGORITHM]
        )
        email: str = payload.get("email")
        if email is None:
            logger.error("토큰에 email 필드가 없습니다.")
            return None
            
        user = await User.find_one({"email": email})
        if not user:
            logger.error(f"사용자를 찾을 수 없습니다: {email}")
            return None
            
        return user
    except JWTError as e:
        logger.error(f"토큰 검증 중 오류: {str(e)}")
        raise Exception(f"토큰 오류: {str(e)}")

async def wait_for_ack(websocket: WebSocket, user_id: str) -> bool:
    """ACK 메시지를 기다리는 함수"""
    try:
        ack_deadline = datetime.now() + timedelta(seconds=ACK_TIMEOUT)
        while datetime.now() < ack_deadline:
            try:
                message = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=max(0.1, (ack_deadline - datetime.now()).total_seconds())
                )
                if message.get("type") == "connect_ack":
                    logger.info(f"ACK 수신 성공: user_id={user_id}")
                    return True
                logger.debug(f"예상치 못한 메시지 수신: user_id={user_id}, message={message}")
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"ACK 대기 중 오류 발생: user_id={user_id}, error={str(e)}")
                return False
        
        logger.error(f"ACK 타임아웃: user_id={user_id}")
        return False
    except Exception as e:
        logger.error(f"ACK 대기 중 예외 발생: user_id={user_id}, error={str(e)}")
        return False

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 연결을 처리하는 엔드포인트입니다."""
    user_id = None
    connection_established = False
    
    try:
        # 쿼리 파라미터에서 토큰 추출
        token = websocket.query_params.get("token")
        if not token:
            logger.error("토큰이 제공되지 않았습니다.")
            await websocket.close(code=4001)
            return

        try:
            current_user = await verify_token_from_query(token)
            if not current_user:
                logger.error("사용자 인증 실패")
                await websocket.close(code=4001)
                return
        except Exception as e:
            logger.error(f"토큰 검증 실패: {str(e)}")
            await websocket.close(code=4003, reason=str(e))
            return

        user_id = str(current_user.id)
        logger.info(f"WebSocket 인증 성공: user_id={user_id}")

        # 기존 연결이 있다면 정리
        if await manager.has_connection(user_id):
            logger.info(f"기존 연결 정리: user_id={user_id}")
            await manager.disconnect(user_id)

        # WebSocket 연결 수락
        await websocket.accept()
        connection_established = True

        # 연결 성공 메시지 전송
        await websocket.send_json({
            "type": "connected",
            "data": {
                "message": "WebSocket connection established",
                "requires_ack": True,
                "session_id": websocket.query_params.get("session_id"),
                "timestamp": datetime.now().isoformat()
            }
        })

        # ACK 대기
        if not await wait_for_ack(websocket, user_id):
            logger.error(f"ACK 수신 실패로 연결 종료: user_id={user_id}")
            if connection_established:
                await websocket.close(code=4002)
            return

        # 연결 관리자에 등록
        if not await manager.connect(websocket, user_id):
            logger.error(f"연결 관리자 등록 실패: user_id={user_id}")
            if connection_established:
                await websocket.close(code=4003)
            return

        logger.info(f"WebSocket 연결 설정 완료: user_id={user_id}")

        try:
            while True:
                data = await websocket.receive_json()
                logger.debug(f"메시지 수신: user_id={user_id}, data={data}")
                await manager.process_message(user_id, data)
        except WebSocketDisconnect:
            logger.info(f"WebSocket 연결 종료: user_id={user_id}")
        except Exception as e:
            logger.error(f"메시지 처리 중 오류: user_id={user_id}, error={str(e)}")
    except Exception as e:
        logger.error(f"WebSocket 처리 중 예외 발생: error={str(e)}")
        if user_id:
            logger.error(f"사용자 연결 처리 실패: user_id={user_id}")
    finally:
        # 연결 정리
        if user_id:
            try:
                await manager.disconnect(user_id)
                logger.info(f"연결 정리 완료: user_id={user_id}")
            except Exception as e:
                logger.error(f"연결 정리 중 오류 발생: user_id={user_id}, error={str(e)}")
        
        # WebSocket 연결이 여전히 열려있다면 종료
        if connection_established:
            try:
                await websocket.close()
            except Exception as e:
                logger.error(f"WebSocket 종료 중 오류 발생: error={str(e)}")