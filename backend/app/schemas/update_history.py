"""
업데이트 이력 관련 스키마 정의
"""
from datetime import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class RecentUpdateEntry(BaseModel):
    """최근 업데이트 목록 항목"""
    cve_id: str = Field(..., description="CVE ID")
    title: Optional[str] = Field(None, description="CVE 제목") 
    username: Optional[str] = Field(None, description="수정한 사용자 이름")
    modified_at: datetime = Field(..., description="수정 시간")
    is_crawler: bool = Field(False, description="크롤러에 의한 수정 여부")
    field_changes: Dict[str, Any] = Field(default_factory=dict, description="변경된 필드")
    crawler_type: Optional[str] = Field(None, description="크롤러 유형 (해당하는 경우)")


class RecentUpdatesResponse(BaseModel):
    """최근 업데이트 목록 응답"""
    updates: List[RecentUpdateEntry] = Field(..., description="업데이트 목록")
    total: int = Field(..., description="전체 업데이트 수")
    page: int = Field(1, description="현재 페이지")
    limit: int = Field(..., description="페이지당 항목 수")
    days: int = Field(..., description="조회 기간(일)")


class UpdateStatisticsEntry(BaseModel):
    """업데이트 통계 항목"""
    date: datetime = Field(..., description="날짜")
    count: int = Field(..., description="업데이트 수")
    manual_count: int = Field(0, description="수동 업데이트 수")
    crawler_count: int = Field(0, description="크롤러 업데이트 수")


class UpdateStatisticsResponse(BaseModel):
    """업데이트 통계 응답"""
    statistics: List[UpdateStatisticsEntry] = Field(..., description="통계 데이터")
    total_updates: int = Field(..., description="전체 업데이트 수")
    period_days: int = Field(..., description="조회 기간(일)")


class UpdateHistoryEntry(BaseModel):
    """업데이트 이력 항목"""
    modified_at: datetime = Field(..., description="수정 시간")
    modified_by: Optional[str] = Field(None, description="수정한 사용자 이름")
    is_crawler: bool = Field(False, description="크롤러에 의한 수정 여부") 
    crawler_type: Optional[str] = Field(None, description="크롤러 유형 (해당하는 경우)")
    changes: Dict[str, Any] = Field(default_factory=dict, description="변경 내용")


class CVEUpdateHistoryResponse(BaseModel):
    """CVE 업데이트 이력 응답"""
    cve_id: str = Field(..., description="CVE ID")
    history: List[UpdateHistoryEntry] = Field(..., description="업데이트 이력")
    count: int = Field(..., description="이력 항목 수")
