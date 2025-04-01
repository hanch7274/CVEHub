"""
CVE 관련 API 라우터 - 모든 CVE 관련 엔드포인트 통합
"""
from fastapi import APIRouter, HTTPException, Query, Path, status, Depends, Response, BackgroundTasks
from typing import Dict, Any, Optional, Union
from datetime import datetime
import logging
import traceback
import json
from pydantic import ValidationError
from app.models.cve_model import CVEModel
from app.models.user_model import User
from app.services.cve_service import CVEService
from app.core.dependencies import get_cve_service
from app.core.auth import get_current_user, get_current_admin_user
from app.core.socketio_manager import socketio_manager, WSMessageType, DateTimeEncoder
from app.core.cache import (
    get_cache, cache_cve_detail, cache_cve_list, 
    invalidate_cve_caches, CACHE_KEY_PREFIXES
)
from app.schemas.cve_base_schemas import (
    CreateCVERequest, PatchCVERequest, BulkUpsertCVERequest, CVEListResponse, 
    CVEDetailResponse, CVEOperationResponse,
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

# ----- CVE 통계 API 엔드포인트 -----

@router.get("/stats", response_model=Dict[str, int])
async def get_cve_stats(
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE 통계 정보를 가져옵니다."""
    try:
        logger.info("CVE 통계 정보 요청")
        
        # 통계 계산
        stats = await cve_service.get_cve_stats()
        
        logger.info("CVE 통계 정보 제공 완료")
        return stats
        
    except Exception as e:
        logger.error(f"CVE 통계 조회 중 오류 발생: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail="CVE 통계 조회 중 오류가 발생했습니다."
        )

# ----- CVE 상세 조회 API 엔드포인트 -----

@router.get("/{cve_id}", response_model=CVEDetailResponse)
async def get_cve_detail(
    cve_id: str,
    bypass_cache: bool = Query(False, description="캐시를 우회하고 항상 데이터베이스에서 조회합니다."),
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    CVE ID로 CVE 상세 정보를 조회합니다.
    
    Args:
        cve_id: 조회할 CVE ID
        bypass_cache: 캐시를 우회할지 여부
        current_user: 현재 인증된 사용자
        cve_service: CVE 서비스 인스턴스
        
    Returns:
        CVE 상세 정보
    """
    try:
        # 라우터에서 직접 콘솔에 출력하는 print 로그 추가
        print(f"##### API 라우터: GET /cves/{cve_id} 호출됨, bypass_cache={bypass_cache} #####")
        
        logger.info(f"사용자 '{current_user.username}'이(가) CVE '{cve_id}' 상세 정보 요청")
        
        cache_key = f"{CACHE_KEY_PREFIXES['cve_detail']}{cve_id}"
        
        # 캐시 우회 옵션이 없으면 캐시에서 조회
        if not bypass_cache:
            cached_data = await get_cache(cache_key)
            if cached_data:
                print(f"##### 캐시에서 CVE 상세 정보 로드: {cache_key} #####")
                logger.debug(f"캐시에서 CVE 상세 정보 로드: {cache_key}")
                return cached_data
            else:
                print(f"##### 캐시에 데이터 없음: {cache_key} #####")
        else:
            print(f"##### 캐시 우회 옵션 활성화됨 #####")
        
        # 캐시에 없거나 우회 옵션이 설정된 경우 DB에서 조회
        print(f"##### cve_service.get_cve_detail({cve_id}) 호출 시작 #####")
        result = await cve_service.get_cve_detail(cve_id, include_details=True)
        print(f"##### cve_service.get_cve_detail({cve_id}) 호출 완료, 결과 있음: {result is not None} #####")
        
        # 결과가 None인 경우 404 오류 반환
        if result is None:
            logger.warning(f"CVE '{cve_id}' 정보를 찾을 수 없음")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"CVE ID '{cve_id}'를 찾을 수 없습니다."
            )
        
        # 결과 캐싱
        await cache_cve_detail(cve_id, result)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CVE '{cve_id}' 상세 정보 조회 중 오류 발생: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CVE 상세 정보 조회 중 오류가 발생했습니다."
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
        cve = await cve_service.get_cve_detail(cve_id, include_details=True)
        if not cve:
            raise HTTPException(status_code=404, detail=f"CVE ID {cve_id} not found")
        
        response = Response()
        
        # Last-Modified 헤더 설정
        if 'last_modified_at' in cve and cve['last_modified_at']:
            last_modified = cve['last_modified_at'].strftime("%a, %d %b %Y %H:%M:%S GMT")
            response.headers["Last-Modified"] = last_modified
        
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
        logger.info(f"CVE 생성 요청: cve_id={cve_data.cve_id}, 사용자={current_user.username}")
        
        # 이미 존재하는 CVE인지 확인 (try-except 블록으로 감싸서 오류 처리)
        try:
            # 대소문자 구분 없이 정확히 일치하는 CVE 검색
            existing_cve = await cve_service.repository.find_by_cve_id(cve_data.cve_id)
            
            if existing_cve:
                logger.warning(f"중복 CVE 생성 시도: {cve_data.cve_id} (이미 존재함: {existing_cve.cve_id})")
                raise HTTPException(
                    status_code=409,
                    detail=f"CVE ID {cve_data.cve_id}는 이미 존재합니다."
                )
        except Exception as e:
            if not isinstance(e, HTTPException):
                logger.error(f"중복 CVE 확인 중 오류 발생: {str(e)}")
                # 중복 확인 중 오류가 발생했지만 계속 진행 (생성 시 DB 레벨에서 다시 검증됨)
        
        # 현재 사용자 정보 추가
        creator = current_user.username
        
        # CVE 생성
        cve = await cve_service.create_cve(cve_data, creator)
        if not cve:
            raise HTTPException(
                status_code=500,
                detail="CVE 생성 중 오류가 발생했습니다."
            )
            
        # 모델을 딕셔너리로 변환
        cve_dict = cve.dict() if hasattr(cve, 'dict') else cve
        
        # 소켓 알림 전송
        await send_cve_notification("add", cve_dict)
        
        # 캐시 무효화
        await invalidate_cve_caches(cve_data.cve_id)
        
        return cve_dict
    
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
        existing_cve = await cve_service.get_cve_detail(cve_id, include_details=True)
        if not existing_cve:
            logger.warning(f"업데이트할 CVE를 찾을 수 없음: {cve_id}")
            
            # 다른 방식으로 조회 시도
            if is_cve_format:
                logger.debug(f"대소문자 구분 없이 조회 시도")
                try:
                    # 대소문자 구분 없이 조회 시도
                    alt_cve = await cve_service.get_cve_detail(cve_id, include_details=True)
                    if alt_cve:
                        logger.info(f"대소문자 구분 없이 CVE 찾음: {alt_cve.get('cve_id', '')}")
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
        
        logger.debug(f"기존 CVE 정보: id={existing_cve.get('id', '')}, cve_id={existing_cve.get('cve_id', '')}")
        
        # 업데이트 데이터 준비
        update_dict = update_data.dict(exclude_unset=True)
        logger.debug(f"업데이트 데이터 (필터링 후): {update_dict}")
        
        # 업데이트된 필드 추적
        updated_fields = list(update_dict.keys())
        field_key = "general"  # 기본값
        
        # 특정 필드 업데이트 감지
        if len(updated_fields) == 1:
            if "pocs" in updated_fields:
                field_key = "poc"
            elif "snort_rules" in updated_fields:
                field_key = "snortRules"
            elif "references" in updated_fields:
                field_key = "references"
            elif "status" in updated_fields:
                field_key = "status"
            elif "title" in updated_fields:
                field_key = "title"
            elif "comments" in updated_fields:
                field_key = "comments"
        
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
        
        logger.info(f"CVE 업데이트 성공: {cve_id}, 업데이트된 필드: {field_key}")
        
        # 소켓 알림 전송 - 업데이트된 필드 정보 포함
        await send_cve_notification("update", updated_cve, field_key=field_key, updated_fields=updated_fields)
        
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

# ----- CVE 삭제 API 엔드포인트 -----

@router.delete("/{cve_id}", response_model=CVEOperationResponse)
async def delete_cve(
    cve_id: str,
    current_user: User = Depends(get_current_admin_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE를 삭제합니다 (관리자 전용)."""
    try:
        logger.info(f"사용자 '{current_user.username}'이(가) CVE '{cve_id}' 삭제 요청")
        
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
        
        logger.info(f"CVE '{cve_id}' 삭제 완료")
        return {"success": True, "message": f"CVE ID {cve_id}가 삭제되었습니다."}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CVE '{cve_id}' 삭제 중 오류 발생: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail="CVE 삭제 중 오류가 발생했습니다."
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
        result = await cve_service.get_cve_list(
            page=skip // limit + 1 if limit > 0 else 1,
            limit=limit,
            search=query
        )
        
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

async def send_cve_notification(type: str, cve: Optional[Union[CVEModel, Dict[str, Any]]] = None, cve_id: Optional[str] = None, message: Optional[str] = None, field_key: Optional[str] = None, updated_fields: Optional[list] = None):
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
                
                if field_key:
                    data["field_key"] = field_key
                if updated_fields:
                    data["updated_fields"] = updated_fields
                
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
