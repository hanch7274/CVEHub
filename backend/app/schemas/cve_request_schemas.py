"""
CVE 관련 요청 스키마 정의
"""
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
from zoneinfo import ZoneInfo

from .cve_base_schemas import Reference, PoCBase, SnortRuleBase

# ----- 요청 모델 -----

class CreatePoCRequest(PoCBase):
    """PoC 생성 요청 모델"""
    pass

class CreateSnortRuleRequest(SnortRuleBase):
    """Snort 룰 생성 요청 모델"""
    pass

class CreateCVERequest(BaseModel):
    """CVE 생성 요청 모델"""
    cve_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    status: str = "신규등록"
    severity: Optional[str] = None
    references: List[Dict[str, str]] = []
    pocs: List[CreatePoCRequest] = []
    snort_rules: List[CreateSnortRuleRequest] = []

    class Config:
        json_encoders = {
            datetime: lambda v: v.replace(tzinfo=ZoneInfo("Asia/Seoul")).isoformat() if v else None
        }

class PatchCVERequest(BaseModel):
    """CVE 부분 업데이트 요청 모델"""
    cve_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    severity: Optional[str] = None
    references: Optional[List[Reference]] = None
    pocs: Optional[List[CreatePoCRequest]] = None
    snort_rules: Optional[List[CreateSnortRuleRequest]] = None

    class Config:
        extra = "allow"
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class BulkUpsertCVERequest(BaseModel):
    """다중 CVE 업서트 요청 모델"""
    cves: List[CreateCVERequest]
    crawler_name: Optional[str] = None
