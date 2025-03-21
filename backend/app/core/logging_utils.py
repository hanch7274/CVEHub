"""
로깅 유틸리티 모듈

애플리케이션 전체에서 일관된 로깅 형식과 컨텍스트를 제공하기 위한 유틸리티 함수들을 포함합니다.
"""

import logging
import inspect
import functools
from typing import Any, Dict, Optional, Union, Callable
from contextvars import ContextVar

# 현재 요청의 컨텍스트 정보를 저장하기 위한 ContextVar
request_id_var = ContextVar("request_id", default=None)
user_id_var = ContextVar("user_id", default=None)

class LoggerAdapter(logging.LoggerAdapter):
    """
    로깅 어댑터 클래스
    
    표준화된 로그 포맷과 컨텍스트 정보를 제공합니다.
    """
    
    def process(self, msg, kwargs):
        """
        로그 메시지를 처리하고 컨텍스트 정보를 추가합니다.
        
        Args:
            msg: 원본 로그 메시지
            kwargs: 로깅 함수에 전달된 키워드 인자
            
        Returns:
            처리된 메시지와 키워드 인자
        """
        # 기존 extra 정보 가져오기
        extra = kwargs.get("extra", {})
        
        # 컨텍스트 정보 추가
        if request_id := request_id_var.get():
            extra["request_id"] = request_id
        
        if user_id := user_id_var.get():
            extra["user_id"] = user_id
            
        # 호출자 정보 추가 (모듈, 함수)
        frame = inspect.currentframe().f_back.f_back
        module = inspect.getmodule(frame)
        module_name = module.__name__ if module else "unknown"
        function_name = frame.f_code.co_name
        
        extra["app_module"] = module_name
        extra["function"] = function_name
        
        # 원본 extra 정보 업데이트
        kwargs["extra"] = extra
        
        # 포맷팅된 메시지 반환
        formatted_msg = f"[{module_name}.{function_name}] {msg}"
        return formatted_msg, kwargs

def get_logger(name: str) -> LoggerAdapter:
    """
    표준화된 로거 인스턴스를 반환합니다.
    
    Args:
        name: 로거 이름 (일반적으로 __name__)
        
    Returns:
        LoggerAdapter 인스턴스
    """
    logger = logging.getLogger(name)
    return LoggerAdapter(logger, {})

def set_request_context(request_id: str, user_id: Optional[str] = None) -> None:
    """
    현재 요청의 컨텍스트 정보를 설정합니다.
    
    Args:
        request_id: 요청 ID
        user_id: 사용자 ID (선택 사항)
    """
    request_id_var.set(request_id)
    if user_id:
        user_id_var.set(user_id)

def clear_request_context() -> None:
    """현재 요청의 컨텍스트 정보를 초기화합니다."""
    request_id_var.set(None)
    user_id_var.set(None)

def log_function_call(logger: Optional[LoggerAdapter] = None) -> Callable:
    """
    함수 호출을 로깅하는 데코레이터
    
    Args:
        logger: 사용할 로거 인스턴스 (None인 경우 함수의 모듈 이름으로 로거 생성)
        
    Returns:
        데코레이터 함수
    """
    def decorator(func):
        # 로거가 제공되지 않은 경우 함수의 모듈 이름으로 로거 생성
        nonlocal logger
        if logger is None:
            module = inspect.getmodule(func)
            module_name = module.__name__ if module else "unknown"
            logger = get_logger(module_name)
        
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            func_name = func.__name__
            logger.debug(f"함수 호출: {func_name}")
            try:
                result = func(*args, **kwargs)
                logger.debug(f"함수 완료: {func_name}")
                return result
            except Exception as e:
                logger.error(f"함수 오류: {func_name} - {str(e)}")
                raise
        
        return wrapper
    
    # 데코레이터가 인자 없이 사용된 경우 처리
    if callable(logger):
        func, logger = logger, None
        return decorator(func)
    
    return decorator
