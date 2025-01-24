from functools import lru_cache
from pydantic_settings import BaseSettings

class DatabaseSettings(BaseSettings):
    """데이터베이스 설정"""
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "cvehub"
    
    # 연결 설정
    MAX_CONNECTIONS_COUNT: int = 10
    MIN_CONNECTIONS_COUNT: int = 1
    
    # 타임아웃 설정
    CONNECT_TIMEOUT_MS: int = 20000
    SOCKET_TIMEOUT_MS: int = 20000
    SERVER_SELECTION_TIMEOUT_MS: int = 20000
    
    # 인덱스 설정
    AUTO_CREATE_INDEXES: bool = True
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # 추가 필드 허용
    
    def get_mongodb_settings(self) -> dict:
        """MongoDB 클라이언트 설정을 반환합니다."""
        return {
            "maxPoolSize": self.MAX_CONNECTIONS_COUNT,
            "minPoolSize": self.MIN_CONNECTIONS_COUNT,
            "connectTimeoutMS": self.CONNECT_TIMEOUT_MS,
            "socketTimeoutMS": self.SOCKET_TIMEOUT_MS,
            "serverSelectionTimeoutMS": self.SERVER_SELECTION_TIMEOUT_MS,
        }

@lru_cache()
def get_db_settings() -> DatabaseSettings:
    """데이터베이스 설정을 반환합니다."""
    return DatabaseSettings()
