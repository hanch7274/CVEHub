from datetime import datetime
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional, Union

def get_utc_now() -> datetime:
    """
    현재 UTC 시간을 datetime 객체로 반환합니다.
    백엔드의 모든 시간 관련 작업에 이 함수를 사용해야 합니다.
    
    Returns:
        datetime: 현재 UTC 시간 (tzinfo=UTC)
    """
    return datetime.now(ZoneInfo("UTC"))

def get_kst_now() -> datetime:
    """
    현재 KST(한국 표준시) 시간을 datetime 객체로 반환합니다.
    
    Returns:
        datetime: 현재 KST 시간 (tzinfo=Asia/Seoul)
    """
    now_utc = get_utc_now()
    return now_utc.astimezone(ZoneInfo("Asia/Seoul"))

def format_datetime(dt: datetime, timezone: Optional[str] = "Asia/Seoul", 
                   format_str: Optional[str] = "%Y-%m-%d %H:%M:%S") -> str:
    """
    datetime 객체를 지정된 타임존의 포맷팅된 문자열로 변환합니다.
    사용자 인터페이스에 표시되는 시간에 사용됩니다.
    
    Args:
        dt (datetime): 변환할 datetime 객체
        timezone (str, optional): 변환할 타임존. 기본값은 "Asia/Seoul"(KST)
        format_str (str, optional): 날짜/시간 포맷 문자열. 기본값은 "%Y-%m-%d %H:%M:%S"
    
    Returns:
        str: 지정된 포맷의 문자열
    """
    if dt is None:
        return ""
    
    # UTC 시간을 지정된 타임존으로 변환
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    
    local_dt = dt.astimezone(ZoneInfo(timezone))
    return local_dt.strftime(format_str)

# 이전 버전과의 호환성을 위해 get_current_time 함수 유지
def get_current_time() -> datetime:
    """
    현재 KST(한국 표준시) 시간을 datetime 객체로 반환합니다.
    get_kst_now()와 동일한 기능을 제공합니다.
    
    Returns:
        datetime: 현재 KST 시간 (tzinfo=Asia/Seoul)
    """
    return get_kst_now()

def normalize_datetime_fields(data: Dict[str, Any], 
                             fields: List[str] = ["created_at", "last_modified_at"]) -> Dict[str, Any]:
    """
    딕셔너리의 날짜 필드를 정규화합니다.
    
    Args:
        data: 처리할 딕셔너리 데이터
        fields: 날짜 필드 이름 목록. 기본값은 ["created_at", "last_modified_at"]
    
    Returns:
        Dict[str, Any]: 정규화된 날짜 필드가 포함된 딕셔너리
    """
    if not data:
        return data
    
    result = data.copy()
    current_time = get_utc_now()
    
    for field in fields:
        # 필드가 없거나 None인 경우 현재 시간으로 설정
        if field not in result or result[field] is None:
            result[field] = current_time
        # 문자열인 경우 datetime 객체로 변환 (이미 datetime이면 그대로 유지)
        elif isinstance(result[field], str):
            try:
                # ISO 형식 문자열을 datetime으로 파싱
                result[field] = datetime.fromisoformat(result[field])
            except ValueError:
                # 파싱 실패 시 현재 시간 사용
                result[field] = current_time
        
        # 시간대 정보가 없는 경우 UTC로 설정
        if isinstance(result[field], datetime) and result[field].tzinfo is None:
            result[field] = result[field].replace(tzinfo=ZoneInfo("UTC"))
    
    return result
