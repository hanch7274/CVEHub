import { useEffect, useRef, useCallback, useState } from 'react';
import socketIOService from '../../services/socketio/socketio';
import logger from '../../utils/logging';
import { useQueryClient, QueryKey } from '@tanstack/react-query';
import _ from 'lodash'; // 전체 lodash 가져오기 대신 특정 함수만 import하는 것이 더 좋습니다
import { 
  CONNECTION_EVENTS, 
  SOCKET_STATE, 
  ConnectionEvent, 
  SocketState, 
  SocketEventHandler 
} from '../../services/socketio/constants';

/**
 * 웹소켓 훅 옵션 인터페이스
 */
export interface WebSocketHookOptions<TData = any, TPayload = any> {
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
   * @param oldData 기존 캐시된 데이터
   * @param newData 소켓으로부터 받은 새 데이터
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
 * 웹소켓 훅 반환 인터페이스
 */
export interface WebSocketHookResult<TPayload = any> {
  /** 일반 메시지 전송 함수 */
  sendMessage: (messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => void;
  
  /** 디바운스된 메시지 전송 함수 */
  sendMessageDebounced: (messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => void;
  
  /** 소켓 연결 상태 */
  connected: boolean;
  
  /** 이벤트 구독 함수 */
  subscribe: (event: string, handler: (data: TPayload) => void) => () => void;
  
  /** 가장 최근에 수신한 데이터 */
  lastReceivedData: TPayload | null;
}

/**
 * 웹소켓 이벤트를 구독하고 처리하는 훅
 * @param event 구독할 이벤트 이름
 * @param callback 이벤트 발생 시 호출될 콜백 함수
 * @param options 훅 옵션
 * @returns 메시지 전송 함수와 디바운스된 메시지 전송 함수
 */
function useWebSocketHook<TData = any, TPayload = any>(
  event: string,
  callback: (data: TPayload) => void,
  options: WebSocketHookOptions<TData, TPayload> = {}
): WebSocketHookResult<TPayload> {
  // 최신 콜백 함수를 참조하기 위한 ref
  const callbackRef = useRef<(data: TPayload) => void>(callback);
  const optionsRef = useRef<WebSocketHookOptions<TData, TPayload>>(options);
  const queryClient = useQueryClient();
  
  // 소켓 연결 상태
  const [connected, setConnected] = useState<boolean>(socketIOService.isSocketConnected());
  
  // 마지막으로 수신한 데이터
  const [lastReceivedData, setLastReceivedData] = useState<TPayload | null>(null);
  
  // 이벤트 이름 및 핸들러 추적
  const eventNamesRef = useRef<Set<string>>(new Set());
  const eventHandlersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  
  // 콜백 함수가 변경될 때마다 ref 업데이트
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  // 옵션이 변경될 때마다 ref 업데이트
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  
  // 쿼리 캐시 업데이트 함수
  const updateQueryCache = useCallback((data: TPayload) => {
    try {
      const currentOptions = optionsRef.current;
      
      // 옵션 또는 쿼리 키가 없으면 무시
      if (!currentOptions || !currentOptions.queryKey) return;
      
      // 쿼리 키 가져오기
      const queryKey = currentOptions.queryKey;
      
      if (currentOptions.directUpdate && currentOptions.updateDataFn) {
        // 직접 업데이트 방식
        queryClient.setQueryData(
          queryKey,
          (oldData: TData) => {
            return currentOptions.updateDataFn!(oldData, data);
          }
        );
        
        logger.debug('useWebSocketHook', '캐시 직접 업데이트 완료');
      } else {
        // 쿼리 무효화 방식
        queryClient.invalidateQueries({ queryKey });
        logger.debug('useWebSocketHook', '캐시 무효화 완료', { queryKey });
      }
    } catch (error) {
      logger.error('useWebSocketHook', '캐시 업데이트 중 오류 발생', error);
      
      // 에러 핸들러가 있으면 호출
      if (optionsRef.current.onError) {
        optionsRef.current.onError(error as Error);
      }
    }
  }, [queryClient]);
  
  // 최적화: 쓰로틀링된 이벤트 핸들러 함수
  const throttledEventHandler = useCallback(
    _.throttle((eventName: string, data: TPayload) => {
      try {
        logger.debug(
          'useWebSocketHook', 
          `이벤트 수신: ${eventName}`, 
          { dataType: typeof data, isArray: Array.isArray(data) }
        );
        
        // 마지막 수신 데이터 업데이트
        setLastReceivedData(data);
        
        // 낙관적 업데이트 처리
        if (optionsRef.current.optimisticUpdate) {
          updateQueryCache(data);
        }
        
        // 콜백 호출
        callbackRef.current(data);
        
        // 해당 이벤트에 등록된 모든 핸들러 호출
        const handlers = eventHandlersRef.current.get(eventName);
        if (handlers) {
          handlers.forEach(handler => {
            try {
              handler(data);
            } catch (handlerError) {
              logger.error(
                'useWebSocketHook', 
                `이벤트 핸들러 실행 중 오류: ${eventName}`, 
                handlerError
              );
            }
          });
        }
      } catch (error) {
        logger.error(
          'useWebSocketHook', 
          `이벤트 처리 중 오류 발생: ${eventName}`, 
          error
        );
        
        // 에러 핸들러가 있으면 호출
        if (optionsRef.current.onError) {
          optionsRef.current.onError(error as Error);
        }
      }
    }, options.throttleDelay || 150, { leading: true, trailing: true }),
    [updateQueryCache]
  );
  
  // 소켓 연결 상태 변경 핸들러
  const handleConnectionChange = useCallback((connected: boolean) => {
    setConnected(connected);
    
    // 연결 상태 변경 콜백이 있으면 호출
    if (optionsRef.current.onConnectionChange) {
      optionsRef.current.onConnectionChange(connected);
    }
    
    logger.info('useWebSocketHook', `소켓 연결 상태 변경: ${connected ? '연결됨' : '연결 끊김'}`);
  }, []);
  
  // 이벤트 구독 함수
  const subscribe = useCallback((eventName: string, handler: (data: any) => void) => {
    if (!eventName) {
      logger.warn('useWebSocketHook', '이벤트 이름이 제공되지 않았습니다.');
      return () => {}; // 빈 클린업 함수 반환
    }
    
    // 이벤트 이름 추적에 추가
    eventNamesRef.current.add(eventName);
    
    // 핸들러 맵에 추가
    if (!eventHandlersRef.current.has(eventName)) {
      eventHandlersRef.current.set(eventName, new Set());
    }
    
    const handlers = eventHandlersRef.current.get(eventName)!;
    handlers.add(handler);
    
    // 소켓 이벤트 리스너가 등록되었는지 확인
    const socketHandler = (data: any) => throttledEventHandler(eventName, data);
    
    // 이벤트 리스너 등록
    socketIOService.on(eventName, socketHandler);
    
    logger.debug('useWebSocketHook', `이벤트 구독 추가: ${eventName}`);
    
    // 클린업 함수 반환
    return () => {
      // 핸들러 맵에서 제거
      const handlers = eventHandlersRef.current.get(eventName);
      if (handlers) {
        handlers.delete(handler);
        
        // 핸들러가 없으면 맵에서 이벤트 항목 제거
        if (handlers.size === 0) {
          eventHandlersRef.current.delete(eventName);
          eventNamesRef.current.delete(eventName);
          
          // 소켓 이벤트 리스너 제거
          socketIOService.off(eventName, socketHandler);
          
          logger.debug('useWebSocketHook', `이벤트 구독 완전히 제거: ${eventName}`);
        }
      }
      
      logger.debug('useWebSocketHook', `이벤트 핸들러 제거: ${eventName}`);
    };
  }, [throttledEventHandler]);
  
  // 이벤트 리스너 등록 및 해제
  useEffect(() => {
    // 이벤트 이름이 없으면 무시
    if (!event) {
      if (process.env.NODE_ENV === 'development') {
        const stackTrace = new Error().stack || '';
        const stackLines = stackTrace.split('\n');
        const callerInfo = stackLines.length > 2 ? stackLines[2].trim() : '알 수 없는 위치';
        
        logger.warn(
          'useWebSocketHook', 
          `이벤트 이름이 제공되지 않았습니다. 호출 위치: ${callerInfo}`
        );
      }
      return;
    }
    
    // 소켓 연결 이벤트 리스너 등록
    const connectionHandler = (connected: boolean) => handleConnectionChange(connected);
    socketIOService.on(CONNECTION_EVENTS.CONNECTION_STATE_CHANGE, connectionHandler);
    
    // 초기 연결 상태 설정
    setConnected(socketIOService.isSocketConnected());
    
    // 현재 이벤트 구독
    const unsubscribe = subscribe(event, throttledEventHandler);
    
    // 컴포넌트 언마운트 시 이벤트 리스너 해제
    return () => {
      // 연결 이벤트 리스너 해제
      socketIOService.off(CONNECTION_EVENTS.CONNECTION_STATE_CHANGE, connectionHandler);
      
      // 이벤트 구독 해제
      unsubscribe();
      
      // 쓰로틀된 함수 취소
      throttledEventHandler.cancel();
    };
  }, [event, subscribe, throttledEventHandler, handleConnectionChange]);
  
  // 메시지 전송 함수 - 낙관적 업데이트 지원
  const sendMessage = useCallback((messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => {
    try {
      logger.debug(
        'useWebSocketHook', 
        `메시지 전송: ${messageEvent}`, 
        { dataType: typeof data, hasCallback: !!localUpdateCallback }
      );
      
      // 로컬 업데이트 콜백이 제공된 경우 즉시 실행
      if (localUpdateCallback) {
        localUpdateCallback(data);
      }
      
      // 소켓을 통해 메시지 전송
      socketIOService.emit(messageEvent, data);
    } catch (error) {
      logger.error(
        'useWebSocketHook', 
        `메시지 전송 중 오류 발생: ${messageEvent}`, 
        error
      );
      
      // 에러 핸들러가 있으면 호출
      if (optionsRef.current.onError) {
        optionsRef.current.onError(error as Error);
      }
    }
  }, []);

  // 디바운스된 메시지 전송 함수
  const sendMessageDebounced = useCallback(
    _.debounce((messageEvent: string, data: any, localUpdateCallback?: (data: any) => void) => {
      try {
        logger.debug(
          'useWebSocketHook', 
          `디바운스된 메시지 전송: ${messageEvent}`, 
          { dataType: typeof data, hasCallback: !!localUpdateCallback }
        );
        
        // 로컬 업데이트 콜백이 제공된 경우 즉시 실행
        if (localUpdateCallback) {
          localUpdateCallback(data);
        }
        
        // 소켓을 통해 메시지 전송
        socketIOService.emit(messageEvent, data);
      } catch (error) {
        logger.error(
          'useWebSocketHook', 
          `디바운스된 메시지 전송 중 오류 발생: ${messageEvent}`, 
          error
        );
        
        // 에러 핸들러가 있으면 호출
        if (optionsRef.current.onError) {
          optionsRef.current.onError(error as Error);
        }
      }
    }, options.debounceDelay || 300),
    []
  );
  
  // 컴포넌트 언마운트 시 디바운스 함수 취소
  useEffect(() => {
    return () => {
      // 디바운스 함수 취소
      sendMessageDebounced.cancel && sendMessageDebounced.cancel();
    };
  }, [sendMessageDebounced]);
  
  return {
    sendMessage,
    sendMessageDebounced,
    connected,
    subscribe,
    lastReceivedData
  };
};

export default useWebSocketHook;