from datetime import datetime
from zoneinfo import ZoneInfo
from typing import List, Dict, Any

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
    
    local_dt = dt.astimezone(ZoneInfo(timezone))
    return local_dt.strftime("%Y-%m-%d %H:%M:%S")

def get_current_time() -> datetime:
    """
    현재 시간을 datetime 객체로 반환합니다 (KST 기준).
    
    Returns:
        datetime: 현재 시간 (KST)
    """
    now_utc = get_utc_now()
    return now_utc.astimezone(ZoneInfo("Asia/Seoul"))

def get_formatted_current_time() -> str:
    """
    현재 시간을 포맷된 문자열로 반환합니다 (KST 기준).
    
    Returns:
        str: 포맷된 현재 시간 문자열 (YYYY-MM-DD HH:MM:SS)
    """
    return format_datetime(get_utc_now())

def normalize_datetime_fields(data: Dict[str, Any], fields: List[str] = ["created_at", "last_modified_at"]) -> Dict[str, Any]:
    """
    딕셔너리의 날짜 필드를 정규화합니다.
    
    Args:
        data: 처리할 딕셔너리 데이터
        fields: 날짜 필드 이름 목록
    Returns:
        정규화된 날짜 필드가 포함된 딕셔너리
    """
    import logging
    logger = logging.getLogger(__name__)
        
    result = data.copy()
    current_time = get_utc_now()
    
    for field in fields:
        if field in result:      
            # 빈 값 체크
            if not result[field] or (isinstance(result[field], dict) and len(result[field]) == 0):
                result[field] = current_time
                logger.info(f"- 빈 값이어서 현재 시간으로 설정: {field}={result[field]} ({type(result[field]).__name__})")
            # 문자열을 datetime 객체로 변환
            elif isinstance(result[field], str):
                try:
                    result[field] = datetime.fromisoformat(result[field].replace('Z', '+00:00'))
                    logger.info(f"- 문자열에서 datetime으로 변환: {field}={result[field]} ({type(result[field]).__name__})")
                except (ValueError, TypeError):
                    result[field] = current_time
                    logger.info(f"- 문자열 변환 실패, 현재 시간으로 설정: {field}={result[field]} ({type(result[field]).__name__})")
    
    return result
