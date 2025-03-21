from pydantic_settings import BaseSettings
from typing import List
from functools import lru_cache
from datetime import timedelta

class Settings(BaseSettings):
    # App settings
    PROJECT_NAME: str = "CVEHub"
    VERSION: str = "1.0.0"
    CORS_ORIGINS: List[str] = ["*"]

    # Database settings
    MONGODB_URL: str
    DATABASE_NAME: str = "cvehub"
    MAX_CONNECTIONS_COUNT: int = 10
    MIN_CONNECTIONS_COUNT: int = 1

    # JWT settings
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Timezone settings
    TZ: str = "Asia/Seoul"
    TIMEZONE: str = "Asia/Seoul"
    DATETIME_FORMAT: str = "%Y-%m-%d %H:%M:%S"

    # WebSocket settings
    WS_PING_INTERVAL: int = 30
    WS_PING_TIMEOUT: int = 10
    WS_CLOSE_TIMEOUT: int = 5
    LOG_PING_PONG: bool = False
    
    # 데이터 디렉토리 설정 추가
    DATA_DIR: str = "data"

    # Redis settings
    REDIS_URL: str = "redis://redis:6379/0"

    class Config:
        env_prefix = ""
        env_file = ".env"
        case_sensitive = True
        extra = "allow"

    @property
    def REFRESH_TOKEN_EXPIRE_DELTA(self) -> timedelta:
        """리프레시 토큰 만료 기간을 timedelta로 반환"""
        return timedelta(days=self.REFRESH_TOKEN_EXPIRE_DAYS)

@lru_cache()
def get_settings() -> Settings:
    return Settings()
