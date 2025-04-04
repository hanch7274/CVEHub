// useCVEQuery.tsx
import { useQuery, useQueryClient, UseQueryOptions, useMutation, UseMutationOptions } from '@tanstack/react-query';
import { useEffect, useCallback, useRef, useMemo, useReducer } from 'react';
import cveService from '../services/cveService';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import { SOCKET_EVENTS, SUBSCRIPTION_EVENTS } from 'core/socket/services/constants';
import _ from 'lodash';
import logger from 'shared/utils/logging';

// cve.ts에 정의된 타입들을 사용
import type { CVEListResponse, CVEDetail } from '../types/cve';
import useSocket from 'core/socket/hooks/useSocket';
import socketService from 'core/socket/services/socketService';
import api from 'shared/api/config/axios';
import { Subscription } from 'rxjs';

/**
 * 구독 관련 이벤트 상수
 */
const LOCAL_SUBSCRIPTION_EVENTS = {
  SUBSCRIPTION_ERROR: SOCKET_EVENTS.SUBSCRIPTION_ERROR,
  UNSUBSCRIPTION_ERROR: SOCKET_EVENTS.UNSUBSCRIPTION_ERROR,
};

/**
 * 재시도 관련 상수
 */
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 10000,
  TIMEOUT: 5000
};

/**
 * 로거 타입 인터페이스
 */
interface LoggerType {
  info: (message: string, data?: any) => void;
  warn: (message: string, data?: any) => void;
  error: (message: string, error?: any) => void;
  debug: (message: string, data?: any) => void;
}

/**
 * 일반 함수용 로거 생성 함수 (non-React 컨텍스트에서 사용)
 * @param prefix - 로그 메시지 프리픽스
 * @returns 로거 객체
 */
const createLogger = (prefix: string): LoggerType => ({
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
 * 타입 정의
 */
type Filters = Record<string, any>;
type QueryOptions<T = any> = Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>;

/**
 * CVE 항목 인터페이스
 */
interface CVEItem {
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
interface CVEStats {
  byStatus?: Record<string, number>;
  bySeverity?: Record<string, number>;
  byMonth?: Record<string, number>;
  total?: number;
  [key: string]: any;
}

/**
 * 타이머 관리 유틸리티 훅
 * @returns 타이머 관리 함수들
 */
function useTimers() {
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
const measurePerformance = <T extends any>(label: string, action: () => T): T => {
  if (process.env.NODE_ENV !== 'development') return action();
  
  const start = performance.now();
  const result = action();
  const end = performance.now();
  logger.debug(`성능[${label}]: ${end - start}ms`);
  return result;
};

/**
 * 구독 상태 액션 타입
 */
type SubscriptionAction = 
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
interface SubscriptionState {
  isSubscribed: boolean;
  subscribers: any[];
  isLoading: boolean;
  error: string | null;
  connectionLost: boolean;
}

/**
 * 구독 상태 리듀서
 * @param state - 현재 상태
 * @param action - 디스패치된 액션
 * @returns 새 상태
 */
function subscriptionReducer(state: SubscriptionState, action: SubscriptionAction): SubscriptionState {
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

/**
 * CVE 구독 업데이트 처리 함수
 * 웹소켓 이벤트로 수신된 CVE 변경사항을 React Query 캐시에 반영
 * 
 * @param queryClient - React Query 클라이언트
 * @param data - 이벤트 데이터
 */
export const handleCVESubscriptionUpdate = (
  queryClient: any,
  data: { type?: string; payload?: any; }
) => {
  const logger = createLogger('handleCVESubscriptionUpdate');
  
  if (!data || !data.type) {
    logger.warn('유효하지 않은 이벤트 데이터', { data });
    return;
  }

  const { type, payload } = data;
  const logData = { type, payloadId: payload?.id };
  
  // 이벤트 추적을 위한 고유 ID 생성
  const eventId = Date.now().toString(36) + Math.random().toString(36).substr(2);

  switch (type) {
    case 'cve:created':
      logger.info(`CVE 생성 이벤트(${eventId}) 수신`, logData);
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchType: 'active'
      });
      logger.debug(`CVE 생성 이벤트(${eventId}) 처리 완료`);
      break;

    case 'cve:updated':
      logger.info(`CVE 업데이트 이벤트(${eventId}) 수신`, logData);
      // 상세 정보 캐시 업데이트
      queryClient.setQueryData(
        QUERY_KEYS.CVE.detail(payload.id), 
        (oldData: any) => oldData ? { ...oldData, ...payload } : payload
      );
      // 목록 갱신
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchType: 'active'
      });
      logger.debug(`CVE 업데이트 이벤트(${eventId}) 처리 완료`);
      break;

    case 'cve:deleted':
      logger.info(`CVE 삭제 이벤트(${eventId}) 수신`, logData);
      // 상세 정보 캐시 제거
      queryClient.removeQueries({ 
        queryKey: QUERY_KEYS.CVE.detail(payload.id) 
      });
      // 목록 갱신
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchType: 'active'
      });
      logger.debug(`CVE 삭제 이벤트(${eventId}) 처리 완료`);
      break;

    default:
      logger.warn(`알 수 없는 이벤트 타입(${eventId})`, { type, payload });
  }
};

/**
 * CVE 목록 조회 훅
 * 필터링 옵션을 적용하여 CVE 목록을 조회
 * 
 * @param filters - 필터 옵션
 * @param options - 쿼리 옵션
 * @param customService - 커스텀 서비스 객체 (테스트용)
 * @returns 쿼리 결과
 */
export const useCVEList = (
  filters: Filters = {},
  options: QueryOptions<CVEListResponse> = {},
  customService = cveService
) => {
  const logger = createLogger('useCVEList');
  const requestIdRef = useRef<string>('');

  return useQuery<CVEListResponse, Error>({
    queryKey: QUERY_KEYS.CVE.list(filters),
    queryFn: async () => {
      try {
        // 요청 ID 생성 (디버깅/추적용)
        requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
        logger.info(`목록 조회 요청(${requestIdRef.current})`, { filters });
        
        const startTime = performance.now();
        const result = await customService.getCVEs(filters);
        const endTime = performance.now();

        // 응답 필드 정규화 (백엔드 응답이 일관되지 않을 경우 대비)
        if (!result.total && result.totalItems) {
          result.total = result.totalItems;
        }
        if (!result.items && result.results) {
          result.items = result.results;
        }

        logger.info(`목록 조회 결과(${requestIdRef.current})`, { 
          totalItems: result.total || result.totalItems || 0,
          itemsCount: result.items?.length || result.results?.length || 0,
          page: filters.page || 1,
          elapsedTime: `${(endTime - startTime).toFixed(2)}ms`
        });

        return result;
      } catch (error: any) {
        // 오류 분류 및 세분화된 로깅
        if (error.response) {
          logger.error(`목록 조회 HTTP 오류(${requestIdRef.current})`, {
            status: error.response.status,
            statusText: error.response.statusText,
            url: error.response.config?.url,
            errorData: error.response.data
          });
        } else if (error.request) {
          logger.error(`목록 조회 네트워크 오류(${requestIdRef.current})`, {
            message: error.message,
            code: error.code
          });
        } else {
          logger.error(`목록 조회 중 예상치 못한 오류(${requestIdRef.current})`, error);
        }
        throw error;
      }
    },
    placeholderData: (oldData) => oldData,
    staleTime: 10000,
    gcTime: 60000,
    refetchOnWindowFocus: true,
    ...options,
  });
};

