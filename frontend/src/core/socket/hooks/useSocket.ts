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
}

/**
 * 통합 웹소켓 훅
 * 
 * socketService를 활용하여 웹소켓 연결 및 이벤트 처리를 간소화하는 통합 훅입니다.
 * useSocketMigration, useSocketEventListener, useWebSocketWithStore의 기능을 통합하여
 * 단일 인터페이스를 제공합니다.
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
        
        logger.debug('useSocket', `RxJS로 이벤트 구독: ${targetEvent}`, { componentId });
      } else {
        // 기존 방식으로 구독
        socketService.on(targetEvent, throttledEventHandler as any);
        logger.debug('useSocket', `기존 방식으로 이벤트 구독: ${targetEvent}`);
      }
      
      setIsSubscribed(true);
    } catch (error) {
      logger.error('useSocket', `이벤트 구독 중 오류: ${targetEvent}`, error);
      
      if (onError) {
        onError(error as Error);
      }
    }
  }, [event, isSubscribed, useRxJS, filterPredicate, throttledEventHandler, onError]);
  
  // 구독 해제 함수
  const unsubscribe = useCallback((eventName?: string) => {
    const targetEvent = eventName || event;
    
    if (!targetEvent) {
      logger.warn('useSocket', '이벤트 이름이 제공되지 않았습니다.');
      return;
    }
    
    if (!isSubscribed) {
      logger.debug('useSocket', `이미 구독 해제됨: ${targetEvent}`);
      return;
    }
    
    try {
      if (useRxJS) {
        // RxJS 구독 해제
        if (subscriptionRef.current) {
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
        }
        
        // socketService에서 컴포넌트 정리
        socketService.cleanup(componentIdRef.current);
      } else {
        // 기존 방식 구독 해제
        socketService.off(targetEvent, throttledEventHandler as any);
      }
      
      // 이벤트 이름 추적에서 제거
      eventNamesRef.current.delete(targetEvent);
      
      setIsSubscribed(false);
      logger.debug('useSocket', `이벤트 구독 해제: ${targetEvent}`);
    } catch (error) {
      logger.error('useSocket', `이벤트 구독 해제 중 오류: ${targetEvent}`, error);
      
      if (onError) {
        onError(error as Error);
      }
    }
  }, [event, isSubscribed, useRxJS, throttledEventHandler, onError]);
  
  // 이벤트 리스너 등록 함수
  const on = useCallback(<T = any>(eventName: string, callback: (data: T) => void) => {
    // 이벤트 핸들러 맵 설정
    if (!eventHandlersRef.current.has(eventName)) {
      eventHandlersRef.current.set(eventName, new Set());
    }
    
    const handlers = eventHandlersRef.current.get(eventName)!;
    handlers.add(callback as any);
    
    // 실제 이벤트 리스너 등록
    const unsubscribe = socketService.on(eventName, callback);
    
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
      unsubscribe();
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
  
  // 기본 이벤트 발신 함수
  const emit = useCallback((messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => {
    try {
    
      // 소켓 연결 상태 확인
      if (!socketService.isSocketConnected()) {
        logger.warn('useSocket', `소켓 연결 없이 메시지 전송 시도: ${messageEvent}`);
        return;
      }
      
      logger.debug('useSocket', `메시지 전송: ${messageEvent}`);
      
      // 로컬 업데이트 콜백이 제공된 경우 즉시 실행
      if (localUpdateCallback) {
        localUpdateCallback(data);
      }
      
      // 소켓을 통해 메시지 전송
      socketService.emit(messageEvent, data);
    } catch (error) {
      logger.error('useSocket', `메시지 전송 중 오류 발생: ${messageEvent}`, error);
      
      if (onError) {
        onError(error as Error);
      }
    }
  }, [onError]);
  
  // 디바운스된 메시지 전송 함수
  const emitDebounced = useCallback(
    _.debounce((messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => {
      emit(messageEvent, data, localUpdateCallback);
    }, debounceDelay),
    [emit, debounceDelay]
  );
  
  // 쓰로틀된 메시지 전송 함수
  const emitThrottled = useCallback(
    _.throttle((messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => {
      emit(messageEvent, data, localUpdateCallback);
    }, throttleDelay, { leading: true, trailing: true }),
    [emit, throttleDelay]
  );
  
  // 연결 상태 변경 감지 및 처리
  useEffect(() => {
    // 연결 상태 변경 시 콜백 호출
    if (onConnectionChange) {
      onConnectionChange(connected);
    }
    
    // 연결되었고 자동 구독이 활성화된 경우 구독
    if (connected && subscribeImmediately && event && !isSubscribed) {
      subscribe();
    }
  }, [connected, event, isSubscribed, subscribe, subscribeImmediately, onConnectionChange]);
  
  // 정리 함수
  const cleanup = useCallback(() => {
    try {
      // 구독 상태인 경우 구독 해제
      if (isSubscribed && event) {
        unsubscribe();
      }
      
      // socketService에서 컴포넌트 정리
      socketService.cleanup(componentIdRef.current);
      
      // 쓰로틀, 디바운스 함수 취소
      throttledEventHandler.cancel && throttledEventHandler.cancel();
      emitDebounced.cancel && emitDebounced.cancel();
      emitThrottled.cancel && emitThrottled.cancel();
      
      logger.debug('useSocket', '리소스 정리 완료', { componentId: componentIdRef.current });
    } catch (error) {
      logger.error('useSocket', '정리 중 오류 발생', error);
    }
  }, [isSubscribed, event, unsubscribe, throttledEventHandler, emitDebounced, emitThrottled]);
  
  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return cleanup;
  }, [cleanup]);
  
  // 결과 반환
  return {
    isSubscribed,
    subscribe,
    unsubscribe,
    on,
    addEventListener,
    off,
    emit,
    emitDebounced,
    emitThrottled,
    connected,
    connectionState,
    connectionError,
    socket: socketService.getSocket(),
    lastReceivedData,
    connectionState$: socketService.getConnectionState(),
    cleanup
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
) {
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

/**
 * useSocketMigration 훅
 * 
 * 기존 SocketIOContext에서 새로운 useSocket 훅으로의 점진적 마이그레이션을 
 * 지원하는 훅으로, 기존 코드와의 호환성을 위해 제공됩니다.
 * 
 * @returns 마이그레이션 지원 객체
 */
