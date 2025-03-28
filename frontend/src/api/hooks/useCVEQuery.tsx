// useCVEQuery.tsx
import { useQuery, useQueryClient, UseQueryOptions, useMutation, UseMutationOptions } from '@tanstack/react-query';
import { useEffect, useCallback, useState, useRef } from 'react';
import cveService from '../services/cveService';
import logger from '../../utils/logging';
import { QUERY_KEYS } from '../queryKeys';
import { useSocketIO } from '../../contexts/SocketIOContext';
import { SOCKET_EVENTS } from '../../services/socketio/constants';
import api from '../config/axios';

// cve.ts에 정의된 타입들을 사용
import type { CVEListResponse, CVEDetail, CVEFilterOptions } from '../../types/cve';

// 구독 관련 이벤트 상수는 SOCKET_EVENTS에서 가져옴
// 추가적인 구독 관련 이벤트 상수 정의
const SUBSCRIPTION_EVENTS = {
  SUBSCRIPTION_ERROR: SOCKET_EVENTS.SUBSCRIPTION_ERROR,
  UNSUBSCRIPTION_ERROR: SOCKET_EVENTS.UNSUBSCRIPTION_ERROR,
};

interface LoggerType {
  info: (message: string, data?: any) => void;
  warn: (message: string, data?: any) => void;
  error: (message: string, error?: any) => void;
  debug: (message: string, data?: any) => void;
}

// 로깅 유틸리티 함수
const logInfo = (module: string, message: string, data?: any): void => {
  logger.info(module, message, data);
};

const logWarn = (module: string, message: string, data?: any): void => {
  logger.warn(module, message, data);
};

const logDebug = (module: string, message: string, data?: any): void => {
  logger.debug(module, message, data);
};

const logError = (module: string, message: string, error?: any): void => {
  logger.error(module, message, error);
};

// useLogger Hook (React 컴포넌트 내에서만 사용)
const useLogger = (prefix: string): LoggerType => ({
  info: (message, data) => {
    if (data !== undefined) {
      logInfo(prefix, message, data);
    } else {
      logInfo(prefix, message);
    }
  },
  warn: (message, data) => {
    if (data !== undefined) {
      logWarn(prefix, message, data);
    } else {
      logWarn(prefix, message);
    }
  },
  error: (message, error) => {
    if (error !== undefined) {
      logError(prefix, message, error);
    } else {
      logError(prefix, message);
    }
  },
  debug: (message, data) => {
    if (data !== undefined) {
      logDebug(prefix, message, data);
    } else {
      logDebug(prefix, message);
    }
  }
});

// 일반 함수용 로거 생성 함수 (non-React 컨텍스트에서 사용)
const createLogger = (prefix: string): LoggerType => ({
  info: (message, data) => {
    if (data !== undefined) {
      logInfo(prefix, message, data);
    } else {
      logInfo(prefix, message);
    }
  },
  warn: (message, data) => {
    if (data !== undefined) {
      logWarn(prefix, message, data);
    } else {
      logWarn(prefix, message);
    }
  },
  error: (message, error) => {
    if (error !== undefined) {
      logError(prefix, message, error);
    } else {
      logError(prefix, message);
    }
  },
  debug: (message, data) => {
    if (data !== undefined) {
      logDebug(prefix, message, data);
    } else {
      logDebug(prefix, message);
    }
  }
});

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

