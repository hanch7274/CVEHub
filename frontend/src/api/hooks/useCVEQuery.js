import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback, useState, useRef } from 'react';
import cveService from '../services/cveService';
import logger from '../../utils/logging';
import { QUERY_KEYS } from '../queryKeys';
import { useSocketIO } from '../../contexts/SocketIOContext';
import { SOCKET_EVENTS } from '../../services/socketio/constants';

// 이벤트 이름 상수 추가 (SOCKET_EVENTS에 없는 이벤트 이름)
const SUBSCRIPTION_EVENTS = {
  SUBSCRIPTION_ERROR: 'subscription:error',
  UNSUBSCRIPTION_ERROR: 'unsubscription:error'
  // SUBSCRIBE_CVES와 UNSUBSCRIBE_CVES는 SOCKET_EVENTS로 이동
};

/**
 * CVE 목록 조회 Hook
 * @param {Object} filters - 페이지네이션, 검색, 필터링 옵션
 * @param {Object} options - React Query 옵션
 * @param {Object} customService - 선택적으로 주입할 서비스 객체
 * @returns {Object} useQuery 훅에서 반환되는 결과 객체
 */
export const useCVEList = (filters = {}, options = {}, customService = cveService) => {
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey: QUERY_KEYS.CVE.list(filters),
    queryFn: async () => {
      try {
        logger.info('useCVEList', '목록 조회 요청', { filters });
        
        // 모든 경우에 getCVEs 메서드 사용 (search 파라미터도 함께 전달)
        const result = await customService.getCVEs(filters);
        
        // 결과 형식 일관성 유지
        if (!result.total && result.totalItems) {
          result.total = result.totalItems;
        }
        
        if (!result.items && result.results) {
          result.items = result.results;
        }
        
        logger.info('useCVEList', '목록 조회 결과', { 
          totalItems: result.total || result.totalItems || 0,
          itemsCount: result.items?.length || result.results?.length || 0,
          page: filters.page || 1
        });
        
        return result;
      } catch (error) {
        logger.error('useCVEList', '목록 조회 중 오류 발생', { 
          error: error.message, 
          filters,
          stack: error.stack 
        });
        throw error;
      }
    },
    keepPreviousData: true, // 페이지네이션시 이전 데이터 유지
    staleTime: 10000, // 10초 동안 데이터를 fresh하게 유지 (30초에서 10초로 단축)
    cacheTime: 60000, // 1분 동안 캐시 유지
    refetchOnWindowFocus: true, // 창이 포커스될 때 자동으로 새로고침
    onError: (error) => {
      logger.error('useCVEList', '쿼리 에러 처리', { error: error.message });
    },
    ...options,
  });
};

/**
 * 이전 useCVEListQuery 훅과의 호환성을 위한 별칭
 * @deprecated useCVEList를 사용하세요
 */
export const useCVEListQuery = (params = {}) => {
  const { 
    page = 0, 
    rowsPerPage = 10, 
    filters = {}, 
    sortBy = 'createdAt', 
    sortOrder = 'desc' 
  } = params;
  
  // 기존 파라미터 구조를 useCVEList에서 기대하는 구조로 변환
  const convertedFilters = {
    page,
    rowsPerPage,
    search: filters.search,
    sortBy,
    sortOrder,
    filters
  };
  
  logger.info('useCVEListQuery', '호환성 모드로 호출됨 (deprecated)', { params });
  return useCVEList(convertedFilters);
};

/**
 * CVE 상세 정보 조회 Hook
 * @param {string} cveId - CVE ID
 * @param {Object} options - React Query 옵션
 * @param {Object} customService - 선택적으로 주입할 서비스 객체
 * @returns {Object} useQuery 훅에서 반환되는 결과 객체
 */
