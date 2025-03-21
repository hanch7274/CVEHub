from datetime import datetime
from zoneinfo import ZoneInfo
from .config import get_settings

settings = get_settings()

def get_utc_now() -> datetime:
    """현재 UTC 시간을 반환"""
    # 명시적으로 UTC 시간대 사용
    return datetime.now(ZoneInfo("UTC"))

def get_kst_now() -> datetime:
    """현재 KST 시간을 반환 (UTC 시간에 9시간 추가)"""
    # UTC 시간을 가져온 후 KST로 변환
    utc_now = get_utc_now()
    return utc_now.astimezone(ZoneInfo("Asia/Seoul"))

def format_datetime(dt: datetime) -> str:
    """datetime 객체를 지정된 포맷의 문자열로 변환"""
    # 시간대가 없는 경우 UTC 시간대 적용
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    # 표시를 위해 KST로 변환
    kst_dt = dt.astimezone(ZoneInfo("Asia/Seoul"))
    return kst_dt.strftime(settings.DATETIME_FORMAT)

def get_current_time() -> str:
    """현재 시간을 포맷된 문자열로 반환 (KST 기준)"""
    return format_datetime(get_utc_now())

class DateTimeFormatter:
    """datetime 객체 변환을 위한 포맷터 클래스"""
    @staticmethod
    def to_string(obj):
        if isinstance(obj, datetime):
            return format_datetime(obj)
        return obj