export function useSocketMigration() {
  const socket = useSocket();
  const componentIdRef = useRef<string>(uuidv4());
  
  // 마이그레이션 유틸리티 함수
  const migrateEvent = useCallback(<T = any>(
    eventName: string,
    legacyCallback: (data: T) => void,
    componentId: string = componentIdRef.current
  ) => {
    // socketService의 fromEvent 메서드를 사용한 구독
    const subscription = socketService
      .fromEvent<T>(eventName, componentId)
      .subscribe({
        next: legacyCallback,
        error: (err) => {
          logger.error('useSocketMigration', `마이그레이션된 이벤트 스트림 오류: ${eventName}`, err);
        }
      });
    
    logger.info('useSocketMigration', `이벤트 마이그레이션 완료: ${eventName}`, { componentId });
    
    // 정리 함수 반환
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  
  // useCVEQuery와 호환되는 구독 메소드
  const subscribe = useCallback(<T = any>(
    eventName: string,
    callback: (data: T) => void
  ) => {
    const unsubscribeFn = socket.on(eventName, callback);
    
    return {
      unsubscribe: unsubscribeFn
    };
  }, [socket]);
  
  // getLegacySocketInterface 메소드 제공
  const getLegacySocketInterface = useCallback(() => {
    return {
      socket: socketService.getSocket(),
      connected: socketService.isSocketConnected(),
      isReady: socketService.isSocketConnected(),
      error: null,
      on: socket.on,
      addEventListener: socket.addEventListener,
      emit: socket.emit,
      subscribe
    };
  }, [socket, subscribe]);
  
  return {
    ...socket,
    migrateEvent,
    subscribe,
    fromEvent: socketService.fromEvent,
    getConnectionState: socketService.getConnectionState,
    getLegacySocketInterface
  };
}

/**
 * useWebSocketWithStore 훅
 * 
 * 기존 useWebSocketWithStore 훅과의 호환성을 위해 제공되는 훅입니다.
 * 내부적으로는 useSocket 훅을 사용합니다.
 * 
 * @param event - 구독할 이벤트 이름
 * @param callback - 이벤트 발생 시 호출될 콜백 함수
 * @param options - 훅 옵션
 * @returns 웹소켓 제어 객체
 */
export function useWebSocketWithStore<TData = any, TPayload = any>(
  event: string,
  callback: (data: TPayload) => void,
  options: Partial<SocketHookOptions<TData, TPayload>> = {}
) {
  const socket = useSocket<TData, TPayload>(event, callback, [], {
    ...options,
    subscribeImmediately: true
  });
  
  return {
    sendMessage: socket.emit,
    sendMessageDebounced: socket.emitDebounced,
    connected: socket.connected,
    subscribe: socket.on,
    lastReceivedData: socket.lastReceivedData,
    connectionState: socket.connectionState,
    connectionError: socket.connectionError
  };
}

export default useSocket;