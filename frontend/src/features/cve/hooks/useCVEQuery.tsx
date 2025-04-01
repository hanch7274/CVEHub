// useCVEQuery.tsx
import { useQuery, useQueryClient, UseQueryOptions, useMutation, UseMutationOptions } from '@tanstack/react-query';
import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import cveService from '../services/cveService';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import { SOCKET_EVENTS } from 'core/socket/services/constants';
import _ from 'lodash';
import logger from 'shared/utils/logging';

// cve.ts에 정의된 타입들을 사용
import type { CVEListResponse, CVEDetail } from '../types/cve';
import useSocket from 'core/socket/hooks/useSocket';
import api from 'shared/api/config/axios';

// 구독 관련 이벤트 상수
const SUBSCRIPTION_EVENTS = {
  SUBSCRIPTION_ERROR: SOCKET_EVENTS.SUBSCRIPTION_ERROR,
  UNSUBSCRIPTION_ERROR: SOCKET_EVENTS.UNSUBSCRIPTION_ERROR,
};

// 로거 타입 인터페이스
interface LoggerType {
  info: (message: string, data?: any) => void;
  warn: (message: string, data?: any) => void;
  error: (message: string, error?: any) => void;
  debug: (message: string, data?: any) => void;
}

// 일반 함수용 로거 생성 함수 (non-React 컨텍스트에서 사용)
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

// 타입 정의
type Filters = Record<string, any>;
type QueryOptions<T = any> = Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>;

interface CVEItem {
  cveId: string;
  createdAt?: string | Date;
  lastModifiedAt?: string | Date;
  created_at?: string | Date;
  last_modified_at?: string | Date;
  [key: string]: any;
}

// CVE 통계 타입 정의
interface CVEStats {
  byStatus?: Record<string, number>;
  bySeverity?: Record<string, number>;
  byMonth?: Record<string, number>;
  total?: number;
  [key: string]: any;
}

// 구독 상태 타입 정의
interface SubscriptionState {
  isSubscribed: boolean;
  subscribers: any[];
  isLoading: boolean;
  error: string | null;
}

/**
 * CVE 구독 업데이트 처리 함수
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

  switch (type) {
    case 'cve:created':
      logger.info('CVE 생성 이벤트 수신', { cveId: payload.id });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      break;

    case 'cve:updated':
      logger.info('CVE 업데이트 이벤트 수신', { cveId: payload.id });
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(payload.id), payload);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      break;

    case 'cve:deleted':
      logger.info('CVE 삭제 이벤트 수신', { cveId: payload.id });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.CVE.detail(payload.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      break;

    default:
      logger.warn('알 수 없는 이벤트 타입', { type, payload });
  }
};

/**
 * CVE 목록 조회 훅
 * @param filters - 필터 옵션
 * @param options - 쿼리 옵션
 * @param customService - 커스텀 서비스 객체
 * @returns 쿼리 결과
 */
export const useCVEList = (
  filters: Filters = {},
  options: QueryOptions<CVEListResponse> = {},
  customService = cveService
) => {
  const logger = createLogger('useCVEList');

  return useQuery<CVEListResponse, Error>({
    queryKey: QUERY_KEYS.CVE.list(filters),
    queryFn: async () => {
      try {
        logger.info('목록 조회 요청', { filters });
        const result = await customService.getCVEs(filters);

        // 응답 필드 정규화
        if (!result.total && result.totalItems) {
          result.total = result.totalItems;
        }
        if (!result.items && result.results) {
          result.items = result.results;
        }

        logger.info('목록 조회 결과', { 
          totalItems: result.total || result.totalItems || 0,
          itemsCount: result.items?.length || result.results?.length || 0,
          page: filters.page || 1
        });

        return result;
      } catch (error: any) {
        logger.error('목록 조회 중 오류 발생', error);
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
 * @param params - 조회 파라미터
 * @returns 쿼리 결과
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
 * @param cveId - CVE ID
 * @param options - 쿼리 옵션
 * @param customService - 커스텀 서비스 객체
 * @returns 쿼리 결과
 */
export const useCVEDetail = (
  cveId: string,
  options: QueryOptions<CVEDetail> = {},
  customService = cveService
) => {
  const logger = createLogger('useCVEDetail');

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
        logger.info('CVE, 상세 조회 요청', { cveId });
        const startTime = Date.now();
        const result = await customService.getCVEById(cveId);
        const endTime = Date.now();

        logger.info('CVE 상세 조회 완료', { 
          cveId, 
          elapsedTime: `${endTime - startTime}ms`,
          dataSize: JSON.stringify(result).length
        });

        return result;
      } catch (error: any) {
        logger.error('상세 정보 조회 중 오류 발생', error);
        throw error;
      }
    },
    ...mergedOptions
  });
};

/**
 * CVE 새로고침 훅
 * @param cveId - CVE ID
 * @param options - 훅 옵션
 * @param customService - 커스텀 서비스 객체
 * @returns 새로고침 함수와 상태
 */
export const useCVERefresh = (
  cveId: string,
  options: any = {},
  customService = cveService
) => {
  const queryClient = useQueryClient();
  const logger = createLogger('useCVERefresh');

  const refreshFn = async () => {
    try {
      logger.info('강제 새로고침 요청', { cveId });
      const data = await customService.getCVEByIdNoCache(cveId);
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), data);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      return data;
    } catch (error: any) {
      logger.error('강제 새로고침 중 오류 발생', error);
      throw error;
    }
  };

  return {
    mutate: refreshFn,
    isLoading: false,
    refresh: refreshFn
  };
};
/**
 * CVE 목록 실시간 업데이트 훅 (useCVEListUpdates.ts와 통합)
 * 웹소켓을 통해 CVE 목록 변경사항을 실시간으로 수신하고 쿼리 캐시를 업데이트
 * @returns 연결 상태 객체
 */
