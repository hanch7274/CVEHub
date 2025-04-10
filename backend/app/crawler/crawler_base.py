from abc import ABC, abstractmethod
import logging
from typing import Dict, Any, Optional
import traceback
from datetime import datetime
from ..core.config import get_settings
from app.socketio.manager import socketio_manager, WSMessageType
from app.cve.models import CVEModel
from app.cve.service import CVEService

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
    
    def __init__(self, crawler_id, display_name=None, cve_service=None):
        self.crawler_id = crawler_id.lower()
        self.display_name = display_name or crawler_id
        self.cve_service = cve_service or CVEService()
        self.requester_id = None
        self.quiet_mode = False
        self.websocket_enabled = True
    
    @abstractmethod
    async def fetch_data(self) -> Any:
        """
        원격 저장소나 API로부터 데이터를 가져옵니다.
        (git clone, API 호출 등)
        """
        pass
    
    @abstractmethod
    async def parse_data(self, raw_data: Any) -> Dict[str, Any]:
        """
        가져온 데이터를 파싱하여 CVE 정보를 추출합니다.
        """
        pass
    
    @abstractmethod
    async def process_data(self, parsed_data: Dict[str, Any]) -> bool:
        """
        파싱된 CVE 데이터를 처리하고 데이터베이스에 저장합니다.
        """
        pass
    
    @abstractmethod
    async def crawl(self) -> Dict[str, Any]:
        """
        전체 크롤링 프로세스를 실행합니다.
        """
        pass
    
    async def report_progress(self, stage, percent, message, **kwargs):
        """
        크롤링 진행 상황을 보고합니다.
        
        Args:
            stage (str): 진행 단계 (preparing, fetching, processing, saving, completed, error)
            percent (int): 진행률 (0-100)
            message (str): 진행 상황 메시지
            **kwargs: 추가 데이터
        """
        # 기본 로깅
        stage_key = stage.lower().strip()
        self.log_info(f"[{stage_key}] {percent}% - {message}")
    
        # 조용한 모드이거나 웹소켓이 비활성화된 경우 웹소켓 메시지 전송 안함
        if self.quiet_mode:
            self.log_debug(f"조용한 모드에서 메시지 무시: {message}")
            return
            
        if not self.websocket_enabled:
            self.log_debug(f"웹소켓 비활성화 상태: {message}")
            return
        
        # 메시지 데이터 준비
        message_data = {
            "crawler": self.crawler_id,
            "stage": stage_key,
            "percent": percent,
            "message": message,
            "isRunning": stage_key not in ["completed", "error"],
            "timestamp": datetime.now().isoformat()
        }
        
        # 추가 데이터가 있으면 포함
        for key, value in kwargs.items():
            message_data[key] = value
        
        # WebSocket 메시지 전송
        try:            
            if hasattr(self, 'requester_id') and self.requester_id:
                self.log_debug(f"사용자 {self.requester_id}에게 진행 상황 전송 중...")
                await socketio_manager.emit_to_user(
                    self.requester_id, 
                    WSMessageType.CRAWLER_UPDATE_PROGRESS, 
                    {"type": "crawler_update_progress", "data": message_data}
                )
            else:
                self.log_debug("모든 사용자에게 진행 상황 전송 중...")
                await socketio_manager.emit(
                    WSMessageType.CRAWLER_UPDATE_PROGRESS, 
                    {"type": "crawler_update_progress", "data": message_data}
                )
            self.log_debug(f"웹소켓 메시지 전송 완료: {stage_key} {percent}%")
        except Exception as e:
            self.log_error(f"웹소켓 메시지 전송 실패: {str(e)}", e)
            
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
        
    async def update_cve(self, cve_id: str, data: Dict[str, Any], creator: str) -> Optional[CVEModel]:
        """
        CVE 모델을 생성하거나 업데이트합니다.
        """       
        try:
            # 기존 CVE 찾기
            existing = await self.cve_service.get_cve_detail(cve_id)
            is_new = existing is None
            
            if is_new:
                # 새 CVE 생성
                self.log_info(f"새 CVE 생성: {cve_id}")
                
                # 필수 필드 설정
                data_with_defaults = self._prepare_new_cve_data(cve_id, data, creator)
                
                # CVE 모델 생성 (Pydantic 모델 사용)
                from ..cve.models import CreateCVERequest
                cve_request = CreateCVERequest(**data_with_defaults)
                
                # CVEService를 통해 CVE 생성
                await self.cve_service.create_cve(cve_request, creator)
            else:
                # 기존 CVE 업데이트
                self.log_info(f"기존 CVE 업데이트: {cve_id}")
                
                # 업데이트 데이터 준비
                data_for_update = self._prepare_update_cve_data(data, creator)
                
                # 필드 제한된 패치 데이터 생성
                from ..cve.models import PatchCVERequest
                patch_data = PatchCVERequest(**data_for_update)
                
                # CVEService를 통해 업데이트
                # MongoDB ID 대신 항상 CVE ID를 사용 - 이렇게 하면 CVE ID로 조회할 때 일관성 유지
                # CVE ID는 전역적으로 유일하므로 이 방법이 더 안전함
                await self.cve_service.update_cve(cve_id, patch_data, creator)
                
            # MongoDB ID가 아닌 CVE ID를 사용하여 항상 조회
            # CVE-ID는 표준 형식이고 데이터베이스 내에서 유일해야 함
            return await self.cve_service.get_cve_detail(cve_id)
        except Exception as e:
            self.log_error(f"CVE {cve_id} 업데이트 실패: {str(e)}", e)
            return None
            
    def _prepare_new_cve_data(self, cve_id: str, data: Dict[str, Any], creator: str) -> Dict[str, Any]:
        """새 CVE 생성을 위한 데이터 준비"""
        result = data.copy()
        
        # 필수 필드 설정
        if "title" not in result or not result["title"]:
            result["title"] = cve_id
        
        if "description" not in result or not result["description"]:
            result["description"] = ""
            
        if "severity" not in result:
            result["severity"] = "unknown"
            
        # 시간 정보 설정
        from app.common.utils.datetime_utils import get_utc_now
        now = get_utc_now()
        result["created_at"] = now
        result["last_modified_at"] = now
        result["created_by"] = creator
        result["last_modified_by"] = creator
        result["status"] = "신규등록"
        result["source"] = result.get("source", self.crawler_id)
        
        # 변경 이력 관련 코드 제거 (activity로 대체 예정)
        
        return result
        
    def _prepare_update_cve_data(self, data: Dict[str, Any], creator: str) -> Dict[str, Any]:
        """CVE 업데이트를 위한 데이터 준비"""
        result = data.copy()
        
        # 업데이트 시간 설정
        from app.common.utils.datetime_utils import get_utc_now
        result["last_modified_at"] = get_utc_now()
        result["last_modified_by"] = creator
        
        return result