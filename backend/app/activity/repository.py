"""
사용자 활동 레포지토리
"""
from typing import List, Dict, Any, Optional
from datetime import datetime
from pymongo import DESCENDING
from .models import UserActivity, ActivityAction, ActivityTargetType

class ActivityRepository:
    """사용자 활동 저장소 클래스"""
    
    def _convert_activities_for_response(self, activities: List[UserActivity]) -> List[Dict[str, Any]]:
        """MongoDB 객체를 API 응답에 맞게 변환합니다."""
        items_with_id = []
        for activity in activities:
            activity_dict = activity.dict()
            # MongoDB _id를 id 필드로 복사
            activity_dict["id"] = str(activity_dict.get("_id"))
            items_with_id.append(activity_dict)
        return items_with_id

    async def create_activity(self, activity_data: Dict[str, Any]) -> UserActivity:
        """
        사용자 활동을 생성합니다.
        
        Args:
            activity_data: 활동 데이터
            
        Returns:
            새 활동 객체
        """
        activity = UserActivity(**activity_data)
        await activity.create()
        return activity

    async def get_activities_by_username(self, 
                                         username: str, 
                                         page: int = 1, 
                                         limit: int = 10) -> Dict[str, Any]:
        """
        사용자명으로 활동 목록을 조회합니다.
        
        Args:
            username: 조회할 사용자명
            page: 페이지 번호
            limit: 페이지당 항목 수
            
        Returns:
            총 개수와 활동 목록
        """
        skip = (page - 1) * limit
        
        # 사용자명으로 조회
        query = {"username": username}
        
        # 활동 개수 조회
        total = await UserActivity.find(query).count()
        
        # 활동 목록 조회
        activities = await UserActivity.find(query)\
            .sort([("timestamp", DESCENDING)])\
            .skip(skip)\
            .limit(limit)\
            .to_list()
        
        return {
            "total": total,
            "items": self._convert_activities_for_response(activities),
            "page": page,
            "limit": limit
        }

    async def get_activities_by_target(self, 
                                       target_type: str, 
                                       target_id: str, 
                                       page: int = 1, 
                                       limit: int = 10) -> Dict[str, Any]:
        """
        대상 유형과 ID로 활동 목록을 조회합니다.
        
        Args:
            target_type: 대상 유형 (cve, poc 등)
            target_id: 대상 ID (CVE ID 등)
            page: 페이지 번호
            limit: 페이지당 항목 수
            
        Returns:
            총 개수와 활동 목록
        """
        skip = (page - 1) * limit
        
        # 대상 유형과 ID로 조회
        query = {
            "target_type": target_type,
            "target_id": target_id
        }
        
        # 활동 개수 조회
        total = await UserActivity.find(query).count()
        
        # 활동 목록 조회
        activities = await UserActivity.find(query)\
            .sort([("timestamp", DESCENDING)])\
            .skip(skip)\
            .limit(limit)\
            .to_list()
        
        return {
            "total": total,
            "items": self._convert_activities_for_response(activities),
            "page": page,
            "limit": limit
        }

    async def get_all_activities(self, 
                                filter_data: Optional[Dict[str, Any]] = None, 
                                page: int = 1, 
                                limit: int = 10) -> Dict[str, Any]:
        """
        모든 또는 필터링된 활동 목록을 조회합니다.
        
        Args:
            filter_data: 필터링할 데이터 (특정 대상 유형, 활동 유형 등)
            page: 페이지 번호
            limit: 페이지당 항목 수
            
        Returns:
            총 개수와 활동 목록
        """
        skip = (page - 1) * limit
        
        # 쿼리 구성
        query = {}
        
        if filter_data:
            # 대상 유형 필터 - OR 조건 처리
            if "target_type" in filter_data:
                if isinstance(filter_data["target_type"], ActivityTargetType):
                    query["target_type"] = filter_data["target_type"].value
                elif isinstance(filter_data["target_type"], str) and "," in filter_data["target_type"]:
                    # 쉼표로 구분된 문자열을 배열로 분할하여 $in 연산자 사용(OR 조건)
                    target_type_list = [target_type.strip() for target_type in filter_data["target_type"].split(",")]
                    query["target_type"] = {"$in": target_type_list}
                else:
                    query["target_type"] = filter_data["target_type"]
            
            # 동작 필터 - OR 조건 처리
            if "action" in filter_data:
                if isinstance(filter_data["action"], ActivityAction):
                    query["action"] = filter_data["action"].value
                elif isinstance(filter_data["action"], str) and "," in filter_data["action"]:
                    # 쉼표로 구분된 문자열을 배열로 분할하여 $in 연산자 사용(OR 조건)
                    action_list = [action.strip() for action in filter_data["action"].split(",")]
                    query["action"] = {"$in": action_list}
                else:
                    query["action"] = filter_data["action"]
            
            # 대상 ID 필터
            if "target_id" in filter_data:
                query["target_id"] = filter_data["target_id"]
            
            # 사용자명 필터
            if "username" in filter_data:
                query["username"] = filter_data["username"]
            
            # 날짜 범위 필터
            if "start_date" in filter_data or "end_date" in filter_data:
                date_query = {}
                
                if "start_date" in filter_data:
                    date_query["$gte"] = filter_data["start_date"]
                
                if "end_date" in filter_data:
                    date_query["$lte"] = filter_data["end_date"]
                
                if date_query:
                    query["timestamp"] = date_query
        
        # 활동 개수 조회
        total = await UserActivity.find(query).count()
        
        # 활동 목록 조회
        activities = await UserActivity.find(query)\
            .sort([("timestamp", DESCENDING)])\
            .skip(skip)\
            .limit(limit)\
            .to_list()
        
        return {
            "total": total,
            "items": self._convert_activities_for_response(activities),
            "page": page,
            "limit": limit
        }

    async def delete_activity(self, activity_id: str) -> bool:
        """
        활동을 ID로 삭제합니다.
        
        Args:
            activity_id: 삭제할 활동 ID
            
        Returns:
            성공 여부
        """
        activity = await UserActivity.get(activity_id)
        if activity:
            await activity.delete()
            return True
        return False
