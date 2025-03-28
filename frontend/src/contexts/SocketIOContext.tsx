import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import socketIOService from '../services/socketio/socketio';
import logger from '../utils/logging';
import { SOCKET_STATE, SOCKET_EVENTS } from '../services/socketio/constants';
import { getAccessToken } from '../utils/storage/tokenStorage';
import { SOCKET_CONFIG } from '../config';
import { Socket } from 'socket.io-client';
import { SocketContextType } from '../types/socket';
import _ from 'lodash'; // Lodash 추가

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

// 이벤트 발행 내역을 추적하기 위한 인터페이스
interface EventEmitRecord {
  event: string;
  timestamp: number;
  data: any;
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
  
  // 이벤트 발행 내역 추적을 위한 ref 추가
  const recentEmitsRef = useRef<EventEmitRecord[]>([]);
  
  // 재시도 관련 상수 - 중앙 config 사용
  const maxRetries = SOCKET_CONFIG.RECONNECTION_ATTEMPTS;
  const reconnectionDelay = SOCKET_CONFIG.RECONNECTION_DELAY;
  
  // 연결 상태 업데이트 핸들러
  type ConnectionState = typeof SOCKET_STATE[keyof typeof SOCKET_STATE];
  
  // 디바운스 적용: 연결 상태 변경에 대한 알림 표시
  // 짧은 시간 내에 여러 번 호출되는 것을 방지하여 UI 성능 개선
  const showConnectionNotification = useCallback((variant: 'success' | 'warning' | 'error', message: string) => {
    enqueueSnackbar(message, { 
      variant,
      autoHideDuration: 3000
    });
  }, [enqueueSnackbar]);
  
  // Lodash를 이용한 디바운스 적용 (300ms)
  const debouncedShowNotification = _.debounce(showConnectionNotification, 300, {
    leading: true,  // 첫 번째 호출 즉시 실행
    trailing: false // 마지막 호출 무시
  });
  
  const handleConnectionStatusChange = useCallback((data: { state: string; }) => {
    logger.info('SocketIOContext', '연결 상태 변경', {
      from: connected ? 'connected' : 'disconnected',
      to: data.state
    });
    
    // 이전 상태 저장
    const prevConnected = connected;
    
    // 각 상태별 처리
    switch (data.state) {
      case SOCKET_STATE.CONNECTED:
        // 즉각적인 상태 업데이트를 위해 먼저 connected 상태를 true로 설정
        setConnected(true);
        setIsReady(true);
        
        // 나머지 로직 수행
        if (!prevConnected) {
          // 연결 완료 로깅
          logger.info('SocketIOContext', '연결 상태 업데이트 완료', {
            connectionState: 'connected',
            isConnected: true,
            socketConnected: true
          });
          
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
          
          // 디바운스된 알림 표시 함수 호출
          debouncedShowNotification('success', '서버에 연결되었습니다');
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
          
          // 디바운스된 알림 표시 함수 호출
          debouncedShowNotification('warning', '서버와 연결이 끊어졌습니다');
        }
        break;
    }
    
    // 연결 상태 변경 후 최종 상태 로깅
    logger.info('SocketIOContext', '연결 상태 업데이트 완료', {
      connectionState: data.state === SOCKET_STATE.CONNECTED ? 'connected' : 'disconnected',
      isConnected: data.state === SOCKET_STATE.CONNECTED,
      socketConnected: connected
    });
  }, [connected, debouncedShowNotification]);
  
  // 디바운스 적용: 연결 상태 변경 전역 이벤트 발행
  // 너무 자주 발생하는 이벤트 발행을 방지하여 성능 개선
  const broadcastConnectionState = useMemo(() => _.debounce(() => {
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
  }, 150), [connected]); // 150ms 디바운스, connected 상태가 변경될 때만 다시 생성

  // 연결 상태 변경 시 브로드캐스트
  useEffect(() => {
    broadcastConnectionState();
  }, [connected, broadcastConnectionState]);
  
