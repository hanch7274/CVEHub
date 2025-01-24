from functools import lru_cache
from pydantic_settings import BaseSettings
from datetime import timedelta
from typing import Optional

class AuthSettings(BaseSettings):
    """인증 관련 설정"""
    # 토큰 설정
    SECRET_KEY: str = "your-secret-key-here"  # 실제 운영 환경에서는 안전한 키로 변경
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # 비밀번호 해싱 설정
    PWD_HASH_ALGORITHM: str = "bcrypt"
    PWD_SALT_ROUNDS: int = 12
    
    # 토큰 관련 URL
    TOKEN_URL: str = "/auth/token"
    REFRESH_TOKEN_URL: str = "/auth/refresh"
    
    @property
    def ACCESS_TOKEN_EXPIRE_DELTA(self) -> timedelta:
        """액세스 토큰 만료 시간을 반환합니다."""
        return timedelta(minutes=self.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    @property
    def REFRESH_TOKEN_EXPIRE_DELTA(self) -> timedelta:
        """리프레시 토큰 만료 시간을 반환합니다."""
        return timedelta(days=self.REFRESH_TOKEN_EXPIRE_DAYS)
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # 추가 필드 허용

@lru_cache()
def get_auth_settings() -> AuthSettings:
    """인증 설정을 반환합니다."""
    return AuthSettings()
