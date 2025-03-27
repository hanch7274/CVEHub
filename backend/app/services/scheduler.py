import asyncio
import logging
from datetime import datetime
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from .crawler_manager import CrawlerManager
from ..core.config import get_settings
from ..models.system_config_model import SystemConfig
from ..core.socketio_manager import socketio_manager
from ..models.cve_model import CVEModel
from .crawler_base import LoggingMixin
import functools
from typing import Optional, Dict, Any, List, Tuple
import traceback

logger = logging.getLogger(__name__)
settings = get_settings()

# KST 타임존 정의
KST = pytz.timezone('Asia/Seoul')

# 현재 시간을 KST로 가져오는 함수
def get_now_kst():
    """현재 시간을 KST 시간대로 반환"""
    return datetime.now(KST)

# 캐시 데코레이터
def async_cache(ttl_seconds=300):
    """비동기 함수 결과를 캐싱하는 데코레이터"""
    cache = {}
    
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # 캐시 키 생성
            key = str(args) + str(kwargs)
            now = datetime.now()
            
            # 캐시에 있고 유효 기간이 지나지 않았으면 캐시 반환
            if key in cache and (now - cache[key]['timestamp']).total_seconds() < ttl_seconds:
                return cache[key]['result']
            
            # 함수 실행
            result = await func(*args, **kwargs)
            
            # 결과 캐싱
            cache[key] = {
                'result': result,
                'timestamp': now
            }
            
            return result
        return wrapper
    return decorator

