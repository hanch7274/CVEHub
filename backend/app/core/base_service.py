"""
베이스 서비스 모듈

서비스 클래스에서 공통으로 사용하는 기능을 제공하는 기본 클래스입니다.
이 클래스는 템플릿 메서드 패턴을 사용하여 에러 처리, 로깅, 응답 형식 등의 공통 로직을 정의합니다.
"""

from typing import Any, Dict, Optional, TypeVar, Generic, Type, Union, List, Tuple, Protocol
import traceback
import logging
from abc import ABC, abstractmethod

# 제네릭 타입 변수 정의
T = TypeVar('T')
R = TypeVar('R')

# 로거 설정
logger = logging.getLogger(__name__)


class BaseRepository(Protocol):
    """저장소 인터페이스 프로토콜

    이 프로토콜은 저장소 클래스가 구현해야 하는 기본적인 메서드를 정의합니다.
    실제 구현은 각 저장소 클래스에서 해야 합니다.
    """
    pass


class BaseService(ABC, Generic[T]):
    """기본 서비스 클래스

    템플릿 메서드 패턴을 사용하여 공통 로직을 제공하는 기본 서비스 클래스입니다.
    이 클래스를 상속받아 구체적인 서비스 구현을 만들 수 있습니다.
    """

    def __init__(self, repository: Optional[T] = None):
        """서비스 초기화

        Args:
            repository: 저장소 인스턴스 (선택적)
        """
        self.repository = repository
        self.logger = self._get_logger()

    def _get_logger(self) -> logging.Logger:
        """로거 인스턴스를 반환합니다.

        이 메서드는 하위 클래스에서 오버라이드하여 다른 로거를 사용할 수 있습니다.

        Returns:
            로거 인스턴스
        """
        return logging.getLogger(self.__class__.__module__)

    async def execute_with_error_handling(self, func, *args, **kwargs) -> Dict[str, Any]:
        """오류 처리와 함께 비동기 함수를 실행합니다.

        Args:
            func: 실행할 비동기 함수
            *args: 함수에 전달할 위치 인자
            **kwargs: 함수에 전달할 키워드 인자

        Returns:
            실행 결과를 담은 딕셔너리 (성공 또는 오류 정보 포함)
        """
        try:
            # 함수 실행
            result = await func(*args, **kwargs)
            
            # 성공 응답 생성
            return self.create_success_response(result)
        except Exception as e:
            # 오류 로깅
            self.logger.error(f"함수 실행 중 오류 발생: {str(e)}")
            self.logger.error(traceback.format_exc())
            
            # 오류 응답 생성
            return self.create_error_response(str(e))

    def create_success_response(self, data: Any = None) -> Dict[str, Any]:
        """성공 응답을 생성합니다.

        Args:
            data: 응답에 포함할 데이터

        Returns:
            성공 응답 딕셔너리
        """
        response = {"success": True}
        
        if data is not None:
            # 반환 데이터가 딕셔너리인 경우 병합
            if isinstance(data, dict):
                response.update(data)
            else:
                # 딕셔너리가 아닌 경우 result 키로 저장
                response["result"] = data
                
        return response

    def create_error_response(self, error_message: str, error_code: str = None) -> Dict[str, Any]:
        """오류 응답을 생성합니다.

        Args:
            error_message: 오류 메시지
            error_code: 오류 코드 (선택적)

        Returns:
            오류 응답 딕셔너리
        """
        error = {
            "message": error_message
        }
        
        if error_code:
            error["code"] = error_code
            
        return {
            "success": False,
            "error": error
        }

    async def handle_operation(self, operation_name: str, operation_func, *args, **kwargs) -> Dict[str, Any]:
        """작업을 처리하고 결과를 반환합니다.

        이 템플릿 메서드는 작업 전후 로깅과 오류 처리를 포함한 공통 로직을 제공합니다.

        Args:
            operation_name: 작업 이름 (로깅용)
            operation_func: 실행할 비동기 함수
            *args: 함수에 전달할 위치 인자
            **kwargs: 함수에 전달할 키워드 인자

        Returns:
            작업 결과를 담은 딕셔너리
        """
        self.logger.debug(f"{operation_name} 작업 시작")
        
        try:
            # 작업 전 전처리 (하위 클래스에서 구현 가능)
            self.before_operation(operation_name, *args, **kwargs)
            
            # 작업 실행
            result = await self.execute_with_error_handling(operation_func, *args, **kwargs)
            
            # 작업 후 후처리 (하위 클래스에서 구현 가능)
            self.after_operation(operation_name, result, *args, **kwargs)
            
            self.logger.debug(f"{operation_name} 작업 완료: {result.get('success', False)}")
            return result
        except Exception as e:
            self.logger.error(f"{operation_name} 작업 중 예외 발생: {str(e)}")
            self.logger.error(traceback.format_exc())
            
            # 예외 처리 (하위 클래스에서 구현 가능)
            self.handle_operation_exception(operation_name, e, *args, **kwargs)
            
            return self.create_error_response(str(e))

    def before_operation(self, operation_name: str, *args, **kwargs) -> None:
        """작업 실행 전 호출되는 메서드

        하위 클래스에서 오버라이드하여 전처리 로직을 구현할 수 있습니다.

        Args:
            operation_name: 작업 이름
            *args: 작업에 전달된 위치 인자
            **kwargs: 작업에 전달된 키워드 인자
        """
        pass

    def after_operation(self, operation_name: str, result: Dict[str, Any], *args, **kwargs) -> None:
        """작업 실행 후 호출되는 메서드

        하위 클래스에서 오버라이드하여 후처리 로직을 구현할 수 있습니다.

        Args:
            operation_name: 작업 이름
            result: 작업 결과
            *args: 작업에 전달된 위치 인자
            **kwargs: 작업에 전달된 키워드 인자
        """
        pass

    def handle_operation_exception(self, operation_name: str, exception: Exception, *args, **kwargs) -> None:
        """작업 중 예외 발생 시 호출되는 메서드

        하위 클래스에서 오버라이드하여 예외 처리 로직을 구현할 수 있습니다.

        Args:
            operation_name: 작업 이름
            exception: 발생한 예외
            *args: 작업에 전달된 위치 인자
            **kwargs: 작업에 전달된 키워드 인자
        """
        pass