export function useCVEListUpdates() {
  const queryClient = useQueryClient();
  const logger = createLogger('useCVEListUpdates');
  
  // 컴포넌트 ID - 고정값 사용
  const componentId = 'cve-list-updates';
  
  // 디바운스된 쿼리 무효화 함수 - 성능 최적화
  const invalidateCVEQueries = useCallback(
    _.debounce(() => {
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
    logger.info('실시간 CVE 생성 감지:', newCve);
    
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
    
    // 백그라운드에서 데이터 갱신 (디바운스 적용)
    invalidateCVEQueries();
  }, [queryClient, invalidateCVEQueries]);
  
  // 이벤트 핸들러 - CVE 업데이트
  const handleCVEUpdated = useCallback((updatedCve) => {
    logger.info('실시간 CVE 업데이트 감지:', updatedCve);
    
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
    
    // 백그라운드에서 데이터 갱신 (디바운스 적용)
    invalidateCVEQueries();
  }, [queryClient, invalidateCVEQueries]);
  
  // 이벤트 핸들러 - CVE 삭제
  const handleCVEDeleted = useCallback((deletedCveId) => {
    logger.info('실시간 CVE 삭제 감지:', deletedCveId);
    
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
    
    // 백그라운드에서 데이터 갱신 (디바운스 적용)
    invalidateCVEQueries();
  }, [queryClient, invalidateCVEQueries]);
  
  // 구독 상태 관리용 ref
  const isSubscribedRef = useRef(false);
  
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
          emit(SOCKET_EVENTS.UNSUBSCRIBE_CVES, {});
        }
        
        // 디바운스된 함수 취소
        invalidateCVEQueries.cancel();
        
        // 소켓 정리
        cleanup();
      };
    }
    
    // 연결되지 않은 경우 정리 함수 제공
    return () => {
      invalidateCVEQueries.cancel();
    };
  }, [connected, on, emit, cleanup, handleCVECreated, handleCVEUpdated, handleCVEDeleted, invalidateCVEQueries]);

  return { isConnected: connected };
}

/**
 * CVE 구독 관리 훅 (간소화 버전)
 * @param cveId - CVE ID
 * @returns 구독 상태와 관리 함수
 */
