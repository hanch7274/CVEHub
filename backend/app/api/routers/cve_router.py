"""
CVE 관련 API 라우터 - 모든 CVE 관련 엔드포인트 통합
"""
from fastapi import APIRouter, HTTPException, Query, Path, status, Depends, Response, BackgroundTasks
from typing import List, Dict, Any, Optional, Union
from datetime import datetime
from zoneinfo import ZoneInfo
from pymongo import DESCENDING
import logging
import json
import asyncio
import traceback
from pydantic import ValidationError

from app.models.cve_model import CVEModel, PoC, SnortRule, Reference, ModificationHistory
from app.models.user import User
from app.services.cve_service import CVEService
from app.core.dependencies import get_cve_service
from app.core.auth import get_current_user, get_current_admin_user
from app.core.socketio_manager import socketio_manager, WSMessageType, DateTimeEncoder
from app.core.cache import (
    get_cache, set_cache, cache_cve_detail, cache_cve_list, 
    invalidate_cve_caches, CACHE_KEY_PREFIXES
)
from app.schemas.cve_request_schemas import (
    CreateCVERequest, PatchCVERequest, BulkUpsertCVERequest
)
from app.schemas.cve_response_schemas import (
    CVEListResponse, CVEDetailResponse, CVEOperationResponse,
    BulkOperationResponse, CVESearchResponse
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ----- 전체 CVE 개수 조회 엔드포인트 -----

@router.get("/total-count", response_model=dict)
async def get_total_cve_count(
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    데이터베이스에 존재하는 전체 CVE 개수를 반환합니다.
    필터링 없이 순수하게 DB에 저장된 모든 CVE의 개수를 반환합니다.
    """
    try:
        logger.info(f"사용자 '{current_user.username}'이(가) 전체 CVE 개수 요청")
        count = await cve_service.get_total_cve_count()
        logger.info(f"전체 CVE 개수 조회 완료: {count}")
        return {"count": count}
    except Exception as e:
        logger.error(f"전체 CVE 개수 조회 중 오류 발생: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="전체 CVE 개수 조회 중 오류가 발생했습니다."
        )

# ----- CVE 목록 조회 API 엔드포인트 -----

@router.get("/", response_model=CVEListResponse)
async def get_cves(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    search: str = Query(default=None),
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE 목록을 페이지네이션하여 반환합니다."""
    try:
        # 성능 로깅 시작
        start_time = datetime.now()
        
        try:
            # CVEService의 get_cve_list 메소드 사용
            # 페이지 번호를 1부터 시작하지만 skip은 0부터 시작하므로 page=skip+1로 변환
            page = skip // limit + 1 if limit > 0 else 1
            
            result = await cve_service.get_cve_list(
                page=page,
                limit=limit,
                search=search
            )
            
            # 성능 측정 및 로깅
            elapsed_time = (datetime.now() - start_time).total_seconds()
            logging.info(f"CVE query executed in {elapsed_time:.3f} seconds. "
                        f"Total: {result['total']}, Fetched: {len(result['items'])}, "
                        f"Search: {search if search else 'None'}")
            
            return result
            
        except Exception as db_error:
            logging.error(f"Database error: {str(db_error)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="데이터베이스 조회 중 오류가 발생했습니다."
            )
            
    except Exception as e:
        logging.error(f"Error in get_cves: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/list", response_model=CVEListResponse)
async def get_cve_list(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    severity: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    CVE 목록을 가져옵니다 (캐싱 적용)
    
    Args:
        page: 페이지 번호 (1부터 시작)
        limit: 페이지당 항목 수
        severity: 심각도 필터
        search: 검색어
        current_user: 현재 인증된 사용자
        cve_service: CVE 서비스 인스턴스
        
    Returns:
        CVE 목록 정보 (total, items, page, limit)
    """
    try:
        logger.info(f"사용자 '{current_user.username}'이(가) CVE 목록 요청. 페이지: {page}, 한도: {limit}, 검색어: {search or 'None'}")
        
        # 쿼리 파라미터로 캐시 키 생성
        query_params = {
            "page": page,
            "limit": limit,
            "severity": severity or "",
            "search": search or ""
        }
        
        cache_key = f"{CACHE_KEY_PREFIXES['cve_list']}{page}_{limit}_{severity or 'all'}_{search or 'none'}"
        
        # 캐시에서 먼저 조회
        cached_data = await get_cache(cache_key)
        if cached_data:
            logger.debug(f"캐시에서 CVE 목록 로드: {cache_key}")
            return cached_data
        
        # 캐시에 없으면 DB에서 조회
        start_time = datetime.now()
        result = await cve_service.get_cve_list(
            page=page, 
            limit=limit,
            severity=severity,
            search=search
        )
        
        # 성능 측정 및 로깅
        elapsed_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"CVE 목록 검색 완료. 소요 시간: {elapsed_time:.3f}초, 총 항목: {result.get('total', 0)}")
        
        # 결과 캐싱
        await cache_cve_list(query_params, result)
        
        return result
        
    except Exception as e:
        logger.error(f"CVE 목록 조회 중 오류 발생: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"CVE 목록 조회 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/{cve_id}", response_model=CVEDetailResponse)
async def get_cve(
    cve_id: str = Path(..., description="조회할 CVE ID"),
    bypass_cache: bool = Query(False, description="캐시 우회 여부"),
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    CVE 상세 정보를 가져옵니다 (캐싱 적용)
    
    Args:
        cve_id: 조회할 CVE ID
        bypass_cache: 캐시 우회 여부 (기본값: False)
        current_user: 현재 인증된 사용자
        cve_service: CVE 서비스 인스턴스
        
    Returns:
        CVE 상세 정보
        
    Raises:
        404: CVE를 찾을 수 없는 경우
        500: 서버 오류 발생 시
    """
    try:
        logger.info(f"사용자 '{current_user.username}'이(가) CVE 상세정보 요청: {cve_id}, 캐시 우회: {bypass_cache}")
        
        cache_key = f"{CACHE_KEY_PREFIXES['cve_detail']}{cve_id}"
        
        # 캐시 우회 옵션이 없으면 캐시에서 조회
        if not bypass_cache:
            cached_data = await get_cache(cache_key)
            if cached_data:
                logger.debug(f"캐시에서 CVE 상세 정보 로드: {cache_key}")
                return cached_data
        
        # 캐시에 없거나 우회 옵션이 설정된 경우 DB에서 조회
        start_time = datetime.now()
        result = await cve_service.get_cve_detail(cve_id)
        elapsed_time = (datetime.now() - start_time).total_seconds()
        
        if not result:
            logger.warning(f"CVE ID {cve_id} 찾을 수 없음")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail=f"CVE ID {cve_id} not found"
            )
        
        logger.info(f"CVE {cve_id} 상세 정보 조회 완료. 소요 시간: {elapsed_time:.3f}초")
        
        # 결과 캐싱
        await cache_cve_detail(cve_id, result)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CVE 상세 정보 조회 중 오류 발생: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"CVE 상세 조회 중 오류가 발생했습니다: {str(e)}"
        )

# ----- 단일 CVE 조회 API 엔드포인트 -----

@router.head("/{cve_id}")
async def head_cve(
    cve_id: str,
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    CVE의 메타데이터만 반환하는 HEAD 요청 처리
    클라이언트 캐싱을 위해 Last-Modified 헤더 제공
    """
    try:
        cve = await cve_service.get_cve(cve_id)
        if not cve:
            raise HTTPException(status_code=404, detail=f"CVE ID {cve_id} not found")
        
        response = Response()
        
        # Last-Modified 헤더 설정
        if cve.last_modified_date:
            last_modified = cve.last_modified_date.strftime("%a, %d %b %Y %H:%M:%S GMT")
            response.headers["Last-Modified"] = last_modified
        
        # ETag 헤더 설정 (선택 사항)
        response.headers["ETag"] = f'W/"{cve_id}-{cve.version if hasattr(cve, "version") else "1"}"'
        
        return response
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in head_cve: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

# ----- CVE 생성 및 수정 API 엔드포인트 -----

@router.post("/", response_model=CVEDetailResponse)
async def create_cve(
    cve_data: CreateCVERequest,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """새로운 CVE를 생성합니다."""
    try:
        # 이미 존재하는 CVE인지 확인
        existing_cve = await cve_service.get_cve(cve_data.cve_id)
        if existing_cve:
            raise HTTPException(
                status_code=409,
                detail=f"CVE ID {cve_data.cve_id}는 이미 존재합니다."
            )
        
        # 현재 사용자 정보 추가
        creator = current_user.username
        
        # CVE 생성
        cve = await cve_service.create_cve(cve_data, creator)
        
        # 소켓 알림 전송
        await send_cve_notification("add", cve)
        
        # 캐시 무효화
        await invalidate_cve_caches(cve_data.cve_id)
        
        return cve
    
    except HTTPException as http_exc:
        logger.error(f"HTTP error in create_cve: {http_exc.detail}")
        raise
    except ValidationError as val_exc:
        logger.error(f"Validation error in create_cve: {str(val_exc)}")
        raise HTTPException(
            status_code=422,
            detail=f"데이터 유효성 검증 오류: {str(val_exc)}"
        )
    except Exception as e:
        logger.error(f"Error in create_cve: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"CVE 생성 중 오류가 발생했습니다: {str(e)}"
        )

@router.patch("/{cve_id}", response_model=CVEDetailResponse)
async def update_cve(
    cve_id: str,
    update_data: PatchCVERequest,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """기존 CVE를 수정합니다."""
    try:
        logger.info(f"CVE 업데이트 요청: cve_id={cve_id}, 사용자={current_user.username}")
        logger.debug(f"업데이트 요청 데이터: {update_data.dict(exclude_unset=True)}")
        
        # cve_id 형식 확인 로깅
        is_object_id = len(cve_id) == 24 and all(c in '0123456789abcdef' for c in cve_id)
        is_cve_format = cve_id.startswith("CVE-") and len(cve_id) > 4
        logger.debug(f"cve_id 형식: {cve_id}, ObjectId 형식: {is_object_id}, CVE 형식: {is_cve_format}")
        
        # CVE 존재 확인
        existing_cve = await cve_service.get_cve(cve_id)
        if not existing_cve:
            logger.warning(f"업데이트할 CVE를 찾을 수 없음: {cve_id}")
            
            # 다른 방식으로 조회 시도
            if is_cve_format:
                logger.debug(f"대소문자 구분 없이 조회 시도")
                try:
                    # 대소문자 구분 없이 조회 시도
                    alt_cve = await cve_service.get_cve(cve_id)
                    if alt_cve:
                        logger.info(f"대소문자 구분 없이 CVE 찾음: {alt_cve.cve_id}")
                        existing_cve = alt_cve
                except Exception as e:
                    logger.error(f"대소문자 구분 없이 조회 중 오류: {str(e)}")
            
            if not existing_cve:
                error_msg = f"CVE ID {cve_id}를 찾을 수 없습니다."
                logger.error(error_msg)
                raise HTTPException(
                    status_code=404,
                    detail=error_msg
                )
        
        logger.debug(f"기존 CVE 정보: id={existing_cve.id}, cve_id={existing_cve.cve_id}")
        
        # 업데이트 데이터 준비
        update_dict = update_data.dict(exclude_unset=True)
        logger.debug(f"업데이트 데이터 (필터링 후): {update_dict}")
        
        # 업데이트 처리
        updated_cve = await cve_service.update_cve(
            cve_id=cve_id,
            update_data=update_dict,
            updated_by=current_user.username
        )
        
        if not updated_cve:
            error_msg = f"CVE ID {cve_id} 업데이트 실패"
            logger.error(error_msg)
            raise HTTPException(
                status_code=500,
                detail=error_msg
            )
        
        logger.info(f"CVE 업데이트 성공: {cve_id}")
        
        # 소켓 알림 전송
        await send_cve_notification("update", updated_cve)
        
        # 캐시 무효화
        await invalidate_cve_caches(cve_id)
        
        return updated_cve
        
    except HTTPException as http_exc:
        logger.error(f"HTTP error in update_cve: {http_exc.detail}")
        raise
    except ValidationError as val_exc:
        logger.error(f"Validation error in update_cve: {str(val_exc)}")
        raise HTTPException(
            status_code=422,
            detail=f"데이터 유효성 검증 오류: {str(val_exc)}"
        )
    except Exception as e:
        logger.error(f"Error in update_cve: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"CVE 업데이트 중 오류가 발생했습니다: {str(e)}"
        )

@router.put("/{cve_id}", response_model=CVEOperationResponse)
async def update_cve_full(
    cve_id: str,
    cve_data: dict,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    CVE 정보를 업데이트합니다 (캐시 무효화 포함)
    """
    updated = await cve_service.update_cve(cve_id, cve_data, current_user)
    
    if updated:
        # 캐시 무효화
        await invalidate_cve_caches(cve_id)
        return {"success": True, "message": f"{cve_id} 업데이트 완료"}
    else:
        raise HTTPException(status_code=404, detail=f"CVE ID {cve_id} not found")

# ----- CVE 삭제 API 엔드포인트 -----

@router.delete("/{cve_id}", response_model=CVEOperationResponse)
async def delete_cve(
    cve_id: str,
    current_user: User = Depends(get_current_admin_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE를 삭제합니다 (관리자 전용)."""
    try:
        deleted = await cve_service.delete_cve(cve_id)
        if not deleted:
            raise HTTPException(
                status_code=404,
                detail=f"CVE ID {cve_id}를 찾을 수 없습니다."
            )
        
        # 소켓 알림 전송
        await send_cve_notification("delete", cve_id=cve_id)
        
        # 캐시 무효화
        await invalidate_cve_caches(cve_id)
        
        return {"success": True, "message": f"CVE ID {cve_id}가 삭제되었습니다."}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in delete_cve: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"CVE 삭제 중 오류가 발생했습니다: {str(e)}"
        )

# ----- CVE 검색 API 엔드포인트 -----

@router.get("/search", response_model=CVESearchResponse)
async def search_cves(
    query: str,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    CVE를 검색합니다.
    
    Args:
        query: 검색어
        skip: 건너뛸 항목 수
        limit: 반환할 최대 항목 수
        current_user: 현재 인증된 사용자
        cve_service: CVE 서비스 인스턴스
        
    Returns:
        검색 결과 (total, items, query)
    """
    try:
        logger.info(f"사용자 '{current_user.username}'이(가) CVE 검색 요청. 검색어: '{query}', skip: {skip}, limit: {limit}")
        
        start_time = datetime.now()
        result = await cve_service.search_cves(query, skip, limit)
        
        # 성능 측정 및 로깅
        elapsed_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"CVE 검색 완료. 검색어: '{query}', 결과 수: {result.get('total', 0)}, 소요 시간: {elapsed_time:.3f}초")
        
        return {
            "total": result.get("total", 0),
            "items": result.get("items", []),
            "query": query
        }
    except Exception as e:
        logger.error(f"CVE 검색 중 오류 발생: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"CVE 검색 중 오류가 발생했습니다: {str(e)}"
        )

# ----- 대량(Bulk) API 엔드포인트 -----

@router.post("/bulk-upsert", response_model=BulkOperationResponse)
async def bulk_upsert_cves(
    bulk_request: BulkUpsertCVERequest,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    다중 CVE 데이터를 한 번에 upsert (생성 또는 업데이트) 합니다.
    각 CVE 데이터에 대해, DB에 존재하면 업데이트, 존재하지 않으면 새로 생성합니다.
    modification_history의 changes에서는 add 또는 edit으로 기록됩니다.
    
    Args:
        bulk_request: 대량 CVE 생성/업데이트 요청 데이터
        current_user: 현재 인증된 사용자
        cve_service: CVE 서비스 인스턴스
        
    Returns:
        작업 결과 (성공, 실패, 총 처리 건수)
    """
    try:
        cve_count = len(bulk_request.cves)
        logger.info(f"사용자 '{current_user.username}'이(가) {cve_count}개의 CVE 대량 업서트 요청")
        
        if cve_count == 0:
            return {
                "success": {},
                "errors": {},
                "total_processed": 0
            }
            
        # 성능 측정 시작
        start_time = datetime.now()
        
        # 크롤러 이름 확인 (추가 메타데이터로 사용)
        crawler_name = getattr(bulk_request, "crawler_name", None)
        
        # 각 CVE 처리 결과 저장
        success_results = {}
        error_results = {}
        
        # 벌크 업서트 서비스 호출
        result = await cve_service.bulk_upsert_cves(
            bulk_request.cves, 
            current_user.username,
            crawler_name
        )
        
        # 결과 처리
        if result:
            success_results = result.get("success", {})
            error_results = result.get("errors", {})
            
            # 성능 측정 및 로깅
            elapsed_time = (datetime.now() - start_time).total_seconds()
            success_count = len(success_results)
            error_count = len(error_results)
            
            logger.info(f"CVE 대량 업서트 완료. 총 {cve_count}개 요청 중 성공: {success_count}개, "
                       f"실패: {error_count}개, 소요 시간: {elapsed_time:.3f}초")
            
            # 모든 CVE 캐시 무효화
            await invalidate_cve_caches()
            
            # 실시간 알림 전송
            await send_cve_notification(
                type="bulk_upsert",
                message=f"{success_count}개의 CVE가 생성 또는 업데이트되었습니다."
            )
            
            return {
                "success": success_results,
                "errors": error_results,
                "total_processed": success_count + error_count
            }
        else:
            logger.error("CVE 대량 업서트 처리 결과가 없음")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="CVE 대량 업서트 처리 중 오류가 발생했습니다."
            )
            
    except Exception as e:
        logger.error(f"CVE 대량 업서트 중 오류 발생: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"CVE 대량 업서트 중 오류가 발생했습니다: {str(e)}"
        )

# ----- WebSocket 알림 전송 유틸리티 함수 -----

async def send_cve_notification(type: str, cve: Optional[Union[CVEModel, Dict[str, Any]]] = None, cve_id: Optional[str] = None, message: Optional[str] = None):
    """WebSocket을 통해 CVE 관련 알림을 전송합니다."""
    try:
        if type == "add" or type == "update":
            if cve:
                # cve_id 추출 (객체 또는 딕셔너리에서)
                if hasattr(cve, "cve_id"):
                    # CVEModel 객체인 경우
                    notification_cve_id = cve.cve_id
                    cve_data = json.loads(json.dumps(cve.dict(), cls=DateTimeEncoder))
                elif isinstance(cve, dict) and "cve_id" in cve:
                    # 딕셔너리인 경우
                    notification_cve_id = cve["cve_id"]
                    cve_data = json.loads(json.dumps(cve, cls=DateTimeEncoder))
                else:
                    # cve_id를 직접 사용
                    notification_cve_id = cve_id
                    cve_data = cve
                
                data = {
                    "event": f"cve_{type}d",  # "cve_added" 또는 "cve_updated"
                    "cve_id": notification_cve_id,
                    "data": cve_data,
                    "timestamp": datetime.now().isoformat()
                }
                
                if type == "add":
                    message_type = WSMessageType.CVE_CREATED
                else:
                    message_type = WSMessageType.CVE_UPDATED
                    
                await socketio_manager.broadcast_cve_update(
                    cve_id=data["cve_id"],
                    data=data,
                    event_type=message_type
                )
                logger.info(f"Sent WebSocket notification: {type} for CVE {data['cve_id']}")
                
        elif type == "delete":
            data = {
                "event": "cve_deleted",
                "cve_id": cve_id,
                "message": message or f"CVE {cve_id} deleted",
                "timestamp": datetime.now().isoformat()
            }
            
            await socketio_manager.broadcast_cve_update(
                cve_id=cve_id,
                data=data,
                event_type=WSMessageType.CVE_DELETED
            )
            logger.info(f"Sent WebSocket notification: delete for CVE {cve_id}")
            
    except Exception as e:
        logger.error(f"Error sending WebSocket notification: {str(e)}")
        logger.error(traceback.format_exc())

# ----- 관리자 전용 API 엔드포인트 -----

@router.post("/admin/check-empty-date-fields", response_model=dict)
async def check_empty_date_fields_async(
    background_tasks: BackgroundTasks,
    cve_service: CVEService = Depends(get_cve_service),
    current_user: User = Depends(get_current_admin_user)
):
    """
    데이터베이스에 있는 모든 CVE의 빈 날짜 필드를 백그라운드에서 검사합니다.
    관리자 권한이 필요합니다.
    """
    try:
        # 관리자 권한 확인
        if not current_user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="이 작업은 관리자만 수행할 수 있습니다."
            )
        
        # 백그라운드 작업으로 실행 (시간이 오래 걸릴 수 있음)
        background_tasks.add_task(cve_service.update_empty_date_fields)
        
        return {
            "status": "success",
            "message": "빈 날짜 필드 검사 작업이 백그라운드에서 실행 중입니다."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"빈 날짜 필드 검사 작업 시작 중 오류 발생: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"빈 날짜 필드 검사 작업 시작 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/admin/check-empty-date-fields", response_model=dict)
async def check_empty_date_fields_sync(
    cve_service: CVEService = Depends(get_cve_service),
    current_user: User = Depends(get_current_admin_user)
):
    """
    데이터베이스에 있는 모든 CVE의 빈 날짜 필드를 동기적으로 검사합니다.
    관리자 권한이 필요합니다.
    """
    try:
        # 관리자 권한 확인
        if not current_user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="이 작업은 관리자만 수행할 수 있습니다."
            )
        
        # 동기적으로 실행 (응답이 지연될 수 있음)
        start_time = datetime.now()
        result = await cve_service.update_empty_date_fields()
        elapsed_time = (datetime.now() - start_time).total_seconds()
        
        return {
            "status": "success",
            "message": "빈 날짜 필드 검사 작업이 완료되었습니다.",
            "elapsed_time_seconds": elapsed_time,
            "result": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"빈 날짜 필드 검사 작업 중 오류 발생: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"빈 날짜 필드 검사 작업 중 오류가 발생했습니다: {str(e)}"
        )
