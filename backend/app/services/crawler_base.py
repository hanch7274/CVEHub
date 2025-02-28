from abc import ABC, abstractmethod
import logging
from typing import Dict, Any, Optional, List
import traceback
from datetime import datetime
from zoneinfo import ZoneInfo
from ..core.config import get_settings
from ..core.websocket import manager
from fastapi import WebSocket
from starlette.websockets import WebSocketState
import asyncio

settings = get_settings()
logger = logging.getLogger(__name__)

class LoggingMixin:
    """로깅 기능을 제공하는 믹스인 클래스"""

    @property
    def logger(self):
        """클래스별 로거 인스턴스 반환"""
        name = '.'.join([self.__module__, self.__class__.__name__])
        return logging.getLogger(name)
    
    def log_info(self, message: str) -> None:
        """정보 로그 기록"""
        self.logger.info(message)
    
    def log_warning(self, message: str) -> None:
        """경고 로그 기록"""
        self.logger.warning(message)
    
    def log_error(self, message: str, exception: Optional[Exception] = None) -> None:
        """오류 로그 기록"""
        if exception:
            self.logger.error(f"{message}: {str(exception)}")
            self.logger.error(traceback.format_exc())
        else:
            self.logger.error(message)
    
    def log_debug(self, message: str) -> None:
        """디버그 로그 기록"""
        self.logger.debug(message)

