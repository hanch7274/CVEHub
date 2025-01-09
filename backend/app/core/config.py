from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache

class Settings(BaseSettings):
    # MongoDB 설정
    MONGODB_URL: str
    MONGODB_DB_NAME: str
    # JWT settings
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Admin account settings
    ADMIN_USERNAME: str = "admin"  # 기본값 설정
    ADMIN_EMAIL: str = "admin@cvehub.com"  # 기본값 설정
    ADMIN_PASSWORD: str = "admin123"  # 기본값 설정

    class Config:
        env_file = ".env"
        case_sensitive = True

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()