export const useCVEDetail = (cveId, options = {}, customService = cveService) => {
  const queryClient = useQueryClient();
  
  // 기본 옵션 설정
  const defaultOptions = {
    enabled: !!cveId,
    retry: 1, // 재시도 횟수 제한
    retryDelay: 500, // 재시도 간격 (1000ms에서 500ms로 단축)
    staleTime: 10000, // 10초 동안 데이터를 fresh하게 유지 (60초에서 10초로 단축)
    cacheTime: 60000, // 1분 동안 캐시 유지 (1시간에서 1분으로 단축)
    refetchOnWindowFocus: true, // 창이 포커스될 때 자동으로 새로고침
    refetchOnMount: true, // 컴포넌트가 마운트될 때 자동으로 새로고침
  };
  
  // 사용자 옵션과 기본 옵션 병합
  const mergedOptions = { ...defaultOptions, ...options };
  
  // useQuery 호출
  return useQuery({
    queryKey: QUERY_KEYS.CVE.detail(cveId),
    queryFn: async () => {
      try {
        logger.info('useCVEDetail', 'CVE 상세 조회 요청', { cveId });
        const startTime = Date.now();
        const result = await customService.getCVEById(cveId);
        const endTime = Date.now();
        logger.info('useCVEDetail', 'CVE 상세 조회 완료', { 
          cveId, 
          elapsedTime: `${endTime - startTime}ms`,
          dataSize: JSON.stringify(result).length
        });
        return result;
      } catch (error) {
        logger.error('useCVEDetail', '상세 정보 조회 중 오류 발생', { cveId, error: error.message });
        throw error;
      }
    },
    ...mergedOptions
  });
};

/**
 * CVE 상세 정보 강제 새로고침 Hook
 * @param {string} cveId - CVE ID
 * @param {Object} options - React Query 옵션
 * @param {Object} customService - 선택적으로 주입할 서비스 객체
 * @returns {Object} useMutation 훅에서 반환되는 결과 객체
 */
export const useCVERefresh = (cveId, options = {}, customService = cveService) => {
  const queryClient = useQueryClient();
  
  const refreshFn = async () => {
    try {
      logger.info('useCVERefresh', '강제 새로고침 요청', { cveId });
      const data = await customService.getCVEByIdNoCache(cveId);
      
      // 캐시 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), data);
      // 목록 쿼리 무효화 (선택 사항)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      
      return data;
    } catch (error) {
      logger.error('useCVERefresh', '강제 새로고침 중 오류 발생', { cveId, error: error.message });
      throw error;
    }
  };

  // React Query의 useMutation 패턴과 유사한 인터페이스 제공
  return {
    mutate: refreshFn,
    isLoading: false, // 단순화된 구현
    refresh: refreshFn // 기존 호환성 유지
  };
};

/**
 * CVE WebSocket 이벤트 처리기
 * @param {Object} queryClient - QueryClient 인스턴스
 * @param {Object} data - WebSocket 이벤트 데이터
 */
export const handleCVESubscriptionUpdate = (queryClient, data) => {
  if (!data || !data.type) {
    logger.warn('handleCVESubscriptionUpdate', '유효하지 않은 이벤트 데이터', { data });
    return;
  }
  
  const { type, payload } = data;
  
  switch (type) {
    case 'cve:created':
      logger.info('handleCVESubscriptionUpdate', 'CVE 생성 이벤트 수신', { cveId: payload.id });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      break;
      
    case 'cve:updated':
      logger.info('handleCVESubscriptionUpdate', 'CVE 업데이트 이벤트 수신', { cveId: payload.id });
      // 상세 정보 캐시 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(payload.id), payload);
      // 목록 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      break;
      
    case 'cve:deleted':
      logger.info('handleCVESubscriptionUpdate', 'CVE 삭제 이벤트 수신', { cveId: payload.id });
      // 상세 캐시 제거
      queryClient.removeQueries({ queryKey: QUERY_KEYS.CVE.detail(payload.id) });
      // 목록 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      break;
      
    default:
      logger.warn('handleCVESubscriptionUpdate', '알 수 없는 이벤트 타입', { type, payload });
  }
};

/**
 * WebSocket을 통한 CVE 실시간 업데이트 구독 설정
 * @param {Object} queryClient - QueryClient 인스턴스
 * @param {Object} webSocketService - WebSocket 서비스
 */
