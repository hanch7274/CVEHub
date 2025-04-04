"""
소켓 세션 및 연결 상태 관리 리파지토리

소켓 세션, 사용자 연결, CVE 구독 상태 등의 데이터를 관리합니다.
메모리 기반 저장소를 사용하며, 필요한 경우 Redis와 같은 외부 저장소로 확장 가능합니다.
"""
from typing import Dict, Set, List, Optional, Any, Tuple
import asyncio
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from .models import SocketSession
from ..core.logging_utils import get_logger

# 로거 설정
logger = get_logger(__name__)


class SocketRepository:
    """소켓 세션 및 연결 상태 관리 리파지토리"""
    
    def __init__(self):
        """리파지토리 초기화"""
        self.logger = logger
        
        # 세션 관련 매핑
        self.sessions: Dict[str, SocketSession] = {}  # sid -> 세션 정보
        self.user_sessions: Dict[str, Set[str]] = {}  # 사용자명 -> sid 집합
        self.session_id_map: Dict[str, Set[str]] = {}  # 세션 ID -> sid 집합
        
        # 구독 관련 매핑
        self.user_subscriptions: Dict[str, Set[str]] = {}  # 사용자명 -> 구독 CVE ID 집합
        self.cve_subscribers: Dict[str, Set[str]] = {}  # CVE ID -> 구독 사용자명 집합
        
        # 락 객체
        self._lock = asyncio.Lock()
    
    async def add_session(self, sid: str, username: Optional[str], session_id: str) -> SocketSession:
        """새 소켓 세션을 추가합니다."""
        async with self._lock:
            # 세션 객체 생성
            session = SocketSession(
                sid=sid,
                username=username,
                session_id=session_id,
                connected_at=datetime.now(ZoneInfo("UTC"))
            )
            
            # 세션 매핑 업데이트
            self.sessions[sid] = session
            
            # 사용자명이 있는 경우 사용자-세션 매핑 업데이트
            if username:
                if username not in self.user_sessions:
                    self.user_sessions[username] = set()
                self.user_sessions[username].add(sid)
            
            # 세션 ID 매핑 업데이트
            if session_id not in self.session_id_map:
                self.session_id_map[session_id] = set()
            self.session_id_map[session_id].add(sid)
            
            self.logger.info(f"세션 추가됨 - SID: {sid}, 사용자명: {username}, 세션 ID: {session_id}")
            return session
    
    async def remove_session(self, sid: str) -> Optional[SocketSession]:
        """소켓 세션을 제거합니다."""
        async with self._lock:
            session = self.sessions.pop(sid, None)
            if not session:
                return None
                
            # 사용자명이 있는 경우 사용자-세션 매핑 업데이트
            if session.username and session.username in self.user_sessions:
                self.user_sessions[session.username].discard(sid)
                # 빈 집합인 경우 키 삭제
                if not self.user_sessions[session.username]:
                    del self.user_sessions[session.username]
            
            # 세션 ID 매핑 업데이트
            if session.session_id in self.session_id_map:
                self.session_id_map[session.session_id].discard(sid)
                # 빈 집합인 경우 키 삭제
                if not self.session_id_map[session.session_id]:
                    del self.session_id_map[session.session_id]
            
            self.logger.info(f"세션 제거됨 - SID: {sid}, 사용자명: {session.username}, 세션 ID: {session.session_id}")
            return session
    
    async def get_session(self, sid: str) -> Optional[SocketSession]:
        """소켓 세션 정보를 조회합니다."""
        return self.sessions.get(sid)
    
    async def get_user_sessions(self, username: str) -> List[SocketSession]:
        """사용자명에 연결된 모든 세션을 조회합니다."""
        if username not in self.user_sessions:
            return []
        
        return [self.sessions[sid] for sid in self.user_sessions[username] if sid in self.sessions]
    
    async def get_session_by_id(self, session_id: str) -> List[SocketSession]:
        """세션 ID에 연결된 모든 세션을 조회합니다."""
        if session_id not in self.session_id_map:
            return []
        
        sessions = []
        for sid in self.session_id_map[session_id]:
            session = self.sessions.get(sid)
            if session:
                sessions.append(session)
        return sessions
    
    async def add_cve_subscription(self, sid: str, cve_id: str) -> bool:
        """세션에 CVE 구독을 추가합니다."""
        async with self._lock:
            session = self.sessions.get(sid)
            if not session:
                return False
                
            # 세션의 구독 목록에 CVE 추가
            session.subscribed_cves.add(cve_id)
            
            # 사용자명이 있는 경우 사용자-구독 매핑 업데이트
            if session.username:
                if session.username not in self.user_subscriptions:
                    self.user_subscriptions[session.username] = set()
                self.user_subscriptions[session.username].add(cve_id)
            
            # CVE-구독자 매핑 업데이트
            if cve_id not in self.cve_subscribers:
                self.cve_subscribers[cve_id] = set()
            if session.username:
                self.cve_subscribers[cve_id].add(session.username)
            
            self.logger.info(f"CVE 구독 추가됨 - SID: {sid}, 사용자명: {session.username}, CVE: {cve_id}")
            return True
    
    async def remove_cve_subscription(self, sid: str, cve_id: str) -> bool:
        """세션에서 CVE 구독을 제거합니다."""
        async with self._lock:
            session = self.sessions.get(sid)
            if not session:
                return False
                
            # 세션의 구독 목록에서 CVE 제거
            session.subscribed_cves.discard(cve_id)
            
            # 사용자명이 있는 경우 다른 세션에서 같은 CVE를 구독 중인지 확인
            if session.username:
                user_still_subscribed = False
                if session.username in self.user_sessions:
                    for other_sid in self.user_sessions[session.username]:
                        if other_sid != sid and self.sessions.get(other_sid) and cve_id in self.sessions[other_sid].subscribed_cves:
                            user_still_subscribed = True
                            break
                
                # 사용자의 모든 세션에서 구독 해제된 경우 사용자-구독 매핑 업데이트
                if not user_still_subscribed:
                    if session.username in self.user_subscriptions:
                        self.user_subscriptions[session.username].discard(cve_id)
                        if not self.user_subscriptions[session.username]:
                            del self.user_subscriptions[session.username]
                    
                    # CVE-구독자 매핑 업데이트
                    if cve_id in self.cve_subscribers:
                        self.cve_subscribers[cve_id].discard(session.username)
                        if not self.cve_subscribers[cve_id]:
                            del self.cve_subscribers[cve_id]
            
            self.logger.info(f"CVE 구독 제거됨 - SID: {sid}, 사용자명: {session.username}, CVE: {cve_id}")
            return True
    
    async def get_cve_subscribers(self, cve_id: str) -> Set[str]:
        """CVE를 구독 중인 사용자명 집합을 조회합니다."""
        return self.cve_subscribers.get(cve_id, set()).copy()
    
    async def get_user_subscriptions(self, username: str) -> Set[str]:
        """사용자가 구독 중인 CVE ID 집합을 조회합니다."""
        return self.user_subscriptions.get(username, set()).copy()
    
    async def clear_user_subscriptions(self, username: str) -> int:
        """사용자의 모든 구독을 정리합니다."""
        async with self._lock:
            if username not in self.user_subscriptions:
                return 0
                
            subscribed_cves = self.user_subscriptions.pop(username, set())
            count = len(subscribed_cves)
            
            # CVE-구독자 매핑 업데이트
            for cve_id in subscribed_cves:
                if cve_id in self.cve_subscribers:
                    self.cve_subscribers[cve_id].discard(username)
                    if not self.cve_subscribers[cve_id]:
                        del self.cve_subscribers[cve_id]
            
            # 사용자의 모든 세션에서 구독 정보 업데이트
            if username in self.user_sessions:
                for sid in self.user_sessions[username]:
                    session = self.sessions.get(sid)
                    if session:
                        session.subscribed_cves.clear()
            
            self.logger.info(f"사용자 구독 전체 정리됨 - 사용자명: {username}, 정리된 CVE 수: {count}")
            return count
    
    async def get_stats(self) -> Dict[str, Any]:
        """소켓 연결 및 구독 통계 정보를 조회합니다."""
        return {
            "active_sessions": len(self.sessions),
            "connected_users": len(self.user_sessions),
            "active_cve_subscriptions": len(self.cve_subscribers),
            "total_user_subscriptions": sum(len(subs) for subs in self.user_subscriptions.values())
        }


# 싱글톤 인스턴스
socket_repository = SocketRepository()

# 의존성 주입을 위한 함수
def get_socket_repository() -> SocketRepository:
    """SocketRepository 인스턴스를 반환합니다."""
    global socket_repository
    return socket_repository
