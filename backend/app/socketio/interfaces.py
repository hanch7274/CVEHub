"""
소켓 모듈의 인터페이스 정의

이 모듈은 순환 참조를 방지하기 위해 소켓 모듈에서 사용되는 다양한 컴포넌트의 
인터페이스(또는 프로토콜)를 정의합니다.
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List, Set, Union, Protocol, runtime_checkable
from datetime import datetime

from .models import WSMessageType, SocketSession, SocketError, SocketSubscription


@runtime_checkable
class SocketServiceInterface(Protocol):
    """Socket 서비스 인터페이스"""
    
    @abstractmethod
    async def handle_event(self, sid: str, event_type: WSMessageType, data: Any) -> Dict[str, Any]:
        """
        Socket.IO 이벤트를 처리합니다.
        
        Args:
            sid: 소켓 ID
            event_type: 이벤트 타입
            data: 이벤트 데이터
            
        Returns:
            처리 결과
        """
        ...
    
    @abstractmethod
    async def handle_subscription(self, sid: str, user_id: Optional[str], cve_id: str, subscribe: bool = True) -> SocketSubscription:
        """
        CVE 구독/구독취소 요청을 처리합니다.
        
        Args:
            sid: 소켓 ID
            user_id: 사용자 ID (옵션)
            cve_id: CVE ID
            subscribe: 구독 여부 (True=구독, False=구독취소)
            
        Returns:
            구독 상태 응답
        """
        ...
    
    @abstractmethod
    async def create_and_deliver_notification(
        self, 
        recipient_id: str, 
        notification_type: str,
        content: str, 
        sender_id: Optional[str] = None,
        cve_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        알림을 생성하고 전송합니다.
        
        Args:
            recipient_id: 수신자 ID
            notification_type: 알림 유형
            content: 알림 내용
            sender_id: 발신자 ID (옵션)
            cve_id: 관련 CVE ID (옵션)
            metadata: 추가 메타데이터 (옵션)
            
        Returns:
            생성된 알림 정보
        """
        ...


@runtime_checkable
class SocketRepositoryInterface(Protocol):
    """Socket 저장소 인터페이스"""
    
    @abstractmethod
    async def get_session(self, sid: str) -> Optional[SocketSession]:
        """
        SID로 세션 정보를 조회합니다.
        
        Args:
            sid: 소켓 ID
            
        Returns:
            세션 정보 또는 None
        """
        ...
    
    @abstractmethod
    async def get_user_sessions(self, user_id: str) -> List[SocketSession]:
        """
        사용자 ID로 모든 세션 정보를 조회합니다.
        
        Args:
            user_id: 사용자 ID
            
        Returns:
            세션 목록
        """
        ...
    
    @abstractmethod
    async def save_session(self, session: SocketSession) -> SocketSession:
        """
        세션 정보를 저장합니다.
        
        Args:
            session: 저장할 세션 정보
            
        Returns:
            저장된 세션 정보
        """
        ...
    
    @abstractmethod
    async def delete_session(self, sid: str) -> bool:
        """
        세션 정보를 삭제합니다.
        
        Args:
            sid: 소켓 ID
            
        Returns:
            삭제 성공 여부
        """
        ...
    
    @abstractmethod
    async def get_cve_subscribers(self, cve_id: str) -> Set[str]:
        """
        CVE 구독자 ID 목록을 조회합니다.
        
        Args:
            cve_id: CVE ID
            
        Returns:
            구독자 ID 목록
        """
        ...


@runtime_checkable
class NotificationServiceInterface(Protocol):
    """알림 서비스 인터페이스"""
    
    @abstractmethod
    async def create_notification(
        self,
        notification_type: Any,  # NotificationType
        recipient_id: str,
        content: str,
        sender_id: Optional[str] = None,
        cve_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> tuple:
        """
        알림을 생성하고 저장합니다.
        
        Args:
            notification_type: 알림 유형
            recipient_id: 수신자 ID
            content: 알림 내용
            sender_id: 발신자 ID (옵션)
            cve_id: 관련 CVE ID (옵션)
            metadata: 추가 메타데이터 (옵션)
            
        Returns:
            생성된 알림과 읽지 않은 알림 수의 튜플
        """
        ...
    
    @abstractmethod
    async def get_unread_count(self, user_id: str) -> int:
        """
        읽지 않은 알림 개수를 조회합니다.
        
        Args:
            user_id: 사용자 ID
            
        Returns:
            읽지 않은 알림 개수
        """
        ...


# 싱글톤 인스턴스의 타입 선언을 위한 함수 타입 정의
def get_socket_service_interface() -> SocketServiceInterface:
    """Socket 서비스 인스턴스를 반환합니다"""
    ...

def get_socket_repository_interface() -> SocketRepositoryInterface:
    """Socket 저장소 인스턴스를 반환합니다"""
    ...

def get_notification_service_interface() -> NotificationServiceInterface:
    """알림 서비스 인스턴스를 반환합니다"""
    ...
