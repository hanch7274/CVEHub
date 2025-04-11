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
  // 옵션 설정
  const {
    useRxJS = false,
    subscribeImmediately = true,
    filterPredicate,
    componentId = uuidv4(),
    optimisticUpdate = false,
    queryKey,
    directUpdate = false,
    updateDataFn,
    debounceDelay = 300,
    throttleDelay = 300,
    onError,
    onConnectionChange
  } = options;
  
  // 훅 상태
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [lastReceivedData, setLastReceivedData] = useState<TPayload | null>(null);
  
  // 쿼리 클라이언트
  const queryClient = useQueryClient();
  
  // 레퍼런스
  const callbackRef = useRef<((data: TPayload) => void) | undefined>(callback);
  const eventRef = useRef<string | undefined>(event);
  const subscriptionRef = useRef<Subscription | null>(null);
  const eventHandlersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const eventNamesRef = useRef<Set<string>>(new Set());
  const debouncedFnRef = useRef<{[key: string]: _.DebouncedFunc<any>}>({});
  const throttledFnRef = useRef<{[key: string]: _.ThrottleFunc<any>}>({});
  const subscribedCVEsRef = useRef<Set<string>>(new Set());
  const onErrorRef = useRef<((error: Error) => void) | undefined>(onError);
  
  // 소켓 스토어에서 상태 가져오기
  const socketState = useSocketStore();
  const {
    connected,
    connectionState,
    connectionError
  } = socketState;
  
  // 콜백 업데이트
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  // 이벤트 업데이트
  useEffect(() => {
    eventRef.current = event;
  }, [event]);
  
  // onError 콜백 업데이트
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  
  // 필터링된 콜백 생성
  const filteredCallback = useCallback((data: TPayload) => {
    // 필터링 조건이 있고 데이터가 조건을 만족하지 않으면 무시
    if (filterPredicate && !filterPredicate(data)) {
      return;
    }
    
    // 최근 수신 데이터 업데이트
    setLastReceivedData(data);
    
    // 콜백 호출
    if (callbackRef.current) {
      callbackRef.current(data);
    }
    
    // React Query 통합 - 최적화된 로컬 업데이트 또는 무효화
    if (queryKey && data) {
      if (directUpdate && updateDataFn) {
        // 직접 업데이트
        queryClient.setQueryData(queryKey, (oldData: TData) => {
          return updateDataFn(oldData, data);
        });
      } else if (optimisticUpdate) {
        // 낙관적 업데이트 (무효화 + 로컬 업데이트)
        queryClient.invalidateQueries({ queryKey });
      } else {
        // 기본 무효화
        queryClient.invalidateQueries({ queryKey });
      }
    }
  }, [queryKey, optimisticUpdate, filterPredicate, directUpdate, updateDataFn, queryClient]);
  
  // 이벤트 구독 함수
  const subscribe = useCallback((newEvent?: string) => {
    try {
      const targetEvent = newEvent || eventRef.current;
      
      if (!targetEvent) {
        logger.warn('useSocket', '구독할 이벤트를 지정하지 않았습니다.');
        return;
      }
      
      // 이미 같은 이벤트를 구독 중이면 무시
      if (eventNamesRef.current.has(targetEvent)) {
        return;
      }
      
      // 이벤트 구독 (RxJS 사용 여부에 따라 다른 방식 적용)
      if (useRxJS) {
        if (subscriptionRef.current) {
          subscriptionRef.current.unsubscribe();
        }
        
        // RxJS 사용 시 Observable 구독
        subscriptionRef.current = socketService.fromEvent<TPayload>(targetEvent)
          .subscribe({
            next: filteredCallback,
            error: (error) => {
              if (onErrorRef.current) {
                onErrorRef.current(error);
              } else {
                logger.error('useSocket', `이벤트 [${targetEvent}] 처리 중 오류 발생`, error);
              }
            }
          });
      } else {
        // 일반 콜백 기반 구독
        const handler = (data: TPayload) => filteredCallback(data);
        
        // 콜백을 이벤트 핸들러 맵에 추가
        if (!eventHandlersRef.current.has(targetEvent)) {
          eventHandlersRef.current.set(targetEvent, new Set());
        }
        
        const handlers = eventHandlersRef.current.get(targetEvent);
        if (handlers) {
          handlers.add(handler);
        }
        
        // 이벤트 수신 시작
        socketService.on(targetEvent, handler);
      }
      
      // 이벤트 이름 추가 및 구독 상태 업데이트
      eventNamesRef.current.add(targetEvent);
      setIsSubscribed(true);
      logger.debug('useSocket', `이벤트 [${targetEvent}] 구독 시작`);
      
    } catch (error) {
      logger.error('useSocket', '이벤트 구독 중 오류 발생', error);
      if (onErrorRef.current) {
        onErrorRef.current(error as Error);
      }
    }
  }, [filteredCallback, useRxJS]);
  
  // 이벤트 구독 해제 함수
  const unsubscribe = useCallback((targetEvent?: string) => {
    try {
      // 모든 이벤트 처리 또는 특정 이벤트 처리
      const eventsToUnsubscribe = targetEvent 
        ? (eventNamesRef.current.has(targetEvent) ? [targetEvent] : [])
        : Array.from(eventNamesRef.current);
      
      if (eventsToUnsubscribe.length === 0) {
        return;
      }
      
      // 각 이벤트 구독 해제
      for (const evt of eventsToUnsubscribe) {
        // RxJS 사용 시 구독 취소
        if (useRxJS && subscriptionRef.current) {
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
        } else {
          // 등록된 모든 핸들러 제거
          const handlers = eventHandlersRef.current.get(evt);
          if (handlers) {
            handlers.forEach(handler => {
              socketService.off(evt, handler);
            });
            handlers.clear();
          }
        }
        
        // 이벤트 이름 목록에서 제거
        eventNamesRef.current.delete(evt);
        eventHandlersRef.current.delete(evt);
        logger.debug('useSocket', `이벤트 [${evt}] 구독 해제`);
      }
      
      // 구독 중인 이벤트가 없으면 구독 상태 업데이트
      if (eventNamesRef.current.size === 0) {
        setIsSubscribed(false);
      }
      
    } catch (error) {
      logger.error('useSocket', '이벤트 구독 해제 중 오류 발생', error);
      if (onErrorRef.current) {
        onErrorRef.current(error as Error);
      }
    }
  }, [useRxJS]);
  
  // 이벤트 리스너 등록 함수
  const on = useCallback(<T = any>(eventName: string, callback: (data: T) => void) => {
    try {
      // 이벤트 핸들러 맵에 이벤트 추가
      if (!eventHandlersRef.current.has(eventName)) {
        eventHandlersRef.current.set(eventName, new Set());
      }
      
      // 핸들러 추가
      const handlers = eventHandlersRef.current.get(eventName);
      if (handlers) {
        handlers.add(callback as any);
      }
      
      // 이벤트 수신 시작
      socketService.on(eventName, callback);
      
      // 이벤트 이름 추가
      eventNamesRef.current.add(eventName);
      
      // 제거 함수 반환
      return () => {
        const handlers = eventHandlersRef.current.get(eventName);
        if (handlers) {
          handlers.delete(callback as any);
        }
        socketService.off(eventName, callback);
        
        // 핸들러가 없으면 이벤트 이름 제거
        if (handlers && handlers.size === 0) {
          eventNamesRef.current.delete(eventName);
          eventHandlersRef.current.delete(eventName);
        }
      };
    } catch (error) {
      logger.error('useSocket', `이벤트 리스너 등록 중 오류 발생 (${eventName})`, error);
      if (onErrorRef.current) {
        onErrorRef.current(error as Error);
      }
      // 더미 제거 함수 반환
      return () => {};
    }
  }, []);
  
  // 이벤트 리스너 제거 함수
  const off = useCallback(<T = any>(eventName: string, callback: (data: T) => void) => {
    try {
      // 핸들러 제거
      const handlers = eventHandlersRef.current.get(eventName);
      if (handlers) {
        handlers.delete(callback as any);
      }
      
      // 소켓 이벤트 리스너 제거
      socketService.off(eventName, callback);
      
      // 핸들러가 없으면 이벤트 이름 제거
      if (handlers && handlers.size === 0) {
        eventNamesRef.current.delete(eventName);
        eventHandlersRef.current.delete(eventName);
      }
      
    } catch (error) {
      logger.error('useSocket', `이벤트 리스너 제거 중 오류 발생 (${eventName})`, error);
      if (onErrorRef.current) {
        onErrorRef.current(error as Error);
      }
    }
  }, []);
  
  // 이벤트 리스너 등록 함수 (on의 별칭)
  const addEventListener = useCallback(<T = any>(eventName: string, callback: (data: T) => void) => {
    return on(eventName, callback);
  }, [on]);
  
  // 메시지 전송 함수
  const emit = useCallback((messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => {
    try {
      if (!connected) {
        logger.warn('useSocket', '소켓이 연결되지 않았습니다. 메시지를 전송할 수 없습니다.');
        return;
      }
      
      // 로컬 업데이트 (제공된 경우)
      if (localUpdateCallback) {
        localUpdateCallback(data);
      }
      
      // 메시지 전송
      socketService.emit(messageEvent, data);
      
    } catch (error) {
      logger.error('useSocket', `메시지 전송 중 오류 발생 (${messageEvent})`, error);
      if (onErrorRef.current) {
        onErrorRef.current(error as Error);
      }
    }
  }, [connected]);
  
  // 디바운스된 메시지 전송 함수
  const debouncedEmit = useCallback((messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => {
    try {
      // 디바운스 함수가 없으면 생성
      if (!debouncedFnRef.current[messageEvent]) {
        debouncedFnRef.current[messageEvent] = _.debounce(
          (eventData: any, callback?: (data: any) => void) => {
            emit(messageEvent, eventData, callback);
          },
          debounceDelay
        );
      }
      
      // 디바운스된 함수 호출
      debouncedFnRef.current[messageEvent](data, localUpdateCallback);
      
    } catch (error) {
      logger.error('useSocket', `디바운스된 메시지 전송 중 오류 발생 (${messageEvent})`, error);
      if (onErrorRef.current) {
        onErrorRef.current(error as Error);
      }
    }
  }, [emit, debounceDelay]);
  
  // 쓰로틀된 메시지 전송 함수
  const throttledEmit = useCallback((messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => {
    try {
      // 쓰로틀 함수가 없으면 생성
      if (!throttledFnRef.current[messageEvent]) {
        throttledFnRef.current[messageEvent] = _.throttle(
          (eventData: any, callback?: (data: any) => void) => {
            emit(messageEvent, eventData, callback);
          },
          throttleDelay
        );
      }
      
      // 쓰로틀된 함수 호출
      throttledFnRef.current[messageEvent](data, localUpdateCallback);
      
    } catch (error) {
      logger.error('useSocket', `쓰로틀된 메시지 전송 중 오류 발생 (${messageEvent})`, error);
      if (onErrorRef.current) {
        onErrorRef.current(error as Error);
      }
    }
  }, [emit, throttleDelay]);
  
  // CVE 구독 관련 메서드들
  // 리팩토링: 이전 각각의 메서드 대신 socketService의 updateSubscription 메서드 사용
  const subscribeCVE = useCallback((cveId: string) => {
    try {
      if (!connected) {
        logger.warn('useSocket', '소켓이 연결되지 않았습니다. CVE를 구독할 수 없습니다.');
        return;
      }
      
      // 이미 구독 중인 경우 중복 요청 방지
      if (subscribedCVEsRef.current.has(cveId)) {
        return;
      }
      
      // 구독 상태 업데이트
      socketService.updateSubscription(cveId, true);
      
      // 로컬 상태 업데이트
      subscribedCVEsRef.current.add(cveId);
      
    } catch (error) {
      logger.error('useSocket', `CVE 구독 중 오류 발생 (${cveId})`, error);
      if (onErrorRef.current) {
        onErrorRef.current(error as Error);
      }
    }
  }, [connected]);
  
  // CVE 구독 해제 메서드
  const unsubscribeCVE = useCallback((cveId: string) => {
    try {
      if (!connected) {
        logger.warn('useSocket', '소켓이 연결되지 않았습니다. CVE 구독을 해제할 수 없습니다.');
        return;
      }
      
      // 구독 중이 아닌 경우 중복 요청 방지
      if (!subscribedCVEsRef.current.has(cveId)) {
        return;
      }
      
      // 구독 상태 업데이트
      socketService.updateSubscription(cveId, false);
      
      // 로컬 상태 업데이트
      subscribedCVEsRef.current.delete(cveId);
      
    } catch (error) {
      logger.error('useSocket', `CVE 구독 해제 중 오류 발생 (${cveId})`, error);
      if (onErrorRef.current) {
        onErrorRef.current(error as Error);
      }
    }
  }, [connected]);
  
  // CVE 구독 상태 확인 메서드
  const isSubscribedToCVE = useCallback((cveId: string) => {
    return subscribedCVEsRef.current.has(cveId);
  }, []);
  
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
  }, [isSubscribed, unsubscribe]);
  
  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);
  
  // 소켓 연결 상태 Observable 생성 (캐싱 적용)
  const connectionState$ = useRef<Observable<string>>(
    socketService.connectionState$()
  ).current;
  
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
    connectionState$,
    
    // 추가 유틸리티 함수
    cleanup,
    
    // CVE 구독 관련 메소드
    subscribeCVE,
    unsubscribeCVE,
    isSubscribedToCVE,
    subscribedCVEs: Array.from(subscribedCVEsRef.current)
  };
}

// 전역 오류 핸들러 추가
useSocket.error = function(error: Error): void {
  logger.error('useSocket.global', '소켓 오류 발생', error);
};

// export default useSocket로도 사용할 수 있도록 설정
export default useSocket;