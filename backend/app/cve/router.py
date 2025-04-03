"""
CVE 및 Comment API 라우터 - 모든 CVE 및 댓글 관련 엔드포인트 통합
"""
from fastapi import APIRouter, HTTPException, Query, Path, status, Depends, Response, BackgroundTasks
from typing import Dict, Any, Optional, Union, List
from datetime import datetime
import logging
import traceback
import json
import functools
from pydantic import ValidationError

from app.cve.models import (
    CVEModel, CVEListResponse, CVEDetailResponse, CVEOperationResponse,
    BulkOperationResponse, CVESearchResponse, CreateCVERequest, PatchCVERequest,
    BulkUpsertCVERequest, CommentCreate, CommentUpdate, CommentResponse
)
from app.auth.models import User
from app.cve.service import CVEService
from app.core.dependencies import get_cve_service
from app.auth.service import get_current_user, get_current_admin_user
from app.core.socketio_manager import socketio_manager, WSMessageType, DateTimeEncoder
from app.core.cache import (
    get_cache, cache_cve_detail, cache_cve_list, 
    invalidate_cve_caches, CACHE_KEY_PREFIXES
)
from app.core.config import get_settings

# 로거 설정
logger = logging.getLogger(__name__)

# 설정 가져오기
settings = get_settings()

# 기본 라우터
router = APIRouter()

# 예외 타입별 HTTP 상태 코드 매핑
exception_status_map = {
    ValidationError: status.HTTP_400_BAD_REQUEST,
    ValueError: status.HTTP_400_BAD_REQUEST,
    KeyError: status.HTTP_404_NOT_FOUND,
    IndexError: status.HTTP_404_NOT_FOUND,
    PermissionError: status.HTTP_403_FORBIDDEN,
    FileNotFoundError: status.HTTP_404_NOT_FOUND,
    NotImplementedError: status.HTTP_501_NOT_IMPLEMENTED,
}

# 예외 타입별 에러 메시지 매핑
exception_message_map = {
    ValidationError: "유효하지 않은 데이터 형식입니다",
    ValueError: "잘못된 값이 제공되었습니다",
    KeyError: "요청한 항목을 찾을 수 없습니다",
    IndexError: "색인이 범위를 벗어났습니다",
    PermissionError: "이 작업을 수행할 권한이 없습니다",
    FileNotFoundError: "파일을 찾을 수 없습니다",
    NotImplementedError: "이 기능은 아직 구현되지 않았습니다",
}

def cve_api_error_handler(func):
    """CVE API 엔드포인트 예외 처리 데코레이터"""
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except HTTPException:
            # FastAPI HTTP 예외는 그대로 전달
            raise
        except Exception as e:
            # 로깅
            endpoint = func.__name__
            logger.error(f"CVE API 오류 ({endpoint}): {str(e)}")
            if "current_user" in kwargs:
                user = kwargs["current_user"]
                logger.error(f"사용자: {user.username} (ID: {user.id})")
                
            # 예외 유형에 따른 상태 코드 결정
            error_status = status.HTTP_500_INTERNAL_SERVER_ERROR
            for exc_type, status_code in exception_status_map.items():
                if isinstance(e, exc_type):
                    error_status = status_code
                    break
                    
            # 예외 유형에 따른 메시지 결정
            base_message = "서버 내부 오류가 발생했습니다"
            for exc_type, message in exception_message_map.items():
                if isinstance(e, exc_type):
                    base_message = message
                    break
            
            # 상세 오류 정보 (개발 환경에서만)
            error_detail = f"{base_message}: {str(e)}"
            if settings.DEBUG:
                error_detail = f"{error_detail}\n{traceback.format_exc()}"
                
            # 표준화된 HTTP 예외 반환
            raise HTTPException(
                status_code=error_status,
                detail=error_detail
            )
    return wrapper

# ----- CVE 기본 엔드포인트 -----

