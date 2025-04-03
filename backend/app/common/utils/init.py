"""
공통 유틸리티 패키지
"""
from app.common.utils.change_detection import detect_object_changes, detect_collection_changes

__all__ = [
    'detect_object_changes',
    'detect_collection_changes'
]