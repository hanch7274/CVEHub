// utils/cveQueryUtils.ts
import { useCallback, useEffect, useRef } from 'react';
import _ from 'lodash';
import logger from 'shared/utils/logging';
import { LoggerType } from './types';
import { SubscriptionState, SubscriptionAction } from './types';

/**
 * 일반 함수용 로거 생성 함수 (non-React 컨텍스트에서 사용)
 * @param prefix - 로그 메시지 프리픽스
 * @returns 로거 객체
 */
export const createLogger = (prefix: string): LoggerType => ({
  info: (message, data) => {
    if (data !== undefined) {
      logger.info(prefix, message, data);
    } else {
      logger.info(prefix, message);
    }
  },
  warn: (message, data) => {
    if (data !== undefined) {
      logger.warn(prefix, message, data);
    } else {
      logger.warn(prefix, message);
    }
  },
  error: (message, error) => {
    if (error !== undefined) {
      logger.error(prefix, message, error);
    } else {
      logger.error(prefix, message);
    }
  },
  debug: (message, data) => {
    if (data !== undefined) {
      logger.debug(prefix, message, data);
    } else {
      logger.debug(prefix, message);
    }
  }
});

/**
 * 타이머 관리 유틸리티 훅
 * @returns 타이머 관리 함수들
 */
export function useTimers() {
  const timersRef = useRef<{ [key: string]: number }>({});

  const startTimer = useCallback((key: string, callback: () => void, delay: number) => {
    // 기존 타이머가 있으면 정리
    if (timersRef.current[key]) {
      clearTimeout(timersRef.current[key]);
    }
    // 새 타이머 설정
    timersRef.current[key] = window.setTimeout(callback, delay);
    return () => clearTimer(key);
  }, []);

  const clearTimer = useCallback((key: string) => {
    if (timersRef.current[key]) {
      clearTimeout(timersRef.current[key]);
      delete timersRef.current[key];
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    Object.keys(timersRef.current).forEach(key => {
      clearTimeout(timersRef.current[key]);
    });
    timersRef.current = {};
  }, []);

  useEffect(() => {
    // 컴포넌트 언마운트 시 모든 타이머 정리
    return clearAllTimers;
  }, [clearAllTimers]);

  return { startTimer, clearTimer, clearAllTimers };
}

/**
 * 성능 측정 유틸리티
 * @param label - 측정 라벨
 * @param action - 측정할 함수
 * @returns 함수 실행 결과
 */
export const measurePerformance = <T extends any>(label: string, action: () => T): T => {
  if (process.env.NODE_ENV !== 'development') return action();
  
  const start = performance.now();
  const result = action();
  const end = performance.now();
  logger.debug(`성능[${label}]: ${end - start}ms`);
  return result;
};

/**
 * 구독 상태 리듀서
 * @param state - 현재 상태
 * @param action - 디스패치된 액션
 * @returns 새 상태
 */


export function subscriptionReducer(state: SubscriptionState, action: SubscriptionAction): SubscriptionState {
  switch (action.type) {
    case 'SUBSCRIBE_REQUEST':
      return { 
        ...state, 
        isLoading: true, 
        error: null, 
        isSubscribed: true // 낙관적 업데이트
      };
    
    case 'SUBSCRIBE_SUCCESS':
      return { 
        ...state, 
        isLoading: false, 
        subscribers: action.subscribers, 
        isSubscribed: true 
      };
    
    case 'SUBSCRIBE_FAILURE':
      return { 
        ...state, 
        isLoading: false, 
        error: action.error,
        isSubscribed: false // 실패 시 구독 취소
      };
    
    case 'UNSUBSCRIBE_REQUEST':
      return { 
        ...state, 
        isLoading: true, 
        error: null, 
        isSubscribed: false // 낙관적 업데이트
      };
    
    case 'UNSUBSCRIBE_SUCCESS':
      return { 
        ...state, 
        isLoading: false, 
        subscribers: action.subscribers, 
        isSubscribed: false 
      };
    
    case 'UNSUBSCRIBE_FAILURE':
      return { 
        ...state, 
        isLoading: false, 
        error: action.error,
        // 구독 상태는 변경하지 않음 (실패했기 때문)
      };
    
    case 'UPDATE_SUBSCRIBERS':
      return { 
        ...state, 
        subscribers: action.subscribers, 
        isSubscribed: action.isSubscribed,
        isLoading: false,
        error: null
      };
    
    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };
    
    case 'SET_ERROR':
      return { ...state, error: action.error };
    
    case 'CONNECTION_LOST':
      return { 
        ...state, 
        connectionLost: true, 
        error: '연결이 끊어졌습니다. 재연결 중...',
        isLoading: true
      };
    
    case 'CONNECTION_RESTORED':
      return { 
        ...state, 
        connectionLost: false, 
        error: null
      };
    
    default:
      return state;
  }
}