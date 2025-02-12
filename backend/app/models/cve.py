from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime
from zoneinfo import ZoneInfo

# 모델 클래스의 timestamp 필드 정의
class CVEBase(BaseModel):
    created_at: Optional[str] = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S'))
    updated_at: Optional[str] = Field(default_factory=lambda: datetime.now(ZoneInfo("Asia/Seoul")).strftime('%Y-%m-%d %H:%M:%S')) 