export const setupCVESubscriptions = (queryClient, webSocketService) => {
  if (!webSocketService || !webSocketService.subscribe) {
    logger.error('setupCVESubscriptions', 'WebSocket 서비스가 유효하지 않음');
    return () => {}; // 빈 cleanup 함수 반환
  }
  
  logger.info('setupCVESubscriptions', 'CVE 실시간 업데이트 구독 설정');
  
  // CVE 생성 이벤트 구독
  const createSubscription = webSocketService.subscribe(
    'cve:created',
    (data) => handleCVESubscriptionUpdate(queryClient, { type: 'cve:created', payload: data })
  );
  
  // CVE 업데이트 이벤트 구독
  const updateSubscription = webSocketService.subscribe(
    'cve:updated',
    (data) => handleCVESubscriptionUpdate(queryClient, { type: 'cve:updated', payload: data })
  );
  
  // CVE 삭제 이벤트 구독
  const deleteSubscription = webSocketService.subscribe(
    'cve:deleted',
    (data) => handleCVESubscriptionUpdate(queryClient, { type: 'cve:deleted', payload: data })
  );
  
  // 구독 해제 함수 반환
  return () => {
    logger.info('setupCVESubscriptions', 'CVE 실시간 업데이트 구독 해제');
    createSubscription.unsubscribe();
    updateSubscription.unsubscribe();
    deleteSubscription.unsubscribe();
  };
};

/**
 * CVE 목록의 실시간 업데이트를 처리하는 훅
 * Socket.IO를 사용하여 서버로부터 CVE 업데이트를 구독하고 React Query 캐시를 업데이트함
 * 
 * @returns {Object} 연결 상태 정보
 */
export const useCVEListUpdates = () => {
  const { socket, connected } = useSocketIO();
  const queryClient = useQueryClient();

  // CVE 생성 이벤트 처리 함수
  const handleCVECreated = useCallback((newCVE) => {
    logger.info('useCVEListUpdates', 'CVE 생성됨', { cveId: newCVE?.id });
    // 쿼리 캐시 갱신
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
  }, [queryClient]);

  // CVE 업데이트 이벤트 처리 함수
  const handleCVEUpdated = useCallback((updatedCVE) => {
    logger.info('useCVEListUpdates', 'CVE 업데이트됨', { cveId: updatedCVE?.id });
    
    if (updatedCVE?.id) {
      // CVE 상세 쿼리 캐시 갱신
      queryClient.setQueryData(
        QUERY_KEYS.CVE.detail(updatedCVE.id),
        updatedCVE
      );
      
      // 목록 쿼리도 갱신 (필터링/정렬에 영향을 줄 수 있음)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
    }
  }, [queryClient]);

  // CVE 삭제 이벤트 처리 함수
  const handleCVEDeleted = useCallback((deletedCVEId) => {
    logger.info('useCVEListUpdates', 'CVE 삭제됨', { cveId: deletedCVEId });
    
    if (deletedCVEId) {
      // 쿼리 캐시 갱신
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      
      // 해당 상세 쿼리도 무효화
      queryClient.removeQueries({ queryKey: QUERY_KEYS.CVE.detail(deletedCVEId) });
    }
  }, [queryClient]);

  // 소켓 연결 및 이벤트 리스너 등록
  useEffect(() => {
    if (!socket || !connected) return;

    logger.info('useCVEListUpdates', 'Socket.IO 이벤트 리스너 등록');
    
    // 이벤트 리스너 등록
    socket.on('cve:created', handleCVECreated);
    socket.on('cve:updated', handleCVEUpdated);
    socket.on('cve:deleted', handleCVEDeleted);

    // 구독 요청
    socket.emit(SOCKET_EVENTS.SUBSCRIBE_CVES);
    logger.info('useCVEListUpdates', 'CVE 업데이트 구독 요청 전송', {
      eventName: SOCKET_EVENTS.SUBSCRIBE_CVES,
      socketId: socket.id,
      connected
    });

    // 클린업 함수
    return () => {
      logger.info('useCVEListUpdates', 'Socket.IO 이벤트 리스너 해제');
      
      socket.off('cve:created', handleCVECreated);
      socket.off('cve:updated', handleCVEUpdated);
      socket.off('cve:deleted', handleCVEDeleted);
      
      // 구독 해제
      socket.emit(SOCKET_EVENTS.UNSUBSCRIBE_CVES);
      logger.info('useCVEListUpdates', 'CVE 업데이트 구독 해제 요청 전송', {
        eventName: SOCKET_EVENTS.UNSUBSCRIBE_CVES,
        socketId: socket.id,
        connected
      });
    };
  }, [socket, connected, handleCVECreated, handleCVEUpdated, handleCVEDeleted]);

  return { isConnected: connected };
};

