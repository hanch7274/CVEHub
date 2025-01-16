from passlib.context import CryptContext
import logging

logger = logging.getLogger(__name__)

# 비밀번호 해싱을 위한 컨텍스트 설정
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """일반 텍스트 비밀번호와 해시된 비밀번호를 비교합니다."""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        logger.error(f"비밀번호 검증 중 오류 발생: {str(e)}")
        return False

def get_password_hash(password: str) -> str:
    """비밀번호를 해시화합니다."""
    try:
        return pwd_context.hash(password)
    except Exception as e:
        logger.error(f"비밀번호 해시화 중 오류 발생: {str(e)}")
        raise