/**
 * (하위 호환성) CVE 목록 조회 훅
 * 이전 버전 API와의 호환성을 위한 래퍼 함수
 * 
 * @param params - 조회 파라미터
 * @returns 쿼리 결과
 * @deprecated useCVEList를 직접 사용하세요
 */
export const useCVEListQuery = (params: {
  page?: number;
  rowsPerPage?: number;
  filters?: Filters;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
} = {}) => {
  const { 
    page = 0, 
    rowsPerPage = 10, 
    filters = {}, 
    sortBy = 'createdAt', 
    sortOrder = 'desc' 
  } = params;

  const convertedFilters = {
    page,
    rowsPerPage,
    search: filters.search,
    sortBy,
    sortOrder,
    filters
  };

  const logger = createLogger('useCVEListQuery');
  logger.info('호환성 모드로 호출됨 (deprecated)', { params });
  
  return useCVEList(convertedFilters);
};

/**
 * CVE 상세 정보 조회 훅
 * 특정 CVE ID의 상세 정보를 조회
 * 
 * @param cveId - CVE ID
 * @param options - 쿼리 옵션
 * @param customService - 커스텀 서비스 객체 (테스트용)
 * @returns 쿼리 결과
 */
export const useCVEDetail = (
  cveId: string,
  options: QueryOptions<CVEDetail> = {},
  customService = cveService
) => {
  const logger = createLogger('useCVEDetail');
  const requestIdRef = useRef<string>('');

  const defaultOptions: QueryOptions<CVEDetail> = {
    enabled: !!cveId,
    retry: 1,
    retryDelay: 500,
    staleTime: 60000, // 1분으로 증가하여 불필요한 리페치 줄이기
    gcTime: 300000, // 5분으로 유지
    refetchOnWindowFocus: false, // 창 포커스 시 리페치 비활성화
    refetchOnMount: false, // 컴포넌트 마운트 시 자동 리페치 비활성화 (명시적 호출만 허용)
    refetchOnReconnect: false, // 재연결 시 자동 리페치 비활성화
  };

  const mergedOptions = { ...defaultOptions, ...options };

  return useQuery<CVEDetail, Error>({
    queryKey: QUERY_KEYS.CVE.detail(cveId),
    queryFn: async () => {
      try {
        requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
        logger.info(`CVE 상세 조회 요청(${requestIdRef.current})`, { cveId });
        
        const startTime = performance.now();
        const result = await customService.getCVEById(cveId);
        const endTime = performance.now();
        const elapsedTime = endTime - startTime;

        logger.info(`CVE 상세 조회 완료(${requestIdRef.current})`, { 
          cveId, 
          elapsedTime: `${elapsedTime.toFixed(2)}ms`,
          dataSize: JSON.stringify(result).length
        });

        return result;
      } catch (error: any) {
        // 세분화된 오류 처리 및 로깅
        if (error.response) {
          if (error.response.status === 404) {
            logger.warn(`CVE 상세 조회 - 항목 없음(${requestIdRef.current})`, { 
              cveId, 
              status: error.response.status 
            });
          } else {
            logger.error(`CVE 상세 조회 HTTP 오류(${requestIdRef.current})`, {
              cveId,
              status: error.response.status,
              statusText: error.response.statusText,
              url: error.response.config?.url,
              errorData: error.response.data
            });
          }
        } else if (error.request) {
          logger.error(`CVE 상세 조회 네트워크 오류(${requestIdRef.current})`, {
            cveId,
            message: error.message,
            code: error.code
          });
        } else {
          logger.error(`CVE 상세 조회 중 예상치 못한 오류(${requestIdRef.current})`, {
            cveId,
            error
          });
        }
        throw error;
      }
    },
    ...mergedOptions
  });
};

/**
 * CVE 새로고침 훅
 * 특정 CVE의 데이터를 강제로 새로고침 (캐시 무시)
 * 
 * @param cveId - CVE ID
 * @param options - 훅 옵션
 * @param customService - 커스텀 서비스 객체 (테스트용)
 * @returns 새로고침 함수와 상태
 */
export const useCVERefresh = (
  cveId: string,
  options: any = {},
  customService = cveService
) => {
  const queryClient = useQueryClient();
  const logger = createLogger('useCVERefresh');
  const { startTimer, clearAllTimers } = useTimers();
  const requestIdRef = useRef<string>('');
  
  // 재시도 메커니즘을 포함한 새로고침 함수
  const refreshFn = async (retryCount = 0) => {
    try {
      requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
      logger.info(`강제 새로고침 요청(${requestIdRef.current})`, { cveId, retryAttempt: retryCount });
      
      const data = await customService.getCVEByIdNoCache(cveId);
      
      // 성공 시 캐시 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), data);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      
      logger.info(`강제 새로고침 성공(${requestIdRef.current})`, { cveId });
      return data;
    } catch (error: any) {
      // 오류 유형에 따른 세분화된 처리
      if (error.response && error.response.status >= 500 && retryCount < RETRY_CONFIG.MAX_ATTEMPTS) {
        // 서버 오류의 경우 지수 백오프로 재시도
        const delay = Math.min(
          RETRY_CONFIG.INITIAL_DELAY * Math.pow(2, retryCount),
          RETRY_CONFIG.MAX_DELAY
        );
        
        logger.warn(`서버 오류로 재시도 예약(${requestIdRef.current})`, {
          cveId,
          retryAttempt: retryCount + 1,
          delay: `${delay}ms`,
          error: error.message
        });
        
        // 지정된 지연 후 재시도
        return new Promise((resolve, reject) => {
          startTimer(`refresh-retry-${retryCount}`, async () => {
            try {
              const result = await refreshFn(retryCount + 1);
              resolve(result);
            } catch (retryError) {
              reject(retryError);
            }
          }, delay);
        });
      }
      
      // 다른 오류는 자세히 로깅 후 throw
      logger.error(`강제 새로고침 실패(${requestIdRef.current})`, {
        cveId,
        retryAttempt: retryCount,
        errorType: error.response ? 'HTTP 오류' : error.request ? '네트워크 오류' : '예상치 못한 오류',
        status: error.response?.status,
        message: error.message
      });
      
      throw error;
    }
  };

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return clearAllTimers;
  }, [clearAllTimers]);

  return {
    mutate: refreshFn,
    isLoading: false,
    refresh: refreshFn
  };
};

/**
 * CVE 목록 실시간 업데이트 훅
 * 웹소켓을 통해 CVE 목록 변경사항을 실시간으로 수신하고 쿼리 캐시를 업데이트
 * 
 * @returns 연결 상태 객체
 */
