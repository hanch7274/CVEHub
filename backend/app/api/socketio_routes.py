from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import Optional, Dict
import logging
import json
import traceback
from datetime import datetime
from zoneinfo import ZoneInfo
from ..core.socketio_manager import socketio_manager
from ..core.auth import get_current_user, verify_token
from ..models.user import User
from pydantic import BaseModel
import socketio

router = APIRouter()
logger = logging.getLogger(__name__)

# Socket.IO ASGI 앱 생성
sio_app = socketio.ASGIApp(socketio_manager.sio)

# Socket.IO 인증 미들웨어
@socketio_manager.sio.event
async def connect(sid, environ, auth):
    """Socket.IO 연결 인증 처리"""
    try:        
        # 인증 데이터에서 토큰 추출
        token = None
        client_info = f"SID: {sid}"
        
        # 1. auth 객체에서 토큰 추출 시도
        if auth and isinstance(auth, dict):
            token = auth.get('token')
            
            # Bearer 토큰 형식 처리
            if token and token.startswith('Bearer '):
                token = token.replace('Bearer ', '')
                logger.debug(f"Bearer 토큰 형식 감지 및 처리 완료")
        
        # 2. HTTP 헤더에서 토큰 추출 시도 (extraHeaders 사용 시)
        if not token and 'HTTP_AUTHORIZATION' in environ:
            auth_header = environ['HTTP_AUTHORIZATION']
            if auth_header.startswith('Bearer '):
                token = auth_header.replace('Bearer ', '')
                logger.debug(f"HTTP 헤더에서 Bearer 토큰 추출 완료")
        
        if not token:
            logger.warning(f"인증 토큰 누락 - {client_info}")
            await socketio_manager.sio.emit('error', {
                "message": "인증 토큰이 필요합니다.",
                "code": "missing_token"
            }, room=sid)
            return False
        
        # 토큰 디버깅 (토큰 앞/뒤 부분만 로깅)
        token_prefix = token[:15] if len(token) > 30 else token[:5]
        token_suffix = token[-15:] if len(token) > 30 else token[-5:]
        logger.debug(f"인증 토큰 시작: {token_prefix}... 끝: ...{token_suffix}")
        
        # 토큰 검증
        try:
            user = await verify_token(token)
            if not user:
                logger.warning(f"유효하지 않은 토큰 - {client_info}")
                await socketio_manager.sio.emit('error', {
                    "message": "유효하지 않은 토큰입니다.",
                    "code": "invalid_token"
                }, room=sid)
                return False
                
            # 토큰 검증 성공 시 사용자 정보 로깅
            logger.debug(f"토큰 검증 성공 - 사용자: {user.email} (ID: {user.id})")
            
        except Exception as token_error:
            logger.error(f"토큰 검증 중 예외 발생: {str(token_error)}")
            logger.error(f"예외 상세 정보: {traceback.format_exc()}")
            await socketio_manager.sio.emit('error', {
                "message": "토큰 검증 중 오류가 발생했습니다.",
                "code": "token_verification_error",
                "details": str(token_error)
            }, room=sid)
            return False
        
        user_id = str(user.id)
        username = user.username
        
        # 사용자 연결 정보 등록
        socketio_manager.register_user_connection(user_id, sid)
        logger.info(f"사용자 연결 등록 완료 - 사용자: {username} (ID: {user_id}, SID: {sid})")
        
        # 연결 성공 메시지 전송
        await socketio_manager.sio.emit('connect_ack', {
            "status": "connected",
            "user_id": user_id,
            "username": username,
            "timestamp": datetime.now(ZoneInfo("Asia/Seoul")).isoformat()
        }, room=sid)
        
        logger.info(f"Socket.IO 연결 성공 - 사용자: {username} (ID: {user_id}, SID: {sid})")
        return True
        
    except Exception as e:
        logger.error(f"Socket.IO 연결 처리 중 예외 발생: {str(e)}")
        logger.error(f"예외 상세 정보: {traceback.format_exc()}")
        
        # 클라이언트에 오류 메시지 전송
        try:
            await socketio_manager.sio.emit('error', {
                "message": "서버 오류가 발생했습니다.",
                "code": "server_error",
                "details": str(e)
            }, room=sid)
        except Exception as emit_error:
            logger.error(f"오류 메시지 전송 중 추가 예외 발생: {str(emit_error)}")
        
        return False

# 세션 구독 정리 요청 모델
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
        
        # Socket.IO 매니저를 통해 세션 구독 정리
        await socketio_manager.unsubscribe_session_cves(session_id, user_id)
        
        # 현재 연결 정보 조회
        connection_info = await socketio_manager.get_connection_info(user_id)
        
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
