"""
캐시 정보 조회 라우터
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Dict, List, Any, Optional
import logging
from app.core.cache import get_redis, CACHE_KEY_PREFIXES
import json
import redis as redis_sync
from datetime import datetime
from app.core.config import get_settings
import functools

router = APIRouter(tags=["cache"])
logger = logging.getLogger(__name__)

def cache_api_error_handler(func):
    """캐시 API 엔드포인트 예외 처리 데코레이터"""
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except HTTPException:
            # FastAPI HTTP 예외는 그대로 전달
            raise
        except redis_sync.RedisError as redis_err:
            # Redis 관련 에러는 로깅 후 500 에러로 반환
            logger.error(f"Redis 에러 in {func.__name__}: {str(redis_err)}")
            raise HTTPException(
                status_code=500, 
                detail=f"Redis 서버 오류: {str(redis_err)}"
            )
        except ValueError as val_err:
            # 값 검증 오류
            logger.warning(f"값 검증 오류 in {func.__name__}: {str(val_err)}")
            raise HTTPException(status_code=400, detail=str(val_err))
        except Exception as e:
            # 일반 예외는 서버 오류로 처리
            logger.error(f"Error in {func.__name__}: {str(e)}")
            raise HTTPException(
                status_code=500, 
                detail=f"{func.__name__} 중 오류 발생: {str(e)}"
            )
    return wrapper

@router.get("/info")
@cache_api_error_handler
async def get_cache_info():
    """
    Redis 캐시 서버 정보 조회
    """
    redis = await get_redis()
    info = await redis.info()
    
    # 추가 서버 정보 포맷팅
    server_info = {
        "redis_version": info.get("redis_version", ""),
        "uptime_in_seconds": info.get("uptime_in_seconds", 0),
        "uptime_in_days": info.get("uptime_in_days", 0),
        "connected_clients": info.get("connected_clients", 0),
        "used_memory": info.get("used_memory", 0),
        "used_memory_human": info.get("used_memory_human", ""),
        "used_memory_peak": info.get("used_memory_peak", 0),
        "used_memory_peak_human": info.get("used_memory_peak_human", ""),
        "total_system_memory": info.get("total_system_memory", 0),
        "total_system_memory_human": info.get("total_system_memory_human", ""),
        "maxmemory": info.get("maxmemory", 0),
        "maxmemory_human": info.get("maxmemory_human", ""),
        "maxmemory_policy": info.get("maxmemory_policy", ""),
        "mem_fragmentation_ratio": info.get("mem_fragmentation_ratio", 0),
        "role": info.get("role", ""),
        "os": info.get("os", ""),
        "arch_bits": info.get("arch_bits", ""),
        "process_id": info.get("process_id", 0),
        "tcp_port": info.get("tcp_port", 0),
        "config_file": info.get("config_file", ""),
        "status": "success"
    }
    
    return server_info

@router.get("/stats")
@cache_api_error_handler
async def get_cache_stats():
    """
    Redis 캐시 통계 정보 조회
    """
    redis = await get_redis()
    
    # 기본 통계 정보
    db_size = await redis.dbsize()
    memory_info = await redis.info("memory")
    stats_info = await redis.info("stats")
    
    # 키 타입 분포 계산
    key_types = {"string": 0, "list": 0, "hash": 0, "set": 0, "zset": 0, "stream": 0, "other": 0}
    
    # 각 프리픽스별 키 개수 조회
    key_counts = {}
    for prefix_name, prefix in CACHE_KEY_PREFIXES.items():
        count = 0
        async for _ in redis.scan_iter(match=f"{prefix}*"):
            count += 1
        key_counts[prefix_name] = count
    
    # 샘플링을 위한 키 목록 가져오기 (최대 1000개)
    keys = []
    count = 0
    async for key in redis.scan_iter(match="*"):
        if count < 1000:
            keys.append(key)
            count += 1
        else:
            break
    
    # 샘플링된 키의 타입 분포 계산
    for key in keys:
        key_type = await redis.type(key)
        if key_type in key_types:
            key_types[key_type] += 1
        else:
            key_types["other"] += 1
    
    # 샘플링된 결과를 전체 키 수에 비례하여 추정
    if count > 0 and db_size > 0:
        ratio = db_size / count
        for key_type in key_types:
            key_types[key_type] = int(key_types[key_type] * ratio)
    
    # 명령어 통계
    commands_stats = {
        "total_commands_processed": stats_info.get("total_commands_processed", 0),
        "instantaneous_ops_per_sec": stats_info.get("instantaneous_ops_per_sec", 0),
        "total_connections_received": stats_info.get("total_connections_received", 0),
        "rejected_connections": stats_info.get("rejected_connections", 0),
        "expired_keys": stats_info.get("expired_keys", 0),
        "evicted_keys": stats_info.get("evicted_keys", 0),
        "keyspace_hits": stats_info.get("keyspace_hits", 0),
        "keyspace_misses": stats_info.get("keyspace_misses", 0),
        "hit_rate": stats_info.get("keyspace_hits", 0) / (stats_info.get("keyspace_hits", 0) + stats_info.get("keyspace_misses", 1)) * 100 if (stats_info.get("keyspace_hits", 0) + stats_info.get("keyspace_misses", 0)) > 0 else 0,
    }
    
    # 메모리 통계
    memory_stats = {
        "used_memory": memory_info.get("used_memory", 0),
        "used_memory_human": memory_info.get("used_memory_human", ""),
        "used_memory_rss": memory_info.get("used_memory_rss", 0),
        "used_memory_rss_human": memory_info.get("used_memory_rss_human", ""),
        "used_memory_peak": memory_info.get("used_memory_peak", 0),
        "used_memory_peak_human": memory_info.get("used_memory_peak_human", ""),
        "total_system_memory": memory_info.get("total_system_memory", 0),
        "total_system_memory_human": memory_info.get("total_system_memory_human", ""),
        "maxmemory": memory_info.get("maxmemory", 0),
        "maxmemory_human": memory_info.get("maxmemory_human", ""),
        "maxmemory_policy": memory_info.get("maxmemory_policy", ""),
        "mem_fragmentation_ratio": memory_info.get("mem_fragmentation_ratio", 0),
        "mem_allocator": memory_info.get("mem_allocator", ""),
    }
    
    stats = {
        "status": "success",
        "total_keys": db_size,
        "key_types_distribution": key_types,
        "key_counts": key_counts,
        "commands_stats": commands_stats,
        "memory_stats": memory_stats,
    }
    
    return stats

@router.get("/keys")
@cache_api_error_handler
async def get_cache_keys(
    prefix: Optional[str] = Query(None, description="캐시 키 프리픽스 (예: cve_detail, cve_list)"),
    pattern: Optional[str] = Query("*", description="검색 패턴"),
    limit: int = Query(100, description="최대 조회 개수")
):
    """
    Redis 캐시 키 목록 조회
    """
    redis = await get_redis()
    
    # 프리픽스 적용
    search_pattern = pattern
    if prefix and prefix in CACHE_KEY_PREFIXES:
        search_pattern = f"{CACHE_KEY_PREFIXES[prefix]}{pattern}"
    elif prefix:
        search_pattern = f"{prefix}:{pattern}"
    
    # 키 목록 조회
    keys = []
    count = 0
    async for key in redis.scan_iter(match=search_pattern):
        if count >= limit:
            break
        
        # 키 유형 및 TTL 조회
        key_type = await redis.type(key)
        ttl = await redis.ttl(key)
        
        # 키 크기 계산
        size = 0
        if key_type == "string":
            size = await redis.strlen(key)
        elif key_type == "list":
            size = await redis.llen(key)
        elif key_type == "hash":
            size = await redis.hlen(key)
        elif key_type == "set":
            size = await redis.scard(key)
        elif key_type == "zset":
            size = await redis.zcard(key)
        
        keys.append({
            "key": key,
            "type": key_type,
            "ttl": ttl,
            "size": size
        })
        count += 1
    
    return {
        "status": "success",
        "total": len(keys),
        "keys": keys
    }

@router.get("/values")
@cache_api_error_handler
async def get_cache_values(
    prefix: Optional[str] = Query(None, description="캐시 키 프리픽스 (예: cve_detail, cve_list)"),
    pattern: Optional[str] = Query("*", description="검색 패턴"),
    limit: int = Query(20, description="최대 조회 개수")
):
    """
    Redis 캐시 값 조회
    """
    redis = await get_redis()
    
    # 프리픽스 적용
    search_pattern = pattern
    if prefix and prefix in CACHE_KEY_PREFIXES:
        search_pattern = f"{CACHE_KEY_PREFIXES[prefix]}{pattern}"
    elif prefix:
        search_pattern = f"{prefix}:{pattern}"
    
    # 키 목록 조회
    keys = []
    count = 0
    async for key in redis.scan_iter(match=search_pattern):
        if count >= limit:
            break
        keys.append(key)
        count += 1
    
    # 각 키의 값, 타입, TTL 정보 가져오기
    values = []
    types = []
    ttls = []
    
    for key in keys:
        key_type = await redis.type(key)
        ttl = await redis.ttl(key)
        ttls.append(ttl)
        types.append(key_type)
        
        # 키 타입에 따라 값 가져오기
        if key_type == "string":
            value = await redis.get(key)
            try:
                # JSON 파싱 시도
                value = json.loads(value)
            except (json.JSONDecodeError, TypeError):
                # 일반 문자열
                pass
        elif key_type == "list":
            value = await redis.lrange(key, 0, -1)
        elif key_type == "hash":
            value = await redis.hgetall(key)
        elif key_type == "set":
            value = list(await redis.smembers(key))
        elif key_type == "zset":
            value_pairs = await redis.zrange(key, 0, -1, withscores=True)
            value = {k: v for k, v in value_pairs}
        else:
            value = f"지원되지 않는 타입: {key_type}"
        
        values.append(value)
    
    return {
        "total": len(keys),
        "keys": keys,
        "values": values,
        "types": types,
        "ttls": ttls
    }

@router.get("/value/{key}")
@cache_api_error_handler
async def get_cache_value(key: str):
    """
    특정 Redis 키의 값을 반환합니다.
    """
    redis = await get_redis()
    
    # 키 존재 여부 확인
    if not await redis.exists(key):
        raise HTTPException(status_code=404, detail=f"키를 찾을 수 없습니다: {key}")
    
    key_type = await redis.type(key)
    ttl = await redis.ttl(key)
    
    # 키 타입에 따라 값 가져오기
    if key_type == "string":
        value = await redis.get(key)
        try:
            # JSON 파싱 시도
            value = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            # 일반 문자열
            pass
    elif key_type == "list":
        value = await redis.lrange(key, 0, -1)
    elif key_type == "hash":
        value = await redis.hgetall(key)
    elif key_type == "set":
        value = list(await redis.smembers(key))
    elif key_type == "zset":
        value_pairs = await redis.zrange(key, 0, -1, withscores=True)
        value = {k: v for k, v in value_pairs}
    else:
        value = f"지원되지 않는 타입: {key_type}"
    
    return {
        "key": key,
        "value": value,
        "type": key_type,
        "ttl": ttl
    }

@router.delete("/keys/{key}")
@cache_api_error_handler
async def delete_cache_key(key: str):
    """
    Redis 키를 삭제합니다.
    """
    redis = await get_redis()
    
    # 키 존재 여부 확인
    if not await redis.exists(key):
        raise HTTPException(status_code=404, detail=f"키를 찾을 수 없습니다: {key}")
    
    # 키 삭제
    deleted = await redis.delete(key)
    return {
        "success": deleted > 0,
        "key": key,
        "deleted": deleted
    }

@router.delete("/clear")
@cache_api_error_handler
async def clear_cache(
    prefix: Optional[str] = Query(None, description="캐시 키 프리픽스 (예: cve_detail, cve_list)"),
    pattern: Optional[str] = Query("*", description="삭제할 키 패턴")
):
    """
    Redis 캐시 삭제
    """
    redis = await get_redis()
    
    # 프리픽스 적용
    search_pattern = pattern
    if prefix and prefix in CACHE_KEY_PREFIXES:
        search_pattern = f"{CACHE_KEY_PREFIXES[prefix]}{pattern}"
    elif prefix:
        search_pattern = f"{prefix}:{pattern}"
    
    # 키 목록 조회 및 삭제
    deleted_count = 0
    async for key in redis.scan_iter(match=search_pattern):
        await redis.delete(key)
        deleted_count += 1
    
    return {
        "status": "success",
        "deleted_count": deleted_count
    }