export function useCVEListUpdates() {
  const queryClient = useQueryClient();
  const logger = createLogger('useCVEListUpdates');
  const { startTimer, clearTimer, clearAllTimers } = useTimers();
  
  // 컴포넌트 ID - 고정값 사용
  const componentId = 'cve-list-updates';
  
  // 재연결 상태 추적
  const reconnectAttemptsRef = useRef(0);
  
  // 디바운스된 쿼리 무효화 함수 - 성능 최적화
  const invalidateCVEQueries = useCallback(
    _.debounce(() => {
      logger.debug('디바운스된 쿼리 무효화 실행');
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchType: 'active'
      });
    }, 300),
    [queryClient]
  );
  
  // useSocket 훅 사용
  const { connected, emit, on, cleanup } = useSocket(
    undefined, undefined, [], { 
      componentId,
      useRxJS: true
    }
  );
  
  // 이벤트 핸들러 - CVE 생성
  const handleCVECreated = useCallback((newCve) => {
    const eventId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    logger.info(`실시간 CVE 생성 감지(${eventId}):`, { cveId: newCve.cveId });
    
    // 성능 측정 래핑
    measurePerformance('낙관적 업데이트 - 생성', () => {
      // 낙관적 업데이트: 캐시에 직접 새 CVE 추가
      queryClient.setQueryData(QUERY_KEYS.CVE.lists(), (oldData: any) => {
        if (!oldData) return oldData;
        
        // 이미 존재하는지 확인 (중복 방지)
        const exists = oldData.items?.some((cve: any) => cve.cveId === newCve.cveId);
        if (exists) return oldData;
        
        return {
          ...oldData,
          items: [newCve, ...(oldData.items || [])],
          total: ((oldData.total || 0) + 1)
        };
      });
    });
    
    // 백그라운드에서 데이터 갱신 (디바운스 적용)
    invalidateCVEQueries();
    logger.debug(`CVE 생성 이벤트(${eventId}) 처리 완료`);
  }, [queryClient, invalidateCVEQueries]);
  
  // 이벤트 핸들러 - CVE 업데이트
  const handleCVEUpdated = useCallback((updatedCve) => {
    const eventId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    logger.info(`실시간 CVE 업데이트 감지(${eventId}):`, { cveId: updatedCve.cveId });
    
    // 성능 측정 래핑
    measurePerformance('낙관적 업데이트 - 업데이트', () => {
      // 캐시 내 해당 CVE만 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.lists(), (oldData: any) => {
        if (!oldData) return oldData;
        
        const updatedItems = oldData.items?.map((cve: any) => 
          cve.cveId === updatedCve.cveId ? { ...cve, ...updatedCve } : cve
        );
        
        // 변경이 없으면 기존 데이터 반환 (불필요한 리렌더링 방지)
        if (_.isEqual(updatedItems, oldData.items)) {
          return oldData;
        }
        
        return {
          ...oldData,
          items: updatedItems || []
        };
      });
      
      // 해당 CVE의 상세 정보도 업데이트
      if (updatedCve.cveId) {
        queryClient.setQueryData(QUERY_KEYS.CVE.detail(updatedCve.cveId), (oldData: any) => {
          if (!oldData) return updatedCve;
          
          // 변경이 없으면 기존 데이터 반환
          if (_.isEqual(oldData, { ...oldData, ...updatedCve })) {
            return oldData;
          }
          
          return { ...oldData, ...updatedCve };
        });
      }
    });
    
    // 백그라운드에서 데이터 갱신 (디바운스 적용)
    invalidateCVEQueries();
    logger.debug(`CVE 업데이트 이벤트(${eventId}) 처리 완료`);
  }, [queryClient, invalidateCVEQueries]);
  
  // 이벤트 핸들러 - CVE 삭제
  const handleCVEDeleted = useCallback((deletedCveId) => {
    const eventId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    logger.info(`실시간 CVE 삭제 감지(${eventId}):`, { cveId: deletedCveId });
    
    // 성능 측정 래핑
    measurePerformance('낙관적 업데이트 - 삭제', () => {
      // 캐시에서 해당 CVE 제거
      queryClient.setQueryData(QUERY_KEYS.CVE.lists(), (oldData: any) => {
        if (!oldData) return oldData;
        
        const filteredItems = oldData.items?.filter((cve: any) => cve.cveId !== deletedCveId);
        
        // 변경이 없으면 기존 데이터 반환
        if (_.isEqual(filteredItems, oldData.items)) {
          return oldData;
        }
        
        return {
          ...oldData,
          items: filteredItems || [],
          total: Math.max(0, (oldData.total || 0) - 1)
        };
      });
      
      // 해당 CVE의 상세 정보 캐시 무효화
      if (deletedCveId) {
        queryClient.removeQueries({
          queryKey: QUERY_KEYS.CVE.detail(deletedCveId)
        });
      }
    });
    
    // 백그라운드에서 데이터 갱신 (디바운스 적용)
    invalidateCVEQueries();
    logger.debug(`CVE 삭제 이벤트(${eventId}) 처리 완료`);
  }, [queryClient, invalidateCVEQueries]);
  
  // 구독 상태 관리용 ref
  const isSubscribedRef = useRef(false);
  
  // 연결 손실 및 복구 처리 기능
  const handleConnectionChange = useCallback((isConnected: boolean) => {
    if (!isConnected) {
      logger.warn('웹소켓 연결 끊김 감지');
      reconnectAttemptsRef.current = 0;
    } else if (reconnectAttemptsRef.current > 0) {
      logger.info('웹소켓 연결 복구됨');
      // 연결 복구 후 구독 복구 시도
      if (isSubscribedRef.current) {
        logger.info('구독 상태 복구 시도');
        emit(SOCKET_EVENTS.SUBSCRIBE_CVES, {});
      }
    }
  }, [emit]);
  
  // 웹소켓 이벤트 구독 설정
  useEffect(() => {
    if (connected && !isSubscribedRef.current) {
      logger.info('CVE 업데이트 구독 요청 전송', {
        eventName: SOCKET_EVENTS.SUBSCRIBE_CVES,
        connected
      });
      
      // 이벤트 구독 설정
      const unsubCreated = on('CVE_CREATED', handleCVECreated);
      const unsubUpdated = on('CVE_UPDATED', handleCVEUpdated);
      const unsubDeleted = on('CVE_DELETED', handleCVEDeleted);
      
      // 서버에 구독 요청 전송
      emit(SOCKET_EVENTS.SUBSCRIBE_CVES, {});
      
      isSubscribedRef.current = true;
      
      // 컴포넌트 언마운트 시 정리 작업 수행
      return () => {
        // 구독 해제
        unsubCreated();
        unsubUpdated();
        unsubDeleted();
        
        // 서버에 구독 해제 요청 전송
        if (connected) {
          logger.info('CVE 목록 업데이트 구독 해제');
          emit(SOCKET_EVENTS.UNSUBSCRIBE_CVES, {});
        }
        
        // 디바운스된 함수 취소
        invalidateCVEQueries.cancel();
        
        // 타이머 정리
        clearAllTimers();
        
        // 소켓 정리
        cleanup();
        
        // 구독 상태 초기화
        isSubscribedRef.current = false;
      };
    }
    
    // 연결 상태 변경 감지
    handleConnectionChange(connected);
    
    // 연결되지 않은 경우 정리 함수 제공
    return () => {
      invalidateCVEQueries.cancel();
      clearAllTimers();
    };
  }, [connected, on, emit, cleanup, handleCVECreated, handleCVEUpdated, handleCVEDeleted, invalidateCVEQueries, handleConnectionChange, clearAllTimers]);

  // 연결 끊김 후 자동 재연결 시도
  useEffect(() => {
    if (!connected && isSubscribedRef.current) {
      const delay = Math.min(
        RETRY_CONFIG.INITIAL_DELAY * Math.pow(2, reconnectAttemptsRef.current),
        RETRY_CONFIG.MAX_DELAY
      );
      
      logger.warn('연결 끊김. 재연결 시도 예약', {
        재시도횟수: reconnectAttemptsRef.current + 1,
        지연시간: `${delay}ms`
      });
      
      // 지수 백오프로 재연결 시도
      const timerKey = 'reconnect-attempt';
      startTimer(timerKey, () => {
        reconnectAttemptsRef.current++;
        
        if (reconnectAttemptsRef.current > RETRY_CONFIG.MAX_ATTEMPTS) {
          logger.error('최대 재연결 시도 횟수 초과. 목록 업데이트가 중단됨.');
          clearTimer(timerKey);
          return;
        }
        
        // 서버에 구독 요청 재시도
        if (connected) {
          logger.info('재연결 성공. 구독 갱신');
          emit(SOCKET_EVENTS.SUBSCRIBE_CVES, {});
        }
      }, delay);
      
      return () => {
        clearTimer(timerKey);
      };
    }
  }, [connected, startTimer, clearTimer, emit]);

  return { 
    isConnected: connected,
    reconnectAttempts: reconnectAttemptsRef.current
  };
}

