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
import asyncio

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
    - 캐시 무효화 시 웹소켓으로 알림 발송 (클라이언트가 캐시 즉시 갱신하도록)
    
    Args:
        cve_id (str, optional): 무효화할 특정 CVE ID. None인 경우 모든 CVE 목록 캐시 무효화
        
    Returns:
        bool: 하나 이상의 캐시가 무효화되었는지 여부
    """
    try:
        redis = await get_redis()
        invalidated = False
        
        # 특정 CVE 상세 정보 캐시 삭제
        if cve_id:
            start_time = datetime.now()
            # 상세 캐시 키 (기본 키 포함)
            detail_key = f"{CACHE_KEY_PREFIXES['cve_detail']}{cve_id}"
            detail_deleted = await redis.delete(detail_key)
            
            # 상세 정보 삭제 결과 로깅
            if detail_deleted:
                logger.info(f"캐시 무효화: CVE 상세 정보 ({cve_id}) 삭제됨")
                invalidated = True
            else:
                logger.debug(f"캐시 무효화: CVE 상세 정보 ({cve_id})가 캐시에 없었음")
            
            # 파생 캐시 키도 삭제 (다양한 형태로 저장된 관련 캐시 검색)
            derived_pattern = f"{CACHE_KEY_PREFIXES['cve_detail']}*{cve_id}*"
            async for derived_key in redis.scan_iter(match=derived_pattern):
                if derived_key != detail_key:  # 이미 삭제한 기본 키는 제외
                    deleted = await redis.delete(derived_key)
                    if deleted:
                        logger.info(f"캐시 무효화: 파생 CVE 상세 캐시 ({derived_key}) 삭제됨")
                        invalidated = True
            
            # 처리 시간 측정 및 로깅
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            logger.debug(f"CVE 상세 캐시 무효화 처리 시간: {processing_time:.2f}ms")
        
        # CVE 목록 캐시는 패턴 매칭으로 모두 삭제
        start_time = datetime.now()
        cve_list_pattern = f"{CACHE_KEY_PREFIXES['cve_list']}*"
        
        # scan_iter로 모든 매칭되는 키 찾기
        list_keys = []
        async for key in redis.scan_iter(match=cve_list_pattern):
            list_keys.append(key)
        
        # 목록 캐시가 있으면 파이프라인으로 일괄 삭제
        if list_keys:
            # 로깅을 위한 키 샘플링 (최대 5개)
            sample_keys = list_keys[:5]
            logger.info(f"삭제할 목록 캐시 키 샘플: {sample_keys} (총 {len(list_keys)}개)")
            
            # 파이프라인으로 효율적으로 삭제
            pipe = redis.pipeline()
            for key in list_keys:
                pipe.delete(key)
            results = await pipe.execute()
            
            # 삭제된 키 수 집계 및 로깅
            deleted_count = sum(1 for res in results if res)
            if deleted_count > 0:
                logger.info(f"캐시 무효화: {deleted_count}개의 CVE 목록 캐시 삭제됨 (총 {len(list_keys)}개 중)")
                invalidated = True
            else:
                logger.warning(f"캐시 무효화: 목록 캐시 키는 {len(list_keys)}개 발견되었으나 삭제된 캐시가 없음")
        else:
            logger.debug("캐시 무효화: 삭제할 CVE 목록 캐시가 없음")
        
        # 목록 캐시 처리 시간 측정 및 로깅
        processing_time = (datetime.now() - start_time).total_seconds() * 1000
        logger.debug(f"CVE 목록 캐시 무효화 처리 시간: {processing_time:.2f}ms")
        
        # 캐시 무효화 결과를 웹소켓으로 브로드캐스트
        if invalidated:
            event_data = {
                "event": "cache_invalidated",
                "data": {
                    "cve_id": cve_id,
                    "timestamp": datetime.now().isoformat(),
                    "invalidated_detail": cve_id is not None,
                    "invalidated_lists": len(list_keys) > 0
                }
            }
            
            try:
                # 비동기로 웹소켓 이벤트 발생 (await 없이)
                asyncio.create_task(
                    handle_websocket_event(
                        "cache_invalidated", 
                        event_data["data"]
                    )
                )
                logger.info(f"캐시 무효화 웹소켓 이벤트 발생: {cve_id if cve_id else '전체 목록'}")
            except Exception as e:
                logger.error(f"웹소켓 이벤트 발생 중 오류: {str(e)}")
            
        return invalidated
        
    except Exception as e:
        logger.error(f"캐시 무효화 중 오류 발생: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        # 오류 발생 시에도 계속 진행
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