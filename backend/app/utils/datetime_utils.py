from datetime import datetime
from zoneinfo import ZoneInfo

def get_utc_now() -> datetime:
    """
    현재 UTC 시간을 반환합니다.
    백엔드의 모든 시간 관련 작업에 이 함수를 사용해야 합니다.
    
    Returns:
        datetime: 현재 UTC 시간
    """
    return datetime.now(ZoneInfo("UTC"))

def format_datetime(dt: datetime, timezone: str = "Asia/Seoul") -> str:
    """
    datetime 객체를 지정된 타임존의 포맷팅된 문자열로 변환합니다.
    사용자 인터페이스에 표시되는 시간에 사용됩니다.
    
    Args:
        dt (datetime): 변환할 datetime 객체
        timezone (str, optional): 변환할 타임존. 기본값은 "Asia/Seoul"(KST)
    
    Returns:
        str: YYYY-MM-DD HH:MM:SS 형식의 문자열
    """
    if dt is None:
        return ""
    
    # UTC 시간을 지정된 타임존으로 변환
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    else:
        dt = dt.astimezone(ZoneInfo("UTC"))
    
    # 지정된 타임존으로 변환
    local_dt = dt.astimezone(ZoneInfo(timezone))
    
    # 포맷팅
    return local_dt.strftime("%Y-%m-%d %H:%M:%S")