/**
 * CVE 구독 상태 관리 훅
 * 
 * 특정 CVE ID에 대한 구독 상태 관리 및 실시간 구독자 정보 업데이트를 제공합니다.
 * Socket.IO를 통해 서버와 구독 관계를 관리합니다.
 * 
 * @param {string} cveId - 구독 대상 CVE ID
 * @returns {Object} - 구독 관련 상태와 함수들
 */
export const useCVESubscription = (cveId) => {
  const { socket, connected } = useSocketIO();
  const queryClient = useQueryClient();
  
  // 소켓 객체 참조 관리를 위한 ref 추가
  const socketRef = useRef(socket);
  const connectedRef = useRef(connected);
  
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribers, setSubscribers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // 타임아웃 ID 관리를 위한 ref
  const timeoutIdRef = useRef(null);
  
  // ref 값 업데이트
  useEffect(() => {
    socketRef.current = socket;
    connectedRef.current = connected;
    
    // 소켓 상태 로깅
    logger.debug('[useCVESubscription] 소켓 상태 업데이트', {
      socketExists: !!socket,
      socketId: socket?.id,
      connected,
      timestamp: new Date().toISOString()
    });
  }, [socket, connected]);
  
  // 구독자 목록을 업데이트하는 핸들러
  const handleSubscriptionUpdated = useCallback((data) => {
    if (!data || !data.cveId || data.cveId !== cveId) return;
    
    logger.info(`[useCVESubscription] 구독자 목록 업데이트: ${data.cveId}`, data.subscribers);
    setSubscribers(data.subscribers || []);
    
    // 사용자가 현재 구독 목록에 있는지 확인
    const currentUserId = localStorage.getItem('userId');
    const isCurrentUserSubscribed = data.subscribers?.some(sub => 
      sub.id === currentUserId || sub.userId === currentUserId
    );
    
    setIsSubscribed(isCurrentUserSubscribed);
  }, [cveId]);
  
  // 구독 요청 함수
  const subscribe = useCallback(() => {
    if (!cveId) {
      logger.warn('[useCVESubscription] CVE ID가 제공되지 않았습니다.');
      setError('CVE ID가 제공되지 않았습니다.');
      return false;
    }
    
    // 현재 소켓 및 연결 상태 확인 (ref 사용)
    const currentSocket = socketRef.current;
    const isConnected = connectedRef.current;
    
    if (!isConnected || !currentSocket) {
      logger.warn('[useCVESubscription] 소켓이 연결되지 않았습니다.', {
        connected: isConnected,
        socketExists: !!currentSocket,
        socketId: currentSocket?.id,
        cveId
      });
      setError('웹소켓 연결이 활성화되지 않았습니다. 잠시 후 다시 시도해주세요.');
      return false;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      logger.info(`[useCVESubscription] CVE 구독 요청: ${cveId}`, {
        socketId: currentSocket.id,
        connected: isConnected,
        timestamp: new Date().toISOString()
      });
      
      // 구독 요청 전송 - 이벤트 이름 명시적 지정
      if (!SOCKET_EVENTS.SUBSCRIBE_CVE) {
        logger.error('[useCVESubscription] SUBSCRIBE_CVE 이벤트 상수가 정의되지 않았습니다.');
        setError('내부 오류가 발생했습니다. 관리자에게 문의하세요.');
        setIsLoading(false);
        return false;
      }
      
      // 이벤트 이름과 데이터를 명확하게 로깅
      logger.debug('[useCVESubscription] 소켓 이벤트 발생', {
        eventName: SOCKET_EVENTS.SUBSCRIBE_CVE,
        data: { cveId },
        socketId: currentSocket.id
      });
      
      // 이벤트 이름을 명시적으로 지정하여 emit 호출
      currentSocket.emit(SOCKET_EVENTS.SUBSCRIBE_CVE, { cveId });
      
      // 이전 타임아웃이 있으면 제거
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
      
      // 5초 후에도 응답이 없으면 타임아웃 처리
      timeoutIdRef.current = setTimeout(() => {
        if (isLoading) {
          logger.warn(`[useCVESubscription] 구독 요청 타임아웃: ${cveId}`);
          setIsLoading(false);
          setError('구독 요청 시간이 초과되었습니다. 네트워크 연결을 확인하고 다시 시도해주세요.');
        }
      }, 5000);
      
      return true;
    } catch (err) {
      logger.error('[useCVESubscription] 구독 요청 오류:', err, {
        cveId,
        socketId: currentSocket?.id,
        connected: isConnected,
        errorMessage: err.message,
        errorStack: err.stack
      });
      setIsLoading(false);
      setError(`구독 요청 오류: ${err.message || '알 수 없는 오류'}`);
      return false;
    }
  }, [cveId]);

  // 구독 해제 요청 함수
  const unsubscribe = useCallback(() => {
    if (!cveId) {
      logger.warn('[useCVESubscription] CVE ID가 제공되지 않았습니다.');
      return false;
    }
    
    // 현재 소켓 및 연결 상태 확인 (ref 사용)
    const currentSocket = socketRef.current;
    const isConnected = connectedRef.current;
    
    if (!isConnected || !currentSocket) {
      logger.warn('[useCVESubscription] 소켓이 연결되지 않았습니다.', {
        connected: isConnected,
        socketExists: !!currentSocket,
        socketId: currentSocket?.id,
        cveId
      });
      return false;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      logger.info(`[useCVESubscription] CVE 구독 해제 요청: ${cveId}`, {
        socketId: currentSocket.id,
        connected: isConnected,
        timestamp: new Date().toISOString()
      });
      
      // 이벤트 이름과 데이터를 명확하게 로깅
      logger.debug('[useCVESubscription] 소켓 이벤트 발생', {
        eventName: SOCKET_EVENTS.UNSUBSCRIBE_CVE,
        data: { cveId },
        socketId: currentSocket.id
      });
      
      // 구독 해제 요청 전송 - 이벤트 이름 명시적 지정
      currentSocket.emit(SOCKET_EVENTS.UNSUBSCRIBE_CVE, { cveId });
      
      // 이전 타임아웃이 있으면 제거
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
      
      // 5초 후에도 응답이 없으면 타임아웃 처리
      timeoutIdRef.current = setTimeout(() => {
        if (isLoading) {
          logger.warn(`[useCVESubscription] 구독 해제 요청 타임아웃: ${cveId}`);
          setIsLoading(false);
        }
      }, 5000);
      
      return true;
    } catch (err) {
      logger.error('[useCVESubscription] 구독 해제 요청 오류:', err, {
        cveId,
        socketId: currentSocket?.id,
        connected: isConnected,
        errorMessage: err.message,
        errorStack: err.stack
      });
      setIsLoading(false);
      return false;
    }
  }, [cveId]);
  
  // 소켓 이벤트 리스너 등록
  useEffect(() => {
    if (!socket || !connected || !cveId) return;
    
    // 구독 성공 이벤트 핸들러
    const handleSubscribeSuccess = (data) => {
      if (!data || data.cveId !== cveId) return;
      
      logger.info(`[useCVESubscription] 구독 성공: ${cveId}`, data);
      setIsLoading(false);
      setIsSubscribed(true);
      setSubscribers(data.subscribers || []);
      
      // 타임아웃 제거
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      
      // 캐시 업데이트
      queryClient.invalidateQueries(QUERY_KEYS.CVE.detail(cveId));
    };
    
    // 구독 실패 이벤트 핸들러
    const handleSubscribeError = (data) => {
      if (!data || data.cveId !== cveId) return;
      
      logger.error(`[useCVESubscription] 구독 실패: ${cveId}`, data);
      setIsLoading(false);
      setError(data.message || '구독 요청이 실패했습니다.');
      
      // 타임아웃 제거
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
    
    // 구독 해제 성공 이벤트 핸들러
    const handleUnsubscribeSuccess = (data) => {
      if (!data || data.cveId !== cveId) return;
      
      logger.info(`[useCVESubscription] 구독 해제 성공: ${cveId}`, data);
      setIsLoading(false);
      setIsSubscribed(false);
      setSubscribers(data.subscribers || []);
      
      // 타임아웃 제거
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      
      // 캐시 업데이트
      queryClient.invalidateQueries(QUERY_KEYS.CVE.detail(cveId));
    };
    
    // 구독 해제 실패 이벤트 핸들러
    const handleUnsubscribeError = (data) => {
      if (!data || data.cveId !== cveId) return;
      
      logger.error(`[useCVESubscription] 구독 해제 실패: ${cveId}`, data);
      setIsLoading(false);
      setError(data.message || '구독 해제 요청이 실패했습니다.');
      
      // 타임아웃 제거
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
    
    // 구독자 목록 업데이트 이벤트 핸들러
    const handleSubscribersUpdated = (data) => {
      handleSubscriptionUpdated(data);
    };
    
    // 이벤트 리스너 등록
    socket.on(SOCKET_EVENTS.SUBSCRIBE_CVE_SUCCESS, handleSubscribeSuccess);
    socket.on(SUBSCRIPTION_EVENTS.SUBSCRIPTION_ERROR, handleSubscribeError);
    socket.on(SOCKET_EVENTS.UNSUBSCRIBE_CVE_SUCCESS, handleUnsubscribeSuccess);
    socket.on(SUBSCRIPTION_EVENTS.UNSUBSCRIPTION_ERROR, handleUnsubscribeError);
    socket.on(SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED, handleSubscribersUpdated);
    
    // 초기 구독 상태 확인 요청
    logger.debug('[useCVESubscription] 소켓 이벤트 발생', {
      eventName: SOCKET_EVENTS.GET_CVE_SUBSCRIBERS,
      data: { cveId },
      socketId: socket.id
    });
    
    socket.emit(SOCKET_EVENTS.GET_CVE_SUBSCRIBERS, { cveId });
    
    logger.info('[useCVESubscription] 소켓 이벤트 리스너 등록 완료', {
      cveId,
      socketId: socket.id
    });
    
    // 클린업 함수
    return () => {
      // 이벤트 리스너 제거
      socket.off(SOCKET_EVENTS.SUBSCRIBE_CVE_SUCCESS, handleSubscribeSuccess);
      socket.off(SUBSCRIPTION_EVENTS.SUBSCRIPTION_ERROR, handleSubscribeError);
      socket.off(SOCKET_EVENTS.UNSUBSCRIBE_CVE_SUCCESS, handleUnsubscribeSuccess);
      socket.off(SUBSCRIPTION_EVENTS.UNSUBSCRIPTION_ERROR, handleUnsubscribeError);
      socket.off(SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED, handleSubscribersUpdated);
      
      // 타임아웃 제거
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      
      logger.info('[useCVESubscription] 소켓 이벤트 리스너 제거 완료', {
        cveId,
        socketId: socket?.id
      });
    };
  }, [socket, connected, cveId, queryClient, handleSubscriptionUpdated]);
  
  return {
    isSubscribed,
    subscribers,
    isLoading,
    error,
    subscribe,
    unsubscribe
  };
};

/**
 * 전체 CVE 개수를 조회하는 훅
 * 필터링 없이 DB에 존재하는 모든 CVE의 개수를 반환합니다.
 * @param {Object} options - React Query 옵션
 * @returns {Object} useQuery 훅에서 반환되는 결과 객체
 */
export const useTotalCVECount = (options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.CVE.totalCount(),
    queryFn: async () => {
      try {
        return await cveService.getTotalCVECount();
      } catch (error) {
        logger.error('useTotalCVECount', '전체 CVE 개수 조회 중 오류 발생', { error: error.message });
        throw error;
      }
    },
    staleTime: 60000, // 1분 동안 데이터를 fresh하게 유지
    ...options,
  });
};

// 모든 CVE 관련 훅을 기본 내보내기로 묶어서 제공
export default {
  useCVEList,
  useCVEListQuery, // 이전 버전과의 호환성을 위한 별칭
  useCVEDetail,
  useCVERefresh,
  useCVEListUpdates,
  useCVESubscription,
  handleCVESubscriptionUpdate,
  setupCVESubscriptions,
  useTotalCVECount
};