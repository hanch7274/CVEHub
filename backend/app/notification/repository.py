"""
알림 관련 데이터 접근 레이어

사용자 알림 데이터에 대한 CRUD 및 조회 기능을 제공합니다.
"""
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from zoneinfo import ZoneInfo
import logging
from beanie import PydanticObjectId

from .models import Notification, NotificationType, NotificationStatus

logger = logging.getLogger(__name__)

class NotificationRepository:
    """알림 데이터 접근 레이어 클래스"""
    
    async def create(
        self,
        notification_type: NotificationType,
        recipient_id: str,
        content: str,
        sender_id: Optional[str] = None,
        cve_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Notification:
        """
        새로운 알림을 생성합니다.
        
        Args:
            notification_type: 알림 유형
            recipient_id: 수신자 ID
            content: 알림 내용
            sender_id: 발신자 ID (선택적)
            cve_id: 관련 CVE ID (선택적)
            metadata: 추가 메타데이터 (선택적)
            
        Returns:
            생성된 알림 객체
        """
        try:
            notification = Notification(
                type=notification_type,
                recipient_id=recipient_id,
                sender_id=sender_id,
                cve_id=cve_id,
                content=content,
                metadata=metadata or {},
                created_at=datetime.now(ZoneInfo("UTC"))
            )
            
            # 데이터베이스에 저장
            await notification.insert()
            return notification
        except Exception as e:
            logger.error(f"알림 생성 중 오류 발생: {str(e)}")
            raise
    
    async def get_by_id(self, notification_id: str) -> Optional[Notification]:
        """
        ID로 알림을 조회합니다.
        
        Args:
            notification_id: 알림 ID
            
        Returns:
            알림 객체 또는 None
        """
        try:
            # 문자열 ID를 ObjectId로 변환
            if isinstance(notification_id, str):
                try:
                    obj_id = PydanticObjectId(notification_id)
                except:
                    obj_id = notification_id
            else:
                obj_id = notification_id
                
            return await Notification.get(obj_id)
        except Exception as e:
            logger.error(f"알림 조회 중 오류 발생: {str(e)}")
            return None
    
    async def get_by_recipient(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 20,
        status: Optional[NotificationStatus] = None
    ) -> List[Notification]:
        """
        사용자가 수신한 알림 목록을 조회합니다.
        
        Args:
            user_id: 사용자 ID
            skip: 건너뛸 레코드 수 (페이징)
            limit: 가져올 최대 레코드 수 (페이징)
            status: 알림 상태로 필터링 (선택적)
            
        Returns:
            알림 목록
        """
        try:
            query = {"recipient_id": user_id}
            if status:
                query["status"] = status
                
            notifications = await Notification.find(query)\
                .sort(-Notification.created_at)\
                .skip(skip)\
                .limit(limit)\
                .to_list()
                
            return notifications
        except Exception as e:
            logger.error(f"알림 목록 조회 중 오류 발생: {str(e)}")
            return []
    
    async def get_recent_notifications(
        self,
        user_id: str,
        limit: int = 5
    ) -> List[Notification]:
        """
        사용자의 최근 알림 목록을 조회합니다.
        소셜 미디어 스타일의 알림 드롭다운에 표시할 최신 알림들
        
        Args:
            user_id: 사용자 ID
            limit: 가져올 최대 알림 수
            
        Returns:
            최근 알림 목록
        """
        try:
            notifications = await Notification.find({"recipient_id": user_id})\
                .sort(-Notification.created_at)\
                .limit(limit)\
                .to_list()
                
            return notifications
        except Exception as e:
            logger.error(f"최근 알림 조회 중 오류 발생: {str(e)}")
            return []
    
    async def mark_as_read(self, notification_id: str, user_id: str) -> bool:
        """
        알림을 읽음 처리합니다.
        
        Args:
            notification_id: 알림 ID
            user_id: 사용자 ID (권한 확인용)
            
        Returns:
            성공 여부
        """
        try:
            notification = await self.get_by_id(notification_id)
            if not notification or notification.recipient_id != user_id:
                return False
                
            notification.status = NotificationStatus.READ
            notification.read_at = datetime.now(ZoneInfo("UTC"))
            await notification.save()
            return True
        except Exception as e:
            logger.error(f"알림 읽음 처리 중 오류 발생: {str(e)}")
            return False
    
    async def mark_all_as_read(self, user_id: str) -> int:
        """
        사용자의 모든 알림을 읽음 처리합니다.
        
        Args:
            user_id: 사용자 ID
            
        Returns:
            읽음 처리된 알림 수
        """
        try:
            notifications = await Notification.find({
                "recipient_id": user_id,
                "status": NotificationStatus.UNREAD
            }).to_list()
            
            update_time = datetime.now(ZoneInfo("UTC"))
            for notification in notifications:
                notification.status = NotificationStatus.READ
                notification.read_at = update_time
                await notification.save()
                
            return len(notifications)
        except Exception as e:
            logger.error(f"모든 알림 읽음 처리 중 오류 발생: {str(e)}")
            return 0
    
    async def mark_as_delivered(self, notification_id: str) -> bool:
        """
        알림을 전송 완료로 표시합니다.
        
        Args:
            notification_id: 알림 ID
            
        Returns:
            성공 여부
        """
        try:
            notification = await self.get_by_id(notification_id)
            if not notification:
                return False
                
            notification.delivered = True
            await notification.save()
            return True
        except Exception as e:
            logger.error(f"알림 전송 완료 처리 중 오류 발생: {str(e)}")
            return False
    
    async def get_unread_count(self, user_id: str) -> int:
        """
        사용자의 읽지 않은 알림 개수를 조회합니다.
        
        Args:
            user_id: 사용자 ID
            
        Returns:
            읽지 않은 알림 개수
        """
        try:
            return await Notification.find({
                "recipient_id": user_id,
                "status": NotificationStatus.UNREAD
            }).count()
        except Exception as e:
            logger.error(f"읽지 않은 알림 개수 조회 중 오류 발생: {str(e)}")
            return 0
    
    async def get_total_count(self, user_id: str) -> int:
        """
        사용자의 전체 알림 개수를 조회합니다.
        
        Args:
            user_id: 사용자 ID
            
        Returns:
            전체 알림 개수
        """
        try:
            return await Notification.find({
                "recipient_id": user_id
            }).count()
        except Exception as e:
            logger.error(f"전체 알림 개수 조회 중 오류 발생: {str(e)}")
            return 0
    
    async def delete_by_id(self, notification_id: str, user_id: str) -> bool:
        """
        알림을 삭제합니다.
        
        Args:
            notification_id: 알림 ID
            user_id: 사용자 ID (권한 확인용)
            
        Returns:
            성공 여부
        """
        try:
            notification = await self.get_by_id(notification_id)
            if not notification or notification.recipient_id != user_id:
                return False
                
            await notification.delete()
            return True
        except Exception as e:
            logger.error(f"알림 삭제 중 오류 발생: {str(e)}")
            return False
    
    async def delete_old_notifications(self, days: int = 30) -> int:
        """
        오래된 알림을 삭제합니다.
        
        Args:
            days: 삭제할 기준 일수 (이전 알림)
            
        Returns:
            삭제된 알림 수
        """
        try:
            from datetime import timedelta
            
            # 기준 시간 계산 (현재 시간 - days일)
            cutoff_date = datetime.now(ZoneInfo("UTC")) - timedelta(days=days)
            
            # 오래된 알림 삭제
            result = await Notification.find({
                "created_at": {"$lt": cutoff_date}
            }).delete_many()
            
            return result.deleted_count if hasattr(result, 'deleted_count') else 0
        except Exception as e:
            logger.error(f"오래된 알림 삭제 중 오류 발생: {str(e)}")
            return 0
    
    async def get_notifications_by_type(
        self,
        user_id: str,
        notification_type: NotificationType,
        skip: int = 0,
        limit: int = 20
    ) -> List[Notification]:
        """
        특정 유형의 알림 목록을 조회합니다.
        
        Args:
            user_id: 사용자 ID
            notification_type: 알림 유형
            skip: 건너뛸 레코드 수 (페이징)
            limit: 가져올 최대 레코드 수 (페이징)
            
        Returns:
            알림 목록
        """
        try:
            notifications = await Notification.find({
                "recipient_id": user_id,
                "type": notification_type
            })\
                .sort(-Notification.created_at)\
                .skip(skip)\
                .limit(limit)\
                .to_list()
                
            return notifications
        except Exception as e:
            logger.error(f"유형별 알림 조회 중 오류 발생: {str(e)}")
            return []
    
    async def get_grouped_notifications(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 20
    ) -> Dict[str, List[Notification]]:
        """
        유형별로 그룹화된 알림 목록을 조회합니다.
        소셜 미디어 스타일 알림 탭에 유용함
        
        Args:
            user_id: 사용자 ID
            skip: 건너뛸 레코드 수 (페이징)
            limit: 가져올 최대 레코드 수 (페이징)
            
        Returns:
            유형별로 그룹화된 알림 목록 딕셔너리
        """
        try:
            # 먼저 모든 알림 가져오기
            notifications = await Notification.find({
                "recipient_id": user_id
            })\
                .sort(-Notification.created_at)\
                .skip(skip)\
                .limit(limit)\
                .to_list()
            
            # 유형별로 그룹화
            grouped = {}
            for notification in notifications:
                if notification.type not in grouped:
                    grouped[notification.type] = []
                grouped[notification.type].append(notification)
                
            return grouped
        except Exception as e:
            logger.error(f"그룹화된 알림 조회 중 오류 발생: {str(e)}")
            return {}


# 싱글톤 인스턴스
_notification_repository = NotificationRepository()

def get_notification_repository() -> NotificationRepository:
    """NotificationRepository 인스턴스를 반환합니다."""
    global _notification_repository
    return _notification_repository