export const useCVESubscription = (cveId: string) => {
  const logger = createLogger('useCVESubscription');
  
  // 단일 상태 객체로 통합 - 관리 용이성 향상
  const [state, setState] = useState<SubscriptionState>({
    isSubscribed: false,
    subscribers: [],
    isLoading: false,
    error: null
  });
  
  // useSocket 훅 사용 - 이전보다 간결한 구조
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
  
  // 현재 사용자 정보 가져오기
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
  
  // 낙관적 UI 업데이트를 위한 구독자 목록 계산
  const optimisticSubscribers = useMemo(() => {
    // 서버에서 받은 구독자 목록을 기본으로 사용
    if (!Array.isArray(state.subscribers)) return [];
    
    const currentUserInfo = getCurrentUserInfo();
    if (!currentUserInfo) return state.subscribers;
    
    // 현재 사용자가 이미 목록에 있는지 확인
    const isUserInList = state.subscribers.some(
      sub => sub.id === currentUserInfo.id || sub.userId === currentUserInfo.id
    );
    
    // 낙관적 UI 업데이트: 구독 상태에 따라 사용자 추가 또는 제거
    if (state.isSubscribed && !isUserInList) {
      // 구독 중이지만 목록에 없으면 추가 (낙관적 업데이트)
      return [...state.subscribers, currentUserInfo];
    } else if (!state.isSubscribed && isUserInList) {
      // 구독 해제했지만 목록에 있으면 제거 (낙관적 업데이트)
      return state.subscribers.filter(
        sub => sub.id !== currentUserInfo.id && sub.userId !== currentUserInfo.id
      );
    }
    
    // 변경 사항 없음
    return state.subscribers;
  }, [state.subscribers, state.isSubscribed, getCurrentUserInfo]);
  
  // 구독 요청 중인지 추적하는 플래그
  const subscriptionPendingRef = useRef<boolean>(false);
  
  // 마지막 요청 시간 추적
  const lastRequestTimeRef = useRef<{subscribe: number, unsubscribe: number}>({
    subscribe: 0,
    unsubscribe: 0
  });
  
  // 구독 함수 - 디바운스 적용하여 중복 요청 방지
  const subscribe = useCallback(() => {
    if (!cveId || !connected) {
      logger.warn('구독 실패: CVE ID 누락 또는 연결 안됨', {
        cveId,
        connected
      });
      setState(prev => ({
        ...prev, 
        error: '연결 상태를 확인해주세요.'
      }));
      return false;
    }
    
    // 이미 구독 중이거나 처리 중인 경우
    if (state.isSubscribed || subscriptionPendingRef.current) {
      return true;
    }
    
    // 빠른 중복 요청 방지
    const now = Date.now();
    if (now - lastRequestTimeRef.current.subscribe < 1000) {
      return true;
    }
    
    lastRequestTimeRef.current.subscribe = now;
    subscriptionPendingRef.current = true;
    
    // 낙관적 UI 업데이트
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      isSubscribed: true // 낙관적 업데이트
    }));
    
    // 구독 요청 전송
    logger.info(`CVE 구독 요청: ${cveId}`);
    emitDebounced(SOCKET_EVENTS.SUBSCRIBE_CVE, { cveId });
    
    // 5초 타임아웃 설정
    setTimeout(() => {
      if (subscriptionPendingRef.current) {
        subscriptionPendingRef.current = false;
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: prev.error || '응답 시간 초과. 네트워크 상태를 확인해주세요.'
        }));
      }
    }, 5000);
    
    return true;
  }, [cveId, connected, state.isSubscribed, emitDebounced]);
  
  // 구독 해제 함수 - 디바운스 적용
  const unsubscribe = useCallback(() => {
    if (!cveId || !connected) {
      logger.warn('구독 해제 실패: CVE ID 누락 또는 연결 안됨', {
        cveId,
        connected
      });
      return false;
    }
    
    // 이미 구독 해제되었거나 처리 중인 경우
    if (!state.isSubscribed || subscriptionPendingRef.current) {
      return true;
    }
    
    // 빠른 중복 요청 방지
    const now = Date.now();
    if (now - lastRequestTimeRef.current.unsubscribe < 1000) {
      return true;
    }
    
    lastRequestTimeRef.current.unsubscribe = now;
    subscriptionPendingRef.current = true;
    
    // 낙관적 UI 업데이트
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      isSubscribed: false // 낙관적 업데이트
    }));
    
    // 구독 해제 요청 전송 - 백엔드 기대 형식(cve_id)으로 수정
    logger.info(`CVE 구독 해제 요청: ${cveId}`);
    emitDebounced(SOCKET_EVENTS.UNSUBSCRIBE_CVE, { cve_id: cveId });
    
    // 5초 타임아웃 설정
    setTimeout(() => {
      if (subscriptionPendingRef.current) {
        subscriptionPendingRef.current = false;
        setState(prev => ({
          ...prev,
          isLoading: false
        }));
      }
    }, 5000);
    
    return true;
  }, [cveId, connected, state.isSubscribed, emitDebounced]);
  
  // 이벤트 리스너 등록
  useEffect(() => {
    if (!cveId) return;
    
    // 구독자 업데이트 이벤트 핸들러
    const handleSubscribersUpdated = (data: any) => {
      logger.debug(`구독자 업데이트 이벤트:`, data);
      
      // 서버 응답 구조에 맞게 데이터 추출
      const eventData = data?.data || data;
      const eventCveId = eventData?.cve_id || eventData?.cveId;
      
      if (!eventData || !eventCveId || eventCveId !== cveId) {
        return;
      }
      
      logger.info(`구독자 목록 업데이트: ${cveId}`);
      
      // 구독자 목록 업데이트
      const subscribersList = eventData.subscribers || [];
      
      // 현재 사용자가 구독 중인지 확인
      const currentUserId = localStorage.getItem('userId');
      const isCurrentUserSubscribed = subscribersList.some((sub: any) =>
        sub.id === currentUserId || sub.userId === currentUserId
      );
      
      setState({
        isSubscribed: isCurrentUserSubscribed,
        subscribers: subscribersList,
        isLoading: false,
        error: null
      });
      
      // 구독 요청 플래그 초기화
      subscriptionPendingRef.current = false;
    };
    
    // 구독 상태 이벤트 핸들러
    const handleSubscriptionStatus = (data: any) => {
      logger.debug(`구독 상태 이벤트:`, data);
      
      // 서버 응답 구조에 맞게 데이터 추출
      const eventData = data?.data || data;
      const eventCveId = eventData?.cve_id || eventData?.cveId;
      
      if (!eventData || !eventCveId || eventCveId !== cveId) {
        return;
      }
      
      logger.info(`구독 상태 응답: ${cveId}`, eventData);
      
      // 구독 상태 업데이트
      const isSuccess = eventData.success === true;
      const status = eventData.status;
      const isSubscribed = status === 'subscribed';
      const errorMessage = eventData.error || null;
      
      setState(prev => ({
        isSubscribed: isSuccess ? isSubscribed : prev.isSubscribed,
        subscribers: Array.isArray(eventData.subscribers) ? eventData.subscribers : prev.subscribers,
        isLoading: false,
        error: errorMessage
      }));
      
      // 구독 요청 플래그 초기화
      subscriptionPendingRef.current = false;
    };
    
    // 이벤트 구독
    const unsubSubscribersUpdated = on(SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED, handleSubscribersUpdated);
    const unsubStatus = on(SOCKET_EVENTS.SUBSCRIPTION_STATUS, handleSubscriptionStatus);
    
    return () => {
      // 이벤트 구독 해제
      unsubSubscribersUpdated();
      unsubStatus();
      
      // 연결 상태에서만 구독 해제 요청 전송
      if (connected && state.isSubscribed) {
        // cveId 대신 cve_id 사용하여 백엔드 기대 형식과 일치시킴
        emit(SOCKET_EVENTS.UNSUBSCRIBE_CVE, { cve_id: cveId });
      }
      
      // 소켓 리소스 정리
      cleanup();
    };
  }, [cveId, on, emit, cleanup, connected, state.isSubscribed]);
  
  return {
    subscribe,
    unsubscribe,
    isSubscribed: state.isSubscribed,
    subscribers: optimisticSubscribers, // 낙관적 UI 업데이트된 구독자 목록
    isLoading: state.isLoading,
    error: state.error
  };
};