/**
 * CVE 구독 관리 훅 (최적화 버전)
 * 특정 CVE에 대한 실시간 구독을 관리합니다.
 * socketService를 통해 구독 상태를 중앙 관리하여 다음의 이점을 제공합니다:
 * - 한 번 구독한 CVE는 여러 컴포넌트에서 일관된 구독 상태 공유
 * - 상태 변경 이벤트 발행을 통한 구독 상태 변경 알림
 * - 로컬 스토리지 저장함으로써 브라우저 새로고침 후에도 상태 유지
 * 
 * @param cveId - 구독할 CVE ID
 * @returns 구독 상태와 관리 함수를 포함한 객체
 */
export const useCVESubscription = (cveId: string) => {
  const logger = createLogger('useCVESubscription');
  const { startTimer, clearTimer, clearAllTimers } = useTimers();
  
  // 구독 요청 추적을 위한 refs
  const subscriptionPendingRef = useRef(false);
  const requestIdRef = useRef('');
  
  // 이벤트 구독 관리를 위한 ref - RxJS 구독 관리 및 메모리 누수 방지
  const subscriptionsRef = useRef<Subscription[]>([]);
  
  // 마지막 요청 시간을 추적하기 위한 ref (중복 요청 방지)
  const lastRequestTimeRef = useRef({
    subscribe: 0,
    unsubscribe: 0
  });
  
  // 재시도 횟수 ref
  const retryCountRef = useRef(0);

  // 초기 구독 상태 확인
  const initialSubscriptionState = useMemo(() => {
    const isSubscribed = socketService.isSubscribedToCVE(cveId);
    logger.debug(`CVE 구독 초기화: ${cveId}, 구독상태: ${isSubscribed}`);
    return isSubscribed;
  }, [cveId]);
  
  // useReducer로 상태 관리 단순화
  const [state, dispatch] = useReducer(subscriptionReducer, {
    isSubscribed: initialSubscriptionState, // socketService에서 초기 구독 상태 확인
    subscribers: [],
    isLoading: false,
    error: null,
    connectionLost: false
  });
  
  // useSocket 훅 사용 - 소켓 연결 중앙화
  const { connected, emit, on, emitDebounced, cleanup } = useSocket(
    undefined, 
    undefined, 
    [], 
    {
      componentId: `cve-subscription-${cveId}`,
      useRxJS: true,
      debounceDelay: 300
    }
  );
  
  // 현재 사용자 정보 가져오기 (메모이제이션 적용)
  const getCurrentUserInfo = useCallback(() => {
    const currentUserId = localStorage.getItem('userId');
    if (!currentUserId) return null;
    
    return {
      id: currentUserId,
      userId: currentUserId,
      username: localStorage.getItem('username') || '사용자',
      displayName: localStorage.getItem('displayName') || localStorage.getItem('username') || '사용자'
    };
  }, []);
  
  // 낙관적 UI 업데이트를 위한 구독자 목록 계산 (메모이제이션 적용)
  const optimisticSubscribers = useMemo(() => {
    return measurePerformance('optimisticSubscribers', () => {
      // 현재 구독자 목록
      const currentSubscribers = [...(state.subscribers || [])];
      const currentUser = getCurrentUserInfo();
      
      if (!currentUser) return currentSubscribers;
      
      // 낙관적 UI 업데이트: 구독 중이라면 현재 사용자를 목록에 추가, 아니라면 제거
      const hasCurrentUser = currentSubscribers.some(sub => 
        sub.id === currentUser.id || sub.userId === currentUser.id
      );
      
      if (state.isSubscribed && !hasCurrentUser) {
        return [...currentSubscribers, currentUser];
      } else if (!state.isSubscribed && hasCurrentUser) {
        return currentSubscribers.filter(sub => 
          (sub.id !== currentUser.id && sub.userId !== currentUser.id)
        );
      }
      
      return currentSubscribers;
    });
  }, [state.subscribers, state.isSubscribed, getCurrentUserInfo]);
  
  // 오류 처리 유틸리티
  const handleSubscriptionError = useCallback((error: any, action: 'subscribe' | 'unsubscribe') => {
    logger.error(`${action === 'subscribe' ? '구독' : '구독 해제'} 오류 처리`, {
      cveId,
      error: error?.message || '알 수 없는 오류'
    });
    
    // 오류 유형 분류
    let errorMessage = '알 수 없는 오류가 발생했습니다.';
    let shouldRetry = false;
    
    if (error?.response) {
      // HTTP 오류
      if (error.response.status === 403) {
        errorMessage = '권한이 없습니다.';
        shouldRetry = false;
      } else if (error.response.status >= 500) {
        errorMessage = '서버 오류가 발생했습니다. 다시 시도합니다.';
        shouldRetry = true;
      } else {
        errorMessage = `서버 오류: ${error.response.status} ${error.response.statusText || ''}`;
        shouldRetry = false;
      }
    } else if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
      errorMessage = '요청 시간 초과. 네트워크 상태를 확인해주세요.';
      shouldRetry = true;
    } else if (!connected) {
      errorMessage = '연결이 끊어졌습니다. 재연결 중...';
      shouldRetry = true;
      dispatch({ type: 'CONNECTION_LOST' });
    }
    
    // 오류 상태 설정
    if (!shouldRetry) {
      dispatch({ type: action === 'subscribe' ? 'SUBSCRIBE_FAILURE' : 'UNSUBSCRIBE_FAILURE', error: errorMessage });
      subscriptionPendingRef.current = false;
      retryCountRef.current = 0;
    } else if (retryCountRef.current < RETRY_CONFIG.MAX_ATTEMPTS) {
      // 지수 백오프 재시도
      retryAttempt(action);
    } else {
      // 최대 시도 횟수 초과
      dispatch({ type: action === 'subscribe' ? 'SUBSCRIBE_FAILURE' : 'UNSUBSCRIBE_FAILURE', error: '최대 재시도 횟수를 초과했습니다.' });
      subscriptionPendingRef.current = false;
      retryCountRef.current = 0;
    }
  }, [cveId, connected]);
  
  // 재시도 유틸리티 - socketService 기반으로 단순화
  const retryAttempt = useCallback((action: 'subscribe' | 'unsubscribe') => {
    retryCountRef.current++;
    
    const delay = Math.min(
      RETRY_CONFIG.INITIAL_DELAY * Math.pow(2, retryCountRef.current - 1),
      RETRY_CONFIG.MAX_DELAY
    );
    
    logger.info(`${action} 재시도 예약 (socketService 활용)`, {
      cveId,
      retryCount: retryCountRef.current,
      delay: `${delay}ms`
    });
    
    startTimer(`${action}-retry`, () => {
      // socketService를 통해 구독 관리
      if (action === 'subscribe') {
        // 낙관적 UI 업데이트
        dispatch({ type: 'SUBSCRIBE_REQUEST' });
        socketService.subscribeCVE(cveId);
      } else {
        // 낙관적 UI 업데이트
        dispatch({ type: 'UNSUBSCRIBE_REQUEST' });
        socketService.unsubscribeCVE(cveId);
      }
    }, delay);
  }, [cveId]);
  
  // 구독자 업데이트 이벤트 핸들러 (메모이제이션 적용) - socketService 연동 최적화
  const handleSubscribersUpdated = useCallback((data: any) => {
    logger.debug('구독자 업데이트 이벤트:', data);
    
    // 데이터 추출
    const eventData = data?.data || data;
    const eventCveId = eventData?.cve_id || eventData?.cveId;
    
    // CVE ID가 일치하지 않으면 무시
    if (!eventData || !eventCveId || eventCveId !== cveId) {
      return;
    }
    
    // 구독자 목록 추출
    const subscribersList = Array.isArray(eventData.subscribers) ? eventData.subscribers : [];
    
    // 현재 사용자가 구독 중인지 확인
    const currentUserId = localStorage.getItem('userId');
    const isCurrentUserSubscribed = subscribersList.some((sub: any) =>
      sub.id === currentUserId || sub.userId === currentUserId
    );
    
    // socketService의 구독 상태 확인
    const serviceSubscriptionStatus = socketService.isSubscribedToCVE(cveId);
    
    // 서버 구독 상태와 socketService 구독 상태가 다른 경우
    if (isCurrentUserSubscribed !== serviceSubscriptionStatus) {
      logger.info(`구독 상태 불일치 발견: ${cveId} (서버 이벤트와 socketService)`, {
        serverStatus: isCurrentUserSubscribed,
        serviceStatus: serviceSubscriptionStatus
      });
      
      // socketService에 상태 동기화
      if (isCurrentUserSubscribed) {
        socketService.subscribeCVE(cveId); // 상태 업데이트만 - 서버 요청은 보내지 않음
      } else {
        socketService.unsubscribeCVE(cveId); // 상태 업데이트만 - 서버 요청은 보내지 않음
      }
    }
    
    // 이전 상태와 비교
    const prevSubscribers = state.subscribers;
    const prevIsSubscribed = state.isSubscribed;
    
    // 변경 사항이 있는 경우에만 업데이트
    const subscribersChanged = JSON.stringify(prevSubscribers) !== JSON.stringify(subscribersList);
    const subscriptionChanged = prevIsSubscribed !== isCurrentUserSubscribed;
    
    if (subscriptionChanged || subscribersChanged) {
      const logLevel = subscriptionChanged ? 'info' : 'debug';
      const message = `구독자 목록 ${subscriptionChanged ? '구독 상태 변경' : '만'} 변경됨: ${cveId}`;
      
      logger[logLevel](message, {
        구독자수: subscribersList.length,
        내구독상태: isCurrentUserSubscribed,
        변경사항: {
          구독상태변경: subscriptionChanged,
          구독자변경: subscribersChanged
        }
      });
      
      dispatch({
        type: 'UPDATE_SUBSCRIBERS',
        subscribers: subscribersList,
        isSubscribed: isCurrentUserSubscribed
      });
    } else {
      logger.debug(`구독자 목록 변경 없음: ${cveId}`);
    }
    
    // 구독 요청 플래그 초기화
    subscriptionPendingRef.current = false;
    retryCountRef.current = 0;
  }, [cveId, state.subscribers, state.isSubscribed]);
  
  // 구독 상태 이벤트 핸들러 - socketService 연동 및 중앙화
  const handleSubscriptionStatus = useCallback((data: any) => {
    logger.debug(`구독 상태 이벤트:`, data);
    
    // 서버 응답 구조에 맞게 데이터 추출
    const eventData = data?.data || data;
    const eventCveId = eventData?.cve_id || eventData?.cveId;
    
    if (!eventData || !eventCveId || eventCveId !== cveId) {
      return;
    }
    
    logger.debug(`구독 상태 응답(${requestIdRef.current}): ${cveId}`, eventData);
    
    // 이벤트 데이터 분석
    const isSuccess = eventData.success === true;
    const status = eventData.status;
    const isSubscribed = status === 'subscribed';
    const errorMessage = eventData.error || null;
    const subscribers = Array.isArray(eventData.subscribers) ? eventData.subscribers : [];
    
    // socketService의 현재 구독 상태 확인
    const currentServiceStatus = socketService.isSubscribedToCVE(cveId);
    
    if (isSuccess) {
      // 성공적인 응답 처리
      if (isSubscribed) {
        // 서버에서 구독 성공 응답을 받은 경우
        
        // socketService의 상태와 서버 응답의 상태가 다른 경우 동기화
        if (!currentServiceStatus) {
          logger.info(`구독 상태 불일치 동기화 (서버: 구독됨, 서비스: 구독안됨): ${cveId}`);
          socketService.subscribeCVE(cveId);
        }
        
        // UI 업데이트
        dispatch({ type: 'SUBSCRIBE_SUCCESS', subscribers });
        logger.info(`구독 성공(${requestIdRef.current}): ${cveId}`);
      } else {
        // 서버에서 구독 해제 성공 응답을 받은 경우
        
        // socketService의 상태와 서버 응답의 상태가 다른 경우 동기화
        if (currentServiceStatus) {
          logger.info(`구독 상태 불일치 동기화 (서버: 구독안됨, 서비스: 구독됨): ${cveId}`);
          socketService.unsubscribeCVE(cveId);
        }
        
        // UI 업데이트
        dispatch({ type: 'UNSUBSCRIBE_SUCCESS', subscribers });
        logger.info(`구독 해제 성공(${requestIdRef.current}): ${cveId}`);
      }
    } else if (errorMessage) {
      // 오류 응답 처리
      logger.warn(`구독 상태 오류(${requestIdRef.current}): ${cveId}`, {
        error: errorMessage
      });
      
      // 오류 발생 시에도 socketService의 상태와 서버 상태를 동기화 시도
      // (오류가 발생했으나 예상했던 상태를 기준으로 리셋)
      if (state.isSubscribed && !currentServiceStatus) {
        // 구독 인 상태를 유지해야 하지만 서비스에서는 구독되지 않음
        socketService.subscribeCVE(cveId);
      } else if (!state.isSubscribed && currentServiceStatus) {
        // 구독 해제 상태를 유지해야 하지만 서비스에서는 구독되어 있음
        socketService.unsubscribeCVE(cveId);
      }
      
      // 오류 상태 UI 업데이트
      if (state.isSubscribed) {
        dispatch({ type: 'SUBSCRIBE_FAILURE', error: errorMessage });
      } else {
        dispatch({ type: 'UNSUBSCRIBE_FAILURE', error: errorMessage });
      }
    }
    
    // 처리 플래그 초기화
    subscriptionPendingRef.current = false;
    retryCountRef.current = 0;
  }, [cveId, state.isSubscribed]);
  
  // 타임아웃 처리 함수
  const handleRequestTimeout = useCallback((action: 'subscribe' | 'unsubscribe') => {
    if (!subscriptionPendingRef.current) return;
    
    logger.warn(`${action === 'subscribe' ? '구독' : '구독 해제'} 요청 타임아웃(${requestIdRef.current}): ${cveId}`);
    
    if (retryCountRef.current < RETRY_CONFIG.MAX_ATTEMPTS) {
      retryAttempt(action);
    } else {
      logger.error(`최대 재시도 횟수 초과: ${cveId}`);
      dispatch({ 
        type: action === 'subscribe' ? 'SUBSCRIBE_FAILURE' : 'UNSUBSCRIBE_FAILURE', 
        error: '응답 시간 초과. 네트워크 상태를 확인해주세요.' 
      });
      subscriptionPendingRef.current = false;
      retryCountRef.current = 0;
    }
  }, [cveId, retryAttempt]);
  
  // 구독 함수 - socketService를 활용한 중앙화된 구독 관리
  const subscribe = useCallback((isRetry = false) => {
    if (!cveId || !connected) {
      logger.warn('구독 실패: CVE ID 누락 또는 연결 안됨', {
        cveId,
        connected,
        isRetry
      });
      
      if (!connected) {
        dispatch({ type: 'CONNECTION_LOST' });
      }
      
      return false;
    }
    
    // 이미 구독 중이거나 처리 중인 경우
    if ((state.isSubscribed && !isRetry) || (subscriptionPendingRef.current && !isRetry)) {
      return true;
    }
    
    // 빠른 중복 요청 방지 (재시도가 아닌 경우)
    if (!isRetry) {
      const now = Date.now();
      if (now - lastRequestTimeRef.current.subscribe < 1000) {
        logger.debug('구독 요청 제한: 너무 빠른 요청', {
          timeSinceLastRequest: now - lastRequestTimeRef.current.subscribe
        });
        return true;
      }
      lastRequestTimeRef.current.subscribe = now;
    }
    
    // 요청 ID 생성 (추적용)
    requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
    subscriptionPendingRef.current = true;
    
    // 타이머 설정 취소 (기존에 실행 중인 타이머가 있을 경우)
    clearTimer('subscribe-timeout');
    
    // 낙관적 UI 업데이트
    dispatch({ type: 'SUBSCRIBE_REQUEST' });
    
    // socketService를 통한 구독 요청
    logger.info(`socketService를 통한 CVE 구독 요청(${requestIdRef.current}): ${cveId}`, {
      isRetry,
      retryCount: isRetry ? retryCountRef.current : 0
    });
    
    // socketService를 사용하여 구독
    socketService.subscribeCVE(cveId);
    
    // 타임아웃 설정 (socketService에서 이벤트 발행하지만 혹시 모를 경우를 대비)
    startTimer('subscribe-timeout', () => {
      handleRequestTimeout('subscribe');
    }, RETRY_CONFIG.TIMEOUT);
    
    return true;
  }, [cveId, connected, state.isSubscribed, emitDebounced, clearTimer, startTimer, handleRequestTimeout]);
  
  // 구독 해제 함수 - socketService를 활용한 중앙화된 구독 관리
  const unsubscribe = useCallback((isRetry = false) => {
    if (!cveId || !connected) {
      logger.warn('구독 해제 실패: CVE ID 누락 또는 연결 안됨', {
        cveId,
        connected,
        isRetry
      });
      
      if (!connected) {
        dispatch({ type: 'CONNECTION_LOST' });
      }
      
      return false;
    }
    
    // 이미 구독 해제되었거나 처리 중인 경우
    if ((!state.isSubscribed && !isRetry) || (subscriptionPendingRef.current && !isRetry)) {
      return true;
    }
    
    // 빠른 중복 요청 방지 (재시도가 아닌 경우)
    if (!isRetry) {
      const now = Date.now();
      if (now - lastRequestTimeRef.current.unsubscribe < 1000) {
        logger.debug('구독 해제 요청 제한: 너무 빠른 요청', {
          timeSinceLastRequest: now - lastRequestTimeRef.current.unsubscribe
        });
        return true;
      }
      lastRequestTimeRef.current.unsubscribe = now;
    }
    
    // 요청 ID 생성 (추적용)
    requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
    subscriptionPendingRef.current = true;
    
    // 타이머 설정 취소 (기존에 실행 중인 타이머가 있을 경우)
    clearTimer('unsubscribe-timeout');
    
    // 낙관적 UI 업데이트
    dispatch({ type: 'UNSUBSCRIBE_REQUEST' });
    
    // socketService를 통한 구독 해제 요청
    logger.info(`socketService를 통한 CVE 구독 해제 요청(${requestIdRef.current}): ${cveId}`, {
      isRetry,
      retryCount: isRetry ? retryCountRef.current : 0
    });
    
    // socketService를 사용하여 구독 해제
    socketService.unsubscribeCVE(cveId);
    
    // 타임아웃 설정 (socketService에서 이벤트 발행하지만 혹시 모를 경우를 대비)
    startTimer('unsubscribe-timeout', () => {
      handleRequestTimeout('unsubscribe');
    }, RETRY_CONFIG.TIMEOUT);
    
    return true;
  }, [cveId, connected, state.isSubscribed, emitDebounced, clearTimer, startTimer, handleRequestTimeout]);
  
  // 연결 상태 변화 관리 - socketService를 활용한 연결 복구 개선
  useEffect(() => {
    if (!connected && !state.connectionLost) {
      logger.warn('연결이 끊어졌습니다.');
      dispatch({ type: 'CONNECTION_LOST' });
    } else if (connected && state.connectionLost) {
      logger.info('연결이 복구되었습니다.');
      dispatch({ type: 'CONNECTION_RESTORED' });
      
      // socketService의 구독 상태와 현재 상태 비교
      const serviceSubscriptionStatus = socketService.isSubscribedToCVE(cveId);
      
      if (serviceSubscriptionStatus !== state.isSubscribed) {
        logger.info(`연결 복구 후 구독 상태 불일치 발견: ${cveId}`, {
          serviceStatus: serviceSubscriptionStatus, 
          localStatus: state.isSubscribed
        });
        
        // socketService 상태를 우선하여 로컬 상태를 그에 맞춤
        if (serviceSubscriptionStatus) {
          // 서비스에서는 구독 중이지만 로컬에서는 구독 안됨 -> 구독 상태로 업데이트
          logger.info(`연결 복구 후 구독 상태 UI 업데이트: ${cveId}`);
          dispatch({ type: 'SUBSCRIBE_SUCCESS', subscribers: state.subscribers }); // 구독자 목록은 유지
        } else {
          // 서비스에서는 구독 안되었지만 로컬에서는 구독 중 -> 구독 해제 상태로 업데이트
          logger.info(`연결 복구 후 구독 해제 상태 UI 업데이트: ${cveId}`);
          dispatch({ type: 'UNSUBSCRIBE_SUCCESS', subscribers: state.subscribers }); // 구독자 목록은 유지
        }
      } else if (state.isSubscribed) {
        // 양쪽 모두 구독 중인 상태 -> 구독자 목록 새로 가져오기
        logger.info(`연결 복구 후 구독 정보 업데이트 요청: ${cveId}`);
        // 구독자 목록 업데이트를 위한 요청
        emit(SOCKET_EVENTS.GET_CVE_SUBSCRIBERS, { cve_id: cveId });
      }
    }
  }, [connected, state.connectionLost, state.isSubscribed, state.subscribers, cveId, emit]);
  
  // 이벤트 리스너 설정 및 정리 (소켓 요청 단일화 및 이벤트 핸들러 관리)
  useEffect(() => {
    // 이벤트 구독 핸들러 등록 - 이벤트 핸들러 관리
    logger.debug(`이벤트 핸들러 등록: ${cveId}`);
    
    // Socket.IO 이벤트 구독
    const unsubSubscribersUpdated = on(SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED, handleSubscribersUpdated);
    const unsubStatus = on(SOCKET_EVENTS.SUBSCRIPTION_STATUS, handleSubscriptionStatus);
    
    // socketService 구독 상태 변경 관찰
    const subscriptionChangedSubscription = socketService.getSubscriptionChanges()
      .subscribe(() => {
        // 이 CVE의 구독 상태 확인
        const isSubscribed = socketService.isSubscribedToCVE(cveId);
        
        // 현재 상태와 다른 경우에만 업데이트
        if (isSubscribed !== state.isSubscribed) {
          logger.info(`socketService 구독 상태 변경 발견: ${cveId}`, {
            isSubscribed,
            previousState: state.isSubscribed
          });
          
          // 상태 업데이트
          dispatch({
            type: isSubscribed ? 'SUBSCRIBE_SUCCESS' : 'UNSUBSCRIBE_SUCCESS',
            subscribers: state.subscribers // 구독자 목록은 변경되지 않았으므로 현재 상태 유지
          });
        }
      });
    
    // 구독한 이벤트들 ref에 저장
    subscriptionsRef.current = [
      subscriptionChangedSubscription
    ];
    
    logger.debug(`이벤트 핸들러 등록됨: ${cveId}`, {
      이벤트: [
        SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED, 
        SOCKET_EVENTS.SUBSCRIPTION_STATUS,
        SUBSCRIPTION_EVENTS.SUBSCRIPTIONS_CHANGED
      ],
      connected
    });
    
    // 컴포넌트 언마운트 또는 의존성 변경 시 정리
    return () => {
      logger.debug(`컴포넌트 언마운트 시작: ${cveId}`);
      
      // 타이머 정리
      clearAllTimers();
      
      // 이벤트 구독 해제
      unsubSubscribersUpdated();
      unsubStatus();
      
      // socketService의 이벤트 구독 해제
      subscriptionsRef.current.forEach(subscription => {
        if (subscription && typeof subscription.unsubscribe === 'function') {
          subscription.unsubscribe();
        }
      });
      
      logger.debug(`이벤트 핸들러 해제 완료: ${cveId}`);
      
      // 구독 해제 처리
      const serviceSubscriptionStatus = socketService.isSubscribedToCVE(cveId);
      if (serviceSubscriptionStatus) {
        // socketService에서 여전히 구독 상태인 경우에만 구독 해제 수행
        if (!subscriptionPendingRef.current) {
          logger.info(`컴포넌트 언마운트: CVE 구독 자동 해제 ${cveId}`);
          
          try {
            // socketService를 통한 구독 해제
            socketService.unsubscribeCVE(cveId);
            
            // 연결되어 있고 연결이 유지되면 서버에도 해제 요청 전송
            if (connected) {
              emit(SOCKET_EVENTS.UNSUBSCRIBE_CVE, { cve_id: cveId });
            }
          } catch (error) {
            logger.error(`컴포넌트 언마운트 시 구독 해제 오류: ${cveId}`, error);
          }
        }
      } else {
        logger.debug(`컴포넌트 언마운트: 이미 구독 해제된 상태이므로 추가 작업 없음 ${cveId}`);
      }
      
      // 소켓 리소스 정리
      cleanup();
      logger.debug(`컴포넌트 언마운트 완료: ${cveId}`);
    };
  }, [cveId, on, emit, cleanup, connected, state.isSubscribed, handleSubscribersUpdated, handleSubscriptionStatus, clearAllTimers]);
  
  // 출력을 위한 추가 메모이제이션
  const socketSubscriptionStatus = useMemo(() => {
    // socketService의 상태와 로컬 상태 간 불일치 검사
    const serviceStatus = socketService.isSubscribedToCVE(cveId);
    if (serviceStatus !== state.isSubscribed) {
      logger.debug(`구독 상태 불일치 검출: ${cveId}`, {
        stateIsSubscribed: state.isSubscribed,
        socketServiceIsSubscribed: serviceStatus
      });
    }
    // 검사 후 socketService의 상태 반환 (중앙 저장소 우선)
    return serviceStatus;
  }, [cveId, state.isSubscribed]);
  
  // 반환값
  return {
    subscribe: () => subscribe(false),
    unsubscribe: () => unsubscribe(false),
    isSubscribed: socketSubscriptionStatus, // socketService 상태 우선 사용
    subscribers: optimisticSubscribers, // 메모이제이션된 구독자 목록
    isLoading: state.isLoading,
    error: state.error,
    connectionLost: state.connectionLost,
    // 디버깅을 위한 추가 정보
    debug: {
      localState: state.isSubscribed,
      serviceState: socketSubscriptionStatus
    }
  };
};

