import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import socketIOService from '../services/socketio/socketio';
import { QUERY_KEYS } from '../api/queryKeys';
import { io } from 'socket.io-client';
import logger from '../services/socketio/loggingService';
import { SOCKET_EVENTS, SOCKET_STATE } from '../services/socketio/constants';
import { getAccessToken } from '../utils/storage/tokenStorage';
import { WS_BASE_URL } from '../config';
import { formatToKST, DATE_FORMATS, formatInTimeZone } from '../utils/dateUtils';

// Context 생성
const SocketIOContext = createContext(null);

/**
 * Socket.IO Provider 컴포넌트
 */
const SocketIOProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  
  // AuthContext 직접 의존성 제거
  const authRef = useRef(null);
  const tokenRef = useRef(getAccessToken());
  const shouldConnectRef = useRef(false);
  
  // Refs for tracking connection attempts
  const retryCountRef = useRef(0);
  const connectionAttemptsRef = useRef(0); // 연결 시도 카운터를 useRef로 관리
  const socketInstanceRef = useRef(null); // 소켓 인스턴스를 useRef로 관리
  
  // 재시도 관련 상수
  const maxRetries = 3;
  const maxConnectionAttempts = 2;
  
  // config.js에서 가져오거나 기본값 설정
  const wsBaseUrl = WS_BASE_URL || 'http://localhost:8000';
  
  // 연결 상태 업데이트 핸들러
  const handleConnectionStatusChange = useCallback((state) => {
    logger.info('SocketIOContext', `연결 상태 변경: ${state}`);
    
    switch (state) {
      case SOCKET_STATE.CONNECTED:
        setConnected(true);
        setIsReady(true);
        setError(null);
        enqueueSnackbar('실시간 업데이트 연결됨', { 
          variant: 'success',
          autoHideDuration: 3000
        });
        break;
      case SOCKET_STATE.DISCONNECTED:
        setConnected(false);
        setIsReady(false);
        
        // 연결이 끊겼을 때 캐시 일부 무효화
        if (state === SOCKET_STATE.DISCONNECTED) {
          enqueueSnackbar('실시간 업데이트 연결이 끊겼습니다. 재연결 시도 중...', { 
            variant: 'warning',
            autoHideDuration: 3000
          });
        }
        break;
      case SOCKET_STATE.ERROR:
        setConnected(false);
        setIsReady(false);
        break;
      default:
        break;
    }
  }, [enqueueSnackbar]);

  // 연결 초기화
  const connect = useCallback(() => {
    const currentToken = getAccessToken();
    
    // 토큰 검증 및 로깅 강화
    if (!currentToken?.trim()) {
      logger.warn('SocketIOContext', '유효한 토큰이 없어 웹소켓 연결을 시도하지 않습니다.');
      return;
    }
    
    try {
      // 토큰 디코딩 시도 (JWT 형식 검증)
      const tokenParts = currentToken.split('.');
      if (tokenParts.length === 3) {
        try {
          const decodedPayload = JSON.parse(atob(tokenParts[1]));
          const expiresAt = decodedPayload.exp * 1000;
          const currentTime = Date.now();
          const timeLeft = Math.floor((expiresAt - currentTime) / 1000);
          
          logger.info('SocketIOContext', '토큰 검증 결과', {
            tokenLength: currentToken.length,
            isExpired: expiresAt < currentTime,
            timeLeft: timeLeft + '초',
            expiresAt: formatInTimeZone(new Date(expiresAt), 'Asia/Seoul', DATE_FORMATS.API),
            currentTime: formatInTimeZone(new Date(currentTime), 'Asia/Seoul', DATE_FORMATS.API)
          });
          
          if (expiresAt < currentTime) {
            logger.error('SocketIOContext', '토큰이 만료되어 웹소켓 연결을 시도하지 않습니다.');
            return;
          }
        } catch (e) {
          logger.error('SocketIOContext', '토큰 페이로드 디코딩 실패', { error: e.message });
        }
      } else {
        logger.warn('SocketIOContext', '토큰 형식이 JWT 표준과 다릅니다', { 
          tokenLength: currentToken.length,
          partsCount: tokenParts.length 
        });
      }
    } catch (e) {
      logger.error('SocketIOContext', '토큰 검증 중 오류 발생', { error: e.message });
    }
    
    logger.info('SocketIOContext', '연결 시도', {
      tokenLength: currentToken.length,
      wsBaseUrl: WS_BASE_URL
    });
    
    // 연결 시도 전 소켓 서비스 상태 확인
    const connectionState = socketIOService.getConnectionState();
    logger.debug('SocketIOContext', '소켓 서비스 상태', { connectionState });
    
    // 연결 시도
    socketIOService.connect();
    
    // 소켓 객체 참조 업데이트
    const socketInstance = socketIOService.getSocket();
    socketInstanceRef.current = socketInstance;
    setSocket(socketInstance);
    
    // 소켓 객체 상태 로깅
    logger.debug('SocketIOContext', '소켓 객체 상태', {
      socketExists: !!socketInstance,
      socketId: socketInstance?.id,
      connected: socketInstance?.connected
    });
  }, []);

  // 연결 종료
  const disconnect = useCallback(() => {
    logger.info('SocketIOContext', '연결 종료');
    socketIOService.disconnect();
  }, []);
  
  // 토큰 상태 정기 확인 (1초마다)
  useEffect(() => {
    const tokenCheckInterval = setInterval(() => {
      const currentToken = getAccessToken();
      
      // 토큰 변경 감지
      if (currentToken !== tokenRef.current) {
        logger.info('SocketIOContext', '토큰 변경 감지');
        
        // 토큰이 새로 생기면(로그인) 연결 시도
        if (currentToken?.trim() && !tokenRef.current) {
          logger.info('SocketIOContext', '토큰 발급됨 - 연결 시도 가능');
          shouldConnectRef.current = true;
          // 토큰이 있으면 즉시 연결 시도
          setTimeout(() => {
            if (currentToken?.trim()) {
              connect();
            }
          }, 1000); // 1초 후에 연결 시도
        } 
        // 토큰이 없어지면(로그아웃) 연결 해제
        else if (!currentToken && tokenRef.current) {
          logger.info('SocketIOContext', '토큰 삭제됨 - 연결 해제');
          shouldConnectRef.current = false;
          disconnect();
        }
        
        // 토큰 상태 업데이트
        tokenRef.current = currentToken;
      }
      
      // 토큰이 있고 연결해야 하는 상태일 때만 연결 시도
      if (tokenRef.current && shouldConnectRef.current && !connected) {
        connect();
      }
    }, 1000);
    
    return () => {
      clearInterval(tokenCheckInterval);
    };
  }, [connect, disconnect, connected]);

  // 관련 쿼리 무효화 함수
  const invalidateRelevantQueries = useCallback(() => {
    // 연결이 끊겼을 때 캐시 무효화
    queryClient.invalidateQueries([QUERY_KEYS.NOTIFICATIONS]);
    queryClient.invalidateQueries([QUERY_KEYS.NOTIFICATION_COUNT]);
  }, [queryClient]);

  // 소켓 서비스 이벤트 리스너 설정
  useEffect(() => {
    // 연결 상태 변경 이벤트 리스너
    const handleConnected = () => {
      logger.info('SocketIOContext', '소켓 연결됨');
      handleConnectionStatusChange(SOCKET_STATE.CONNECTED);
      
      // 소켓 객체 참조 업데이트
      const socketInstance = socketIOService.getSocket();
      socketInstanceRef.current = socketInstance;
      setSocket(socketInstance);
      
      // 소켓 객체 상태 로깅
      logger.debug('SocketIOContext', '소켓 객체 상태 (연결 후)', {
        socketExists: !!socketInstance,
        socketId: socketInstance?.id,
        connected: socketInstance?.connected
      });
    };
    
    const handleDisconnected = () => {
      logger.info('SocketIOContext', '소켓 연결 끊김');
      handleConnectionStatusChange(SOCKET_STATE.DISCONNECTED);
    };
    
    const handleError = (error) => {
      logger.error('SocketIOContext', '소켓 오류', { error });
      handleConnectionStatusChange(SOCKET_STATE.ERROR);
      setError(error);
    };
    
    // 이벤트 리스너 등록
    socketIOService.on(SOCKET_EVENTS.CONNECT, handleConnected);
    socketIOService.on(SOCKET_EVENTS.DISCONNECT, handleDisconnected);
    socketIOService.on(SOCKET_EVENTS.CONNECT_ERROR, handleError);
    
    // 정기적으로 소켓 객체 상태 확인 및 업데이트
    const socketCheckInterval = setInterval(() => {
      const socketInstance = socketIOService.getSocket();
      const isConnected = socketIOService.isConnected;
      
      // 상태가 불일치하면 업데이트
      if (!!socketInstance !== !!socket || isConnected !== connected) {
        logger.debug('SocketIOContext', '소켓 상태 불일치 감지', {
          contextSocket: !!socket,
          serviceSocket: !!socketInstance,
          contextConnected: connected,
          serviceConnected: isConnected
        });
        
        socketInstanceRef.current = socketInstance;
        setSocket(socketInstance);
        setConnected(isConnected);
      }
    }, 5000);
    
    // 컴포넌트 언마운트 시 이벤트 리스너 제거
    return () => {
      socketIOService.off(SOCKET_EVENTS.CONNECT, handleConnected);
      socketIOService.off(SOCKET_EVENTS.DISCONNECT, handleDisconnected);
      socketIOService.off(SOCKET_EVENTS.CONNECT_ERROR, handleError);
      clearInterval(socketCheckInterval);
    };
  }, [handleConnectionStatusChange, socket, connected]);

  // Socket.IO 이벤트 리스너 설정
  useEffect(() => {
    // 연결 이벤트 리스너
    const handleConnect = () => {
      logger.info('SocketIOContext', '소켓 연결됨');
      setConnected(true);
      setIsReady(true);
      setError(null);
      
      // 연결 성공 시 재시도 카운터 초기화
      retryCountRef.current = 0;
      connectionAttemptsRef.current = 0;
    };
    
    // 연결 해제 이벤트 리스너
    const handleDisconnect = (reason) => {
      logger.info('SocketIOContext', '소켓 연결 해제됨', { reason });
      setConnected(false);
      setIsReady(false);
      
      // 연결이 끊겼을 때 캐시 무효화 처리
      invalidateRelevantQueries();
    };
    
    // 연결 오류 이벤트 리스너
    const handleConnectError = (error) => {
      logger.error('SocketIOContext', '소켓 연결 오류', error);
      setConnected(false);
      setIsReady(false);
      setError(error);
      
      // 오류 메시지 표시
      enqueueSnackbar('실시간 업데이트 연결 오류가 발생했습니다', { 
        variant: 'error',
        autoHideDuration: 5000
      });
    };
    
    // CVE 업데이트 이벤트 리스너
    const handleCVEUpdated = (data) => {
      logger.info('SocketIOContext', 'CVE 업데이트 수신', data);
      
      // CVE 데이터 캐시 무효화
      if (data && data.cveId) {
        queryClient.invalidateQueries([QUERY_KEYS.CVE, data.cveId]);
        enqueueSnackbar(`${data.cveId} 정보가 업데이트되었습니다`, { 
          variant: 'info',
          autoHideDuration: 3000
        });
      }
    };
    
    // CVE 생성 이벤트 리스너
    const handleCVECreated = (data) => {
      logger.info('SocketIOContext', 'CVE 생성 수신', data);
      
      // CVE 목록 캐시 무효화
      queryClient.invalidateQueries([QUERY_KEYS.CVES]);
      
      if (data && data.cveId) {
        enqueueSnackbar(`새로운 ${data.cveId}가 등록되었습니다`, { 
          variant: 'info',
          autoHideDuration: 3000
        });
      }
    };
    
    // 알림 이벤트 리스너
    const handleNotification = (data) => {
      logger.info('SocketIOContext', '알림 수신', data);
      
      // 알림 관련 캐시 무효화
      queryClient.invalidateQueries([QUERY_KEYS.NOTIFICATIONS]);
      queryClient.invalidateQueries([QUERY_KEYS.NOTIFICATION_COUNT]);
      
      // 알림 메시지 표시
      if (data && data.message) {
        enqueueSnackbar(data.message, { 
          variant: 'info',
          autoHideDuration: 5000
        });
      }
    };
    
    // 이벤트 리스너 등록
    socketIOService.on(SOCKET_EVENTS.CONNECT, handleConnect);
    socketIOService.on(SOCKET_EVENTS.DISCONNECT, handleDisconnect);
    socketIOService.on(SOCKET_EVENTS.CONNECT_ERROR, handleConnectError);
    socketIOService.on(SOCKET_EVENTS.CVE_UPDATED, handleCVEUpdated);
    socketIOService.on(SOCKET_EVENTS.CVE_CREATED, handleCVECreated);
    socketIOService.on(SOCKET_EVENTS.NOTIFICATION, handleNotification);
    
    // 컴포넌트 언마운트 시 이벤트 리스너 제거
    return () => {
      socketIOService.off(SOCKET_EVENTS.CONNECT, handleConnect);
      socketIOService.off(SOCKET_EVENTS.DISCONNECT, handleDisconnect);
      socketIOService.off(SOCKET_EVENTS.CONNECT_ERROR, handleConnectError);
      socketIOService.off(SOCKET_EVENTS.CVE_UPDATED, handleCVEUpdated);
      socketIOService.off(SOCKET_EVENTS.CVE_CREATED, handleCVECreated);
      socketIOService.off(SOCKET_EVENTS.NOTIFICATION, handleNotification);
    };
  }, [enqueueSnackbar, queryClient, invalidateRelevantQueries]);
  
  // 컨텍스트 값 정의
  const contextValue = {
    socket,
    connected,
    isReady,
    error,
    connect,
    disconnect
  };
  
  return (
    <SocketIOContext.Provider value={contextValue}>
      {children}
    </SocketIOContext.Provider>
  );
};

/**
 * Socket.IO Context 사용을 위한 훅
 */
const useSocketIO = () => {
  const context = useContext(SocketIOContext);
  if (!context) {
    throw new Error('useSocketIO must be used within a SocketIOProvider');
  }
  return context;
};

// 파일 하단에서 내보내기
export { SocketIOProvider, useSocketIO, SocketIOContext };
export default SocketIOContext;