export const useCVEList = (
  filters: Filters = {},
  options: QueryOptions<CVEListResponse> = {},
  customService = cveService
) => {
  const queryClient = useQueryClient();
  const logger = useLogger('useCVEList');

  return useQuery<CVEListResponse, Error>({
    queryKey: QUERY_KEYS.CVE.list(filters),
    queryFn: async () => {
      try {
        logger.info('목록 조회 요청', { filters });
        const result = await customService.getCVEs(filters);

        if (!result.total && result.totalItems) {
          result.total = result.totalItems;
        }
        if (!result.items && result.results) {
          result.items = result.results;
        }

        if (result && result.items && result.items.length > 0) {
          const sampleItem = result.items[0];
          logger.debug('첫 번째 아이템의 날짜 정보:', {
            createdAt: sampleItem.createdAt,
            createdAt_type: typeof sampleItem.createdAt,
            lastModifiedAt: sampleItem.lastModifiedAt,
            lastModifiedAt_type: typeof sampleItem.lastModifiedAt,
            created_at: sampleItem.created_at,
            created_at_type: typeof sampleItem.created_at,
            last_modified_at: sampleItem.last_modified_at,
            last_modified_at_type: typeof sampleItem.last_modified_at,
          });
          logger.debug('모든 CVE 아이템의 날짜 필드:');
          result.items.forEach((item: CVEItem, index: number) => {
            logger.debug(`CVE #${index + 1}: ${item.cveId}`, {
              createdAt: item.createdAt,
              createdAt_type: typeof item.createdAt,
              lastModifiedAt: item.lastModifiedAt,
              lastModifiedAt_type: typeof item.lastModifiedAt,
              created_at: item.created_at,
              created_at_type: typeof item.created_at,
              last_modified_at: item.last_modified_at,
              last_modified_at_type: typeof item.last_modified_at,
            });
          });
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

interface UseCVEListQueryParams {
  page?: number;
  rowsPerPage?: number;
  filters?: Filters;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const useCVEListQuery = (params: UseCVEListQueryParams = {}) => {
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

  const logger = useLogger('useCVEListQuery');
  logger.info('호환성 모드로 호출됨 (deprecated)', { params });
  
  return useCVEList(convertedFilters);
};

export const useCVEDetail = (
  cveId: string,
  options: QueryOptions<CVEDetail> = {},
  customService = cveService
) => {
  const queryClient = useQueryClient();
  const logger = useLogger('useCVEDetail');

  const defaultOptions: QueryOptions<CVEDetail> = {
    enabled: !!cveId,
    retry: 1,
    retryDelay: 500,
    staleTime: 10000,
    gcTime: 60000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  };

  const mergedOptions = { ...defaultOptions, ...options };

  return useQuery<CVEDetail, Error>({
    queryKey: QUERY_KEYS.CVE.detail(cveId),
    queryFn: async () => {
      try {
        logger.info('CVE 상세 조회 요청', { cveId });
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

export const useCVERefresh = (
  cveId: string,
  options: any = {},
  customService = cveService
) => {
  const queryClient = useQueryClient();
  const logger = useLogger('useCVERefresh');

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

export const setupCVESubscriptions = (queryClient: any, webSocketService: any) => {
  const logger = createLogger('setupCVESubscriptions');
  
  if (!webSocketService || !webSocketService.subscribe) {
    logger.error('WebSocket 서비스가 유효하지 않음');
    return () => {};
  }

  logger.info('CVE 실시간 업데이트 구독 설정');

  const createSubscription = webSocketService.subscribe(
    'cve:created',
    (data: any) => handleCVESubscriptionUpdate(queryClient, { type: 'cve:created', payload: data })
  );

  const updateSubscription = webSocketService.subscribe(
    'cve:updated',
    (data: any) => handleCVESubscriptionUpdate(queryClient, { type: 'cve:updated', payload: data })
  );

  const deleteSubscription = webSocketService.subscribe(
    'cve:deleted',
    (data: any) => handleCVESubscriptionUpdate(queryClient, { type: 'cve:deleted', payload: data })
  );

  return () => {
    logger.info('CVE 실시간 업데이트 구독 해제');
    createSubscription.unsubscribe();
    updateSubscription.unsubscribe();
    deleteSubscription.unsubscribe();
  };
};

export const useCVEListUpdates = () => {
  const socketIO = useSocketIO();
  const queryClient = useQueryClient();
  const logger = useLogger('useCVEListUpdates');

  // useRef를 사용하여 불필요한 렌더링 방지
  const socketRef = useRef(socketIO.socket);
  const connectedRef = useRef(socketIO.connected);
  const queryClientRef = useRef(queryClient);
  const isSubscribedRef = useRef(false);

  // 최초 마운트 시 초기값 설정
  useEffect(() => {
    socketRef.current = socketIO.socket;
    connectedRef.current = socketIO.connected;
    queryClientRef.current = queryClient;
  }, []);

  // 핸들러 함수를 useRef로 정의하여 의존성 제거
  const handlersRef = useRef({
    handleCVECreated: (newCVE) => {
      logger.info('CVE 생성됨', { cveId: newCVE?.id });
      queryClientRef.current.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
    },
    
    handleCVEUpdated: (updatedCVE) => {
      logger.info('CVE 업데이트됨', { cveId: updatedCVE?.cve_id });
      if (updatedCVE?.cve_id) {
        queryClientRef.current.setQueryData(QUERY_KEYS.CVE.detail(updatedCVE.cve_id), updatedCVE);
        queryClientRef.current.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      }
    },
    
    handleCVEDeleted: (deletedCVEId) => {
      logger.info('CVE 삭제됨', { cveId: deletedCVEId });
      if (deletedCVEId) {
        queryClientRef.current.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
        queryClientRef.current.removeQueries({ queryKey: QUERY_KEYS.CVE.detail(deletedCVEId) });
      }
    }
  });

  // 소켓 연결 변경 감지를 위한 전용 useEffect
  useEffect(() => {
    if (socketIO.connected !== connectedRef.current) {
      connectedRef.current = socketIO.connected;
    }
    
    if (socketIO.socket !== socketRef.current) {
      socketRef.current = socketIO.socket;
    }
  }, [socketIO.connected, socketIO.socket]);

  // 이벤트 구독 관리를 위한 useEffect
  useEffect(() => {
    const socket = socketRef.current;
    const connected = connectedRef.current;
    const handlers = handlersRef.current;
    
    if (!socket || !connected) {
      isSubscribedRef.current = false;
      return;
    }

    if (isSubscribedRef.current) return;
    
    logger.info('Socket.IO 이벤트 리스너 등록');

    socket.on('cve:created', handlers.handleCVECreated);
    socket.on('cve:updated', handlers.handleCVEUpdated);
    socket.on('cve:deleted', handlers.handleCVEDeleted);

    socket.emit(SOCKET_EVENTS.SUBSCRIBE_CVES);
    logger.info('CVE 업데이트 구독 요청 전송', {
      eventName: SOCKET_EVENTS.SUBSCRIBE_CVES,
      socketId: socket.id,
      connected
    });
    
    isSubscribedRef.current = true;

    return () => {
      if (!socket) return;
      
      logger.info('Socket.IO 이벤트 리스너 해제');

      socket.off('cve:created', handlers.handleCVECreated);
      socket.off('cve:updated', handlers.handleCVEUpdated);
      socket.off('cve:deleted', handlers.handleCVEDeleted);

      socket.emit(SOCKET_EVENTS.UNSUBSCRIBE_CVES);
      logger.info('CVE 업데이트 구독 해제 요청 전송', {
        eventName: SOCKET_EVENTS.UNSUBSCRIBE_CVES,
        socketId: socket.id
      });
      
      isSubscribedRef.current = false;
    };
  }, []); // 의존성 배열을 비워 마운트/언마운트 시에만 실행

  return { isConnected: connectedRef.current };
};

export const useCVESubscription = (cveId: string) => {
  const { socket, connected } = useSocketIO();
  const queryClient = useQueryClient();
  const logger = useLogger('useCVESubscription');

  const socketRef = useRef(socket);
  const connectedRef = useRef(connected);

  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const timeoutIdRef = useRef<number | null>(null);
  
  // 마지막 구독/구독 해제 요청 시간 추적
  const lastSubscribeRequestRef = useRef<number>(0);
  const lastUnsubscribeRequestRef = useRef<number>(0);
  
  // 구독 요청 중복 방지를 위한 플래그
  const subscriptionPendingRef = useRef<boolean>(false);

  useEffect(() => {
    socketRef.current = socket;
    connectedRef.current = connected;

    logger.debug('소켓 상태 업데이트', {
      socketExists: !!socket,
      socketId: socket?.id,
      connected,
      timestamp: new Date().toISOString()
    });
  }, [socket, connected]);

  const handleSubscriptionUpdated = useCallback((data: any) => {
    if (!data || !data.cveId || data.cveId !== cveId) return;
    logger.info(`구독자 목록 업데이트: ${cveId}`, data);
    setSubscribers(data.subscribers || []);

    const currentUserId = localStorage.getItem('userId');
    const isCurrentUserSubscribed = data.subscribers?.some((sub: any) =>
      sub.id === currentUserId || sub.userId === currentUserId
    );
    
    // 구독 상태 업데이트 및 플래그 초기화
    setIsSubscribed(isCurrentUserSubscribed);
    subscriptionPendingRef.current = false;
  }, [cveId]);

  const subscribe = useCallback(() => {
    if (!cveId) {
      logger.warn('CVE ID가 제공되지 않았습니다.');
      setError('CVE ID가 제공되지 않았습니다.');
      return false;
    }

    const currentSocket = socketRef.current;
    const isConnected = connectedRef.current;

    if (!isConnected || !currentSocket) {
      logger.warn('소켓이 연결되지 않았습니다.', {
        connected: isConnected,
        socketExists: !!currentSocket,
        socketId: currentSocket?.id,
        cveId
      });
      setError('웹소켓 연결이 활성화되지 않았습니다. 잠시 후 다시 시도해주세요.');
      return false;
    }
    
    // 이미 구독 중이거나 구독 요청 중인 경우 중복 요청 방지
    if (isSubscribed || subscriptionPendingRef.current) {
      logger.info(`이미 구독 중이거나 구독 요청 중입니다: ${cveId}`, {
        isSubscribed,
        isPending: subscriptionPendingRef.current
      });
      return true;
    }
    
    // 마지막 요청 시간 확인 (1초 내 중복 요청 방지)
    const now = Date.now();
    if (now - lastSubscribeRequestRef.current < 1000) {
      logger.info(`구독 요청 너무 빠름, 무시: ${cveId}`, {
        timeSinceLastRequest: now - lastSubscribeRequestRef.current
      });
      return true;
    }
    
    // 요청 시간 및 플래그 업데이트
    lastSubscribeRequestRef.current = now;
    subscriptionPendingRef.current = true;

    setIsLoading(true);
    setError(null);

    try {
      logger.info(`CVE 구독 요청: ${cveId}`, {
        socketId: currentSocket.id,
        connected: isConnected,
        timestamp: new Date().toISOString()
      });

      logger.debug('소켓 이벤트 발생', {
        eventName: SOCKET_EVENTS.SUBSCRIBE_CVE,
        data: { cveId },
        socketId: currentSocket.id
      });

      currentSocket.emit(SOCKET_EVENTS.SUBSCRIBE_CVE, { cveId });

      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }

      timeoutIdRef.current = window.setTimeout(() => {
        if (isLoading) {
          logger.warn(`구독 요청 타임아웃: ${cveId}`);
          setIsLoading(false);
          setError('구독 요청 시간이 초과되었습니다. 네트워크 연결을 확인하고 다시 시도해주세요.');
          subscriptionPendingRef.current = false;
        }
      }, 5000);

      return true;
    } catch (err: any) {
      logger.error('구독 요청 오류:', err);
      setIsLoading(false);
      setError(`구독 요청 오류: ${err.message || '알 수 없는 오류'}`);
      subscriptionPendingRef.current = false;
      return false;
    }
  }, [cveId, isLoading, isSubscribed]);

  const unsubscribe = useCallback(() => {
    if (!cveId) {
      logger.warn('CVE ID가 제공되지 않았습니다.');
      return false;
    }

    const currentSocket = socketRef.current;
    const isConnected = connectedRef.current;

    if (!isConnected || !currentSocket) {
      logger.warn('소켓이 연결되지 않았습니다.', {
        connected: isConnected,
        socketExists: !!currentSocket,
        socketId: currentSocket?.id,
        cveId
      });
      return false;
    }
    
    // 이미 구독 해제되었거나 구독 해제 요청 중인 경우 중복 요청 방지
    if (!isSubscribed || subscriptionPendingRef.current) {
      logger.info(`이미 구독 해제되었거나 구독 해제 요청 중입니다: ${cveId}`, {
        isSubscribed,
        isPending: subscriptionPendingRef.current
      });
      return true;
    }
    
    // 마지막 요청 시간 확인 (1초 내 중복 요청 방지)
    const now = Date.now();
    if (now - lastUnsubscribeRequestRef.current < 1000) {
      logger.info(`구독 해제 요청 너무 빠름, 무시: ${cveId}`, {
        timeSinceLastRequest: now - lastUnsubscribeRequestRef.current
      });
      return true;
    }
    
    // 요청 시간 및 플래그 업데이트
    lastUnsubscribeRequestRef.current = now;
    subscriptionPendingRef.current = true;

    setIsLoading(true);
    setError(null);

    try {
      logger.info(`CVE 구독 해제 요청: ${cveId}`, {
        socketId: currentSocket.id,
        connected: isConnected,
        timestamp: new Date().toISOString()
      });

      logger.debug('소켓 이벤트 발생', {
        eventName: SOCKET_EVENTS.UNSUBSCRIBE_CVE,
        data: { cveId },
        socketId: currentSocket.id
      });

      currentSocket.emit(SOCKET_EVENTS.UNSUBSCRIBE_CVE, { cveId });

      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }

      timeoutIdRef.current = window.setTimeout(() => {
        if (isLoading) {
          logger.warn(`구독 해제 요청 타임아웃: ${cveId}`);
          setIsLoading(false);
          subscriptionPendingRef.current = false;
        }
      }, 5000);

      return true;
    } catch (err: any) {
      logger.error('구독 해제 요청 오류:', err);
      setIsLoading(false);
      subscriptionPendingRef.current = false;
      return false;
    }
  }, [cveId, isLoading, isSubscribed]);

  useEffect(() => {
    if (!socket || !connected || !cveId) return;

    const handleSubscribeSuccess = (data: any) => {
      if (!data || data.cveId !== cveId) return;

      logger.info(`구독 성공: ${cveId}`, data);
      setIsLoading(false);
      setIsSubscribed(true);
      setSubscribers(data.subscribers || []);
      subscriptionPendingRef.current = false;

      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
    };

    const handleSubscribeError = (data: any) => {
      if (!data || data.cveId !== cveId) return;

      logger.error(`구독 실패: ${cveId}`, data);
      setIsLoading(false);
      setError(data.message || '구독 요청이 실패했습니다.');
      subscriptionPendingRef.current = false;

      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };

    const handleUnsubscribeSuccess = (data: any) => {
      if (!data || data.cveId !== cveId) return;

      logger.info(`구독 해제 성공: ${cveId}`, data);
      setIsLoading(false);
      setIsSubscribed(false);
      setSubscribers(data.subscribers || []);
      subscriptionPendingRef.current = false;

      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(cveId) });
    };

    const handleUnsubscribeError = (data: any) => {
      if (!data || data.cveId !== cveId) return;

      logger.error(`구독 해제 실패: ${cveId}`, data);
      setIsLoading(false);
      setError(data.message || '구독 해제 요청이 실패했습니다.');
      subscriptionPendingRef.current = false;

      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };

    const handleSubscribersUpdated = (data: any) => {
      if (!data || data.cveId !== cveId) return;

      logger.info(`구독자 목록 업데이트: ${cveId}`, data);
      
      // 구독자 수 업데이트
      setSubscribers(data.subscribers || []);
      
      // 현재 사용자의 구독 상태 확인
      const currentUserId = localStorage.getItem('userId');
      const isCurrentUserSubscribed = data.subscribers?.some((sub: any) =>
        sub.id === currentUserId || sub.userId === currentUserId
      );
      
      // 구독 상태 업데이트
      setIsSubscribed(isCurrentUserSubscribed);
    };

    // 이벤트 리스너 등록
    logger.debug('소켓 이벤트 발생', {
      action: '이벤트 리스너 등록',
      socketId: socket.id,
      cveId
    });

    logger.info('소켓 이벤트 리스너 등록 완료', {
      socketId: socket.id,
      events: [
        SOCKET_EVENTS.SUBSCRIPTION_STATUS,
        SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED
      ]
    });

    socket.on(SOCKET_EVENTS.SUBSCRIPTION_STATUS, (data: any) => {
      if (!data || !data.data) return;
      const { status, cve_id, success } = data.data;
      
      if (cve_id !== cveId) return;
      
      if (status === 'subscribed' && success) {
        handleSubscribeSuccess(data.data);
      } else if (status === 'subscribed' && !success) {
        handleSubscribeError(data.data);
      } else if (status === 'unsubscribed' && success) {
        handleUnsubscribeSuccess(data.data);
      } else if (status === 'unsubscribed' && !success) {
        handleUnsubscribeError(data.data);
      }
    });

    socket.on(SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED, (data: any) => {
      if (!data || !data.data) return;
      handleSubscribersUpdated(data.data);
    });

    // 컴포넌트 언마운트 시 이벤트 리스너 제거
    return () => {
      logger.info('소켓 이벤트 리스너 제거 완료', {
        socketId: socket.id,
        events: [
          SOCKET_EVENTS.SUBSCRIPTION_STATUS,
          SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED
        ]
      });

      socket.off(SOCKET_EVENTS.SUBSCRIPTION_STATUS);
      socket.off(SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED);
      
      // 타이머 정리
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
  }, [socket, connected, cveId, queryClient]);

  return {
    subscribe,
    unsubscribe,
    isSubscribed,
    subscribers,
    isLoading,
    error
  };
};

// CVE 통계 타입 정의
interface CVEStats {
  byStatus?: Record<string, number>;
  bySeverity?: Record<string, number>;
  byMonth?: Record<string, number>;
  total?: number;
  [key: string]: any;
}

// cveService에 getCVEStats 메서드가 없으므로 API 직접 호출로 대체
export const useCVEStats = (options: QueryOptions<CVEStats> = {}) => {
  const logger = useLogger('useCVEStats');
  
  return useQuery<CVEStats, Error>({
    queryKey: QUERY_KEYS.CVE.stats(),
    queryFn: async () => {
      try {
        logger.info('CVE 통계 조회 요청');
        // cveService에 getCVEStats 메서드가 없으므로 API 직접 호출
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

export const useTotalCVECount = (options: QueryOptions<number> = {}) => {
  const logger = useLogger('useTotalCVECount');
  
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

export const useUpdateCVE = (
  cveId: string,
  options: UseMutationOptions<any, Error, Partial<CVEDetail>> = {}
) => {
  const queryClient = useQueryClient();
  const logger = useLogger('useUpdateCVE');

  return useMutation<any, Error, Partial<CVEDetail>>({
    mutationFn: async (updateData: Partial<CVEDetail>) => {
      try {
        logger.info(`CVE 업데이트 요청: ${cveId}`, { updateData });
        const result = await cveService.updateCVE(cveId, updateData);
        logger.info(`CVE 업데이트 성공: ${cveId}`, { result });
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      
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
  handleCVESubscriptionUpdate,
  setupCVESubscriptions
};
