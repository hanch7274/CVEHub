"""
CVE 중앙 스키마 정의 파일
모든 CVE 관련 필드와 구조는 이 파일에서 정의됩니다.
"""
from typing import Dict, Tuple, List, Optional, Literal, Any
from app.schemas.base import SchemaDefinition

class CVESchemaDefinition(SchemaDefinition):
    """CVE 스키마 정의 - 모든 CVE 관련 필드의 중앙 소스"""
    
    # 기본 필드
    fields: Dict[str, Tuple[str, str, Optional[str], bool, Any]] = {
        # 필드명: (타입, 설명, 기본값, 필수여부, 예시값)
        "cve_id": ("str", "CVE ID", None, True, "CVE-2023-1234"),
        "title": ("Optional[str]", "CVE 제목", None, False, "원격 코드 실행 취약점"),
        "description": ("Optional[str]", "CVE 설명", None, False, "이 취약점은..."),
        "status": ("str", "CVE 상태", "\"신규등록\"", True, "신규등록"),
        "assigned_to": ("Optional[str]", "담당자", None, False, "jdoe"),
        "severity": ("Optional[str]", "심각도", None, False, "높음"),
        "created_by": ("str", "추가한 사용자", None, True, "admin"),
        "last_modified_by": ("str", "마지막 수정자", None, True, "admin"),
        
        # 락 관련 필드
        "is_locked": ("bool", "편집 잠금 여부", "False", False, False),
        "locked_by": ("Optional[str]", "잠금 설정한 사용자", None, False, "admin"),
        "lock_timestamp": ("Optional[datetime]", "잠금 설정 시간", None, False, "2023-01-01T12:00:00Z"),
        "lock_expires_at": ("Optional[datetime]", "잠금 만료 시간", None, False, "2023-01-01T13:00:00Z"),
        
        # 기타 메타데이터
        "notes": ("Optional[str]", "내부 참고사항", None, False, "패치 확인 필요"),
        "nuclei_hash": ("Optional[str]", "Nuclei 템플릿 해시", None, False, "a1b2c3d4"),
    }
    
    # 임베디드 모델 정의
    embedded_models: Dict[str, Dict[str, Tuple[str, str, Optional[str], bool, Any]]] = {
        "reference": {
            "url": ("str", "참조 URL", None, True, "https://example.com"),
            "type": ("str", "참조 타입", "\"OTHER\"", False, "OTHER"),
            "description": ("Optional[str]", "참조 설명", None, False, "관련 문서"),
            "created_at": ("datetime", "생성 시간", "lambda: datetime.now(ZoneInfo(\"UTC\"))", True, "2023-01-01T12:00:00Z"),
            "created_by": ("str", "추가한 사용자", None, True, "admin"),
            "last_modified_at": ("datetime", "마지막 수정 시간", "lambda: datetime.now(ZoneInfo(\"UTC\"))", True, "2023-01-01T12:00:00Z"),
            "last_modified_by": ("str", "마지막 수정자", None, True, "admin"),
        },
        "poc": {
            "source": ("str", "PoC 소스", None, True, "Github"),
            "url": ("str", "PoC URL", None, True, "https://github.com/example"),
            "description": ("Optional[str]", "PoC 설명", None, False, "재현 코드"),
            "created_at": ("datetime", "생성 시간", "lambda: datetime.now(ZoneInfo(\"UTC\"))", True, "2023-01-01T12:00:00Z"),
            "created_by": ("str", "추가한 사용자", None, True, "admin"),
            "last_modified_at": ("datetime", "마지막 수정 시간", "lambda: datetime.now(ZoneInfo(\"UTC\"))", True, "2023-01-01T12:00:00Z"),
            "last_modified_by": ("str", "마지막 수정자", None, True, "admin"),
        },
        "snort_rule": {
            "rule": ("str", "Snort Rule 내용", None, True, "alert tcp any any -> any any (msg:\"Example\";)"),
            "type": ("str", "Rule 타입", None, True, "EXPLOIT"),
            "description": ("Optional[str]", "Rule 설명", None, False, "악성 트래픽 감지"),
            "created_at": ("datetime", "생성 시간", "lambda: datetime.now(ZoneInfo(\"UTC\"))", True, "2023-01-01T12:00:00Z"),
            "created_by": ("str", "추가한 사용자", None, True, "admin"),
            "last_modified_at": ("datetime", "마지막 수정 시간", "lambda: datetime.now(ZoneInfo(\"UTC\"))", True, "2023-01-01T12:00:00Z"),
            "last_modified_by": ("str", "마지막 수정자", None, True, "admin"),
        },
        "comment": {
            "id": ("str", "댓글 ID", "lambda: str(ObjectId())", True, "507f1f77bcf86cd799439011"),
            "content": ("str", "댓글 내용", None, True, "이 취약점의 영향 범위는..."),
            "created_by": ("str", "작성자 이름", None, True, "admin"),
            "parent_id": ("Optional[str]", "부모 댓글 ID", "None", False, "507f1f77bcf86cd799439011"),
            "depth": ("int", "댓글 깊이", "0", False, 0),
            "is_deleted": ("bool", "삭제 여부", "False", False, False),
            "created_at": ("datetime", "생성 시간", "lambda: datetime.now(ZoneInfo(\"UTC\"))", True, "2023-01-01T12:00:00Z"),
            "last_modified_at": ("Optional[datetime]", "마지막 수정 시간", None, False, "2023-01-01T13:00:00Z"),
            "last_modified_by": ("Optional[str]", "마지막 수정자", None, False, "admin"),
            "mentions": ("List[str]", "멘션된 사용자 목록", "[]", False, ["@user1", "@user2"]),
        },
        "change_item": {
            "field": ("str", "변경된 필드명", None, True, "title"),
            "field_name": ("str", "필드의 한글명", None, True, "제목"),
            "action": ("Literal[\"add\", \"edit\", \"delete\"]", "변경 유형", None, True, "edit"),
            "detail_type": ("Literal[\"simple\", \"detailed\"]", "변경 내역 표시 방식", "\"detailed\"", False, "detailed"),
            "before": ("Optional[Any]", "변경 전 값", None, False, "이전 제목"),
            "after": ("Optional[Any]", "변경 후 값", None, False, "새 제목"),
            "items": ("Optional[List[dict]]", "컬렉션 타입 필드의 변경 항목들", None, False, [{"url": "https://example.com"}]),
            "summary": ("str", "변경 요약", None, True, "제목이 변경되었습니다"),
        },
    }