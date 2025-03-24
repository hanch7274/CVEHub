/**
 * 타입 정의 파일 인덱스
 */

// 모든 타입 정의 파일을 여기서 내보냅니다.
export * from './api';
export * from './auth';
export * from './components';
export * from './cve';
export * from './notification';
export * from './socket';

// React 관련 타입 정의
import { ReactNode, MouseEvent, ChangeEvent, FormEvent } from 'react';

export interface ReactUtilTypes {
  ReactNode: ReactNode;
  MouseEvent: MouseEvent;
  ChangeEvent: ChangeEvent;
  FormEvent: FormEvent;
}

// 공통적으로 사용되는 기본 타입 정의
export type ID = string;
export type Timestamp = string | Date | number;
export type Optional<T> = T | null | undefined;
export type Nullable<T> = T | null;

// 테마 관련 타입 정의
export interface Theme {
  palette: {
    primary: { main: string; light?: string; dark?: string };
    secondary: { main: string; light?: string; dark?: string };
    error: { main: string };
    warning: { main: string };
    info: { main: string };
    success: { main: string };
    background: { default: string; paper: string };
    text: { primary: string; secondary: string; disabled: string };
  };
  typography: {
    fontFamily: string;
    fontSize: number;
    fontWeightLight: number;
    fontWeightRegular: number;
    fontWeightMedium: number;
    fontWeightBold: number;
  };
  shape: {
    borderRadius: number;
  };
  spacing: (factor: number) => number | string;
  breakpoints: {
    values: {
      xs: number;
      sm: number;
      md: number;
      lg: number;
      xl: number;
    };
  };
}

// 환경 설정 관련 타입 정의
export interface AppConfig {
  API_URL: string;
  SOCKET_URL: string;
  TOKEN_REFRESH_THRESHOLD: number;
  CASE_CONVERSION_CONFIG: {
    ENABLED: boolean;
    EXCLUDED_FIELDS: string[];
  };
}