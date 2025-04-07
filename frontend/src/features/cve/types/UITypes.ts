import React from 'react';
import { Theme } from '@mui/material';

/**
 * 인라인 텍스트 편집 컴포넌트 Props 인터페이스
 */
export interface InlineEditTextProps {
  /** 표시/편집 값 */
  value: string;
  
  /** 값 저장 콜백 */
  onSave: (value: string) => void;
  
  /** 플레이스홀더 */
  placeholder?: string;
  
  /** 여러 줄 입력 가능 여부 */
  multiline?: boolean;
  
  /** 비활성화 여부 */
  disabled?: boolean;
  
  /** 최대 높이 */
  maxHeight?: string | number;
  
  /** 글꼴 크기 */
  fontSize?: string | number;
  
  /** 외부에서 편집 모드 제어 */
  externalEdit?: boolean;
  
  /** 편집 시작 콜백 */
  onEditingStart?: () => void;
  
  /** 편집 종료 콜백 */
  onEditingEnd?: () => void;
}

/**
 * styled 컴포넌트에 사용되는 Props 타입들
 */
export interface StyledComponentProps {
  theme: Theme;
}

/**
 * 심각도 칩 컴포넌트 Props
 */
export interface SeverityChipProps {
  /** CVSS 점수 (0-10) */
  score?: number;
  
  /** 직접 지정하는 심각도 레벨 */
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'none';
  
  /** 칩 크기 */
  size?: 'small' | 'medium';
  
  /** 점수 표시 여부 */
  showScore?: boolean;
  
  /** 추가 스타일 */
  sx?: React.CSSProperties;
}

/**
 * 탭 패널 컴포넌트 Props
 */
export interface TabPanelProps {
  /** 현재 활성화된 탭 인덱스 */
  currentTab: number;
  
  /** 이 패널의 인덱스 */
  index: number;
  
  /** 패널 내용 */
  children?: React.ReactNode;
  
  /** 추가 Props */
  [key: string]: any;
}