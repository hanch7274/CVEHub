// utils/types.ts
import { UseQueryOptions } from '@tanstack/react-query';

/**
 * 로거 타입 인터페이스
 */
export interface LoggerType {
  info: (message: string, data?: any) => void;
  warn: (message: string, data?: any) => void;
  error: (message: string, error?: any) => void;
  debug: (message: string, data?: any) => void;
}

/**
 * 필터 타입 정의
 */
export type Filters = Record<string, any>;

/**
 * 쿼리 옵션 타입 정의
 */
export type QueryOptions<T = any> = Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>;

/**
 * CVE 항목 인터페이스
 */
export interface CVEItem {
  cveId: string;
  createdAt?: string | Date;
  lastModifiedAt?: string | Date;
  created_at?: string | Date;
  last_modified_at?: string | Date;
  [key: string]: any;
}

/**
 * CVE 통계 타입 정의
 */
export interface CVEStats {
  byStatus?: Record<string, number>;
  bySeverity?: Record<string, number>;
  byMonth?: Record<string, number>;
  total?: number;
  [key: string]: any;
}

/**
 * 구독 상태 액션 타입
 */
export type SubscriptionAction = 
  | { type: 'SUBSCRIBE_REQUEST' }
  | { type: 'SUBSCRIBE_SUCCESS', subscribers: any[] }
  | { type: 'SUBSCRIBE_FAILURE', error: string }
  | { type: 'UNSUBSCRIBE_REQUEST' }
  | { type: 'UNSUBSCRIBE_SUCCESS', subscribers: any[] }
  | { type: 'UNSUBSCRIBE_FAILURE', error: string }
  | { type: 'UPDATE_SUBSCRIBERS', subscribers: any[], isSubscribed: boolean }
  | { type: 'SET_LOADING', isLoading: boolean }
  | { type: 'SET_ERROR', error: string | null }
  | { type: 'CONNECTION_LOST' }
  | { type: 'CONNECTION_RESTORED' };

/**
 * 구독 상태 인터페이스
 */
export interface SubscriptionState {
  isSubscribed: boolean;
  subscribers: any[];
  isLoading: boolean;
  error: string | null;
  connectionLost: boolean;
}

/**
 * 재시도 관련 상수
 */
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 10000,
  TIMEOUT: 5000
};

/**
 * 구독 관련 이벤트 상수
 */
export const LOCAL_SUBSCRIPTION_EVENTS = {
  SUBSCRIPTION_ERROR: 'SUBSCRIPTION_ERROR',
  UNSUBSCRIPTION_ERROR: 'UNSUBSCRIPTION_ERROR',
};