/**
 * CVE 통계 정보 조회 훅
 * 시스템의 CVE 통계 정보를 조회
 * 
 * @param options - 쿼리 옵션
 * @returns 쿼리 결과
 */
export const useCVEStats = (options: QueryOptions<CVEStats> = {}) => {
  const logger = createLogger('useCVEStats');
  const requestIdRef = useRef('');
  
  return useQuery<CVEStats, Error>({
    queryKey: QUERY_KEYS.CVE.stats(),
    queryFn: async () => {
      try {
        requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
        logger.info(`CVE 통계 조회 요청(${requestIdRef.current})`);
        
        const startTime = performance.now();
        const response = await api.get('/cves/stats');
        const endTime = performance.now();
        
        const result = response.data;
        logger.info(`CVE 통계 조회 결과(${requestIdRef.current})`, { 
          stats: result,
          elapsedTime: `${(endTime - startTime).toFixed(2)}ms`
        });
        
        return result;
      } catch (error: any) {
        // 세분화된 오류 로깅
        if (error.response) {
          logger.error(`CVE 통계 조회 HTTP 오류(${requestIdRef.current})`, {
            status: error.response.status,
            statusText: error.response.statusText,
            url: error.response.config?.url,
            errorData: error.response.data
          });
        } else if (error.request) {
          logger.error(`CVE 통계 조회 네트워크 오류(${requestIdRef.current})`, {
            message: error.message,
            code: error.code
          });
        } else {
          logger.error(`CVE 통계 조회 중 예상치 못한 오류(${requestIdRef.current})`, error);
        }
        throw error;
      }
    },
    // 기본 옵션
    staleTime: 300000, // 5분
    gcTime: 600000, // 10분
    ...options
  });
};

