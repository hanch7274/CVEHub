"""
자동 생성된 Comment 모델 파일 - 직접 수정하지 마세요
생성 시간: 2025-04-11 18:22:52
"""
from typing import List, Optional
from datetime import datetime
from zoneinfo import ZoneInfo
from beanie import Document
from pydantic import BaseModel, Field
from bson import ObjectId
import re

from app.common.models.base_models import BaseDocument
from app.common.utils.datetime_utils import serialize_datetime

class Comment(BaseModel):
    """댓글 모델 - CVE 댓글 기능"""
    id: str = Field(default_factory=lambda: str(ObjectId()), description="댓글 ID")
    content: str = Field(..., description="댓글 내용")
    created_by: str = Field(..., description="작성자 이름")
    parent_id: Optional[str] = Field(default=None, description="부모 댓글 ID")
    depth: int = Field(default=0, description="댓글 깊이")
    is_deleted: bool = Field(default=False, description="삭제 여부")
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")), description="생성 시간")
    last_modified_at: Optional[datetime] = Field(default=None, description="마지막 수정 시간")
    last_modified_by: Optional[str] = Field(default=None, description="마지막 수정자")
    mentions: List[str] = Field(default_factory=list, description="멘션된 사용자 목록")
    
    class Config:
        json_encoders = {
            datetime: serialize_datetime
        }
    
    @classmethod
    def extract_mentions(cls, content: str) -> List[str]:
        """댓글 내용에서 멘션된 사용자명을 추출 - 개선된 버전
        
        특징:
        1. 한글, 영문, 숫자, 밑줄(_)을 포함하는 사용자명 지원
        2. 공백이나 문장 시작에 위치한 @사용자명만 인식
        3. 중복 제거 및 정규화
        """
        if not content:
            return []
            
        # 더 정교한 정규식 패턴
        # (?:^|\s): 줄의 시작 또는 공백 뒤에 나오는 패턴
        # @: @ 기호
        # ([\w가-힣]+): 영문, 숫자, 밑줄, 한글을 포함하는 사용자명
        MENTION_PATTERN = re.compile(r'(?:^|\s)@([\w가-힣]+)')
        matches = MENTION_PATTERN.findall(content)
        
        # 중복 제거 및 정규화 - 소문자로 변환하여 일관성 유지
        return [f"@{username}" for username in set(matches)]