/**
 * CVE 통계 정보 조회 훅
 * @param options - 쿼리 옵션
 * @returns 쿼리 결과
 */
export const useCVEStats = (options: QueryOptions<CVEStats> = {}) => {
  const logger = createLogger('useCVEStats');
  
  return useQuery<CVEStats, Error>({
    queryKey: QUERY_KEYS.CVE.stats(),
    queryFn: async () => {
      try {
        logger.info('CVE 통계 조회 요청');
        const response = await api.get('/cves/stats');
        const result = response.data;
        logger.info('CVE 통계 조회 결과', { stats: result });
        return result;
      } catch (error: any) {
        logger.error('CVE 통계 조회 중 오류 발생', error);
        throw error;
      }
    },
    ...options
  });
};

/**
 * 전체 CVE 수 조회 훅
 * @param options - 쿼리 옵션
 * @returns 쿼리 결과
 */
export const useTotalCVECount = (options: QueryOptions<number> = {}) => {
  const logger = createLogger('useTotalCVECount');
  
  return useQuery<number, Error>({
    queryKey: QUERY_KEYS.CVE.totalCount(),
    queryFn: async () => {
      try {
        logger.info('전체 CVE 수 조회 요청');
        const result = await cveService.getTotalCVECount();
        logger.info('전체 CVE 수 조회 결과', { count: result });
        return result;
      } catch (error: any) {
        logger.error('전체 CVE 수 조회 중 오류 발생', error);
        throw error;
      }
    },
    ...options
  });
};

/**
 * CVE 업데이트 훅
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

  return useMutation<any, Error, Partial<CVEDetail>>({
    mutationFn: async (updateData: Partial<CVEDetail>) => {
      try {
        logger.info(`CVE 업데이트 요청: ${cveId}`, { updateData });
        const result = await cveService.updateCVE(cveId, updateData);
        logger.info(`CVE 업데이트 성공: ${cveId}`);
        return result;
      } catch (error: any) {
        logger.error(`CVE 업데이트 실패: ${cveId}`, error);
        throw error;
      }
    },
    onSuccess: (data, variables, context) => {
      logger.info(`CVE 업데이트 후 캐시 업데이트: ${cveId}`);
      
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
      
      if (options.onSuccess) {
        options.onSuccess(data, variables, context);
      }
    },
    onError: (error, variables, context) => {
      logger.error(`CVE 업데이트 에러 처리: ${cveId}`, error);
      
      if (options.onError) {
        options.onError(error, variables, context);
      }
    },
    ...options
  });
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