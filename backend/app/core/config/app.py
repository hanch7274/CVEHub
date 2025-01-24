from functools import lru_cache
from pydantic_settings import BaseSettings
from typing import List

class AppSettings(BaseSettings):
    """애플리케이션 설정"""
    APP_NAME: str = "CVEHub"
    DEBUG: bool = True
    API_V1_PREFIX: str = ""
    
    # CORS 설정
    CORS_ORIGINS: List[str] = ["*"]
    CORS_CREDENTIALS: bool = True
    CORS_METHODS: List[str] = ["*"]
    CORS_HEADERS: List[str] = ["*"]
    
    # 로깅 설정
    LOG_LEVEL: str = "DEBUG"
    LOG_FORMAT: str = "%(levelprefix)s | %(asctime)s | %(message)s"
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # 추가 필드 허용

@lru_cache()
def get_app_settings() -> AppSettings:
    """애플리케이션 설정을 반환합니다."""
    return AppSettings()
