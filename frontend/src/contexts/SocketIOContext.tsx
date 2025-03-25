import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import socketIOService from '../services/socketio/socketio';
import logger from '../utils/logging';
import { SOCKET_STATE, SOCKET_EVENTS } from '../services/socketio/constants';
import { getAccessToken } from '../utils/storage/tokenStorage';
import { SOCKET_CONFIG } from '../config';
import { SocketContextType } from '../types/socket';
import { Socket } from 'socket.io-client';

// 이벤트 핸들러 타입 정의
type EventHandler = (data: any) => void;
type EventHandlers = Record<string, Array<(data: any) => void>>;

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
      previous: connected
    });
    
    // 상태에 따라 connected 업데이트 - 중복 업데이트 방지
    switch (data.state) {
      case SOCKET_STATE.CONNECTED:
        if (!connected) {
          setConnected(true);
          
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
          
          // 알림 표시는 상태 업데이트와 분리
          setTimeout(() => {
            enqueueSnackbar('서버와 연결이 끊어졌습니다', { 
              variant: 'warning',
              autoHideDuration: 3000
            });
          }, 0);
        }
        break;
        
      default:
        break;
    }
  }, [connected, enqueueSnackbar]);

  // Socket.IO 인스턴스 생성
  const createSocketInstance = useCallback(() => {
    if (socketInstanceRef.current) {
      logger.info('SocketIOContext', '기존 소켓 인스턴스가 있습니다. 연결 해제 후 재생성합니다.', {
        function: 'createSocketInstance'
      });
      socketInstanceRef.current.disconnect();
      socketInstanceRef.current = null;
    }
    
    try {
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
  const getActiveSubscriptions = useCallback(() => {
    // 구독 중인 CVE ID 목록 반환
    // 실제 구현은 서버 상태에 따라 달라질 수 있으므로 여기서는 클라이언트 측 상태만 반환
    return Object.keys(eventHandlersRef.current).filter(key => key.startsWith('cve_'));
  }, []);
  
  // 인증 상태 변경 처리 함수
  const handleAuthStateChange = useCallback((isAuthenticated: boolean) => {
    logger.info('SocketIOContext', `인증 상태 변경: ${isAuthenticated ? '인증됨' : '인증되지 않음'}`, {
      function: 'handleAuthStateChange'
    });
    
    isAuthenticatedRef.current = isAuthenticated;
    
    if (isAuthenticated) {
      // 인증된 경우 연결 시도
      connect();
    } else {
      // 인증되지 않은 경우 연결 해제
      disconnect();
    }
  }, [connect, disconnect]);
  
  // 소켓 이벤트 구독 등록
  const registerSocketEventListeners = useCallback(() => {
    if (!socketInstanceRef.current) return;

    const socket = socketInstanceRef.current;

  // 이벤트 핸들러 내에서 emit 호출을 제거하고 다른 방식으로 상태 변경 감지
  const handleConnect = () => {
    logger.info('SocketIOContext', '소켓 연결됨');
    
    // 이미 연결되어 있는지 확인
    if (!connected) {
      setConnected(true);
    }
  };

  // 연결 해제 이벤트 리스너도 유사하게 수정
  const handleDisconnect = (reason: string) => {
    logger.info('SocketIOContext', `소켓 연결 해제: ${reason}`);
    
    // 이미 연결 해제되어 있는지 확인
    if (connected) {
      setConnected(false);
    }
  
    // 인증된 상태이고 자동 재연결이 활성화된 경우에만 재연결 시도
    if (isAuthenticatedRef.current && shouldConnectRef.current) {
      logger.info('SocketIOContext', '자동 재연결 시도 예약됨', {
        delay: reconnectionDelay
      });
      
      const timer = setTimeout(() => {
        if (shouldConnectRef.current) {
          connect();
        }
      }, reconnectionDelay);
      
      // 타이머 참조 저장
      reconnectTimerRef.current = timer;
    }
  };

    // 소켓 오류 이벤트 리스너
    const handleError = (err: Error) => {
      logger.error('SocketIOContext', '소켓 오류', {
        error: err.message
      });
      setError(err);
      setConnected(false);
      // 오류 상태 이벤트 발생
      if (socketIOService) {
        socketIOService.emit(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, { 
          state: SOCKET_STATE.ERROR 
        });
      }
    };

    // 이벤트 리스너 등록
    socket.on('connect', handleConnect);
    socket.on('connect_error', handleError);
    socket.on('disconnect', handleDisconnect);
    socket.io.on('reconnect', handleConnect);
    socket.io.on('reconnect_attempt', () => logger.info('SocketIOContext', '재연결 시도 중'));
    socket.io.on('reconnect_error', handleError);
    socket.io.on('reconnect_failed', () => logger.warn('SocketIOContext', '재연결 실패'));
    
    // 클린업 함수
    return () => {
      // 이벤트 리스너 제거
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleError);
      socket.off('disconnect', handleDisconnect);
      socket.io.off('reconnect', handleConnect);
      socket.io.off('reconnect_attempt');
      socket.io.off('reconnect_error', handleError);
      socket.io.off('reconnect_failed');
    };
  }, [connect, enqueueSnackbar, reconnectionDelay, socketIOService, handleConnectionStatusChange]);

// 그리고 useEffect에서는 참조만 합니다
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
const value = useMemo<SocketContextType>(() => ({
  socket,
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
  handleAuthStateChange
}), [
  socket, 
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
  handleAuthStateChange
]);

  return (
    <SocketIOContext.Provider value={value}>
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

// 파일 하단에서 내보내기
export { SocketIOProvider, useSocketIO, SocketIOContext };
export default SocketIOContext;