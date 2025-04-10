"""
스키마 정의를 위한 기본 클래스 및 유틸리티
"""
from typing import Dict, Any, Tuple, Optional, List
from pydantic import BaseModel, Field

class SchemaDefinition(BaseModel):
    """스키마 정의를 위한 기본 클래스"""
    # 타입 어노테이션을 명시적으로 지정
    fields: Dict[str, Tuple[str, str, Optional[str], bool, Any]] = {}
    embedded_models: Dict[str, Dict[str, Tuple[str, str, Optional[str], bool, Any]]] = {}
    
    class Config:
        arbitrary_types_allowed = True