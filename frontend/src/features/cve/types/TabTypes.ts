import React from 'react';
import { SvgIconComponent } from '@mui/icons-material';
import { User } from './CommentTypes';

/**
 * 기본 탭 설정 인터페이스
 */
export interface TabConfig {
  /** 탭 아이콘 */
  icon: SvgIconComponent | React.ElementType;
  
  /** 탭 제목 */
  title: string;
  
  /** 항목 이름 */
  itemName: string;
  
  /** 데이터 필드 이름 */
  dataField: string;
  
  /** 추가 버튼 텍스트 */
  addButtonText: string;
  
  /** 편집 버튼 텍스트 */
  editButtonText: string;
  
  /** 삭제 버튼 텍스트 */
  deleteButtonText: string;
}

/**
 * PoC 소스 정보 인터페이스
 */
export interface PoCSourceInfo {
  /** 표시 라벨 */
  label: string;
  
  /** 색상 스키마 */
  color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
}

/**
 * 규칙 타입 정보 인터페이스
 */
export interface RuleTypeInfo {
  /** 표시 라벨 */
  label: string;
  
  /** 색상 스키마 */
  color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
}

/**
 * 기본 아이템 인터페이스
 */
export interface BaseItem {
  /** 아이템 ID */
  id?: string | number;
  
  /** 설명 */
  description?: string;
  
  /** 생성 일시 */
  created_at?: string | Date;
  
  /** 생성자 (username) */
  created_by?: string;
  
  /** 마지막 수정 일시 */
  last_modified_at?: string | Date;
  
  /** 마지막 수정자 (username) */
  last_modified_by?: string;
  
  /** 현재 사용자 정보 */
  currentUser?: User;
}

/**
 * PoC 아이템 인터페이스
 */
export interface PoCItem extends BaseItem {
  /** 소스 타입 */
  source: string;
  
  /** URL */
  url: string;
}

/**
 * Snort 규칙 아이템 인터페이스
 */
export interface SnortRuleItem extends BaseItem {
  /** 규칙 타입 */
  type: string;
  
  /** 규칙 내용 */
  rule: string;
}

/**
 * 참조 아이템 인터페이스
 */
export interface ReferenceItem extends BaseItem {
  /** 참조 타입 */
  type: string;
  
  /** URL */
  url: string;
}

/**
 * 모든 데이터 아이템 타입
 */
export type DataItem = PoCItem | SnortRuleItem | ReferenceItem;

/**
 * 확장된 탭 설정 인터페이스
 */
export interface ExtendedTabConfig<T extends DataItem> extends TabConfig {
  /** 웹소켓 필드 이름 */
  wsFieldName: string;
  
  /** 기본 아이템 템플릿 */
  defaultItem: T;
  
  /** 빈 상태 제목 */
  emptyTitle: string;
  
  /** 빈 상태 설명 */
  emptyDescription: string;
  
  /** 아이템 유효성 검사 함수 */
  validateItem: (item: T) => boolean | string;
  
  /** 중복 확인 함수 */
  checkDuplicate?: (item: T, items: T[], excludeIndex?: number) => boolean;
  
  /** 아이템 라벨 렌더링 함수 */
  renderItemLabel?: (item: T) => React.ReactNode;
  
  /** 아이템 콘텐츠 렌더링 함수 */
  renderItemContent?: (item: T) => React.ReactNode;
  
  /** 다이얼로그 콘텐츠 렌더링 함수 */
  renderDialogContent?: (
    item: T,
    updateItemState: <K extends keyof T>(item: T, field: K, value: T[K]) => void,
    isEdit: boolean
  ) => React.ReactNode;
  
  /** 저장 전 아이템 처리 함수 */
  prepareItemForSave?: (item: T, isUpdate: boolean, kstTime?: Date) => Partial<T> | Record<string, any>;
  
  /** 상세 정보 필드 */
  detailsField?: string;
  
  /** 카운트 필드 */
  countField?: string;
  
  /** 빈 아이템 생성 함수 */
  getEmptyItem?: () => T;
  
  /** 아이템 제목 가져오기 함수 */
  getItemTitle?: (item: T) => string;
}