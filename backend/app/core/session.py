from fastapi import HTTPException, status, Depends, Request
from fastapi.security import APIKeyCookie
from fastapi_sessions.backends.implementations import InMemoryBackend
from uuid import UUID
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

# 세션 데이터 모델
class SessionData(BaseModel):
    username: str
    email: str
    is_admin: bool = False

# 세션 백엔드 초기화
backend = InMemoryBackend[str, SessionData]()

# 세션 쿠키 설정
cookie_sec = APIKeyCookie(name="session_id", auto_error=False)

async def get_session_data(
    session_id: str = Depends(cookie_sec)
) -> SessionData:
    """현재 세션의 사용자 데이터를 반환합니다."""
    if not session_id:
        logger.error("No session cookie found")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    try:
        session_data = await backend.read(session_id)
        if not session_data:
            logger.error(f"Invalid session: {session_id}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid session"
            )
        return session_data
    except Exception as e:
        logger.error(f"Session verification error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session verification failed"
        )