@router.get("/total-count", response_model=dict)
@cve_api_error_handler
async def get_total_cve_count(
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """데이터베이스에 존재하는 전체 CVE 개수를 반환합니다."""
    logger.info(f"사용자 '{current_user.username}'이(가) 전체 CVE 개수 요청")
    count = await cve_service.get_total_cve_count()
    logger.info(f"전체 CVE 개수 조회 완료: {count}")
    return {"count": count}

@router.get("/list", response_model=CVEListResponse)
@cve_api_error_handler
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

# ----- CVE 통계 API 엔드포인트 -----

@router.get("/stats", response_model=Dict[str, int])
@cve_api_error_handler
async def get_cve_stats(
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE 통계 정보를 가져옵니다."""
    logger.info("CVE 통계 정보 요청")
    
    # 통계 계산
    stats = await cve_service.get_cve_stats()
    
    logger.info("CVE 통계 정보 제공 완료")
    return stats

@router.get("/{cve_id}", response_model=CVEDetailResponse)
@cve_api_error_handler
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

@router.get("/{cve_id}", response_model=CVEDetailResponse)
@cve_api_error_handler
async def get_cve_detail(
    cve_id: str,
    bypass_cache: bool = Query(False, description="캐시를 우회하고 항상 데이터베이스에서 조회합니다."),
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE ID로 CVE 상세 정보를 조회합니다."""
    # 기존 구현 유지

@router.head("/{cve_id}")
@cve_api_error_handler
async def head_cve(
    cve_id: str,
    cve_service: CVEService = Depends(get_cve_service)
):
    """
    CVE의 메타데이터만 반환하는 HEAD 요청 처리
    클라이언트 캐싱을 위해 Last-Modified 헤더 제공
    """
    cve = await cve_service.get_cve_detail(cve_id, include_details=True)
    if not cve:
        raise HTTPException(status_code=404, detail=f"CVE ID {cve_id} not found")
    
    response = Response()
    
    # Last-Modified 헤더 설정
    if 'last_modified_at' in cve and cve['last_modified_at']:
        last_modified = cve['last_modified_at'].strftime("%a, %d %b %Y %H:%M:%S GMT")
        response.headers["Last-Modified"] = last_modified
    
    return response

@router.post("/", response_model=CVEDetailResponse)
@cve_api_error_handler
async def create_cve(
    cve_data: CreateCVERequest,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """새로운 CVE를 생성합니다."""
    logger.info(f"CVE 생성 요청: cve_id={cve_data.cve_id}, 사용자={current_user.username}")
    
    # 이미 존재하는 CVE인지 확인 (중복 확인 중 오류가 발생해도 생성 시도를 계속 진행)
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

@router.patch("/{cve_id}", response_model=CVEDetailResponse)
@cve_api_error_handler
async def update_cve(
    cve_id: str,
    update_data: PatchCVERequest,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """기존 CVE를 수정합니다."""
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

@router.delete("/{cve_id}", response_model=CVEOperationResponse)
@cve_api_error_handler
async def delete_cve(
    cve_id: str,
    current_user: User = Depends(get_current_admin_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE를 삭제합니다 (관리자 전용)."""
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

# ----- 댓글 관련 엔드포인트 -----

@router.post("/{cve_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
@cve_api_error_handler
async def create_comment(
    cve_id: str,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """새 댓글을 생성합니다."""
    logger.info(f"CVE {cve_id}에 사용자 {current_user.username}의 댓글 생성")
    
    comment, message = await cve_service.create_comment(
        cve_id=cve_id,
        content=comment_data.content,
        user=current_user,
        parent_id=comment_data.parent_id,
        mentions=comment_data.mentions
    )
    
    if not comment:
        logger.error(f"댓글 생성 실패: {message}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    
    logger.info(f"댓글 생성 성공: {comment.id}")
    return comment

@router.put("/{cve_id}/comments/{comment_id}", response_model=CommentResponse)
@cve_api_error_handler
async def update_comment(
    cve_id: str,
    comment_id: str,
    comment_data: CommentUpdate,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """댓글을 수정합니다."""
    logger.info(f"CVE {cve_id}의 댓글 {comment_id} 사용자 {current_user.username}에 의한 수정")
    
    comment, message = await cve_service.update_comment(
        cve_id=cve_id,
        comment_id=comment_id,
        content=comment_data.content,
        user=current_user
    )
    
    if not comment:
        logger.error(f"댓글 수정 실패: {message}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    
    logger.info(f"댓글 수정 성공: {comment_id}")
    return comment

@router.delete("/{cve_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
@cve_api_error_handler
async def delete_comment(
    cve_id: str,
    comment_id: str,
    permanent: bool = False,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """댓글을 삭제합니다."""
    logger.info(f"CVE {cve_id}의 댓글 {comment_id} 사용자 {current_user.username}에 의한 삭제")
    
    success, message = await cve_service.delete_comment(
        cve_id=cve_id,
        comment_id=comment_id,
        user=current_user,
        permanent=permanent
    )
    
    if not success:
        logger.error(f"댓글 삭제 실패: {message}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    
    logger.info(f"댓글 삭제 성공: {comment_id}")
    return {"message": "댓글이 성공적으로 삭제되었습니다."}

@router.get("/{cve_id}/comments", response_model=List[CommentResponse])
@cve_api_error_handler
async def get_comments(
    cve_id: str,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE의 모든 댓글을 조회합니다."""
    logger.info(f"CVE {cve_id}의 댓글 조회")
    
    comments = await cve_service.get_comments(cve_id)
    
    logger.info(f"CVE {cve_id}의 댓글 {len(comments)}개 조회됨")
    return comments

@router.get("/{cve_id}/comments/count", response_model=int)
@cve_api_error_handler
async def get_comment_count(
    cve_id: str,
    current_user: User = Depends(get_current_user),
    cve_service: CVEService = Depends(get_cve_service)
):
    """CVE의 활성화된 댓글 수를 반환합니다."""
    logger.info(f"CVE {cve_id}의 댓글 수 요청")
    
    count = await cve_service.count_active_comments(cve_id)
    
    logger.info(f"CVE {cve_id}의 댓글 수: {count}")
    return count

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
