import React from 'react';

/**
 * 멘션 가능한 사용자 타입
 */
export interface MentionUser {
  /** 사용자 ID (일반적으로 username) */
  id: string;
  
  /** 표시 이름 */
  display: string;
  
  /** 사용자명 (id와 동일할 수 있음) */
  username?: string;
  
  /** 프로필 이미지 URL */
  profileImage?: string;
}

/**
 * 멘션 상태 타입 정의
 */
export interface MentionState {
  /** 활성화 여부 */
  active: boolean;
  
  /** 검색 쿼리 */
  query: string;
  
  /** 시작 위치 */
  startPos: number;
}

/**
 * MentionInput 컴포넌트 Props 인터페이스
 */
export interface MentionInputProps {
  /** 입력 값 */
  value: string;
  
  /** 입력 값 변경 핸들러 */
  onChange: (value: string | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  
  /** 제출 핸들러 (Enter 키 등 사용 시) */
  onSubmit?: (value: string) => void;
  
  /** 플레이스홀더 텍스트 */
  placeholder?: string;
  
  /** 로딩 상태 여부 */
  loading?: boolean;
  
  /** 전체 너비 차지 여부 */
  fullWidth?: boolean;
  
  /** 여러 줄 입력 가능 여부 */
  multiline?: boolean;
  
  /** 멀티라인일 경우 기본 행 수 */
  rows?: number;
  
  /** 입력 컴포넌트 variant */
  variant?: 'outlined' | 'filled' | 'standard';
  
  /** 입력 컴포넌트 크기 */
  size?: 'small' | 'medium';
  
  /** 멘션 가능한 사용자 목록 */
  users?: MentionUser[];
  
  /** 입력 요소 ref */
  inputRef?: React.RefObject<HTMLDivElement>;
  
  /** 컴포넌트 키 (리렌더링 제어용) */
  key?: number | string;
}