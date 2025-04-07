import { useEffect, useRef, useState, useCallback } from 'react';
import { Subscription, Observable } from 'rxjs';
import { useQueryClient, QueryKey } from '@tanstack/react-query';

import { v4 as uuidv4 } from 'uuid';
import _ from 'lodash';
import useSocketStore from '../state/socketStore';
import logger from 'shared/utils/logging';
import socketService from '../services/socketService';

/**
 * 소켓 훅 옵션 인터페이스
 */
export interface SocketHookOptions<TData = any, TPayload = any> {
  /**
   * RxJS Observable 사용 여부
   */
  useRxJS?: boolean;
  
  /**
   * 연결 즉시 구독 여부
   */
  subscribeImmediately?: boolean;
  
  /**
   * 이벤트 필터링 조건
   */
  filterPredicate?: (data: TPayload) => boolean;
  
  /**
   * 컴포넌트 ID (이벤트 핸들러 관리용)
   */
  componentId?: string;
  
  /**
   * 낙관적 업데이트 사용 여부
   */
  optimisticUpdate?: boolean;
  
  /**
   * 쿼리 키
   */
  queryKey?: QueryKey;
  
  /**
   * 쿼리 무효화 대신 직접 업데이트를 수행할지 여부
   */
  directUpdate?: boolean;
  
  /**
   * 데이터 업데이트 함수 (낙관적 업데이트에 사용)
   */
  updateDataFn?: (oldData: TData, newData: TPayload) => TData;
  
  /**
   * 디바운스 지연 시간 (밀리초)
   */
  debounceDelay?: number;
  
  /**
   * 쓰로틀 지연 시간 (밀리초)
   */
  throttleDelay?: number;
  
  /**
   * 이벤트 에러 핸들러
   */
  onError?: (error: Error) => void;
  
  /**
   * 연결 상태 변경 시 호출될 콜백
   */
  onConnectionChange?: (connected: boolean) => void;
}

/**
 * 소켓 훅 반환 인터페이스
 */
export interface SocketHookResult<TPayload = any> {
  /** 이벤트 구독 여부 */
  isSubscribed: boolean;
  
  /** 이벤트 구독 함수 */
  subscribe: (event?: string) => void;
  
  /** 이벤트 구독 해제 함수 */
  unsubscribe: (event?: string) => void;
  
  /** 이벤트 리스너 등록 함수 */
  on: <T = any>(eventName: string, callback: (data: T) => void) => () => void;
  
  /** 이벤트 리스너 등록 함수 (on의 별칭) */
  addEventListener: <T = any>(eventName: string, callback: (data: T) => void) => () => void;
  
  /** 이벤트 리스너 제거 함수 */
  off: <T = any>(eventName: string, callback: (data: T) => void) => void;
  
  /** 이벤트 리스너 제거 함수 (off의 별칭) */
  removeEventListener: <T = any>(eventName: string, callback: (data: T) => void) => void;
  
