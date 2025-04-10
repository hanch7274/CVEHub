"""
댓글 스키마 정의
"""
from typing import Dict, Tuple, Optional, Any, List
from datetime import datetime
from zoneinfo import ZoneInfo

from app.schemas.base import SchemaDefinition


class CommentSchemaDefinition(SchemaDefinition):
    """댓글 스키마 정의 클래스"""
    
    fields: Dict[str, Tuple[str, str, Optional[str], bool, Any]] = {
        "id": ("str", "댓글 ID", "lambda: str(ObjectId())", True, "5f7f6a7b8c9d0e1f2a3b4c5d"),
        "content": ("str", "댓글 내용", None, True, "이것은 테스트 댓글입니다."),
        "created_by": ("str", "작성자 이름", None, True, "admin"),
        "parent_id": ("Optional[str]", "부모 댓글 ID", "None", False, None),
        "depth": ("int", "댓글 깊이", "0", True, 0),
        "is_deleted": ("bool", "삭제 여부", "False", True, False),
        "created_at": ("datetime", "생성 시간", "lambda: datetime.now(ZoneInfo(\"UTC\"))", True, "2023-01-01T12:00:00Z"),
        "last_modified_at": ("Optional[datetime]", "마지막 수정 시간", "None", False, None),
        "last_modified_by": ("Optional[str]", "마지막 수정자", "None", False, None),
        "mentions": ("List[str]", "멘션된 사용자 목록", "[]", True, []),
    }
    
    embedded_models: Dict[str, Dict[str, Tuple[str, str, Optional[str], bool, Any]]] = {}
