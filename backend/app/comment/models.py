"""
댓글 관련 모델 정의 - CVE 모델에서 분리
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from zoneinfo import ZoneInfo
from bson import ObjectId
import re

from app.common.utils.datetime_utils import serialize_datetime


class Comment(BaseModel):
    """댓글 모델 - CVE 댓글 기능"""
    id: str = Field(default_factory=lambda: str(ObjectId()))
    content: str
    created_by: str = Field(..., description="작성자 이름")
    parent_id: Optional[str] = None
    depth: int = 0
    is_deleted: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(ZoneInfo("UTC")))
    last_modified_at: Optional[datetime] = None
    last_modified_by: Optional[str] = None
    mentions: List[str] = []
    
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


class CommentCreate(BaseModel):
    """댓글 생성 요청 모델"""
    content: str
    parent_id: Optional[str] = None


class CommentUpdate(BaseModel):
    """댓글 수정 요청 모델"""
    content: str


class CommentResponse(Comment):
    """댓글 응답 모델"""
    pass
