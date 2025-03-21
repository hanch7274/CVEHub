from abc import ABC, abstractmethod
import logging
from typing import Dict, Any, Optional, List
import traceback
from datetime import datetime
from ..core.config import get_settings
from ..core.socketio_manager import socketio_manager, WSMessageType
import asyncio
from ..utils.datetime_utils import get_utc_now
from ..models.cve_model import CVEModel
from ..services.cve_service import CVEService

settings = get_settings()
logger = logging.getLogger(__name__)

# 크롤러 진행 단계 정의
CRAWLER_STAGES = [
    {
        "key": "preparing",
        "label": "준비",
        "description": "크롤러 초기화 및 저장소 연결 준비"
    },
    {
        "key": "fetching",
        "label": "데이터 수집",
        "description": "소스에서 데이터 수집 중"
    },
    {
        "key": "processing",
        "label": "데이터 처리",
        "description": "수집된 데이터 처리 및 분석"
    },
    {
        "key": "saving",
        "label": "데이터베이스 업데이트",
        "description": "처리된 데이터 데이터베이스에 저장"
    },
    {
        "key": "completed",
        "label": "완료",
        "description": "크롤링 작업 완료"
    },
    {
        "key": "error",
        "label": "오류",
        "description": "크롤링 작업 중 오류 발생"
    }
]

