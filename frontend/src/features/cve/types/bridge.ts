// src/features/cve/types/bridge.ts
import {
    GeneratedCVEDetail,
    GeneratedReference,
    GeneratedPoC,
    GeneratedSnortRule,
    GeneratedModificationHistory,
    GeneratedChangeItem
  } from './generated/cve';
  
import { GeneratedComment } from './generated/comment';

// 타입 매핑 - 기존 필드명(snake_case)에서 자동 생성 타입(camelCase)으로의 브릿지
// CVE 생성/업데이트 요청 시 humps 라이브러리에 의해 자동으로 snake_case로 변환됨

/**
 * 기본 확장 인터페이스 정의
 * 기존 코드와의 호환성을 위해 필드 매핑
 */
export interface CVEDetail extends Omit<GeneratedCVEDetail, 'reference' | 'poc' | 'snortRule' | 'modificationHistory' | 'comments'> {
  id?: string;
  reference: Reference[];
  poc: PoC[];
  snortRule: SnortRule[];
  modificationHistory: ModificationHistory[];
  comments?: Comment[];
  createdAt?: string | Date;
  lastModifiedAt?: string | Date;
  [key: string]: unknown;
}

export interface Reference extends GeneratedReference {
  id?: string;
  [key: string]: unknown;
}

export interface PoC extends Omit<GeneratedPoC, 'source'> {
  id?: string;
  code: string; // 'source' 대신 'code' 필드 사용
  language?: string;
  [key: string]: unknown;
}

export interface SnortRule extends GeneratedSnortRule {
  id?: string;
  [key: string]: unknown;
}

export interface Comment extends Omit<GeneratedComment, 'id'> {
  id?: string;
  children?: Comment[];
  [key: string]: unknown;
}

export interface ChangeItem extends GeneratedChangeItem {
  [key: string]: unknown;
}

export interface ModificationHistory extends GeneratedModificationHistory {
  id?: string;
  [key: string]: unknown;
}

// 주의: API 요청 시 프론트엔드의 카멜케이스 필드명은
// axios interceptor에 의해 자동으로 스네이크케이스로 변환됨
// config.js에 설정된 CASE_CONVERSION_CONFIG에 따라 일부 필드는 변환에서 제외될 수 있음