  /** 일반 메시지 전송 함수 */
  emit: (messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => void;
  
  /** 디바운스된 메시지 전송 함수 */
  emitDebounced: (messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => void;
  
  /** 쓰로틀된 메시지 전송 함수 */
  emitThrottled: (messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => void;
  
  /** 소켓 연결 상태 */
  connected: boolean;
  
  /** 연결 상태 문자열 */
  connectionState: string;
  
  /** 연결 오류 */
  connectionError: Error | null;
  
  /** 소켓 인스턴스 */
  socket: any;
  
  /** 가장 최근에 수신한 데이터 */
  lastReceivedData: TPayload | null;
  
  /** 연결 상태 Observable */
  connectionState$: Observable<string>;
  
  /** 웹소켓 정리 함수 */
  cleanup: () => void;
  
  /** CVE 구독 함수 */
  subscribeCVE: (cveId: string) => void;
  
  /** CVE 구독 해제 함수 */
  unsubscribeCVE: (cveId: string) => void;
  
  /** CVE 구독 상태 확인 함수 */
  isSubscribedToCVE: (cveId: string) => boolean;
  
  /** 구독 중인 CVE 목록 */
  subscribedCVEs: string[];
}

/**
 * 통합 웹소켓 훅
 * 
 * socketService를 활용하여 웹소켓 연결 및 이벤트 처리를 간소화하는 통합 훅입니다.
 * 
 * @param event - 구독할 이벤트 이름 (옵션)
 * @param callback - 이벤트 발생 시 호출될 콜백 함수 (옵션)
 * @param deps - 콜백 함수의 의존성 배열
 * @param options - 훅 옵션
 * @returns 소켓 훅 결과
 */
export function useSocket<TData = any, TPayload = any>(
  event?: string,
  callback?: (data: TPayload) => void,
  deps: React.DependencyList = [],
  options: SocketHookOptions<TData, TPayload> = {}
): SocketHookResult<TPayload> {
  // 기본 옵션 설정
  const { 
    useRxJS = true, 
    subscribeImmediately = true,
    filterPredicate,
    componentId: propComponentId,
    optimisticUpdate = false,
    queryKey,
    directUpdate = false,
    updateDataFn,
    debounceDelay = 300,
    throttleDelay = 150,
    onError,
    onConnectionChange
  } = options;
  
  // 컴포넌트 ID 설정 (제공되지 않은 경우 자동 생성)
  const componentIdRef = useRef<string>(propComponentId || uuidv4());
  
  // 상태 관리 - Zustand 스토어 사용
  const { 
    connected, 
    connectionState, 
    connectionError 
  } = useSocketStore();
  
  // React Query 클라이언트
  const queryClient = useQueryClient();
  
  // 구독 관리를 위한 상태 및 참조
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [lastReceivedData, setLastReceivedData] = useState<TPayload | null>(null);
  const callbackRef = useRef(callback);
  const subscriptionRef = useRef<Subscription | null>(null);
  const eventNamesRef = useRef<Set<string>>(new Set());
  const eventHandlersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  
  // 콜백 함수 업데이트
  useEffect(() => {
    if (callback) {
      callbackRef.current = callback;
    }
  }, [callback, ...deps]);
  
  // 쿼리 캐시 업데이트 함수
  const updateQueryCache = useCallback((data: TPayload) => {
    try {
      // 쿼리 키가 없거나 낙관적 업데이트가 비활성화된 경우 무시
      if (!optimisticUpdate || !queryKey) return;
      
      if (directUpdate && updateDataFn) {
        // 직접 업데이트 방식
        queryClient.setQueryData(
          queryKey,
          (oldData: TData) => {
            return updateDataFn(oldData, data);
          }
        );
        
        logger.debug('useSocket', '캐시 직접 업데이트 완료');
      } else {
        // 쿼리 무효화 방식
        queryClient.invalidateQueries({ queryKey });
        logger.debug('useSocket', '캐시 무효화 완료', { queryKey });
      }
    } catch (error) {
      logger.error('useSocket', '캐시 업데이트 중 오류 발생', error);
      
      // 에러 핸들러가 있으면 호출
      if (onError) {
        onError(error as Error);
      }
    }
  }, [optimisticUpdate, queryKey, directUpdate, updateDataFn, queryClient, onError]);
  
  // 이벤트 핸들러 함수
  const handleEvent = useCallback((data: TPayload) => {
    try {
      // 필터링 조건이 있는 경우 체크
      if (filterPredicate && !filterPredicate(data)) {
        return;
      }
      
      // 마지막 수신 데이터 업데이트
      setLastReceivedData(data);
      
      // 낙관적 업데이트 처리
      if (optimisticUpdate) {
        updateQueryCache(data);
      }
      
      // 콜백 호출
      if (callbackRef.current) {
        callbackRef.current(data);
      }
      
      // 해당 이벤트에 등록된 모든 핸들러 호출
      const eventName = event || '';
      const handlers = eventHandlersRef.current.get(eventName);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(data);
          } catch (handlerError) {
            logger.error('useSocket', `이벤트 핸들러 실행 중 오류: ${eventName}`, handlerError);
          }
        });
      }
    } catch (error) {
      logger.error('useSocket', `이벤트 처리 중 오류 발생: ${event}`, error);
      
      // 에러 핸들러가 있으면 호출
      if (onError) {
        onError(error as Error);
      }
    }
  }, [event, filterPredicate, optimisticUpdate, updateQueryCache, onError]);
  
  // 쓰로틀된 이벤트 핸들러
  const throttledEventHandler = useCallback(
    _.throttle(handleEvent, throttleDelay, { leading: true, trailing: true }),
    [handleEvent, throttleDelay]
  );
  
  // 이벤트 이름을 저장하기 위한 ref
  const eventNameRef = useRef<string | undefined>(event);
  
  // 이벤트 구독 함수
  const subscribe = useCallback((eventName?: string) => {
    const targetEvent = eventName || event;
    
    if (!targetEvent) {
      logger.warn('useSocket', '이벤트 이름이 제공되지 않았습니다.');
      return;
    }
    
    if (isSubscribed) {
      logger.debug('useSocket', `이미 구독 중: ${targetEvent}`);
      return;
    }
    
    try {
      // 이벤트 이름 추적에 추가
      eventNamesRef.current.add(targetEvent);
      eventNameRef.current = targetEvent;
      
      if (useRxJS) {
        // RxJS 방식으로 구독
        const componentId = componentIdRef.current;
        
        // 필터 조건이 있으면 필터링된 Observable 사용
        let observable = filterPredicate
          ? socketService.fromFilteredEvent<TPayload>(targetEvent, filterPredicate, componentId)
          : socketService.fromEvent<TPayload>(targetEvent, componentId);
        
        // 구독 설정
        subscriptionRef.current = observable.subscribe({
          next: throttledEventHandler,
          error: (error) => {
            logger.error('useSocket', `이벤트 스트림 오류: ${targetEvent}`, error);
            
            if (onError) {
              onError(error);
            }
          }
        });
      }
      
      setIsSubscribed(true);
      logger.debug('useSocket', `이벤트 구독: ${targetEvent}`);
    } catch (error) {
      logger.error('useSocket', `이벤트 구독 중 오류 발생: ${targetEvent}`, error);
      if (onError) {
        onError(error as Error);
      }
    }
  }, [event, filterPredicate, useRxJS, isSubscribed, throttledEventHandler, onError]);
  
  // 구독 해제 함수
  const unsubscribe = useCallback((eventToUnsubscribe?: string) => {
    const actualEvent = eventToUnsubscribe || eventNameRef.current || event;
    if (!actualEvent) {
      logger.warn('useSocket', '구독 해제할 이벤트를 지정하지 않았습니다.');
      return;
    }
    
    // RxJS 구독이 있으면 해제
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }
    
    // 이벤트 이름 추적에서 제거
    eventNamesRef.current.delete(actualEvent);
    eventNameRef.current = undefined;
    
    setIsSubscribed(false);
    logger.debug('useSocket', `이벤트 구독 해제: ${actualEvent}`);
  }, [event]);
  
  // CVE 구독 관련 메소드(socketService에 위임)
  const subscribeCVE = useCallback((cveId: string) => {
    if (!cveId) return;
    socketService.subscribeCVE(cveId);
  }, []);
  
  const unsubscribeCVE = useCallback((cveId: string) => {
    if (!cveId) return;
    socketService.unsubscribeCVE(cveId);
  }, []);
  
  const isSubscribedToCVE = useCallback((cveId: string) => {
    return socketService.isSubscribedToCVE(cveId);
  }, []);
  
  // 구독 중인 CVE 목록을 상태로 관리
  const [subscribedCVEs, setSubscribedCVEs] = useState<string[]>(
    socketService.getSubscribedCVEs()
  );
  
  // CVE 구독 상태 변경 시 컴포넌트 상태 업데이트를 위한 효과
  useEffect(() => {
    const intervalId = setInterval(() => {
      const currentSubscribedCVEs = socketService.getSubscribedCVEs();
      // 함수형 업데이트를 사용하여 이전 상태와 비교
      setSubscribedCVEs(prev => {
        if (!_.isEqual(currentSubscribedCVEs.sort(), prev.sort())) {
          return currentSubscribedCVEs;
        }
        return prev;
      });
    }, 1000); // 1초마다 확인
      
    return () => clearInterval(intervalId);
  }, []); // 의존성 배열에서 subscribedCVEs 제거
  
  // 콜백 메모이제이션
  const memoizedCallback = useCallback(data => {
    // 필터 조건이 있고, 데이터가 조건을 만족하지 않으면 무시
    if (filterPredicate && !filterPredicate(data)) {
      return;
    }
    
    setLastReceivedData(data);
    callback?.(data);
  }, [callback, filterPredicate]);
  
  // 이벤트 리스너 등록 함수
  const on = useCallback(<T = any>(eventName: string, callback: (data: T) => void) => {
    // 이벤트 핸들러 맵 설정
    if (!eventHandlersRef.current.has(eventName)) {
      eventHandlersRef.current.set(eventName, new Set());
    }
    
    const handlers = eventHandlersRef.current.get(eventName)!;
    handlers.add(callback as any);
    
    logger.debug('useSocket', `이벤트 리스너 등록: ${eventName}`);
    
    // 정리 함수 반환
    return () => {
      const handlers = eventHandlersRef.current.get(eventName);
      if (handlers) {
        handlers.delete(callback as any);
        if (handlers.size === 0) {
          eventHandlersRef.current.delete(eventName);
        }
      }
      logger.debug('useSocket', `이벤트 리스너 제거: ${eventName}`);
    };
  }, []);
  
  // addEventListener는 on의 별칭
  const addEventListener = useCallback(<T = any>(eventName: string, callback: (data: T) => void) => {
    return on(eventName, callback);
  }, [on]);
  
  // 이벤트 리스너 제거 함수
  const off = useCallback(<T = any>(eventName: string, callback: (data: T) => void) => {
    const handlers = eventHandlersRef.current.get(eventName);
    if (handlers) {
      handlers.delete(callback as any);
      if (handlers.size === 0) {
        eventHandlersRef.current.delete(eventName);
      }
    }
    
    socketService.off(eventName, callback);
    logger.debug('useSocket', `이벤트 리스너 제거: ${eventName}`);
  }, []);
  
  // 일반 메시지 전송 함수
  const emit = useCallback((messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => {
    try {
      // 소켓을 통해 메시지 전송
      socketService.emit(messageEvent, data);
      
      // 로컬 업데이트 콜백이 제공된 경우 호출
      if (localUpdateCallback) {
        localUpdateCallback(data);
      }
      
      logger.debug('useSocket', `메시지 전송: ${messageEvent}`, data);
    } catch (error) {
      logger.error('useSocket', `메시지 전송 중 오류 발생: ${messageEvent}`, error);
      
      if (onError) {
        onError(error as Error);
      }
    }
  }, [onError]);
  
  // 디바운스된 메시지 전송 함수
  const debouncedEmit = useCallback(
    _.debounce((messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => {
      emit(messageEvent, data, localUpdateCallback);
    }, debounceDelay),
    [emit, debounceDelay]
  );
  
  // 쓰로틀된 메시지 전송 함수
  const throttledEmit = useCallback(
    _.throttle((messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => {
      emit(messageEvent, data, localUpdateCallback);
    }, throttleDelay, { leading: true, trailing: true }),
    [emit, throttleDelay]
  );
  
  // 이벤트 리스너 제거 함수 (off의 별칭)
  const removeEventListener = useCallback(<T = any>(eventName: string, callback: (data: T) => void) => {
    off(eventName, callback);
  }, [off]);
  
  // 이벤트 리스너 함수의 연결 상태에 대한 효과
  useEffect(() => {
    // 연결 상태 변경 시 콜백 호출
    if (onConnectionChange) {
      onConnectionChange(connected);
    }
    
    // 연결됐을 때 즉시 구독 설정
    // 중요: 소켓 연결은 App.jsx에서 관리
    if (connected && subscribeImmediately && event) {
      subscribe(event);
    }
    
  }, [connected, subscribeImmediately, event, subscribe, onConnectionChange]);

  // 소켓 연결 상태 검사
  useEffect(() => {
    // 경고: 여기서는 소켓 연결을 초기화하지 않음 (최상위 App.jsx에서 관리)
    if (!socketService.isSocketConnected() && process.env.NODE_ENV === 'development') {
      logger.warn('useSocket', '소켓이 연결되지 않았습니다. 연결은 App.jsx에서 관리됩니다.');
    }
  }, []);
  
  // 정리 함수
  const cleanup = useCallback(() => {
    try {
      // 구독 상태인 경우 구독 해제
      if (isSubscribed) {
        unsubscribe();
      }
      
      // RxJS 구독 취소
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      
      // 이벤트 핸들러 맵 정리
      eventHandlersRef.current.clear();
      eventNamesRef.current.clear();
      setIsSubscribed(false);
      setLastReceivedData(null);
      
      // 중요: 여기서는 소켓 연결을 해제하지 않음 (최상위 App.jsx에서 관리)
      logger.debug('useSocket', '이 컴포넌트의 이벤트 구독 정리 완료');
    } catch (error) {
      logger.error('useSocket', '정리 중 오류 발생', error);
    }
  }, []);
  
  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);
  
  // 훅 결과 반환
  return {
    // 기본 속성
    isSubscribed,
    subscribe,
    unsubscribe,
    on,
    addEventListener,
    off,
    removeEventListener: off,
    emit,
    emitDebounced: debouncedEmit,
    emitThrottled: throttledEmit,
    
    // 연결 상태 정보
    connected,
    connectionState,
    connectionError,
    socket: socketService.getSocket(),
    lastReceivedData,
    connectionState$: socketService.getConnectionState(),
    
    // 추가 유틸리티 함수
    cleanup,
    
    // CVE 구독 관련 메소드
    subscribeCVE,
    unsubscribeCVE,
    isSubscribedToCVE,
    subscribedCVEs
  };
}

/**
 * useSocketEventListener 훅
 * 
 * 웹소켓 이벤트 리스너를 관리하는 훅으로, 기존 코드와의 호환성을 위해 제공됩니다.
 * 내부적으로는 useSocket 훅을 사용합니다.
 * 
 * @param eventName - 구독할 이벤트 이름
 * @param callback - 이벤트 발생 시 호출될 콜백 함수
 * @param deps - 콜백 함수의 의존성 배열
 * @param options - 이벤트 리스너 옵션
 * @returns 이벤트 리스너 제어 객체
 */
export function useSocketEventListener<T = any>(
  eventName: string,
  callback: (data: T) => void,
  deps: React.DependencyList = [],
  options: {
    useRxJS?: boolean;
    subscribeImmediately?: boolean;
    filterPredicate?: (data: T) => boolean;
    componentId?: string;
  } = {}
): { isSubscribed: boolean; subscribe: () => void; unsubscribe: () => void; emit: (data: any) => void } {
  const socket = useSocket<any, T>(
    eventName, 
    callback, 
    deps, 
    {
      ...options,
      subscribeImmediately: options.subscribeImmediately !== false
    }
  );
  
  // 호환성을 위한 간소화된 인터페이스 반환
  return {
    isSubscribed: socket.isSubscribed,
    subscribe: () => socket.subscribe(eventName),
    unsubscribe: () => socket.unsubscribe(eventName),
    emit: (data: any) => socket.emit(eventName, data)
  };
}

export default useSocket;