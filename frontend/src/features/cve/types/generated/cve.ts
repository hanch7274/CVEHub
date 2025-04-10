/**
 * 자동 생성된 TypeScript 인터페이스 파일 - 직접 수정하지 마세요
 * 생성 시간: 2025-04-09 02:53:22
 */

// 베이스 모델 정의
interface BaseGeneratedModel {
  [key: string]: unknown;
}

/**
 * Reference 인터페이스
 * @description 참조 정보
 */
export interface GeneratedReference extends BaseGeneratedModel {
  /** 참조 URL */
  url: string;
  /** 참조 타입 */
  type?: string;
  /** 참조 설명 */
  description?: string;
  /** 생성 시간 */
  createdAt: string | Date;
  /** 추가한 사용자 */
  createdBy: string;
  /** 마지막 수정 시간 */
  lastModifiedAt: string | Date;
  /** 마지막 수정자 */
  lastModifiedBy: string;
}
/**
 * PoC 인터페이스
 * @description Proof of Concept 코드
 */
export interface GeneratedPoC extends BaseGeneratedModel {
  /** PoC 소스 */
  source: string;
  /** PoC URL */
  url: string;
  /** PoC 설명 */
  description?: string;
  /** 생성 시간 */
  createdAt: string | Date;
  /** 추가한 사용자 */
  createdBy: string;
  /** 마지막 수정 시간 */
  lastModifiedAt: string | Date;
  /** 마지막 수정자 */
  lastModifiedBy: string;
}
/**
 * SnortRule 인터페이스
 * @description Snort 침입 탐지 규칙
 */
export interface GeneratedSnortRule extends BaseGeneratedModel {
  /** Snort Rule 내용 */
  rule: string;
  /** Rule 타입 */
  type: string;
  /** Rule 설명 */
  description?: string;
  /** 생성 시간 */
  createdAt: string | Date;
  /** 추가한 사용자 */
  createdBy: string;
  /** 마지막 수정 시간 */
  lastModifiedAt: string | Date;
  /** 마지막 수정자 */
  lastModifiedBy: string;
}
/**
 * Comment 인터페이스
 * @description CVE 관련 댓글
 */
export interface GeneratedComment extends BaseGeneratedModel {
  /** 댓글 ID */
  id: string;
  /** 댓글 내용 */
  content: string;
  /** 작성자 이름 */
  createdBy: string;
  /** 부모 댓글 ID */
  parentId?: string;
  /** 댓글 깊이 */
  depth?: number;
  /** 삭제 여부 */
  isDeleted?: boolean;
  /** 생성 시간 */
  createdAt: string | Date;
  /** 마지막 수정 시간 */
  lastModifiedAt?: string | Date;
  /** 마지막 수정자 */
  lastModifiedBy?: string;
  /** 멘션된 사용자 목록 */
  mentions?: Array<string>;
}
/**
 * ChangeItem 인터페이스
 * @description 변경 항목
 */
export interface GeneratedChangeItem extends BaseGeneratedModel {
  /** 변경된 필드명 */
  field: string;
  /** 필드의 한글명 */
  fieldName: string;
  /** 변경 유형 */
  action: "add" | "edit" | "delete";
  /** 변경 내역 표시 방식 */
  detailType?: "simple" | "detailed";
  /** 변경 전 값 */
  before?: any;
  /** 변경 후 값 */
  after?: any;
  /** 컬렉션 타입 필드의 변경 항목들 */
  items?: Array<Record<string, any>>;
  /** 변경 요약 */
  summary: string;
}

/**
 * ModificationHistory 인터페이스 (수동 정의)
 * @description 변경 이력
 * @note 백엔드에서 리팩토링 예정이므로 임시 구현
 */
export interface GeneratedModificationHistory extends BaseGeneratedModel {
  /** 수정 ID */
  id?: string;
  /** 수정한 사용자 */
  username: string;
  /** 수정 시간 */
  timestamp: string | Date;
  /** 변경 내역 목록 */
  changes: GeneratedChangeItem[];
}

/**
 * 생성된 CVE 상세 정보 인터페이스
 */
export interface GeneratedCVEDetail extends BaseGeneratedModel {
  /** CVE ID */
  cveId: string;
  /** CVE 제목 */
  title?: string;
  /** CVE 설명 */
  description?: string;
  /** CVE 상태 */
  status: string;
  /** 담당자 */
  assignedTo?: string;
  /** 심각도 */
  severity?: string;
  /** 추가한 사용자 */
  createdBy: string;
  /** 마지막 수정자 */
  lastModifiedBy: string;
  /** 편집 잠금 여부 */
  isLocked?: boolean;
  /** 잠금 설정한 사용자 */
  lockedBy?: string;
  /** 잠금 설정 시간 */
  lockTimestamp?: string | Date;
  /** 잠금 만료 시간 */
  lockExpiresAt?: string | Date;
  /** 내부 참고사항 */
  notes?: string;
  /** Nuclei 템플릿 해시 */
  nucleiHash?: string;
  
  /** 댓글 목록 */
  comment?: GeneratedComment[];
  
  /** PoC 목록 */
  poc?: GeneratedPoC[];
  
  /** Snort 규칙 목록 */
  snort_rule?: GeneratedSnortRule[];
  
  /** 참조 정보 목록 */
  reference?: GeneratedReference[];
  
  /** 변경 이력 목록 (백엔드 리팩토링 예정) */
  modificationHistory?: GeneratedModificationHistory[];
}