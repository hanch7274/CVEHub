import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import socketIOService from '../services/socketio/socketio';
import logger from '../utils/logging';
import { SOCKET_STATE, SOCKET_EVENTS, WS_LOG_CONTEXT, WS_DIRECTION, WS_STATUS } from '../services/socketio/constants';
import { getAccessToken } from '../utils/storage/tokenStorage';
import { WS_BASE_URL, SOCKET_IO_PATH, SOCKET_CONFIG } from '../config';
import { DATE_FORMATS, formatWithTimeZone, TIME_ZONES } from '../utils/dateUtils';
import { SocketContextType } from '../types/socket';

// 이벤트 핸들러 타입 정의
type EventHandler = (data: any) => void;
type EventHandlers = Record<string, EventHandler[]>;

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
  const [socket, setSocket] = useState<any>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [eventHandlers, setEventHandlers] = useState<EventHandlers>({});
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  
  // Refs
  const tokenRef = useRef<string | null>(getAccessToken());
  const shouldConnectRef = useRef<boolean>(false);
  const reconnectAttemptsRef = useRef<number>(0);
  const socketInstanceRef = useRef<any>(null);
  const connectionCheckerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const globalEventHandlersRef = useRef<EventHandlers>({});
  const isAuthenticatedRef = useRef<boolean>(false);
  
  // 재시도 관련 상수 - 중앙 config 사용
  const maxRetries = SOCKET_CONFIG.RECONNECTION_ATTEMPTS;
  const reconnectionDelay = SOCKET_CONFIG.RECONNECTION_DELAY;
  
  // 연결 상태 업데이트 핸들러
  const handleConnectionStatusChange = useCallback((data: { state: string }) => {
    logger.info('SocketIOContext', '연결 상태 변경 이벤트 수신', {
      function: 'handleConnectionStatusChange',
      state: data.state
    });
    
    // socketIOService.connected 속성을 직접 확인하여 실제 연결 상태 반영
    const isReallyConnected = socketIOService.connected;
    
    logger.debug('SocketIOContext', '연결 상태 세부 정보', {
      stateFromEvent: data.state,
      socketConnected: socketIOService.socket?.connected,
      serviceIsConnected: socketIOService.isConnected,
      serviceConnected: isReallyConnected
    });
    
    switch (data.state) {
      case SOCKET_STATE.CONNECTED:
        if (isReallyConnected) {
          setConnected(true);
          setLastConnected(new Date());
          setReconnectAttempts(0);
          enqueueSnackbar('서버와 연결되었습니다.', { 
            variant: 'success',
            autoHideDuration: 3000
          });
        } else {
          logger.warn('SocketIOContext', '연결 상태 불일치 감지: 이벤트는 연결됨이지만 실제로는 연결되지 않음');
          setConnected(false);
        }
        break;
      case SOCKET_STATE.DISCONNECTED:
        setConnected(false);
        break;
      case SOCKET_STATE.CONNECTING:
        setConnected(false);
        break;
      case SOCKET_STATE.ERROR:
        setConnected(false);
        enqueueSnackbar('서버 연결에 문제가 발생했습니다.', { 
          variant: 'error',
          autoHideDuration: 5000
        });
        break;
      default:
        logger.warn('SocketIOContext', '알 수 없는 연결 상태', { state: data.state });
        // 기본적으로 실제 연결 상태 반영
        setConnected(isReallyConnected);
    }
  }, [enqueueSnackbar]);
  
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
      handleConnectionStatusChange({ state: SOCKET_STATE.CONNECTING });
      socketInstance.connect();
      
      // 연결 상태 확인 타이머 설정
      if (connectionCheckerRef.current) {
        clearTimeout(connectionCheckerRef.current);
      }
      
      connectionCheckerRef.current = setTimeout(() => {
        if (socketInstance && !socketInstance.connected) {
          logger.warn('SocketIOContext', '연결 시간 초과', {
            function: 'connect'
          });
          handleConnectionStatusChange({ state: SOCKET_STATE.ERROR });
          
          // 재연결 시도
          if (shouldConnectRef.current && reconnectAttemptsRef.current < maxRetries) {
            reconnectAttemptsRef.current++;
            
            logger.info('SocketIOContext', `재연결 시도 (${reconnectAttemptsRef.current}/${maxRetries})`, {
              function: 'connect'
            });
            
            if (reconnectTimerRef.current) {
              clearTimeout(reconnectTimerRef.current);
            }
            
            reconnectTimerRef.current = setTimeout(() => {
              connect();
            }, reconnectionDelay);
          } else if (reconnectAttemptsRef.current >= maxRetries) {
            logger.error('SocketIOContext', '최대 재연결 시도 횟수를 초과했습니다.', {
              function: 'connect',
              attempts: reconnectAttemptsRef.current,
              maxRetries
            });
            setError(new Error('최대 재연결 시도 횟수를 초과했습니다.'));
          }
        }
      }, SOCKET_CONFIG.CONNECTION_TIMEOUT);
      
    } catch (err) {
      const error = err as Error;
      logger.error('SocketIOContext', '연결 중 오류가 발생했습니다.', {
        function: 'connect',
        error: error.message
      });
      handleConnectionStatusChange({ state: SOCKET_STATE.ERROR });
      setError(error);
    }
  }, [createSocketInstance, handleConnectionStatusChange, maxRetries, reconnectionDelay]);
  
  // 연결 해제
  const disconnect = useCallback(() => {
    logger.info('SocketIOContext', '소켓 연결 해제', {
      function: 'disconnect'
    });
    
    shouldConnectRef.current = false;
    
    // 타이머 정리
    if (connectionCheckerRef.current) {
      clearTimeout(connectionCheckerRef.current);
      connectionCheckerRef.current = null;
    }
    
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
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
  const subscribeEvent = useCallback((event: string, handler: (data: any) => void) => {
    logger.debug('SocketIOContext', `이벤트 구독: ${event}`, {
      function: 'subscribeEvent'
    });
    
    // 이벤트 핸들러 추가
    setEventHandlers(prev => {
      const handlers = prev[event] || [];
      
      // 이미 등록된 핸들러인지 확인
      if (!handlers.includes(handler)) {
        return {
          ...prev,
          [event]: [...handlers, handler]
        };
      }
      
      return prev;
    });
    
    // 소켓 인스턴스에 이벤트 리스너 등록
    if (socketInstanceRef.current) {
      socketInstanceRef.current.on(event, handler);
    }
    
    // 전역 이벤트 핸들러에도 추가
    const globalHandlers = globalEventHandlersRef.current[event] || [];
    if (!globalHandlers.includes(handler)) {
      globalEventHandlersRef.current = {
        ...globalEventHandlersRef.current,
        [event]: [...globalHandlers, handler]
      };
    }
    
    // 구독 해제 함수 반환
    return () => {
      unsubscribeEvent(event, handler);
    };
  }, []);
  
  // 이벤트 구독 해제
  const unsubscribeEvent = useCallback((event: string, handler: (data: any) => void) => {
    logger.debug('SocketIOContext', `이벤트 구독 해제: ${event}`, {
      function: 'unsubscribeEvent'
    });
    
    // 이벤트 핸들러 제거
    setEventHandlers(prev => {
      const handlers = prev[event] || [];
      return {
        ...prev,
        [event]: handlers.filter(h => h !== handler)
      };
    });
    
    // 소켓 인스턴스에서 이벤트 리스너 제거
    if (socketInstanceRef.current) {
      socketInstanceRef.current.off(event, handler);
    }
    
    // 전역 이벤트 핸들러에서도 제거
    const globalHandlers = globalEventHandlersRef.current[event] || [];
    globalEventHandlersRef.current = {
      ...globalEventHandlersRef.current,
      [event]: globalHandlers.filter(h => h !== handler)
    };
  }, []);
  
  // 이벤트 발생
  const emit = useCallback((event: string, data?: any) => {
    logger.debug('SocketIOContext', `이벤트 발생: ${event}`, {
      function: 'emit',
      data
    });
    
    if (!socketInstanceRef.current || !socketInstanceRef.current.connected) {
      logger.warn('SocketIOContext', '소켓이 연결되어 있지 않습니다. 이벤트를 발생시킬 수 없습니다.', {
        function: 'emit',
        event
      });
      return;
    }
    
    socketInstanceRef.current.emit(event, data);
  }, []);
  
  // 활성 구독 목록 가져오기
  const getActiveSubscriptions = useCallback(() => {
    // 구독 중인 CVE ID 목록 반환
    // 실제 구현은 서버 상태에 따라 달라질 수 있으므로 여기서는 클라이언트 측 상태만 반환
    return Object.keys(eventHandlers).filter(key => key.startsWith('cve_'));
  }, [eventHandlers]);
  
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
  
  // 소켓 이벤트 리스너 설정
  useEffect(() => {
    if (!socketInstanceRef.current) return;

    const socket = socketInstanceRef.current;

    // 연결 이벤트 리스너
    const handleConnect = () => {
      logger.info('SocketIOContext', '소켓 연결됨', {
        function: 'handleConnect'
      });
      // 실제 연결 상태 즉시 반영
      setConnected(true);
      handleConnectionStatusChange({ state: SOCKET_STATE.CONNECTED });
    };

    // 연결 확인 이벤트 리스너 추가
    const handleConnectAck = (data: any) => {
      logger.info('SocketIOContext', '소켓 연결 확인됨', {
        function: 'handleConnectAck',
        data
      });
      // 실제 연결 상태 즉시 반영
      setConnected(true);
      handleConnectionStatusChange({ state: SOCKET_STATE.CONNECTED });
    };

    // 연결 해제 이벤트 리스너
    const handleDisconnect = (reason: string) => {
      logger.info('SocketIOContext', `소켓 연결 해제: ${reason}`, {
        function: 'handleDisconnect',
        reason
      });
      // 실제 연결 상태 즉시 반영
      setConnected(false);
      handleConnectionStatusChange({ state: SOCKET_STATE.DISCONNECTED });

      // 인증된 상태이고 자동 재연결이 활성화된 경우에만 재연결 시도
      if (isAuthenticatedRef.current && shouldConnectRef.current) {
        logger.info('SocketIOContext', '자동 재연결 시도 예약됨', {
          function: 'handleDisconnect',
          delay: reconnectionDelay
        });
        
        setTimeout(() => {
          if (shouldConnectRef.current) {
            connect();
          }
        }, reconnectionDelay);
      }
    };

    // 소켓 오류 이벤트 리스너
    const handleError = (err: Error) => {
      logger.error('SocketIOContext', '소켓 오류', {
        function: 'handleError',
        error: err.message
      });
      setError(err);
      // 실제 연결 상태 즉시 반영
      setConnected(false);
      handleConnectionStatusChange({ state: SOCKET_STATE.ERROR });
    };

    // 소켓 연결 오류 이벤트 리스너 (커스텀)
    const handleConnectionError = (data: any) => {
      logger.error('SocketIOContext', '소켓 연결 오류 (커스텀)', data);
      // 실제 연결 상태 즉시 반영
      setConnected(false);
      handleConnectionStatusChange({ state: SOCKET_STATE.ERROR });

      // 인증 상태에 따라 자동 재연결 시도
      if (isAuthenticatedRef.current) {
        logger.info('SocketIOContext', '자동 재연결 시도 예약됨', {
          function: 'handleConnectionError',
          delay: reconnectionDelay
        });
        
        setTimeout(() => {
          if (shouldConnectRef.current) {
            connect();
          }
        }, reconnectionDelay);
      }
    };

    // 재연결 요청 이벤트 리스너
    const handleRequestReconnect = () => {
      logger.info('SocketIOContext', '재연결 요청 수신');
      if (isAuthenticatedRef.current) {
        handleAuthStateChange(true);
      }
    };

    // 이벤트 리스너 등록
    socket.on('connect', handleConnect);
    socket.on('connect_ack', handleConnectAck);
    socket.on('disconnect', handleDisconnect);
    socket.on('error', handleError);
    socket.on('connection_error', handleConnectionError);
    socket.on('request_reconnect', handleRequestReconnect);

    // 전역 이벤트 핸들러 등록
    Object.entries(globalEventHandlersRef.current).forEach(([event, handlers]) => {
      handlers.forEach(handler => {
        socket.on(event, handler);
      });
    });

    // 정리 함수
    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_ack', handleConnectAck);
      socket.off('disconnect', handleDisconnect);
      socket.off('error', handleError);
      socket.off('connection_error', handleConnectionError);
      socket.off('request_reconnect', handleRequestReconnect);

      // 전역 이벤트 핸들러 제거
      Object.entries(globalEventHandlersRef.current).forEach(([event, handlers]) => {
        handlers.forEach(handler => {
          socket.off(event, handler);
        });
      });
    };
  }, [connect, handleConnectionStatusChange, reconnectionDelay]);

  // 연결 상태 주기적 확인
  useEffect(() => {
    // 5초마다 연결 상태 확인 (10초에서 5초로 변경하여 더 빠르게 감지)
    const connectionChecker = setInterval(() => {
      if (socketInstanceRef.current) {
        const socketConnected = socketInstanceRef.current.connected;
        const serviceConnected = socketIOService.connected;
        
        // 연결 상태 불일치 감지
        if (connected !== socketConnected || connected !== serviceConnected) {
          logger.warn('SocketIOContext', '연결 상태 불일치 감지', {
            contextConnected: connected,
            socketConnected: socketConnected,
            serviceConnected: serviceConnected
          });
          
          // 실제 소켓 연결 상태에 맞게 UI 상태 즉시 조정
          setConnected(serviceConnected);
          
          // 상태가 변경되었으므로 이벤트 발생
          if (serviceConnected && !connected) {
            enqueueSnackbar('서버와 연결이 복구되었습니다.', { 
              variant: 'success',
              autoHideDuration: 3000
            });
          } else if (!serviceConnected && connected) {
            enqueueSnackbar('서버와 연결이 끊어졌습니다.', { 
              variant: 'warning',
              autoHideDuration: 3000
            });
          }
        }
      }
    }, 5000);
    
    return () => {
      clearInterval(connectionChecker);
    };
  }, [connected, enqueueSnackbar]);

  // Context 값
  const value: SocketContextType = {
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
  };

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
