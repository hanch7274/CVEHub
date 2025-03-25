import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import socketIOService from '../services/socketio/socketio';
import logger from '../utils/logging';
import { SOCKET_STATE, SOCKET_EVENTS } from '../services/socketio/constants';
import { getAccessToken } from '../utils/storage/tokenStorage';
import { SOCKET_CONFIG } from '../config';
import { Socket } from 'socket.io-client';

// 이벤트 핸들러 타입 정의
type EventHandler = (data: any) => void;

interface EventHandlers {
  [key: string]: EventHandler[];
}

interface PendingSubscriptions {
  [key: string]: EventHandler[];
}

// Provider Props 인터페이스
interface SocketIOProviderProps {
  children: ReactNode;
}

// Context 생성
const SocketIOContext = createContext<SocketContextType | null>(null);

/**
 * Socket.IO Provider 컴포넌트
 * 중앙집중형 웹소켓 관리 담당
 */
const SocketIOProvider: React.FC<SocketIOProviderProps> = ({ children }) => {
  // 상태 관리
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  // 이벤트 핸들러는 ref로 관리하여 상태 업데이트로 인한 무한 루프 방지
  const eventHandlersRef = useRef<EventHandlers>({});
  // 대기 중인 구독 관리를 위한 ref 추가
  const pendingSubscriptionsRef = useRef<PendingSubscriptions>({});
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  
  // Refs
  const tokenRef = useRef<string | null>(getAccessToken());
  const shouldConnectRef = useRef<boolean>(false);
  const reconnectAttemptsRef = useRef<number>(0);
  const socketInstanceRef = useRef<Socket | null>(null);
  const connectionCheckerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const globalEventHandlersRef = useRef<EventHandlers>({});
  const isAuthenticatedRef = useRef<boolean>(false);
  const initializedRef = useRef(false);
  
  // 재시도 관련 상수 - 중앙 config 사용
  const maxRetries = SOCKET_CONFIG.RECONNECTION_ATTEMPTS;
  const reconnectionDelay = SOCKET_CONFIG.RECONNECTION_DELAY;
  
  // 연결 상태 업데이트 핸들러
  type ConnectionState = typeof SOCKET_STATE[keyof typeof SOCKET_STATE];
  const handleConnectionStatusChange = useCallback((data: { state: string; }) => {
    logger.debug('SocketIOContext', `연결 상태 변경: ${data.state}`, {
      previous: connected,
      eventHandlersCount: Object.keys(eventHandlersRef.current).length,
      hasConnectionStateHandlers: eventHandlersRef.current[SOCKET_EVENTS.CONNECTION_STATE_CHANGE]?.length || 0
    });
    
    // 상태에 따라 connected 업데이트 - 중복 업데이트 방지
    switch (data.state) {
      case SOCKET_STATE.CONNECTED:
        if (!connected) {
          setConnected(true);
          
          // 상세 로깅 추가
          logger.debug('SocketIOContext', '연결 상태 이벤트 발행', {
            eventName: SOCKET_EVENTS.CONNECTION_STATE_CHANGE,
            state: SOCKET_STATE.CONNECTED,
            handlersCount: (eventHandlersRef.current[SOCKET_EVENTS.CONNECTION_STATE_CHANGE] || []).length
          });
          
          // 모든 구독 핸들러에게 명시적으로 이벤트 발생
          const handlersForConnectionStateChange = eventHandlersRef.current[SOCKET_EVENTS.CONNECTION_STATE_CHANGE] || [];
          if (handlersForConnectionStateChange.length > 0) {
            handlersForConnectionStateChange.forEach((handler, index) => {
              logger.debug('SocketIOContext', `핸들러 ${index + 1} 호출 시도`);
              try {
                handler({ state: SOCKET_STATE.CONNECTED });
                logger.debug('SocketIOContext', `핸들러 ${index + 1} 호출 성공`);
              } catch (err) {
                logger.error('SocketIOContext', `핸들러 ${index + 1} 호출 실패`, { error: err });
              }
            });
          } else {
            logger.warn('SocketIOContext', '연결 상태 이벤트 핸들러가 등록되지 않음');
          }
          
          // 알림 표시는 상태 업데이트와 분리
          setTimeout(() => {
            enqueueSnackbar('서버에 연결되었습니다', { 
              variant: 'success',
              autoHideDuration: 3000
            });
          }, 0);
        }
        break;
        
      case SOCKET_STATE.DISCONNECTED:
      case SOCKET_STATE.ERROR:
        if (connected) {
          setConnected(false);
          
          // 상세 로깅 추가
          logger.debug('SocketIOContext', '연결 해제 상태 이벤트 발행', {
            eventName: SOCKET_EVENTS.CONNECTION_STATE_CHANGE,
            state: data.state,
            handlersCount: (eventHandlersRef.current[SOCKET_EVENTS.CONNECTION_STATE_CHANGE] || []).length
          });
          
          // 모든 구독 핸들러에게 명시적으로 이벤트 발생
          const handlersForConnectionStateChange = eventHandlersRef.current[SOCKET_EVENTS.CONNECTION_STATE_CHANGE] || [];
          if (handlersForConnectionStateChange.length > 0) {
            handlersForConnectionStateChange.forEach((handler, index) => {
              logger.debug('SocketIOContext', `핸들러 ${index + 1} 호출 시도 (연결 해제)`);
              try {
                handler({ state: data.state });
                logger.debug('SocketIOContext', `핸들러 ${index + 1} 호출 성공 (연결 해제)`);
              } catch (err) {
                logger.error('SocketIOContext', `핸들러 ${index + 1} 호출 실패 (연결 해제)`, { error: err });
              }
            });
          } else {
            logger.warn('SocketIOContext', '연결 상태 이벤트 핸들러가 등록되지 않음 (연결 해제)');
          }
          
          // 알림 표시
          setTimeout(() => {
            enqueueSnackbar('서버와 연결이 끊어졌습니다', {
              variant: 'warning',
              autoHideDuration: 3000
            });
          }, 0);
        }
        break;
    }
    
    // 연결 상태 변경 후 최종 상태 로깅
    logger.info('SocketIOContext', '연결 상태 업데이트 완료', {
      connectionState: data.state === SOCKET_STATE.CONNECTED ? 'connected' : 'disconnected',
      isConnected: data.state === SOCKET_STATE.CONNECTED,
      socketConnected: connected
    });
  }, [connected, enqueueSnackbar]);
  
  // 연결 상태 변경 후 전역 이벤트로 발행
  const broadcastConnectionState = useCallback(() => {
    logger.debug('SocketIOContext', '연결 상태 변경 전역 이벤트 발행', {
      connected,
      socketId: socketInstanceRef.current?.id
    });
    
    // 전역 이벤트로 발행
    try {
      const event = new CustomEvent('socket_connection_change', {
        detail: { 
          connected, 
          socketId: socketInstanceRef.current?.id,
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
    } catch (error) {
      logger.error('SocketIOContext', '전역 이벤트 발행 중 오류', { error });
    }
  }, [connected]);

  // 연결 상태 변경 시 브로드캐스트
  useEffect(() => {
    broadcastConnectionState();
  }, [connected, broadcastConnectionState]);
  
  // Socket.IO 인스턴스 생성
  const createSocketInstance = useCallback(() => {
    try {
      if (socketInstanceRef.current) {
        logger.debug('SocketIOContext', '기존 소켓 인스턴스가 있습니다.');
        // 이미 연결된 소켓이 있으면 재사용
        if (socketInstanceRef.current.connected) {
          setSocket(socketInstanceRef.current);
          setIsReady(true);
          handleConnectionStatusChange({ state: SOCKET_STATE.CONNECTED });
          // processLegacyHandlers 호출 제거
          processPendingSubscriptions(); // 대기 중인 구독 처리 추가
          return socketInstanceRef.current;
        }
      }
      
      // 소켓 인스턴스 생성
      const newSocket = socketIOService.getSocket();
      
      if (!newSocket) {
        throw new Error('소켓 인스턴스를 생성할 수 없습니다.');
      }
      
      // 소켓 인스턴스 저장
      socketInstanceRef.current = newSocket;
      setSocket(newSocket);
      
      logger.info('SocketIOContext', '소켓 인스턴스가 생성되었습니다.', {
        function: 'createSocketInstance'
      });
      
      return newSocket;
    } catch (err) {
      const error = err as Error;
      logger.error('SocketIOContext', '소켓 인스턴스 생성 중 오류가 발생했습니다.', {
        function: 'createSocketInstance',
        error: error.message
      });
      setError(error);
      return null;
    }
  }, []);
  
  // 연결 시도
  const connect = useCallback(() => {
    logger.info('SocketIOContext', '소켓 연결 시도', {
      function: 'connect'
    });
    
    shouldConnectRef.current = true;
    
    // 토큰 확인
    const token = getAccessToken();
    if (!token) {
      logger.warn('SocketIOContext', '인증 토큰이 없습니다. 연결을 시도하지 않습니다.', {
        function: 'connect'
      });
      setError(new Error('인증 토큰이 없습니다.'));
      return;
    }
    
    // 토큰 업데이트
    tokenRef.current = token;
    
    try {
      // 소켓 인스턴스 생성 또는 가져오기
      const socketInstance = socketInstanceRef.current || createSocketInstance();
      
      if (!socketInstance) {
        throw new Error('소켓 인스턴스를 생성할 수 없습니다.');
      }
      
      // 이미 연결된 경우 처리
      if (socketInstance.connected) {
        logger.info('SocketIOContext', '이미 연결되어 있습니다.', {
          function: 'connect'
        });
        handleConnectionStatusChange({ state: SOCKET_STATE.CONNECTED });
        return;
      }
      
      // 연결 시도
      socketInstance.connect();
      
    } catch (err) {
      const error = err as Error;
      logger.error('SocketIOContext', '연결 중 오류가 발생했습니다.', {
        function: 'connect',
        error: error.message
      });
      handleConnectionStatusChange({ state: SOCKET_STATE.ERROR });
      setError(error);
    }
  }, [createSocketInstance, handleConnectionStatusChange]);
  
  // 연결 해제
  const disconnect = useCallback(() => {
    logger.info('SocketIOContext', '소켓 연결 해제', {
      function: 'disconnect'
    });
    
    shouldConnectRef.current = false;
    
    // 소켓 인스턴스가 있으면 연결 해제
    if (socketInstanceRef.current) {
      socketInstanceRef.current.disconnect();
      handleConnectionStatusChange({ state: SOCKET_STATE.DISCONNECTED });
    }
  }, [handleConnectionStatusChange]);
  
  // 구독 상태 추적
  const [subscribers, setSubscribers] = useState<Array<any>>([]);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const [lastConnected, setLastConnected] = useState<Date | undefined>(undefined);
  
  // 구독 여부 확인 함수
  const isSubscribed = useCallback((cveId: string): boolean => {
    // 구현 필요
    return false;
  }, []);
  
  // CVE 구독 함수
  const subscribeCVEDetail = useCallback((cveId: string): boolean => {
    if (!socket || !connected) return false;
    
    try {
      socket.emit('subscribe_cve', { cveId });
      return true;
    } catch (error) {
      logger.error('SocketIOContext', '구독 실패', error);
      return false;
    }
  }, [socket, connected]);
  
  // CVE 구독 취소 함수
  const unsubscribeCVEDetail = useCallback((cveId: string): boolean => {
    if (!socket || !connected) return false;
    
    try {
      socket.emit('unsubscribe_cve', { cveId });
      return true;
    } catch (error) {
      logger.error('SocketIOContext', '구독 취소 실패', error);
      return false;
    }
  }, [socket, connected]);
  
  // 이벤트 구독
  const subscribeEvent = useCallback(<T = any>(event: string, handler: (data: T) => void) => {
    logger.debug('SocketIOContext', `이벤트 구독: ${event}`, {
      function: 'subscribeEvent'
    });
    
    // 이벤트 핸들러 추가
    const existingHandlers = eventHandlersRef.current[event] || [];
    const handlerExists = existingHandlers.includes(handler as EventHandler);
    
    // 이미 등록된 핸들러라면 중복 구독하지 않음
    if (!handlerExists) {
      // ref를 직접 업데이트하여 상태 변경 없이 핸들러 관리
      eventHandlersRef.current = {
        ...eventHandlersRef.current,
        [event]: [...existingHandlers, handler as EventHandler]
      };
      
      // 소켓 인스턴스에 이벤트 리스너 등록
      if (socketInstanceRef.current) {
        socketInstanceRef.current.on(event, handler as EventHandler);
      }
    }
    
    // 구독 해제 함수 반환
    return () => {
      unsubscribeEvent(event, handler as EventHandler);
    };
  }, []); // eventHandlers 의존성 제거
  
  // 이벤트 구독 해제
  const unsubscribeEvent = useCallback((event: string, handler: (data: any) => void) => {
    logger.debug('SocketIOContext', `이벤트 구독 해제: ${event}`, {
      function: 'unsubscribeEvent'
    });
    
    // 핸들러가 실제로 존재하는지 확인
    const existingHandlers = eventHandlersRef.current[event] || [];
    const handlerExists = existingHandlers.includes(handler);
    
    // 등록된 핸들러인 경우에만 제거
    if (handlerExists) {
      // ref를 직접 업데이트하여 상태 변경 없이 핸들러 관리
      eventHandlersRef.current = {
        ...eventHandlersRef.current,
        [event]: existingHandlers.filter(h => h !== handler)
      };
      
      // 소켓 인스턴스에서 이벤트 리스너 제거
      if (socketInstanceRef.current) {
        socketInstanceRef.current.off(event, handler);
      }
    }
  }, []); // eventHandlers 의존성 제거
  
  // 소켓 이벤트 발행
  const emit = useCallback(<T = any>(event: string, data?: T, callback?: (response: any) => void) => {
    logger.debug('SocketIOContext', `소켓 이벤트 발행: ${event}`, {
      function: 'emit',
      data
    });
    
    // 소켓이 연결되어 있지 않으면 대기 큐에 추가
    if (!socketInstanceRef.current || !connected) {
      logger.warn('SocketIOContext', '소켓이 연결되어 있지 않습니다. 나중에 재시도합니다.', {
        function: 'emit',
        event
      });
      return false;
    }
    
    try {
      if (callback) {
        socketInstanceRef.current.emit(event, data, callback);
      } else {
        socketInstanceRef.current.emit(event, data);
      }
      return true;
    } catch (error) {
      logger.error('SocketIOContext', '이벤트 발행 중 오류 발생', {
        function: 'emit',
        event,
        error
      });
      return false;
    }
  }, [connected]);
  
  // 활성 구독 목록 가져오기
  const getActiveSubscriptions = useCallback<() => Record<string, number>>(() => {
    const activeSubscriptions: Record<string, number> = {};
    
    // 각 이벤트 타입별 구독 수 계산
    Object.entries(eventHandlersRef.current).forEach(([event, handlers]) => {
      activeSubscriptions[event] = handlers.length;
    });
    
    return activeSubscriptions;
  }, []);
  
  // 인증 상태 변경 처리 함수
  const handleAuthStateChange = useCallback(() => {
    logger.debug('SocketIOContext', '인증 상태 변경 감지');
    
    // 현재 토큰 가져오기
    const token = getAccessToken();
    
    // 토큰이 있으면 재연결, 없으면 연결 해제
    if (token) {
      disconnect();
      setTimeout(() => {
        connect();
      }, 300);
    } else {
      disconnect();
    }
  }, [connect, disconnect]);
  
  // 대기 중인 구독 처리
  const processPendingSubscriptions = useCallback(() => {
    if (!socketInstanceRef.current || !connected) {
      logger.debug('SocketIOContext', '소켓이 준비되지 않아 대기 중인 구독을 처리할 수 없습니다');
      return;
    }
    
    logger.debug('SocketIOContext', '대기 중인 구독 처리 시작', {
      pendingEventsCount: Object.keys(pendingSubscriptionsRef.current).length
    });
    
    // 대기 중인 모든 구독 처리
    Object.entries(pendingSubscriptionsRef.current).forEach(([event, handlers]) => {
      if (Array.isArray(handlers) && handlers.length > 0) {
        handlers.forEach(handler => {
          logger.debug('SocketIOContext', `대기 중인 구독 등록: ${event}`);
          try {
            subscribeEvent(event, handler);
          } catch (error) {
            logger.error('SocketIOContext', `대기 중인 구독 등록 실패: ${event}`, { error });
          }
        });
      }
    });
    
    // 처리 완료 후 초기화
    pendingSubscriptionsRef.current = {};
  }, [connected, subscribeEvent]);

  // 소켓 준비 상태 변경 시 대기 중인 구독 처리
  useEffect(() => {
    if (connected && socketInstanceRef.current) {
      processPendingSubscriptions();
    }
  }, [connected, processPendingSubscriptions]);
  
  // 소켓 준비 상태에 따라 이벤트 구독
  const subscribeWhenReady = useCallback((event: string, handler: EventHandler) => {
    logger.debug('SocketIOContext', `구독 요청: ${event}`, {
      socketReady: socketInstanceRef.current && connected,
      handlerExists: !!handler
    });
    
    // 현재 연결되어 있으면 즉시 구독
    if (socketInstanceRef.current && connected) {
      logger.debug('SocketIOContext', `소켓 준비됨, 즉시 구독: ${event}`);
      try {
        subscribeEvent(event, handler);
        return true;
      } catch (error) {
        logger.error('SocketIOContext', `구독 실패: ${event}`, { error });
        return false;
      }
    } else {
      // 연결 대기 목록에 추가
      logger.debug('SocketIOContext', `소켓 준비되지 않음, 구독 예약: ${event}`);
      pendingSubscriptionsRef.current = {
        ...pendingSubscriptionsRef.current,
        [event]: [
          ...(pendingSubscriptionsRef.current[event] || []),
          handler
        ]
      };
      return false;
    }
  }, [connected, subscribeEvent]);
  
  // 소켓 이벤트 구독 등록
  const registerSocketEventListeners = useCallback(() => {
    if (!socketInstanceRef.current) return;

    const socket = socketInstanceRef.current;

    const connectHandler = () => {
      logger.info('SocketIOContext', '웹소켓 연결 성공', { 
        socketId: socket.id,
        // socket.io.uri는 private 속성이므로 접근 제거
        path: socket.io.opts.path,
        connected: socket.connected,
        disconnected: socket.disconnected,
        // 필요한 옵션만 선택적으로 기록
        opts: {
          path: socket.io.opts.path,
          transports: socket.io.opts.transports,
          upgrade: socket.io.opts.upgrade,
          reconnection: socket.io.opts.reconnection,
        }
      });
      
      // 연결 상태 업데이트 및 이벤트 발생
      handleConnectionStatusChange({ state: SOCKET_STATE.CONNECTED });
      
      // 연결 상태가 변경되었음을 알리는 이벤트 발생
      socket.emit(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, { 
        from: 'disconnected', 
        to: 'connected',
        timestamp: Date.now()
      });
    };
    
    socket.on(SOCKET_EVENTS.CONNECT, connectHandler);
    
    // 이미 연결된 상태라면 상태 업데이트
    if (socket.connected && !connected) {
      logger.info('SocketIOContext', '소켓이 이미 연결된 상태입니다. 강제 상태 업데이트를 수행합니다.');
      handleConnectionStatusChange({ state: SOCKET_STATE.CONNECTED });

      // 명시적 이벤트 발생
      socket.emit(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, { 
        from: 'unknown', 
        to: 'connected',
        timestamp: Date.now()
      });
    }
    
    // 클린업 함수
    return () => {
      logger.info('SocketIOContext', '소켓 이벤트 리스너 제거');
      if (socket) {
        socket.off(SOCKET_EVENTS.CONNECT, connectHandler);
      }
    };
  }, [socketInstanceRef.current, handleConnectionStatusChange]); // 의존성 배열 최적화

  useEffect(() => {
    if (!socketInstanceRef.current) return;
    
    // 이벤트 리스너 등록 및 클린업 함수 얻기
    const cleanupListeners = registerSocketEventListeners();
    
    // 연결 초기화 시 상태 확인 (한 번만)
    if (!initializedRef.current) {
      initializedRef.current = true;
      const initialConnectionStatus = socketIOService.connected;
      if (initialConnectionStatus !== connected) {
        setConnected(initialConnectionStatus);
        logger.info('SocketIOContext', '초기 연결 상태 설정', {
          connected: initialConnectionStatus
        });
      }
    }
    
    return () => {
      if (cleanupListeners) {
        cleanupListeners();
      }
    };
  }, [registerSocketEventListeners, socketIOService]); // connected 의존성 제거

  // useMemo를 사용하여 context 값 메모이제이션
  const contextValue = useMemo<SocketContextType>(() => ({
    socket: socketInstanceRef.current,
    connected,
    isReady,
    error,
    connecting: !connected && !error,
    reconnectAttempts: reconnectAttemptsRef.current,
    connect,
    disconnect,
    subscribeEvent,
    unsubscribeEvent,
    isSubscribed,
    emit,
    subscribeCVEDetail,
    unsubscribeCVEDetail,
    getActiveSubscriptions,
    subscribeWhenReady,
    handleAuthStateChange
  }), [
    connected,
    isReady,
    error,
    connect,
    disconnect,
    subscribeEvent,
    unsubscribeEvent,
    isSubscribed,
    emit,
    subscribeCVEDetail,
    unsubscribeCVEDetail,
    getActiveSubscriptions,
    subscribeWhenReady,
    handleAuthStateChange
  ]);

  return (
    <SocketIOContext.Provider value={contextValue}>
      {children}
    </SocketIOContext.Provider>
  );
};
/**
 * Socket.IO Context 사용을 위한 훅
 */
const useSocketIO = (): SocketContextType => {
  const context = useContext(SocketIOContext);
  if (!context) {
    throw new Error('useSocketIO must be used within a SocketIOProvider');
  }
  return context;
};

// 컨텍스트 인터페이스
interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  isReady: boolean;
  error: Error | null;
  connecting: boolean;
  reconnectAttempts: number;
  connect: () => void;
  disconnect: () => void;
  subscribeEvent: (event: string, handler: (data: any) => void) => void;
  unsubscribeEvent: (event: string, handler: (data: any) => void) => void;
  isSubscribed: (event: string, handler: (data: any) => void) => boolean;
  emit: (event: string, data?: any) => void;
  subscribeCVEDetail: (cveId: string) => void;
  unsubscribeCVEDetail: (cveId: string) => void;
  getActiveSubscriptions: () => Record<string, number>;
  subscribeWhenReady: (event: string, handler: EventHandler) => boolean;
  handleAuthStateChange: () => void;
}

// 파일 하단에서 내보내기
export { SocketIOProvider, useSocketIO, SocketIOContext };
export default SocketIOContext;