class CrawlerScheduler(LoggingMixin):
    """Nuclei-templates 및 기타 크롤러를 스케줄링하는 클래스"""
    
    _instance = None
    _is_running = False
    _last_update = {}
    _initialized = False
    _db_state_initialized = False
    _running_crawlers = {}  # 크롤러 유형별 실행 상태
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(CrawlerScheduler, cls).__new__(cls)
            cls._instance._scheduler = AsyncIOScheduler()
            cls._instance._crawler_manager = CrawlerManager()
            cls._instance._lock = asyncio.Lock()
            # 데이터베이스 초기화 이전에는 빈 상태로 시작
            cls._instance._last_update = {}
            cls._instance._initialized = False
            cls._instance._update_results = {}  # 마지막 업데이트 결과 저장
        return cls._instance
    
    def start(self):
        """스케줄러 시작"""
        if not self._scheduler.running:
            self._setup_jobs()
            self._scheduler.start()
            self.log_info("Scheduler started")
    
    def _setup_jobs(self):
        """정기적인 크롤링 작업 설정"""
        # Nuclei 크롤러 - 매일 자정 실행
        self._scheduler.add_job(
            self._run_crawler_task,
            trigger=CronTrigger(hour=0, minute=0, timezone=KST),
            args=["nuclei"],
            id="nuclei_daily",
            replace_existing=True
        )
        
        # Metasploit 크롤러 - 매주 월요일 새벽 3시 실행
        self._scheduler.add_job(
            self._run_crawler_task,
            trigger=CronTrigger(day_of_week="mon", hour=3, minute=0, timezone=KST),
            args=["metasploit"],
            id="metasploit_weekly",
            replace_existing=True
        )
        
        self.log_info("Scheduled jobs set up")
    
    async def _run_crawler_task(self, crawler_type: str):
        """스케줄러에서 호출할 크롤러 실행 작업"""
        try:
            # 크롤러 인스턴스 생성
            crawler = self._crawler_manager.create_crawler(crawler_type)
            if not crawler:
                logger.error(f"크롤러 생성 실패: {crawler_type}")
                return False
            
            # 조용한 모드 활성화 (스케줄러에 의한 실행이므로)
            if hasattr(crawler, 'set_quiet_mode'):
                crawler.set_quiet_mode(True)
                logger.info(f"{crawler_type} 크롤러: 조용한 모드 활성화 (스케줄러 실행)")
            
            # 크롤러 실행
            success = await crawler.crawl()
            
            # 실행 결과 로깅
            if success:
                logger.info(f"스케줄 {crawler_type} 크롤러 실행 성공")
            else:
                logger.error(f"스케줄 {crawler_type} 크롤러 실행 실패")
                
            return success
        except Exception as e:
            logger.error(f"스케줄 크롤러 실행 중 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return False
    
    async def init_db(self):
        """데이터베이스가 초기화된 후 호출되는 메서드"""
        if not self._initialized:
            try:
                self.log_info("크롤러 스케줄러 데이터베이스 초기화 중...")
                await self._load_last_updates()
                self._initialized = True
                self._db_state_initialized = True  # DB 초기화 플래그 설정
                self.log_info("크롤러 스케줄러 데이터베이스 초기화 완료")
            except Exception as e:
                self.log_error(f"크롤러 스케줄러 데이터베이스 초기화 중 오류 발생: {e}")
                # 오류가 발생해도 초기화는 계속 진행
                self._initialized = True
                # 최소한의 기능을 위해 DB 상태 초기화됨으로 설정
                self._db_state_initialized = True
    
    async def _load_last_updates(self):
        """시스템 설정에서 마지막 업데이트 시간 로드"""
        try:
            from ..models.system_config import SystemConfig
            
            # SystemConfig 모델이 초기화되었는지 확인
            try:
                updates = await SystemConfig.get_crawler_last_updates()
                if updates:
                    self._last_update = updates
                    self.log_info(f"마지막 업데이트 시간 로드: {updates}")
                else:
                    self.log_info("이전 업데이트 기록 없음")
            except Exception as e:
                if "CollectionWasNotInitialized" in str(e):
                    self.log_warning("SystemConfig 모델이 초기화되지 않았습니다. 기본값 사용")
                    # SystemConfig가 초기화되지 않았다면 빈 딕셔너리 사용
                    self._last_update = {}
                    
                    # 초기 데이터 생성 시도
                    try:
                        # SystemConfig 컬렉션 초기화 (부분적 초기화)
                        from motor.motor_asyncio import AsyncIOMotorClient
                        from ..core.config import get_settings
                        settings = get_settings()
                        
                        # MongoDB 연결
                        client = AsyncIOMotorClient(settings.MONGODB_URL)
                        db = client[settings.DATABASE_NAME]
                        
                        # system_config 컬렉션에 직접 문서 삽입
                        await db.system_config.insert_one({
                            "key": "crawler_last_updates",
                            "value": {}
                        })
                        
                        self.log_info("SystemConfig 초기 데이터 생성 완료")
                    except Exception as init_err:
                        self.log_error(f"SystemConfig 초기화 실패: {init_err}")
                else:
                    self.log_error(f"마지막 업데이트 시간 로드 중 오류: {e}")
                    self._last_update = {}
                
        except Exception as e:
            self.log_error(f"마지막 업데이트 시간 로드 중 오류: {e}")
            # 오류 발생 시 빈 딕셔너리로 초기화
            self._last_update = {}
    
    async def _save_last_update(self, crawler_type: str, update_time: datetime):
        """데이터베이스에 마지막 업데이트 시간 저장"""
        try:
            if not self._initialized:
                self.log_warning("데이터베이스가 초기화되지 않아 업데이트 시간을 저장할 수 없습니다.")
                return
                
            if not crawler_type:
                self.log_warning("크롤러 타입이 지정되지 않았습니다.")
                return
                
            if not update_time:
                self.log_warning("업데이트 시간이 지정되지 않았습니다.")
                return
                
            # 타임존 정보가 없는 경우 KST로 설정
            if update_time.tzinfo is None:
                update_time = KST.localize(update_time)
                
            await SystemConfig.update_crawler_last_update(crawler_type, update_time)
            self.log_info(f"크롤러 {crawler_type}의 마지막 업데이트 시간 저장됨: {update_time}")
        except Exception as e:
            self.log_error(f"크롤러 {crawler_type}의 업데이트 시간 저장 중 오류 발생: {e}")
    
    async def _broadcast_progress(self, crawler_type: str, stage: str, percent: int, message: str, updated_cves=None):
        """웹소켓을 통해 진행 상황을 브로드캐스트합니다."""
        try:
            # 단순화된 데이터 구조
            data = {
                "type": "crawler_update_progress",
                "data": {
                    "crawler": crawler_type,
                    "stage": stage,
                    "percent": percent,
                    "message": message,
                    "timestamp": datetime.now().isoformat(),  # 이미 문자열로 변환
                    "isRunning": self._is_running
                }
            }
            
            # 업데이트된 CVE 정보가 있으면 추가
            if updated_cves:
                # datetime 객체를 문자열로 직접 변환
                if isinstance(updated_cves, dict) and "items" in updated_cves:
                    for item in updated_cves["items"]:
                        if "created_at" in item and isinstance(item["created_at"], datetime):
                            item["created_at"] = item["created_at"].isoformat()
                
                data["data"]["updated_cves"] = updated_cves
            
            # 웹소켓으로 전송
            await socketio_manager.broadcast_json(data)
            
            # 로그
            self.log_info(f"진행 상황 [{crawler_type}]: {stage} {percent}% - {message}")
            
        except Exception as e:
            self.log_error(f"웹소켓 진행 상황 전송 중 오류: {str(e)}")
            self.log_error(traceback.format_exc())
    
    async def run_specific_crawler(self, crawler_type: str, user_id: Optional[str] = None, quiet_mode: bool = False):
        """특정 크롤러 실행"""
        try:
            # 크롤러 인스턴스 생성
            crawler = self._crawler_manager.create_crawler(crawler_type)
            if not crawler:
                logger.error(f"크롤러 생성 실패: {crawler_type}")
                return False
            
            # 사용자 ID 설정 (개인화된 메시지 전송용)
            if hasattr(crawler, 'set_requester_id') and user_id:
                crawler.set_requester_id(user_id)
            
            # 조용한 모드 설정
            if hasattr(crawler, 'set_quiet_mode'):
                crawler.set_quiet_mode(quiet_mode)
                if quiet_mode:
                    logger.info(f"{crawler_type} 크롤러: 조용한 모드로 실행")
            
            # 크롤러 실행 상태 설정 (async with 사용)
            async with self._lock:
                self._running_crawlers[crawler_type] = True
                self._is_running = True  # 전역 상태도 유지
                
                # 업데이트 시작 시간 기록
                start_time = get_now_kst()
                
                # 업데이트 시작 상태 브로드캐스트
                await self._broadcast_progress(
                    crawler_type=crawler_type,
                    stage="준비 중",
                    percent=0,
                    message=f"{crawler_type} 업데이트를 시작합니다."
                )
                
                try:
                    # 크롤러 실행
                    update_result = await crawler.run()
                    
                    # 크롤러 실행 성공 시
                    if update_result and update_result.get("stage") == "success":
                        # 마지막 업데이트 시간 저장
                        self._last_update[crawler_type] = start_time
                        await self._save_last_update(crawler_type, start_time)
                        
                        # 결과 저장
                        self._update_results[crawler_type] = update_result
                        
                        # 완료 단계
                        if update_result and isinstance(update_result.get("updated_cves"), dict):
                            updated_count = update_result["updated_cves"].get("count", 0)
                            success_message = f"{crawler_type} 업데이트가 완료되었습니다. {updated_count}개의 CVE가 업데이트되었습니다."
                            
                            # 업데이트가 없는 경우
                            if updated_count == 0:
                                success_message = f"{crawler_type} 업데이트가 완료되었습니다. 업데이트된 CVE가 없습니다."
                            
                            # 완료 메시지 전송
                            await self._broadcast_progress(
                                crawler_type=crawler_type,
                                stage="완료",
                                percent=100,
                                message=success_message,
                                updated_cves=update_result.get("updated_cves")
                            )
                        else:
                            # 기본 완료 메시지
                            await self._broadcast_progress(
                                crawler_type=crawler_type,
                                stage="완료",
                                percent=100,
                                message=f"{crawler_type} 업데이트가 완료되었습니다."
                            )
                        
                        return True
                    else:
                        # 오류 메시지
                        error_message = update_result.get("message", f"{crawler_type} 업데이트 중 오류가 발생했습니다.") if update_result else f"{crawler_type} 업데이트 중 오류가 발생했습니다."
                        
                        # 오류 상태 브로드캐스트
                        await self._broadcast_progress(
                            crawler_type=crawler_type,
                            stage="오류",
                            percent=0,
                            message=error_message
                        )
                        
                        return False
                except Exception as e:
                    # 크롤러 실행 중 오류 발생
                    error_message = f"크롤러 실행 중 오류 발생: {str(e)}"
                    self.log_error(error_message, e)
                    
                    # 오류 상태 브로드캐스트
                    await self._broadcast_progress(
                        crawler_type=crawler_type,
                        stage="오류",
                        percent=0,
                        message=error_message
                    )
                    
                    return False
                finally:
                    # 크롤러 실행 상태 해제
                    self._running_crawlers[crawler_type] = False
                    
                    # 다른 크롤러가 실행 중인지 확인
                    if not any(self._running_crawlers.values()):
                        self._is_running = False
        except Exception as e:
            # 전체 프로세스 오류
            error_message = f"크롤러 실행 중 오류 발생: {str(e)}"
            self.log_error(error_message, e)
            
            try:
                # 오류 상태 브로드캐스트
                await self._broadcast_progress(
                    crawler_type=crawler_type,
                    stage="오류",
                    percent=0,
                    message=error_message
                )
            except Exception as broadcast_error:
                self.log_error(f"오류 메시지 전송 실패: {str(broadcast_error)}", broadcast_error)
            
            return False
    
    def is_update_running(self) -> bool:
        """현재 업데이트가 진행 중인지 확인"""
        return self._is_running
    
    def get_last_update(self, crawler_type: str = None) -> Dict[str, datetime]:
        """마지막 업데이트 시간 조회"""
        if crawler_type:
            return {crawler_type: self._last_update.get(crawler_type)}
        return self._last_update
    
    def get_update_results(self, crawler_type: str = None) -> Dict[str, Dict[str, Any]]:
        """업데이트 결과 조회"""
        if crawler_type:
            return {crawler_type: self._update_results.get(crawler_type)}
        return self._update_results

    async def _batch_process_data(self, crawler_type: str, data_list: List[Dict[str, Any]], batch_size: int = 20) -> int:
        """데이터를 배치로 처리
        
        Args:
            crawler_type: 크롤러 유형
            data_list: 처리할 데이터 리스트
            batch_size: 배치 크기
            
        Returns:
            int: 처리된 데이터 수
        """
        if not data_list:
            return 0
            
        total = len(data_list)
        processed = 0
        
        # 배치 단위로 나누기
        batches = [data_list[i:i+batch_size] for i in range(0, total, batch_size)]
        
        for i, batch in enumerate(batches):
            # 배치 처리 진행률 계산
            progress = int((i / len(batches)) * 100)
            
            # 진행 상황 보고
            await self._broadcast_progress(
                crawler_type=crawler_type,
                stage="처리",
                percent=progress,
                message=f"{len(batch)}개 항목 처리 중... ({processed}/{total})"
            )
            
            # 배치 병렬 처리
            tasks = []
            for item in batch:
                # 여기서 실제 데이터 처리 로직 호출
                # 예: crawler.process_data(item)
                tasks.append(asyncio.create_task(self._process_single_item(crawler_type, item)))
            
            # 배치의 모든 작업이 완료될 때까지 대기
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # 결과 처리
            for result in batch_results:
                if result is True:  # 성공적으로 처리된 경우
                    processed += 1
                elif isinstance(result, Exception):
                    self.log_error(f"데이터 처리 중 오류: {str(result)}")
            
        return processed
    
    async def _process_single_item(self, crawler_type: str, item: Dict[str, Any]) -> bool:
        """단일 데이터 항목 처리
        
        실제 구현에서는 해당 크롤러의 process_data 메서드를 호출
        
        Args:
            crawler_type: 크롤러 유형
            item: 처리할 데이터 항목
            
        Returns:
            bool: 처리 성공 여부
        """
        try:
            # 크롤러 인스턴스 생성 방식 개선
            if hasattr(self._crawler_manager, 'create_crawler'):
                crawler = self._crawler_manager.create_crawler(crawler_type)
            elif hasattr(self._crawler_manager, 'factory') and self._crawler_manager.factory:
                crawler = self._crawler_manager.factory.create_crawler(crawler_type)
            else:
                return False
            
            if crawler:
                return await crawler.process_data(item)
            return False
        except Exception as e:
            self.log_error(f"항목 처리 중 오류: {str(e)}", e)
            return False
    
    def is_db_initialized(self) -> bool:
        """데이터베이스가 초기화되었는지 확인합니다."""
        try:
            # DB 연결 상태를 확인하는 간단한 방법
            if self._db_state_initialized:
                return True
            
            # 비동기 함수를 동기적으로 실행
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # 이미 이벤트 루프가 실행 중인 경우 (FastAPI 내에서 호출)
                # 새로운 루프를 생성하지 않고 현재 실행 중인 루프에서 future를 실행
                return True  # FastAPI 컨텍스트 내에서는 일단 성공으로 가정
            else:
                # 독립 실행 환경에서는 새 루프 생성
                return asyncio.run(self._check_db_connection())
        except Exception as e:
            self.log_error(f"데이터베이스 초기화 확인 중 오류: {str(e)}", e)
            return False
        
    async def _check_db_connection(self) -> bool:
        """데이터베이스 연결을 비동기적으로 확인합니다."""
        try:
            from ..models.cve_model import CVEModel
            # 간단한 쿼리 실행
            await CVEModel.find_all().limit(1).to_list()
            self._db_state_initialized = True  # 연결 성공 시 상태 저장
            return True
        except Exception as e:
            self.log_error(f"DB 연결 확인 중 오류: {str(e)}", e)
            return False

    async def init_scheduler_state(self):
        """
        스케줄러의 내부 상태를 초기화하는 메서드
        
        참고: 이 메서드는 실제로 데이터베이스를 초기화하지 않습니다. 
        데이터베이스가 이미 초기화된 후에 스케줄러의 상태만 설정합니다.
        """
        return await self.init_db()

def setup_scheduler():
    """호환성을 위한 함수 - CrawlerScheduler 인스턴스 반환"""
    return CrawlerScheduler() 