class BaseCrawlerService(ABC, LoggingMixin):
    """
    크롤러 서비스의 기본 추상 클래스.
    모든 크롤러 구현체는 이 클래스를 상속받아야 합니다.
    """
    
    def __init__(self, crawler_id: str, display_name: Optional[str] = None):
        """
        크롤러 기본 클래스 초기화
        
        Args:
            crawler_id: 크롤러 식별자 (예: "nuclei") - 시스템 내부에서 사용
            display_name: 표시 이름 (예: "Nuclei Templates Crawler") - UI/로그에 표시
        """
        self.crawler_id = crawler_id.lower()  # 항상 소문자로 정규화
        self.display_name = display_name or crawler_id  # 지정되지 않은 경우 ID 사용
        self.settings = get_settings()
        self.requester_id = None  # 요청자 ID 초기화
        self.quiet_mode = False   # 조용한 모드 플래그 추가
        self.log_info(f"Initializing {self.display_name}")
        self._last_message_time = {}  # 스테이지별 마지막 메시지 시간
        self._last_percent = {}       # 스테이지별 마지막 퍼센트
    
    @abstractmethod
    async def fetch_data(self) -> bool:
        """
        원격 저장소나 API로부터 데이터를 가져옵니다.
        (git clone, API 호출 등)
        """
        pass
    
    @abstractmethod
    async def parse_data(self, data_path: str) -> dict:
        """
        가져온 데이터를 파싱하여 CVE 정보를 추출합니다.
        """
        pass
    
    @abstractmethod
    async def process_data(self, cve_data: dict) -> bool:
        """
        파싱된 CVE 데이터를 처리하고 데이터베이스에 저장합니다.
        """
        pass
    
    @abstractmethod
    async def crawl(self) -> bool:
        """
        전체 크롤링 프로세스를 실행합니다.
        """
        pass
    
    def get_current_time(self) -> datetime:
        """현재 KST 시간을 반환합니다."""
        return datetime.now(ZoneInfo("Asia/Seoul"))
    
    def set_requester_id(self, user_id: str):
        """업데이트를 요청한 사용자 ID 설정"""
        self.requester_id = user_id
        self.log_info(f"요청자 ID 설정: {user_id}")

    def set_quiet_mode(self, quiet: bool = True):
        """
        크롤러의 조용한 모드 설정
        
        조용한 모드가 활성화되면 진행 상황 메시지가 웹소켓으로 전송되지 않습니다.
        스케줄러에 의한 자동 크롤링 작업에 유용합니다.
        """
        self.quiet_mode = quiet
        self.log_info(f"조용한 모드 {'활성화' if quiet else '비활성화'}")

    async def report_progress(self, stage: str, percent: int, message: str, updated_cves=None) -> None:
        """진행 상황 보고 - 로깅 및 웹소켓 전송"""
        self.log_info(f"[{stage}] {percent}% - {message}")
        
        # 조용한 모드에서는 웹소켓 메시지를 전송하지 않음
        if self.quiet_mode:
            self.log_debug("조용한 모드: 웹소켓 메시지 전송 생략")
            return
        
        try:
            from app.core.websocket import manager
            self.log_info(f"웹소켓 메시지 전송 시작: {stage}, {percent}%")
            
            # 단계 이름 표준화 (UI 표시용)
            ui_stage = stage
            if stage.lower() == "준비":
                ui_stage = "준비"  # 변경 없음
            elif "수집" in stage.lower():
                ui_stage = "데이터 수집"
            elif "처리" in stage.lower():
                ui_stage = "데이터 처리"
            elif "업데이트" in stage.lower():
                ui_stage = "데이터베이스 업데이트"
            elif "완료" in stage.lower():
                ui_stage = "완료"
            elif "오류" in stage.lower():
                ui_stage = "오류"
            
            # 메시지 필터링 로직 추가
            current_time = datetime.now()
            last_time = self._last_message_time.get(stage, datetime.min)
            last_percent = self._last_percent.get(stage, -1)
            
            # 메시지 전송 결정 기준:
            # 1. 최소 시간 간격 (200ms)
            # 2. 중요한 단계 변화 (25%, 50%, 75%, 100%)
            # 3. 시작/완료 메시지는 항상 전송
            is_milestone = percent in [0, 25, 50, 75, 100] or percent % 25 == 0
            time_threshold_met = (current_time - last_time).total_seconds() > 0.2
            
            should_send = (
                is_milestone or 
                (time_threshold_met and abs(percent - last_percent) >= 10) or
                stage.lower() in ["준비", "완료", "오류"] or
                "완료" in message.lower() or
                updated_cves is not None
            )
            
            if not should_send:
                self.log_debug(f"메시지 필터링: 스테이지={stage}, 퍼센트={percent}")
                return
            
            # 메시지 전송 시간과 퍼센트 업데이트
            self._last_message_time[stage] = current_time
            self._last_percent[stage] = percent
            
            # 메시지 데이터 준비
            message_data = {
                "type": "crawler_update_progress",
                "data": {
                    "crawler": self.crawler_id,
                    "stage": ui_stage,
                    "percent": percent,
                    "message": message,
                    "raw_count": message.split("(")[-1].split(")")[0] if "(" in message and ")" in message else "",
                    "timestamp": datetime.now().isoformat(),
                    "isRunning": not (ui_stage == "완료" or ui_stage == "오류")
                }
            }
            
            # 완료 단계에서는 업데이트된 CVE 개수만 포함
            if stage.lower() == '완료' and updated_cves is not None:
                message_data["data"]["updated_count"] = len(updated_cves)
                message_data["data"]["isRunning"] = False  # 명시적으로 실행 중이 아님을 표시
                self.log_info(f"완료 메시지 전송: stage={ui_stage}, percent={percent}, isRunning=False")
            
            # 오류 상태에서도 명시적으로 실행 중이 아님을 표시
            if ui_stage == "오류":
                message_data["data"]["isRunning"] = False
                self.log_info(f"오류 메시지 전송: stage={ui_stage}, percent={percent}, isRunning=False")
            
            # 요청자 ID가 있으면 해당 사용자에게만 전송, 없으면 전체 브로드캐스트
            if self.requester_id:
                self.log_info(f"사용자 {self.requester_id}에게 진행 상황 전송")
                sent_count = await manager.send_to_specific_user(self.requester_id, message_data)
            else:
                self.log_info("모든 사용자에게 진행 상황 브로드캐스트")
                sent_count = await manager.broadcast_json(message_data)
            
            self.log_info(f"웹소켓 메시지 전송 완료: {stage}, {percent}%, {sent_count}개 클라이언트에 전송됨")
            
            # 중요 단계 메시지 전송 후 지연 추가 (메시지 누락 방지)
            if stage in ["준비", "데이터 수집", "데이터 처리", "데이터베이스 업데이트", "완료"]:
                await asyncio.sleep(0.2)
            
            # 완료 상태일 경우 업데이트된 CVE 정보를 캐시에만 저장
            if stage.lower() == '완료' and updated_cves is not None:
                await self._store_update_results(updated_cves)
            
        except Exception as e:
            self.log_error(f"웹소켓 메시지 전송 실패: {e}")
            self.log_error(f"보내려던 메시지: {message_data}")
            self.log_error(traceback.format_exc())
        
        # 콜백 호출 (기존 로직)
        if hasattr(self, 'on_progress') and callable(self.on_progress):
            await self.on_progress(self.crawler_id, stage, percent, message)

    async def _store_update_results(self, updated_cves):
        """업데이트 결과를 캐시 또는 데이터베이스에 저장"""
        try:
            from app.core.cache import set_cache
            
            # updated_cves 타입 검사 및 변환
            if not isinstance(updated_cves, list):
                self.log_warning(f"updated_cves 매개변수의 타입이 list가 아님: {type(updated_cves)}")
                # 딕셔너리인 경우 'items' 키 확인
                if isinstance(updated_cves, dict) and 'items' in updated_cves:
                    self.log_info("업데이트 결과 딕셔너리에서 'items' 항목을 사용합니다.")
                    updated_cves = updated_cves.get('items', [])
                else:
                    self.log_warning("추출할 items 목록이 없어 빈 리스트로 계속 진행합니다.")
                    updated_cves = []
            
            # 중요도별 통계 계산 (get 메서드를 안전하게 호출)
            severity_counts = {
                "critical": sum(1 for cve in updated_cves if isinstance(cve, dict) and cve.get("severity") == "critical"),
                "high": sum(1 for cve in updated_cves if isinstance(cve, dict) and cve.get("severity") == "high"),
                "medium": sum(1 for cve in updated_cves if isinstance(cve, dict) and cve.get("severity") == "medium"),
                "low": sum(1 for cve in updated_cves if isinstance(cve, dict) and cve.get("severity") == "low")
            }
            
            # 저장할 정보 구성
            update_info = {
                "crawler": self.crawler_id,
                "updated_at": datetime.now().isoformat(),
                "count": len(updated_cves),
                "severity_counts": severity_counts,
                "samples": updated_cves[:10] if updated_cves else []  # 대표 샘플 10개만 저장
            }
            
            # 캐시에 저장 (24시간 유효)
            cache_key = f"crawler_update_result:{self.crawler_id}"
            await set_cache(cache_key, update_info, expire=86400)
            
            self.log_info(f"업데이트 결과 저장 완료: {len(updated_cves)}개 CVE")
        except Exception as e:
            self.log_error(f"업데이트 결과 저장 실패: {str(e)}")
            # 상세 오류 정보 로깅
            error_type = e.__class__.__name__
            error_msg = str(e)
            self.log_error(f"업데이트 결과 저장 실패 유형: {error_type}, 메시지: {error_msg}")
            self.log_error(f"updated_cves 타입: {type(updated_cves)}, 값: {str(updated_cves)[:100]}...") 