/**
 * 전체 CVE 수 조회 훅
 * 시스템에 등록된 총 CVE 수를 조회
 * 
 * @param options - 쿼리 옵션
 * @returns 쿼리 결과
 */
export const useTotalCVECount = (options: QueryOptions<number> = {}) => {
  const logger = createLogger('useTotalCVECount');
  const requestIdRef = useRef('');
  const { startTimer, clearAllTimers } = useTimers();
  
  // 재시도 카운터
  const retryCountRef = useRef(0);
  
  // 재시도 함수
  const retryWithBackoff = useCallback(async (queryFn: () => Promise<number>) => {
    retryCountRef.current++;
    
    if (retryCountRef.current > RETRY_CONFIG.MAX_ATTEMPTS) {
      logger.error(`최대 재시도 횟수 초과(${requestIdRef.current})`);
      throw new Error(`최대 재시도 횟수(${RETRY_CONFIG.MAX_ATTEMPTS}회)를 초과했습니다.`);
    }
    
    const delay = Math.min(
      RETRY_CONFIG.INITIAL_DELAY * Math.pow(2, retryCountRef.current - 1),
      RETRY_CONFIG.MAX_DELAY
    );
    
    logger.info(`재시도 예약(${requestIdRef.current})`, {
      retryCount: retryCountRef.current,
      delay: `${delay}ms`
    });
    
    return new Promise<number>((resolve, reject) => {
      startTimer(`retry-total-count-${retryCountRef.current}`, async () => {
        try {
          const result = await queryFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  }, [startTimer]);
  
  const query = useQuery<number, Error>({
    queryKey: QUERY_KEYS.CVE.totalCount(),
    queryFn: async () => {
      try {
        requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
        logger.info(`전체 CVE 수 조회 요청(${requestIdRef.current})`);
        
        const startTime = performance.now();
        const result = await cveService.getTotalCVECount();
        const endTime = performance.now();
        
        retryCountRef.current = 0; // 성공 시 재시도 카운터 리셋
        
        logger.info(`전체 CVE 수 조회 결과(${requestIdRef.current})`, { 
          count: result,
          elapsedTime: `${(endTime - startTime).toFixed(2)}ms`
        });
        
        return result;
      } catch (error: any) {
        // 서버 오류인 경우 재시도
        if (error.response && error.response.status >= 500) {
          logger.warn(`서버 오류로 인한 재시도(${requestIdRef.current})`, {
            status: error.response.status,
            retry: retryCountRef.current + 1
          });
          return retryWithBackoff(() => cveService.getTotalCVECount());
        }
        
        // 네트워크 오류인 경우 재시도
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout') || !error.response) {
          logger.warn(`네트워크 오류로 인한 재시도(${requestIdRef.current})`, {
            message: error.message,
            retry: retryCountRef.current + 1
          });
          return retryWithBackoff(() => cveService.getTotalCVECount());
        }
        
        // 세분화된 오류 로깅
        if (error.response) {
          logger.error(`전체 CVE 수 조회 HTTP 오류(${requestIdRef.current})`, {
            status: error.response.status,
            statusText: error.response.statusText,
            url: error.response.config?.url,
            errorData: error.response.data
          });
        } else {
          logger.error(`전체 CVE 수 조회 중 예상치 못한 오류(${requestIdRef.current})`, error);
        }
        
        throw error;
      }
    },
    // 기본 옵션
    staleTime: 300000, // 5분
    gcTime: 600000, // 10분
    ...options
  });
  
  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return clearAllTimers;
  }, [clearAllTimers]);
  
  return query;
};

/**
 * CVE 업데이트 훅
 * 특정 CVE 정보를 업데이트하기 위한 뮤테이션 훅
 * 
 * @param cveId - CVE ID
 * @param options - 뮤테이션 옵션
 * @returns 뮤테이션 결과
 */
export const useUpdateCVE = (
  cveId: string,
  options: UseMutationOptions<any, Error, Partial<CVEDetail>> = {}
) => {
  const queryClient = useQueryClient();
  const logger = createLogger('useUpdateCVE');
  const requestIdRef = useRef('');
  const { startTimer, clearAllTimers } = useTimers();
  
  // 재시도 카운터
  const retryCountRef = useRef(0);
  
  // 재시도 함수
  const retryWithBackoff = useCallback(async (updateData: Partial<CVEDetail>) => {
    retryCountRef.current++;
    
    if (retryCountRef.current > RETRY_CONFIG.MAX_ATTEMPTS) {
      logger.error(`최대 재시도 횟수 초과(${requestIdRef.current})`);
      throw new Error(`최대 재시도 횟수(${RETRY_CONFIG.MAX_ATTEMPTS}회)를 초과했습니다.`);
    }
    
    const delay = Math.min(
      RETRY_CONFIG.INITIAL_DELAY * Math.pow(2, retryCountRef.current - 1),
      RETRY_CONFIG.MAX_DELAY
    );
    
    logger.info(`업데이트 재시도 예약(${requestIdRef.current})`, {
      cveId,
      retryCount: retryCountRef.current,
      delay: `${delay}ms`
    });
    
    return new Promise((resolve, reject) => {
      startTimer(`retry-update-${retryCountRef.current}`, async () => {
        try {
          const result = await cveService.updateCVE(cveId, updateData);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  }, [cveId, startTimer]);

  const mutation = useMutation<any, Error, Partial<CVEDetail>>({
    mutationFn: async (updateData: Partial<CVEDetail>) => {
      try {
        requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
        logger.info(`CVE 업데이트 요청(${requestIdRef.current}): ${cveId}`, { 
          updateFields: Object.keys(updateData),
          updateData
        });
        
        const startTime = performance.now();
        const result = await cveService.updateCVE(cveId, updateData);
        const endTime = performance.now();
        
        retryCountRef.current = 0; // 성공 시 재시도 카운터 리셋
        
        logger.info(`CVE 업데이트 성공(${requestIdRef.current}): ${cveId}`, {
          elapsedTime: `${(endTime - startTime).toFixed(2)}ms`
        });
        
        return result;
      } catch (error: any) {
        // 서버 오류인 경우 재시도
        if (error.response && error.response.status >= 500) {
          logger.warn(`서버 오류로 인한 재시도(${requestIdRef.current})`, {
            cveId,
            status: error.response.status,
            retry: retryCountRef.current + 1
          });
          return retryWithBackoff(updateData);
        }
        
        // 네트워크 오류인 경우 재시도
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout') || !error.response) {
          logger.warn(`네트워크 오류로 인한 재시도(${requestIdRef.current})`, {
            cveId,
            message: error.message,
            retry: retryCountRef.current + 1
          });
          return retryWithBackoff(updateData);
        }
        
        // 세분화된 오류 로깅
        if (error.response) {
          logger.error(`CVE 업데이트 HTTP 오류(${requestIdRef.current}): ${cveId}`, {
            status: error.response.status,
            statusText: error.response.statusText,
            url: error.response.config?.url,
            errorData: error.response.data
          });
        } else {
          logger.error(`CVE 업데이트 실패(${requestIdRef.current}): ${cveId}`, error);
        }
        
        throw error;
      }
    },
    onSuccess: (data, variables, context) => {
      logger.info(`CVE 업데이트 후 캐시 업데이트(${requestIdRef.current}): ${cveId}`);
      
      // 캐시 업데이트 성능 측정
      measurePerformance('캐시 업데이트', () => {
        // 기존 데이터 가져오기
        const previousData = queryClient.getQueryData<CVEDetail>(QUERY_KEYS.CVE.detail(cveId));
        
        if (previousData) {
          // 업데이트된 데이터로 캐시 업데이트
          queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), {
            ...previousData,
            ...variables,
            lastModifiedAt: new Date().toISOString()
          });
        }
        
        // 목록 쿼리 무효화
        queryClient.invalidateQueries({ 
          queryKey: QUERY_KEYS.CVE.lists(),
          refetchType: 'active'
        });
      });
      
      if (options.onSuccess) {
        options.onSuccess(data, variables, context);
      }
    },
    onError: (error, variables, context) => {
      logger.error(`CVE 업데이트 에러 처리(${requestIdRef.current}): ${cveId}`, error);
      
      if (options.onError) {
        options.onError(error, variables, context);
      }
    },
    ...options
  });
  
  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return clearAllTimers;
  }, [clearAllTimers]);
  
  return mutation;
};

// 모든 훅을 객체로 묶어서 내보내기
export default {
  useCVEList,
  useCVEListQuery,
  useCVEDetail,
  useCVERefresh,
  useCVESubscription,
  useCVEListUpdates,
  useTotalCVECount,
  useCVEStats,
  useUpdateCVE,
  handleCVESubscriptionUpdate
};