# 단계 키를 통해 단계 정보 가져오기
def get_stage_by_key(key: str) -> Dict[str, Any]:
    """
    단계 키를 통해 단계 정보를 가져옵니다.
    
    Args:
        key (str): 단계 키
        
    Returns:
        Dict[str, Any]: 단계 정보
    """
    for stage in CRAWLER_STAGES:
        if stage["key"] == key:
            return stage
    
    # 키가 없으면 준비 단계 반환
    logger.warning(f"단계 키 '{key}'에 해당하는 단계 정보가 없습니다. 기본값 반환")
    return CRAWLER_STAGES[0]

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
        self.cve_service = CVEService()  # CVEService 초기화
    
    async def send_websocket_message(self, data: Dict[str, Any]) -> int:
        """
        웹소켓 메시지를 전송합니다.
        
        Args:
            data (Dict[str, Any]): 전송할 메시지 데이터
            
        Returns:
            int: 메시지가 전송된 클라이언트 수
        """
        try:
            # 메시지 데이터 준비
            message_data = {
                "type": "crawler_update_progress",
                "data": data
            }
            
            # 요청자 ID가 있으면 해당 사용자에게만 전송, 없으면 전체 브로드캐스트
            if self.requester_id:
                self.log_info(f"사용자 {self.requester_id}에게 메시지 전송: {data.get('stage', 'unknown')}")
                return await socketio_manager.emit_to_user(
                    self.requester_id, 
                    WSMessageType.CRAWLER_UPDATE_PROGRESS, 
                    message_data
                )
            else:
                self.log_info(f"모든 사용자에게 메시지 브로드캐스트: {data.get('stage', 'unknown')}")
                return await socketio_manager.emit(
                    WSMessageType.CRAWLER_UPDATE_PROGRESS, 
                    message_data
                )
        except Exception as e:
            self.log_error(f"웹소켓 메시지 전송 실패: {str(e)}", e)
            return 0
    
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
    
    async def run(self) -> Dict[str, Any]:
        """
        크롤러 실행 메서드 - crawl 메서드를 호출합니다.
        scheduler에서 이 메서드를 호출합니다.
        """
        return await self.crawl()
    
    def get_current_time(self) -> datetime:
        """현재 UTC 시간을 반환합니다."""
        return get_utc_now()
    
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

    async def report_progress(self, stage: str, percent: int, message: str = None, updated_cves=None, items: List = None, require_websocket: bool = False):
        """
        크롤러 진행 상황을 웹소켓을 통해 사용자에게 보고합니다.
        
        Args:
            stage (str): 현재 단계 (예: 'preparing', 'fetching', 'processing', 'saving', 'completed', 'error')
            percent (int): 진행률 (0-100)
            message (str, optional): 상세 메시지
            updated_cves (list, optional): 업데이트된 CVE 목록
            items (List, optional): 현재 처리 중인 항목 목록
            require_websocket (bool, optional): 웹소켓 연결이 필요한지 여부
            
        Returns:
            bool: 메시지 전송 성공 여부
            
        Note:
            프론트엔드에서는 다음 필드를 사용합니다:
            - stage: 현재 단계 (문자열)
            - percent: 진행률 (숫자)
            - message: 상세 메시지 (문자열)
            - isRunning: 실행 중 여부 (불리언)
            - hasError: 오류 발생 여부 (불리언)
            - crawler: 크롤러 타입 (문자열)
        """
        # 단계 키 정규화 (소문자로 변환 및 공백 제거)
        stage_key = stage.lower().strip()
        
        # 단계 키를 표준 키로 매핑
        if "준비" in stage_key or "초기화" in stage_key or "연결" in stage_key:
            stage_key = "preparing"
        elif "수집" in stage_key or "다운로드" in stage_key:
            stage_key = "fetching"
        elif "처리" in stage_key or "분석" in stage_key or "파싱" in stage_key:
            stage_key = "processing"
        elif "저장" in stage_key or "업데이트" in stage_key or "데이터베이스" in stage_key:
            stage_key = "saving"
        elif "완료" in stage_key or "done" in stage_key or "complete" in stage_key or "finished" in stage_key:
            stage_key = "completed"
        elif "오류" in stage_key or "error" in stage_key or "fail" in stage_key:
            stage_key = "error"
        
        # 표준 단계 정보 가져오기
        stage_info = get_stage_by_key(stage_key)
        stage_label = stage_info["label"]
        
        self.log_info(f"[{stage_label}] {percent}% - {message}")
        
        # 조용한 모드에서는 웹소켓 메시지를 전송하지 않음
        if self.quiet_mode:
            self.log_debug("조용한 모드: 웹소켓 메시지 전송 생략")
            return
        
        try:
            # 웹소켓 연결 상태 확인 및 로깅
            active_connections = len(socketio_manager.get_participants())
            has_active = active_connections > 0
            
            self.log_info(f"웹소켓 메시지 전송 시작: {stage_label}, {percent}%, 활성 연결: {active_connections}개, 연결 상태: {'있음' if has_active else '없음'}")
            
            # 웹소켓 연결 확인이 필요한 경우
            if require_websocket and not has_active:
                error_msg = "활성화된 웹소켓 연결이 없어 크롤러 작업을 중단합니다"
                self.log_error(error_msg)
                # 활성 연결이 없을 때 추가 정보 로깅
                self.log_debug(f"활성 사용자 목록: {socketio_manager.get_participants()}")
                self.log_debug(f"총 웹소켓 연결 수: {len(socketio_manager.get_participants())}")
                self.log_debug(f"연결 요청 사용자: {self.requester_id or '없음'}")
                raise Exception(error_msg)
            
            # 메시지 필터링 로직 추가
            current_time = datetime.now()
            last_time = self._last_message_time.get(stage_key, datetime.min)
            last_percent = self._last_percent.get(stage_key, -1)
            
            # 메시지 전송 결정 기준:
            # 1. 최소 시간 간격 (200ms)
            # 2. 중요한 단계 변화 (25%, 50%, 75%, 100%)
            # 3. 시작/완료 메시지는 항상 전송
            is_milestone = percent in [0, 25, 50, 75, 100] or percent % 25 == 0
            time_threshold_met = (current_time - last_time).total_seconds() > 0.2
            
            should_send = (
                is_milestone or 
                (time_threshold_met and abs(percent - last_percent) >= 10) or
                stage_key in ["preparing", "completed", "error"] or
                "완료" in message.lower() or
                updated_cves is not None
            )
            
            if not should_send:
                self.log_debug(f"메시지 필터링: 스테이지={stage_key}, 퍼센트={percent}")
                return
            
            # 메시지 전송 시간과 퍼센트 업데이트
            self._last_message_time[stage_key] = current_time
            self._last_percent[stage_key] = percent
            
            # 메시지 데이터 준비
            message_data = {
                "type": "crawler_update_progress",
                "data": {
                    "crawler": self.crawler_id,
                    "stage": stage_key,  # 표준화된 단계 키
                    "stage_label": stage_label,  # 사용자 표시용 단계 레이블
                    "percent": percent,
                    "message": message,
                    "raw_count": message.split("(")[-1].split(")")[0] if "(" in message and ")" in message else "",
                    "timestamp": datetime.now().isoformat(),
                    "isRunning": stage_key not in ["completed", "error"]
                }
            }
            
            # items가 있으면 메시지 데이터에 추가
            if items:
                message_data["data"]["items"] = items
            
            # 완료 단계에서는 업데이트된 CVE 개수만 포함
            if stage_key == 'completed' and updated_cves is not None:
                message_data["data"]["updated_count"] = len(updated_cves)
                message_data["data"]["isRunning"] = False  # 명시적으로 실행 중이 아님을 표시
                self.log_info(f"완료 메시지 전송: stage={stage_key}, percent={percent}, isRunning=False")
            
            # 오류 상태에서도 명시적으로 실행 중이 아님을 표시
            if stage_key == "error":
                message_data["data"]["isRunning"] = False
                self.log_info(f"오류 메시지 전송: stage={stage_key}, percent={percent}, isRunning=False")
            
            # 요청자 ID가 있으면 해당 사용자에게만 전송, 없으면 전체 브로드캐스트
            if self.requester_id:
                self.log_info(f"사용자 {self.requester_id}에게 진행 상황 전송")
                # 전송 전 웹소켓 연결 상태 확인
                user_connections = socketio_manager.get_participants()
                self.log_debug(f"사용자 {self.requester_id}의 연결 수: {len(user_connections)}")
                
                sent_count = await socketio_manager.emit_to_user(self.requester_id, WSMessageType.CRAWLER_UPDATE_PROGRESS, message_data, raise_exception=require_websocket)
                if sent_count == 0:
                    self.log_warning(f"사용자 {self.requester_id}에게 메시지 전송 실패: 연결된 웹소켓 없음")
                    # 전체 연결 상태 디버깅
                    self.log_debug(f"모든 활성 사용자: {socketio_manager.get_participants()}")
                    self.log_debug(f"총 활성 연결 수: {len(socketio_manager.get_participants())}")
            else:
                self.log_info("모든 사용자에게 진행 상황 브로드캐스트")
                # 브로드캐스트 전 웹소켓 연결 상태 확인
                self.log_debug(f"활성 사용자 수: {len(socketio_manager.get_participants())}")
                self.log_debug(f"총 웹소켓 연결 수: {len(socketio_manager.get_participants())}")
                
                sent_count = await socketio_manager.emit(WSMessageType.CRAWLER_UPDATE_PROGRESS, message_data, critical=True, raise_exception=require_websocket)
                if sent_count == 0:
                    self.log_warning("브로드캐스트 실패: 활성화된 웹소켓 연결 없음")
            
            self.log_info(f"웹소켓 메시지 전송 완료: {stage_label}, {percent}%, {sent_count}개 클라이언트에 전송됨")
            
            # 중요 단계 메시지 전송 후 지연 추가 (메시지 누락 방지)
            if stage_key in ["preparing", "completed", "error"]:
                await asyncio.sleep(0.2)
            
            # 완료 상태일 경우 업데이트된 CVE 정보를 캐시에만 저장
            if stage_key == 'completed' and updated_cves is not None:
                await self._store_update_results(updated_cves)
            
        except Exception as e:
            self.log_error(f"웹소켓 메시지 전송 실패: {e}")
            # 자세한 예외 정보 로깅
            error_type = e.__class__.__name__
            error_msg = str(e)
            self.log_error(f"오류 유형: {error_type}, 메시지: {error_msg}")
            # 전송하려던 메시지 로깅 (일부만)
            if 'message_data' in locals():
                msg_type = message_data.get('type', 'unknown')
                msg_stage = message_data.get('data', {}).get('stage', 'unknown')
                msg_percent = message_data.get('data', {}).get('percent', 'unknown')
                self.log_error(f"보내려던 메시지: 타입={msg_type}, 단계={msg_stage}, 퍼센트={msg_percent}")
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
            # updated_cves 타입 및 값 로깅
            self.log_error(f"updated_cves 타입: {type(updated_cves)}, 값: {str(updated_cves)[:100]}...") 

    async def update_cve(self, cve_id: str, data: Dict[str, Any], creator: str) -> CVEModel:
        """
        CVE 모델을 생성하거나 업데이트합니다.
        
        Args:
            cve_id (str): CVE ID
            data (Dict[str, Any]): 업데이트할 데이터
            creator (str): 생성자/수정자 이름 (크롤러 ID)
            
        Returns:
            CVEModel: 생성되거나 업데이트된 CVE 모델
        """
        self.log_info(f"CVE {cve_id} 데이터베이스 업데이트 중...")
        
        # 기존 CVE 찾기
        existing = await self.cve_service.get_cve(cve_id)
        is_new = existing is None
        
        if is_new:
            # 새 CVE 생성
            self.log_info(f"새 CVE 생성: {cve_id}")
            
            # 필수 필드 설정
            if "title" not in data or not data["title"]:
                data["title"] = cve_id
            
            if "description" not in data or not data["description"]:
                data["description"] = ""
                
            if "severity" not in data:
                data["severity"] = "unknown"
                
            # 시간 정보 설정
            now = get_utc_now()
            data["created_at"] = now
            data["last_modified_date"] = now
            data["created_by"] = creator
            data["last_modified_by"] = creator
            data["status"] = "신규등록"
            data["source"] = data.get("source", self.crawler_id)
            
            # 변경 이력 생성
            changes = [{
                "field": "cve_id",
                "field_name": "CVE ID",
                "action": "add",
                "summary": f"{cve_id} 등록됨",
                "old_value": None,
                "new_value": cve_id
            }]
            
            # 수정 이력 객체 생성
            mod_history = {
                "username": creator,
                "modified_at": now,
                "changes": changes
            }
            
            # 수정 이력 추가
            data["modification_history"] = [mod_history]
            
            # CVE 모델 생성 (Pydantic 모델 사용)
            from ..models.cve_model import CreateCVERequest
            cve_request = CreateCVERequest(**data)
            
            # CVEService를 통해 CVE 생성
            cve_detail = await self.cve_service.create_cve(cve_request, creator)
            if not cve_detail:
                raise Exception(f"CVE {cve_id} 생성 실패")
                
            # 모델 조회
            cve_model = await self.cve_service.get_cve(cve_id)
            return cve_model
        else:
            # 기존 CVE 업데이트
            self.log_info(f"기존 CVE 업데이트: {cve_id}")
            
            # 업데이트 시간 설정
            data["last_modified_date"] = get_utc_now()
            data["last_modified_by"] = creator
            
            # 필드 제한된 패치 데이터 생성
            from ..models.cve_model import PatchCVERequest
            patch_data = PatchCVERequest(**data)
            
            # CVEService를 통해 업데이트
            updated_cve = await self.cve_service.update_cve(str(existing.id), patch_data, creator)
            if not updated_cve:
                raise Exception(f"CVE {cve_id} 업데이트 실패")
                
            # 모델 조회
            cve_model = await self.cve_service.get_cve(cve_id)
            return cve_model