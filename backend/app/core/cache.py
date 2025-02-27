"""
통합 캐싱 서비스 - 시스템 전체 캐싱 기능 제공
"""
import json
from typing import Any, Optional, List, Dict, Union
from datetime import datetime, timedelta
# aioredis 대신 redis.asyncio 사용
import redis.asyncio as redis_async
import logging
from .config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Redis 연결 설정
redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
_redis = None

# 캐시 키 프리픽스 및 기본 TTL 정의
CACHE_KEY_PREFIXES = {
    "crawler_result": "cache:crawler_result:",
    "cve_detail": "cache:cve_detail:",
    "cve_list": "cache:cve_list:",
    "user": "cache:user:",
    "stats": "cache:stats:"
}

DEFAULT_TTL = {
    "crawler_result": 86400,  # 1일
    "cve_detail": 3600,       # 1시간
    "cve_list": 300,          # 5분
    "user": 1800,             # 30분
    "stats": 600              # 10분
}

async def get_redis():
    """Redis 연결 얻기"""
    global _redis
    if _redis is None:
        try:
            # redis.asyncio 모듈 사용
            _redis = redis_async.from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            logger.info(f"Redis 연결 성공: {redis_url}")
        except Exception as e:
            logger.error(f"Redis 연결 실패: {str(e)}")
            raise
    return _redis

async def set_cache(key: str, value: Any, expire: int = None, cache_type: str = None) -> bool:
    """
    캐시에 값 저장
    
    Args:
        key: 캐시 키
        value: 저장할 값 (자동으로 JSON 직렬화됨)
        expire: 만료 시간 (초)
        cache_type: 캐시 유형 (crawler_result, cve_detail, cve_list 등)
        
    Returns:
        성공 여부
    """
    try:
        # 캐시 타입에 따른 TTL 설정
        if expire is None and cache_type:
            expire = DEFAULT_TTL.get(cache_type, 3600)
            
        # 타임스탬프 추가
        if isinstance(value, dict):
            value["_cached_at"] = datetime.now().isoformat()
        
        redis = await get_redis()
        serialized = json.dumps(value)
        await redis.set(key, serialized, ex=expire)
        return True
    except Exception as e:
        logger.error(f"캐시 저장 실패 ({key}): {str(e)}")
        return False

# CVE 상세 정보 캐싱
async def cache_cve_detail(cve_id: str, data: Dict[str, Any]) -> bool:
    """
    CVE 상세 정보 캐싱
    """
    key = f"{CACHE_KEY_PREFIXES['cve_detail']}{cve_id}"
    return await set_cache(key, data, cache_type="cve_detail")

# CVE 목록 캐싱
async def cache_cve_list(query_params: Dict[str, Any], data: Dict[str, Any]) -> bool:
    """
    CVE 목록 캐싱 - 쿼리 파라미터 기반
    """
    # 쿼리 파라미터를 정렬된 문자열로 변환하여 일관된 키 생성
    params_str = "&".join(f"{k}={v}" for k, v in sorted(query_params.items()) 
                         if k not in ["_t", "timestamp"])
    
    key = f"{CACHE_KEY_PREFIXES['cve_list']}{params_str}"
    return await set_cache(key, data, cache_type="cve_list")

# 캐시 무효화 - CVE 업데이트 시
async def invalidate_cve_caches(cve_id: str = None) -> bool:
    """
    CVE 관련 캐시 무효화
    - 특정 CVE 캐시만 무효화하거나 모든 CVE 목록 캐시 무효화
    """
    try:
        redis = await get_redis()
        
        # 특정 CVE 상세 정보 캐시 삭제
        if cve_id:
            detail_key = f"{CACHE_KEY_PREFIXES['cve_detail']}{cve_id}"
            await redis.delete(detail_key)
        
        # CVE 목록 캐시는 패턴 매칭으로 모두 삭제
        cve_list_pattern = f"{CACHE_KEY_PREFIXES['cve_list']}*"
        
        # redis.asyncio의 scan_iter 사용
        keys_to_delete = []
        async for key in redis.scan_iter(match=cve_list_pattern):
            keys_to_delete.append(key)
        
        if keys_to_delete:
            await redis.delete(*keys_to_delete)
                
        return True
    except Exception as e:
        logger.error(f"캐시 무효화 실패: {str(e)}")
        return False

# 웹소켓 이벤트 기반 캐시 무효화 함수
async def handle_websocket_event(event_type: str, data: Dict[str, Any]) -> None:
    """
    웹소켓 이벤트에 따른 캐시 무효화 처리
    """
    if event_type in ["cve_created", "cve_updated", "cve_deleted"]:
        cve_id = data.get("cve_id") or data.get("cveId")
        if cve_id:
            logger.info(f"웹소켓 이벤트 {event_type}에 따른 캐시 무효화: {cve_id}")
            await invalidate_cve_caches(cve_id)
    
    elif event_type == "comment_added" or event_type == "comment_updated":
        cve_id = data.get("cve_id") or data.get("cveId")
        if cve_id:
            # 댓글 관련 업데이트는 CVE 상세 캐시만 무효화
            detail_key = f"{CACHE_KEY_PREFIXES['cve_detail']}{cve_id}"
            await get_redis().delete(detail_key)

async def get_cache(key: str) -> Optional[Any]:
    """
    캐시에서 값 조회
    
    Args:
        key: 캐시 키
        
    Returns:
        저장된 값 (JSON으로 역직렬화됨) 또는 None
    """
    try:
        redis = await get_redis()
        value = await redis.get(key)
        if value is None:
            return None
        return json.loads(value)
    except Exception as e:
        logger.error(f"캐시 조회 실패 ({key}): {str(e)}")
        return None

async def delete_cache(key: str) -> bool:
    """
    캐시에서 키 삭제
    
    Args:
        key: 캐시 키
        
    Returns:
        성공 여부
    """
    try:
        redis = await get_redis()
        await redis.delete(key)
        return True
    except Exception as e:
        logger.error(f"캐시 삭제 실패 ({key}): {str(e)}")
        return False 