  // 클라이언트 내부 이벤트 발행 함수 (서버로 전송하지 않고 내부적으로만 처리)
  const publishInternalEvent = useCallback((event: string, data: any) => {
    logger.debug('SocketIOContext', `내부 이벤트 발행: ${event}`, {
      data,
      handlersCount: (eventHandlersRef.current[event] || []).length
    });
    
    // 해당 이벤트에 등록된 모든 핸들러 호출
    const handlers = eventHandlersRef.current[event] || [];
    handlers.forEach((handler, index) => {
      try {
        handler(data);
        logger.debug('SocketIOContext', `내부 이벤트 핸들러 ${index + 1} 호출 성공`);
      } catch (err) {
        logger.error('SocketIOContext', `내부 이벤트 핸들러 ${index + 1} 호출 실패`, { error: err });
      }
    });
  }, []);

  // 연결 상태 변경 알림 함수
  const notifyConnectionStateChange = useCallback((state: ConnectionState) => {
    logger.debug('SocketIOContext', `연결 상태 변경 알림: ${state}`);
    publishInternalEvent(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, { state });
  }, [publishInternalEvent]);

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
  }, [handleConnectionStatusChange]);
  
  // 디바운스 적용: 연결 시도
  // 짧은 시간 내에 여러 번 호출되는 연결 시도를 방지
  const connect = useMemo(() => _.debounce(async () => {
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
        
        // 이미 연결된 경우에도 상태를 업데이트하고 이벤트를 발행하여 UI가 최신 상태를 반영하게 함
        setConnected(true);
        setIsReady(true);
        handleConnectionStatusChange({ state: SOCKET_STATE.CONNECTED });
        publishInternalEvent(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, { state: SOCKET_STATE.CONNECTED });
        
        return socketInstance;
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
  }, 300), [createSocketInstance, handleConnectionStatusChange, publishInternalEvent]); // 300ms 디바운스
  
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
      
      // 내부 이벤트인지 확인 (이름으로 구분)
      const isInternalEvent = event === SOCKET_EVENTS.CONNECTION_STATE_CHANGE;
      
      // 내부 이벤트가 아닌 경우만 소켓 인스턴스에 이벤트 리스너 등록
      if (!isInternalEvent && socketInstanceRef.current) {
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
      
      // 내부 이벤트인지 확인
      const isInternalEvent = event === SOCKET_EVENTS.CONNECTION_STATE_CHANGE;
      
      // 내부 이벤트가 아닌 경우만 소켓 인스턴스에서 이벤트 리스너 제거
      if (!isInternalEvent && socketInstanceRef.current) {
        socketInstanceRef.current.off(event, handler);
      }
    }
  }, []); // eventHandlers 의존성 제거
  
  // 디바운스와 캐싱 적용: 이벤트 발행 최적화
  // 짧은 시간 내에 동일한 이벤트가 발생할 경우 캐싱하여 중복 발행 방지
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
      // 최근 발행된 동일 이벤트 확인 (100ms 이내)
      const now = Date.now();
      const recentEmits = recentEmitsRef.current;
      const isDuplicate = recentEmits.some(record => 
        record.event === event && 
        _.isEqual(record.data, data) && 
        now - record.timestamp < 100
      );
      
      // 중복 이벤트가 아닌 경우에만 발행
      if (!isDuplicate || callback) {
        const socketInstance = socketInstanceRef.current; // 로컬 변수로 캡처
        if (callback) {
          socketInstance.emit(event, data, callback);
        } else {
          socketInstance.emit(event, data);
        }
        
        // 발행 기록 추가
        recentEmitsRef.current = [
          ...recentEmitsRef.current.slice(-9), // 최근 10개만 유지
          { event, data, timestamp: now }
        ];
        
        return true;
      }
      
      // 중복 이벤트라면 무시하고 성공으로 처리
      logger.debug('SocketIOContext', '중복 이벤트 발행 방지', {
        event,
        data
      });
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
  
  // 디바운스 적용: 인증 상태 변경 처리 함수
  // 토큰 변경 시 연속적인 재연결을 방지하고 안정적인 연결 처리를 위해 디바운스
  const handleAuthStateChange = useMemo(() => _.debounce(() => {
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
  }, 500), [connect, disconnect]); // 500ms 디바운스
  
  // 대기 중인 구독 처리
  const processPendingSubscriptions = useCallback(() => {
    if (!socketInstanceRef.current || !connected) {
      logger.debug('SocketIOContext', '소켓이 준비되지 않아 대기 중인 구독을 처리할 수 없습니다');
      return;
    }
    
    logger.debug('SocketIOContext', '대기 중인 구독 처리 시작', {
      pendingEventsCount: Object.keys(pendingSubscriptionsRef.current).length
    });
    
    // Lodash를 사용한 대기 중인 구독 처리
    _.forEach(pendingSubscriptionsRef.current, (handlers, event) => {
      if (Array.isArray(handlers) && handlers.length > 0) {
        _.forEach(handlers, handler => {
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

  useEffect(() => {
    logger.info('SocketIOContext', '컨텍스트 초기화');
    
    // socketIOService의 연결 상태 확인
    const socket = socketIOService.getSocket();
    if (socket && socket.connected) {
      logger.info('SocketIOContext', '기존 연결된 소켓 발견', {
        socketId: socket.id,
        connected: socket.connected
      });
      
      // 소켓 인스턴스 및 상태 설정
      socketInstanceRef.current = socket;
      setSocket(socket);
      setIsReady(true);
      setConnected(true);
      
      // 연결 상태 변경 이벤트 발행 (지연 처리)
      setTimeout(() => {
        logger.info('SocketIOContext', '초기화 시 연결 상태 이벤트 발행');
        handleConnectionStatusChange({ state: SOCKET_STATE.CONNECTED });
        publishInternalEvent(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, { state: SOCKET_STATE.CONNECTED });
      }, 0);
    }
  }, [handleConnectionStatusChange, publishInternalEvent]);

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
        path: socket.io.opts.path,
        connected: socket.connected,
        disconnected: socket.disconnected,
        opts: {
          path: socket.io.opts.path,
          transports: socket.io.opts.transports,
          upgrade: socket.io.opts.upgrade,
          reconnection: socket.io.opts.reconnection,
        }
      });
      
      // 연결 상태 업데이트 및 내부 이벤트 발생
      handleConnectionStatusChange({ state: SOCKET_STATE.CONNECTED });
      
      // 서버로 이벤트를 전송하지 않고 내부적으로만 상태 변경 알림
      notifyConnectionStateChange(SOCKET_STATE.CONNECTED);
    };
    
    socket.on(SOCKET_EVENTS.CONNECT, connectHandler);
    
    // 이미 연결된 상태라면 상태 업데이트
    if (socket.connected && !connected) {
      logger.info('SocketIOContext', '소켓이 이미 연결된 상태입니다. 강제 상태 업데이트를 수행합니다.');
      handleConnectionStatusChange({ state: SOCKET_STATE.CONNECTED });

      // 명시적 이벤트 발생
      notifyConnectionStateChange(SOCKET_STATE.CONNECTED);
    }
    
    // 클린업 함수
    return () => {
      logger.info('SocketIOContext', '소켓 이벤트 리스너 제거');
      if (socket) {
        socket.off(SOCKET_EVENTS.CONNECT, connectHandler);
      }
    };
  }, [connected, handleConnectionStatusChange, notifyConnectionStateChange]);

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
  }, [registerSocketEventListeners]);

  // 전역 소켓 상태 이벤트 리스너 처리 함수
  // Lodash의 디바운스를 적용하여 연속된 이벤트 처리 최적화
  const handleSocketStateChangeEvent = useMemo(() => _.debounce((event: CustomEvent) => {
    const detail = event.detail;
    const eventType = event.type;
    const isConnectionEvent = eventType === 'socket_connection_state_change';
    const isInitialEvent = eventType === 'socket_initial_connected';
    
    logger.debug('SocketIOContext', '전역 소켓 이벤트 감지됨', {
      eventType,
      connected,
      currentSocketId: socketInstanceRef.current?.id,
      detail
    });
    
    // 연결 이벤트의 경우 (두 이벤트 모두)
    let shouldUpdateState = false;
    
    if (isConnectionEvent && detail.state === SOCKET_STATE.CONNECTED) {
      shouldUpdateState = !connected;
    } else if (isInitialEvent && detail.connected === true) {
      shouldUpdateState = !connected;
    }
    
    // 상태 업데이트 필요한 경우에만 업데이트 수행
    if (shouldUpdateState) {
      // 소켓 객체 확인 및 설정 (필요한 경우)
      if (!socketInstanceRef.current) {
        const socket = socketIOService.getSocket();
        if (socket) {
          socketInstanceRef.current = socket;
          setSocket(socket);
        }
      }
      
      // 연결 상태 업데이트
      setConnected(true);
      setIsReady(true);
      
      logger.info('SocketIOContext', '전역 이벤트를 통한 연결 상태 업데이트', {
        eventType,
        socketId: detail.socketId || socketInstanceRef.current?.id
      });
      
      // 내부 이벤트를 구독 컴포넌트에 전파 (성능 최적화를 위해 지연 처리)
      setTimeout(() => {
        publishInternalEvent(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, { 
          state: SOCKET_STATE.CONNECTED 
        });
      }, 0);
    }
  }, 200), [connected, publishInternalEvent]); // 200ms 디바운스

  // 전역 소켓 상태 이벤트 리스너 설정 - 최적화 버전
  useEffect(() => {
    logger.info('SocketIOContext', '전역 소켓 이벤트 리스너 설정');
    
    // DOM 이벤트 리스너 등록 - 디바운스된 핸들러를 사용
    window.addEventListener('socket_connection_state_change', handleSocketStateChangeEvent as EventListener);
    window.addEventListener('socket_initial_connected', handleSocketStateChangeEvent as EventListener);
    
    // 클린업 함수
    return () => {
      logger.info('SocketIOContext', '전역 소켓 이벤트 리스너 해제');
      window.removeEventListener('socket_connection_state_change', handleSocketStateChangeEvent as EventListener);
      window.removeEventListener('socket_initial_connected', handleSocketStateChangeEvent as EventListener);
    };
  }, [handleSocketStateChangeEvent]);

  // useMemo를 사용하여 context 값 메모이제이션
  const contextValue = useMemo<SocketContextType>(() => {
    // 최신 소켓 인스턴스 참조를 직접 캡처
    const currentSocket = socketInstanceRef.current;
    
    return {
      socket: currentSocket, // 캡처된 최신 소켓 인스턴스 사용
      connected,
      isReady,
      error,
      connecting: shouldConnectRef.current && !connected,
      reconnectAttempts: reconnectAttemptsRef.current,
      connect,
      disconnect,
      subscribeEvent,
      unsubscribeEvent,
      isSubscribed,
      emit,
      subscribeCVEDetail,
      unsubscribeCVEDetail,
      getActiveSubscriptions: () => {
        // Lodash를 사용하여 구독 정보 변환
        return _.reduce(eventHandlersRef.current, (result, handlers, event) => {
          result[event] = handlers.length;
          return result;
        }, {} as Record<string, number>);
      },
      subscribeWhenReady,
      handleAuthStateChange,
      publishInternalEvent // 내부 이벤트 발행 함수도 컨텍스트에 추가
    };
  }, [
    // socket 제거 - 이는 외부 참조가 아니라 내부에서 캡처함
    connected, isReady, error, 
    connect, disconnect, subscribeEvent, unsubscribeEvent, 
    isSubscribed, emit, subscribeCVEDetail, unsubscribeCVEDetail,
    subscribeWhenReady, handleAuthStateChange, publishInternalEvent
  ]);

  // 소켓 초기화 및 이벤트 구독 설정
  useEffect(() => {
    logger.info('SocketIOContext', '소켓 초기화 및 이벤트 구독 설정');
    
    // 현재 소켓 인스턴스 가져오기
    const socketInstance = socketIOService.getSocket();
    
    // 소켓 인스턴스가 있는 경우
    if (socketInstance) {
      // 소켓 인스턴스 저장
      socketInstanceRef.current = socketInstance;
      setSocket(socketInstance);
      
      // 소켓 연결 상태 확인
      const isConnected = socketInstance.connected;
      
      // 로깅
      logger.info('SocketIOContext', '소켓 초기화 완료', {
        socketId: socketInstance.id,
        connected: isConnected
      });
      
      // SocketIOService의 getSocket 호출로 인해 상태가 이미 업데이트되었는지 확인
      // 연결 되어 있으면 상태 업데이트
      if (isConnected && !connected) {
        setConnected(true);
        setIsReady(true);
      }
    }
    
    // 컴포넌트 언마운트 시 정리
    return () => {
      logger.info('SocketIOContext', '컨텍스트 정리');
      
      // 디바운스된 함수들의 대기 중인 호출 취소
      debouncedShowNotification.cancel();
      broadcastConnectionState.cancel();
      handleAuthStateChange.cancel();
      handleSocketStateChangeEvent.cancel();
    };
  }, [connected, broadcastConnectionState, debouncedShowNotification, handleAuthStateChange, handleSocketStateChangeEvent]);

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

// 파일 하단에서 내보내기
export { SocketIOProvider, useSocketIO, SocketIOContext };
export default SocketIOContext;