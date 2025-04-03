"""
크롤러 관련 스키마 정의
"""
from typing import List, Dict, Any, Optional, TypeVar, Generic
from datetime import datetime
from pydantic import BaseModel, Field


class CrawlerResponse(BaseModel):
    """크롤러 응답 스키마"""
    message: str = Field(..., description="응답 메시지")
    stage: str = Field(..., description="상태 (예: completed, running, failed)")
    crawler_type: str = Field(..., description="크롤러 유형 (예: nuclei, metasploit)")


class DBStatusResponse(BaseModel):
    """데이터베이스 상태 응답 스키마"""
    status: str = Field(..., description="데이터베이스 상태")
    message: str = Field(..., description="상태 메시지")
    initialized: bool = Field(..., description="초기화 완료 여부")


class UpdatedCVE(BaseModel):
    """업데이트된 CVE 정보"""
    cve_id: str = Field(..., description="CVE ID")
    title: Optional[str] = Field(None, description="CVE 제목")
    fields_updated: List[str] = Field([], description="업데이트된 필드 목록")


class UpdatedCVEList(BaseModel):
    """업데이트된 CVE 목록"""
    cves: List[UpdatedCVE] = Field(..., description="업데이트된 CVE 목록")
    count: int = Field(..., description="업데이트된 CVE 개수")


class CrawlerResult(BaseModel):
    """크롤러 결과 스키마"""
    added: int = Field(0, description="추가된 항목 수")
    updated: int = Field(0, description="업데이트된 항목 수")
    failed: int = Field(0, description="실패한 항목 수")
    skipped: int = Field(0, description="건너뛴 항목 수")
    total: int = Field(0, description="전체 처리 항목 수")
    errors: List[str] = Field([], description="발생한 오류 목록")


class CrawlerStatusResponse(BaseModel):
    """크롤러 상태 응답 스키마"""
    isRunning: bool = Field(..., description="크롤러 실행 중 여부")
    lastUpdate: Optional[datetime] = Field(None, description="마지막 업데이트 시간")
    results: Optional[Dict[str, CrawlerResult]] = Field(None, description="각 크롤러별 결과")


class CrawlerUpdateResult(BaseModel):
    """크롤러 업데이트 결과 스키마"""
    crawler_id: str = Field(..., description="크롤러 ID")
    results: Optional[Dict[str, Any]] = Field(None, description="업데이트 결과 상세")


class AvailableCrawler(BaseModel):
    """사용 가능한 크롤러 정보"""
    id: str = Field(..., description="크롤러 ID")
    name: str = Field(..., description="크롤러 이름")
    description: Optional[str] = Field(None, description="크롤러 설명")
    type: str = Field(..., description="크롤러 유형")
    enabled: bool = Field(True, description="활성화 여부")


class AvailableCrawlers(BaseModel):
    """사용 가능한 크롤러 목록"""
    crawlers: List[AvailableCrawler] = Field(..., description="사용 가능한 크롤러 목록")
    count: int = Field(..., description="크롤러 개수")

# 제네릭 데이터 타입 (다양한 응답 구조 지원)
T = TypeVar('T')

class StandardResponse(BaseModel, Generic[T]):
    """표준 API 응답 스키마"""
    success: bool = Field(..., description="요청 성공 여부")
    message: str = Field(..., description="응답 메시지")
    data: Optional[T] = Field(None, description="응답 데이터")
    timestamp: datetime = Field(default_factory=datetime.now, description="응답 시간")