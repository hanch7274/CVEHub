"""
업데이트 이력 관련 서비스
"""
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorClient

from app.models.cve_model import CVEModel
from app.core.exceptions import DatabaseOperationError
from zoneinfo import ZoneInfo
import logging

logger = logging.getLogger(__name__)

class UpdateHistoryService:
    def __init__(self, db_client: AsyncIOMotorClient = None):
        """
        업데이트 이력 서비스 초기화
        
        Args:
            db_client: MongoDB 클라이언트 (선택 사항)
        """
        self.db_client = db_client

    def _create_date_range_pipeline(self, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """
        날짜 범위에 대한 기본 파이프라인을 생성합니다.
        
        Args:
            start_date: 시작 날짜
            end_date: 종료 날짜
            
        Returns:
            기본 파이프라인 리스트
        """
        return [
            {
                "$match": {
                    "modification_history.modified_at": {
                        "$gte": start_date,
                        "$lte": end_date
                    }
                }
            },
            {
                "$unwind": "$modification_history"
            },
            {
                "$match": {
                    "modification_history.modified_at": {
                        "$gte": start_date,
                        "$lte": end_date
                    }
                }
            }
        ]

    async def _handle_aggregation_request(self, pipeline: List[Dict[str, Any]], error_msg: str) -> List[Dict[str, Any]]:
        """
        MongoDB 집계 파이프라인을 실행하고 오류를 처리합니다.
        
        Args:
            pipeline: MongoDB 집계 파이프라인
            error_msg: 오류 발생 시 표시할 메시지
            
        Returns:
            집계 결과 리스트
            
        Raises:
            DatabaseOperationError: 데이터베이스 작업 중 오류 발생 시
        """
        try:
            result = await CVEModel.aggregate(pipeline).to_list()
            return result
        except Exception as e:
            logger.error(f"{error_msg}: {str(e)}")
            raise DatabaseOperationError(f"{error_msg}: {str(e)}")

    async def get_recent_updates(
        self,
        days: int = 7,
        crawlers_only: bool = False,
        username: Optional[str] = None,
        page: int = 1,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        최근 업데이트 이력을 조회합니다.
        
        Args:
            days: 최근 몇 일간의 데이터를 조회할지 (기본값: 7일)
            crawlers_only: 크롤러에 의한 업데이트만 표시할지 여부
            username: 특정 사용자의 업데이트만 표시할 사용자 이름
            page: 페이지 번호
            limit: 페이지당 항목 수
            
        Returns:
            업데이트 이력 및 페이지네이션 정보가 포함된 딕셔너리
            
        Raises:
            DatabaseOperationError: 데이터베이스 작업 중 오류 발생 시
        """
        # 날짜 범위 설정
        end_date = datetime.now(ZoneInfo("Asia/Seoul"))
        start_date = end_date - timedelta(days=days)
        
        # 로깅
        logger.info(f"Fetching updates from {start_date} to {end_date}, crawlers_only={crawlers_only}, username={username}")
        
        try:
            # 기본 파이프라인 생성
            pipeline = self._create_date_range_pipeline(start_date, end_date)
            
            # 크롤러 필터링 (필요시)
            if crawlers_only:
                pipeline.append({
                    "$match": {
                        "modification_history.username": {
                            "$in": ["Nuclei-Crawler", "Metasploit-Crawler", "EmergingThreats-Crawler"]
                        }
                    }
                })
            
            # 사용자 필터링 (필요시)
            if username:
                pipeline.append({
                    "$match": {
                        "modification_history.username": username
                    }
                })
            
            # 결과 프로젝션 및 정렬
            pipeline.extend([
                {
                    "$project": {
                        "_id": 0,
                        "cve_id": 1,
                        "title": 1,
                        "status": 1,
                        "username": "$modification_history.username",
                        "modified_at": "$modification_history.modified_at",
                        "changes": "$modification_history.changes"
                    }
                },
                {
                    "$sort": {
                        "modified_at": -1
                    }
                }
            ])
            
            # 총 개수 카운트를 위한 파이프라인
            count_pipeline = pipeline.copy()
            count_pipeline.append({"$count": "total"})
            count_result = await self._handle_aggregation_request(
                count_pipeline,
                "업데이트 개수 조회 중 오류가 발생했습니다"
            )
            total_count = count_result[0]["total"] if count_result else 0
            
            # 페이지네이션
            pipeline.extend([
                {"$skip": (page - 1) * limit},
                {"$limit": limit}
            ])
            
            # 집계 실행 및 오류 처리
            updates = await self._handle_aggregation_request(
                pipeline,
                "업데이트 이력 조회 중 오류가 발생했습니다"
            )
            
            logger.info(f"Found {len(updates)} update records out of {total_count} total")
            
            # 응답 형식으로 변환
            return {
                "updates": updates,
                "total": total_count,
                "page": page,
                "limit": limit
            }
        except DatabaseOperationError:
            raise
        except Exception as e:
            logger.error(f"업데이트 이력 조회 중 오류 발생: {str(e)}")
            raise DatabaseOperationError(f"업데이트 이력 조회 중 오류가 발생했습니다: {str(e)}")

    async def get_update_statistics(self, days: int = 30) -> Dict[str, Any]:
        """
        업데이트 관련 통계 정보를 조회합니다.
        
        Args:
            days: 최근 몇 일간의 데이터를 조회할지 (기본값: 30일)
            
        Returns:
            통계 정보가 포함된 딕셔너리
            
        Raises:
            DatabaseOperationError: 데이터베이스 작업 중 오류 발생 시
        """
        # 날짜 범위 설정
        end_date = datetime.now(ZoneInfo("Asia/Seoul"))
        start_date = end_date - timedelta(days=days)
        
        logger.info(f"Fetching update statistics from {start_date} to {end_date}")
        
        try:
            # 기본 파이프라인 생성
            base_pipeline = self._create_date_range_pipeline(start_date, end_date)
            
            # 전체 업데이트 수
            total_updates_pipeline = base_pipeline + [{"$count": "total"}]
            total_updates_result = await self._handle_aggregation_request(
                total_updates_pipeline,
                "전체 업데이트 수 조회 중 오류가 발생했습니다"
            )
            total_updates = total_updates_result[0]["total"] if total_updates_result else 0
            
            # 사용자별 업데이트 수
            by_user_pipeline = base_pipeline + [
                {
                    "$group": {
                        "_id": "$modification_history.username",
                        "count": {"$sum": 1}
                    }
                },
                {
                    "$sort": {"count": -1}
                },
                {
                    "$limit": 10
                }
            ]
            by_user = await self._handle_aggregation_request(
                by_user_pipeline,
                "사용자별 업데이트 수 조회 중 오류가 발생했습니다"
            )
            
            # 필드별 업데이트 수
            by_field_pipeline = base_pipeline + [
                {
                    "$unwind": "$modification_history.changes"
                },
                {
                    "$group": {
                        "_id": "$modification_history.changes.field_name",
                        "count": {"$sum": 1}
                    }
                },
                {
                    "$sort": {"count": -1}
                },
                {
                    "$limit": 20
                }
            ]
            by_field = await self._handle_aggregation_request(
                by_field_pipeline,
                "필드별 업데이트 수 조회 중 오류가 발생했습니다"
            )
            
            # 일별 업데이트 수
            daily_pipeline = base_pipeline + [
                {
                    "$project": {
                        "date": {
                            "$dateToString": {
                                "format": "%Y-%m-%d",
                                "date": "$modification_history.modified_at",
                                "timezone": "Asia/Seoul"
                            }
                        }
                    }
                },
                {
                    "$group": {
                        "_id": "$date",
                        "count": {"$sum": 1}
                    }
                },
                {
                    "$sort": {"_id": 1}
                }
            ]
            daily = await self._handle_aggregation_request(
                daily_pipeline,
                "일별 업데이트 수 조회 중 오류가 발생했습니다"
            )
            
            return {
                "total_updates": total_updates,
                "by_user": by_user,
                "by_field": by_field,
                "daily": daily
            }
        except DatabaseOperationError:
            raise
        except Exception as e:
            logger.error(f"업데이트 통계 조회 중 오류 발생: {str(e)}")
            raise DatabaseOperationError(f"업데이트 통계 조회 중 오류가 발생했습니다: {str(e)}")

    async def get_cve_update_history(self, cve_id: str) -> Dict[str, Any]:
        """
        특정 CVE의 업데이트 이력을 조회합니다.
        
        Args:
            cve_id: 조회할 CVE의 ID
            
        Returns:
            업데이트 이력 정보가 포함된 딕셔너리
            
        Raises:
            DatabaseOperationError: 데이터베이스 작업 중 오류 발생 시
        """
        logger.info(f"Fetching update history for CVE: {cve_id}")
        
        try:
            # CVE 문서 조회
            cve = await CVEModel.find_one({"cve_id": cve_id})
            if not cve:
                logger.warning(f"CVE not found: {cve_id}")
                raise DatabaseOperationError(f"CVE ID '{cve_id}'를 찾을 수 없습니다", 404)
            
            # 업데이트 이력 추출 및 정렬
            update_history = cve.modification_history
            update_history.sort(key=lambda x: x.modified_at, reverse=True)
            
            # 응답 형식으로 변환
            history_entries = []
            for entry in update_history:
                history_entries.append({
                    "username": entry.username,
                    "modified_at": entry.modified_at,
                    "changes": entry.changes
                })
            
            return {
                "cve_id": cve_id,
                "update_history": history_entries
            }
        except DatabaseOperationError:
            raise
        except Exception as e:
            logger.error(f"CVE 업데이트 이력 조회 중 오류 발생: {str(e)}")
            raise DatabaseOperationError(f"CVE 업데이트 이력 조회 중 오류가 발생했습니다: {str(e)}")
