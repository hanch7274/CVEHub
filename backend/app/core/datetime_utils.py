from datetime import datetime
from zoneinfo import ZoneInfo
from .config import get_settings

settings = get_settings()

def get_kst_now() -> datetime:
    """현재 KST 시간을 반환"""
    return datetime.now(ZoneInfo(settings.TIMEZONE))

def format_datetime(dt: datetime) -> str:
    """datetime 객체를 지정된 포맷의 문자열로 변환"""
    return dt.strftime(settings.DATETIME_FORMAT)

def get_current_time() -> str:
    """현재 KST 시간을 포맷된 문자열로 반환"""
    return format_datetime(get_kst_now())

class DateTimeFormatter:
    """datetime 객체 변환을 위한 포맷터 클래스"""
    @staticmethod
    def to_string(obj):
        if isinstance(obj, datetime):
            return format_datetime(obj)
        return obj 