"""
소켓 모듈의 데이터 모델 정의

WebSocket 메시지 타입, 이벤트 타입, 구독 정보 등 소켓 통신에 필요한 데이터 구조를 정의합니다.
"""
from enum import Enum
from typing import Dict, List, Optional, Set, Any, Union
from pydantic import BaseModel, Field
from datetime import datetime


class WSMessageType(str, Enum):
    """WebSocket 메시지 타입 열거형"""
    CONNECTED = "connected"
    CONNECT_ACK = "connect_ack"
    SESSION_INFO_ACK = "session_info_ack"
    PING = "ping"
    PONG = "pong"
    ERROR = "error"
    NOTIFICATION = "notification"
    NOTIFICATION_READ = "notification_read"
    ALL_NOTIFICATIONS_READ = "all_notifications_read"
    CVE_CREATED = "cve_created"
    CVE_UPDATED = "cve_updated"
    CVE_DELETED = "cve_deleted"
    CRAWLER_UPDATE_PROGRESS = "crawler_update_progress"
    COMMENT_ADDED = "comment_added"
    COMMENT_UPDATED = "comment_updated"
    COMMENT_DELETED = "comment_deleted"
    COMMENT_REACTION_ADDED = "comment_reaction_added"
    COMMENT_REACTION_REMOVED = "comment_reaction_removed"
    COMMENT_COUNT_UPDATE = "comment_count_update"
    SUBSCRIBE_CVE = "subscribe_cve"
    UNSUBSCRIBE_CVE = "unsubscribe_cve"
    SUBSCRIPTION_STATUS = "subscription_status"
    CVE_SUBSCRIBERS_UPDATED = "cve_subscribers_updated"


class SocketSession(BaseModel):
    """소켓 세션 정보 모델"""
    sid: str
    username: Optional[str] = None
    session_id: str
    connected_at: datetime
    subscribed_cves: Set[str] = Field(default_factory=set)
    
    class Config:
        arbitrary_types_allowed = True


class SocketError(BaseModel):
    """소켓 오류 모델"""
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class SocketMessage(BaseModel):
    """소켓 메시지 기본 모델"""
    type: WSMessageType
    data: Optional[Any] = None
    timestamp: datetime = Field(default_factory=datetime.now)


class SocketSubscription(BaseModel):
    """소켓 구독 요청/응답 모델"""
    cve_id: str
    success: bool = True
    error: Optional[SocketError] = None


class SocketNotification(BaseModel):
    """소켓 알림 메시지 모델"""
    notification_id: str
    recipient_id: str
    type: str
    content: str
    created_at: datetime
    unread_count: int
    metadata: Optional[Dict[str, Any]] = None


class SocketAuth(BaseModel):
    """소켓 인증 정보 모델"""
    token: str
    user_id: str
    session_id: Optional[str] = None


class SessionCleanupRequest(BaseModel):
    """세션 구독 정리 요청 모델"""
    session_id: str
    user_id: Optional[str] = None
