"""
사용자 활동 모델 정의
"""
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from beanie import Document
from pydantic import BaseModel, Field
from zoneinfo import ZoneInfo
from bson import ObjectId

from ..cve.models import ChangeItem

class ActivityAction(str):
    """활동 동작 유형"""
    CREATE = "create"  # 생성
    UPDATE = "update"  # 업데이트
    DELETE = "delete"  # 삭제
    ADD = "add"       # 추가
    ASSIGN = "assign"  # 할당
    LOGIN = "login"    # 로그인
    LOGOUT = "logout"  # 로그아웃

class ActivityTargetType(str):
    """활동 대상 유형"""
    CVE = "cve"              # CVE
    POC = "poc"              # PoC
    SNORT_RULE = "snort_rule"  # Snort 규칙
    REFERENCE = "reference"    # 참조 문서
    COMMENT = "comment"        # 댓글
    USER = "user"              # 사용자
    SYSTEM = "system"          # 시스템

class UserActivity(Document):
    """사용자 활동 모델"""
    username: str = Field(..., description="활동을 수행한 사용자명")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    action: str = Field(..., description="수행한 동작")
    target_type: str = Field(..., description="대상 유형")
    target_id: str = Field(..., description="대상 ID (CVE ID, 댓글 ID 등)")
    target_title: Optional[str] = Field(None, description="대상 제목 또는 요약 (검색 및 표시 용도)")
    changes: List[ChangeItem] = Field(default_factory=list, description="변경 사항 목록 (모든 변경 내역 및 컨텍스트 정보 포함)")

    class Settings:
        name = "user_activities"
        use_state_management = True
        indexes = [
            "username",  # 사용자명 인덱스
            "target_type",  # 대상 유형 인덱스
            "target_id",  # 대상 ID 인덱스
            "action",     # 동작 유형 인덱스
            [("timestamp", -1)],  # 타임스탬프 내림차순 인덱스
            [("username", 1), ("timestamp", -1)],  # 사용자 + 타임스탬프 복합 인덱스
            [("target_type", 1), ("target_id", 1), ("timestamp", -1)],  # 대상 유형 + ID + 타임스탬프 인덱스
            [("target_type", 1), ("action", 1), ("timestamp", -1)]  # 대상 유형 + 동작 + 타임스탬프 인덱스
        ]

class ActivityResponse(BaseModel):
    """사용자 활동 응답 모델"""
    id: str
    username: str
    timestamp: datetime
    action: str
    target_type: str
    target_id: str
    target_title: Optional[str]
    changes: List[ChangeItem]

    class Config:
        orm_mode = True
        allow_population_by_field_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class ActivityListResponse(BaseModel):
    """활동 목록 응답 모델"""
    total: int
    items: List[ActivityResponse]
    page: int = 1
    limit: int = 10
