"""시스템 구성 및 상태 모델"""
from datetime import datetime
from pydantic import Field
from typing import Dict, Optional
import logging
from beanie import Document

logger = logging.getLogger(__name__)

class SystemConfig(Document):
    """시스템 설정 및 상태 정보 모델"""
    
    key: str = Field(..., description="설정 키")
    value: Dict = Field(default={}, description="설정 값 (딕셔너리 형태)")
    last_modified_at: datetime = Field(default_factory=datetime.now, description="마지막 업데이트 시간")
    
    class Settings:
        name = "system_configs"
        
    @classmethod
    async def get_crawler_last_updates(cls) -> dict:
        """크롤러 마지막 업데이트 시간 조회"""
        try:
            config = await cls.find_one({"key": "crawler_last_updates"})
            if config:
                return config.value
            
            # 없으면 새로 생성
            new_config = cls(key="crawler_last_updates", value={})
            await new_config.save()
            return {}
        except Exception as e:
            logger.error(f"크롤러 업데이트 시간 조회 중 오류 발생: {str(e)}")
            logger.exception(e)
            
            # 기본값 반환
            return {}
    
    @classmethod
    async def update_crawler_last_update(cls, crawler_type: str, update_time: datetime):
        """크롤러 마지막 업데이트 시간 저장"""
        try:
            if not crawler_type:
                logger.warning("유효하지 않은 crawler_type입니다.")
                return {}
                
            config = await cls.find_one({"key": "crawler_last_updates"})
            if not config:
                logger.info(f"crawler_last_updates 설정을 새로 생성합니다. crawler_type: {crawler_type}")
                config = cls(key="crawler_last_updates", value={})
            
            # 업데이트 시간 저장
            config.value[crawler_type] = update_time.isoformat()
            config.last_modified_at = datetime.now()
            
            await config.save()
            return config.value
        except Exception as e:
            logger.error(f"크롤러 업데이트 시간 저장 중 오류 발생 - crawler_type: {crawler_type}, 오류: {str(e)}", exc_info=True)
            return {} 