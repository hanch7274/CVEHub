/**
 * 자동 생성된 Comment 인터페이스 파일 - 직접 수정하지 마세요
 * 생성 시간: 2025-04-11 18:30:00
 */

// 베이스 모델 정의
export interface BaseGeneratedModel {
  [key: string]: unknown;
}

/**
 * Comment 인터페이스
 * @description 댓글 정보
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
  depth: number;
  /** 삭제 여부 */
  isDeleted: boolean;
  /** 생성 시간 */
  createdAt: string | Date;
  /** 마지막 수정 시간 */
  lastModifiedAt?: string | Date;
  /** 마지막 수정자 */
  lastModifiedBy?: string;
  /** 멘션된 사용자 목록 */
  mentions: string[];
}
