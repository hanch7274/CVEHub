import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import socketIOService from '../services/socketio/socketio';
import { QUERY_KEYS } from '../api/queryKeys';
import logger from '../utils/logging';
import { SOCKET_STATE, SOCKET_EVENTS, WS_LOG_CONTEXT, WS_DIRECTION, WS_STATUS } from '../services/socketio/constants';
import { getAccessToken } from '../utils/storage/tokenStorage';
import { WS_BASE_URL, SOCKET_IO_PATH, SOCKET_CONFIG } from '../config';
import { formatToKST, DATE_FORMATS, formatWithTimeZone } from '../utils/dateUtils';

// Context 생성
const SocketIOContext = createContext(null);

/**
 * Socket.IO Provider 컴포넌트
 * 중앙집중형 웹소켓 관리 담당
 */
const SocketIOProvider = ({ children }) => {
  // 상태 관리
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const [eventHandlers, setEventHandlers] = useState({});
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  
  // Refs
  const tokenRef = useRef(getAccessToken());
  const shouldConnectRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const socketInstanceRef = useRef(null);
  const connectionCheckerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const globalEventHandlersRef = useRef({});
  
  // 재시도 관련 상수 - 중앙 config 사용
  const maxRetries = SOCKET_CONFIG.RECONNECTION_ATTEMPTS;
  const reconnectionDelay = SOCKET_CONFIG.RECONNECTION_DELAY;
  
  // 연결 상태 업데이트 핸들러
  const handleConnectionStatusChange = useCallback((state) => {
    logger.info('SocketIOContext', `연결 상태 변경: ${state}`, { 
      function: 'handleConnectionStatusChange', 
      state, 
      connected: state === SOCKET_STATE.CONNECTED 
    });
    
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
      logger.warn('SocketIOContext', '유효한 토큰이 없어 웹소켓 연결을 시도하지 않습니다.', { 
        function: 'connect',
        tokenExists: false
      });
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
            function: 'connect',
            tokenLength: currentToken.length,
            isExpired: expiresAt < currentTime,
            timeLeft: timeLeft + '초',
            expiresAt: formatWithTimeZone(new Date(expiresAt), 'Asia/Seoul', DATE_FORMATS.API),
            currentTime: formatWithTimeZone(new Date(currentTime), 'Asia/Seoul', DATE_FORMATS.API)
          });
          
          if (expiresAt < currentTime) {
            logger.error('SocketIOContext', '토큰이 만료되어 웹소켓 연결을 시도하지 않습니다.', { 
              function: 'connect',
              expiresAt: formatWithTimeZone(new Date(expiresAt), 'Asia/Seoul', DATE_FORMATS.API),
              currentTime: formatWithTimeZone(new Date(currentTime), 'Asia/Seoul', DATE_FORMATS.API)
            });
            return;
          }
        } catch (e) {
          logger.error('SocketIOContext', '토큰 페이로드 디코딩 실패', { 
            function: 'connect', 
            error: e.message,
            tokenFormat: 'JWT',
            tokenPartsCount: tokenParts.length
          });
        }
      } else {
        logger.warn('SocketIOContext', '토큰 형식이 JWT 표준과 다릅니다', { 
          function: 'connect',
          tokenLength: currentToken.length,
          partsCount: tokenParts.length 
        });
      }
    } catch (e) {
      logger.error('SocketIOContext', '토큰 검증 중 오류 발생', { 
        function: 'connect', 
        error: e.message,
        stack: e.stack
      });
    }
    
    logger.info('SocketIOContext', '웹소켓 연결 시도', {
      function: 'connect',
      tokenLength: currentToken.length,
      wsBaseUrl: WS_BASE_URL,
      socketIoPath: SOCKET_IO_PATH,
      fullUrl: `${WS_BASE_URL}`
    });
    
    // 연결 시도 전 소켓 서비스 상태 확인
    const connectionState = socketIOService.getConnectionState();
    logger.debug('SocketIOContext', '소켓 서비스 상태', { 
      function: 'connect', 
      connectionState,
      retryCount: reconnectAttemptsRef.current,
      connectionAttempts: reconnectAttemptsRef.current
    });
    
    // 연결 시도
    try {
      socketIOService.connect();
      
      // 소켓 객체 참조 업데이트
      const socketInstance = socketIOService.getSocket();
      socketInstanceRef.current = socketInstance;
      setSocket(socketInstance);
      
      // 소켓 객체 상태 로깅
      logger.debug('SocketIOContext', '소켓 객체 상태', {
        function: 'connect',
        socketExists: !!socketInstance,
        socketId: socketInstance?.id,
        connected: socketInstance?.connected
      });
    } catch (error) {
      logger.error('SocketIOContext', '소켓 연결 시도 중 오류 발생', {
        function: 'connect',
        error: error.message,
        stack: error.stack
      });
    }
  }, []);

  // 연결 종료
  const disconnect = useCallback(() => {
    logger.info('SocketIOContext', '웹소켓 연결 종료 시도', { 
      function: 'disconnect',
      socketExists: !!socketInstanceRef.current,
      socketId: socketInstanceRef.current?.id,
      connected: socketInstanceRef.current?.connected
    });
    
    try {
      socketIOService.disconnect();
      logger.info('SocketIOContext', '웹소켓 연결 종료 완료', { function: 'disconnect' });
    } catch (error) {
      logger.error('SocketIOContext', '웹소켓 연결 종료 중 오류 발생', {
        function: 'disconnect',
        error: error.message,
        stack: error.stack
      });
    }
  }, []);
  
  // 글로벌 이벤트 핸들러 설정 함수
  const setupGlobalEventHandlers = useCallback(() => {
    const handlers = {
      // CVE 관련 이벤트
      [SOCKET_EVENTS.CVE_UPDATED]: (data) => {
        logger.info('SocketIOContext', 'CVE 업데이트 이벤트 수신', {
          function: 'globalEventHandlers.CVE_UPDATED',
          cveId: data?.cveId || data?.id
        });
        
        // 쿼리 무효화
        if (data?.cveId || data?.id) {
          const cveId = data.cveId || data.id;
          queryClient.invalidateQueries(['cve', cveId], {
            refetchActive: true
          });
          queryClient.invalidateQueries(['cves'], {
            refetchActive: true
          });
        }
      },
      
      [SOCKET_EVENTS.CVE_CREATED]: (data) => {
        logger.info('SocketIOContext', 'CVE 생성 이벤트 수신', {
          function: 'globalEventHandlers.CVE_CREATED',
          cveId: data?.cveId || data?.id
        });
        
        // 쿼리 무효화
        queryClient.invalidateQueries(['cves'], {
          refetchActive: true
        });
        
        // 알림 표시
        if (data?.cveId || data?.id) {
          const cveId = data.cveId || data.id;
          enqueueSnackbar(`새로운 CVE ${cveId}가 생성되었습니다.`, { 
            variant: 'info',
            autoHideDuration: 3000
          });
        }
      },
      
      // 크롤러 관련 이벤트
      [SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS]: (data) => {
        logger.info('SocketIOContext', '크롤러 업데이트 이벤트 수신', {
          function: 'globalEventHandlers.CRAWLER_UPDATE_PROGRESS',
          stage: data?.stage,
          percent: data?.percent
        });
        
        // CrawlerUpdateButton 컴포넌트가 이 이벤트를 처리하므로 여기서는 추가 작업 없음
      },
      
      // 알림 관련 이벤트
      [SOCKET_EVENTS.NOTIFICATION]: (data) => {
        logger.info('SocketIOContext', '알림 이벤트 수신', {
          function: 'globalEventHandlers.NOTIFICATION',
          notificationId: data?.id,
          type: data?.type
        });
        
        // 알림 관련 쿼리 무효화
        queryClient.invalidateQueries(['notifications'], {
          refetchActive: true
        });
      },
      
      // 댓글 관련 이벤트
      [SOCKET_EVENTS.COMMENT_ADDED]: (data) => {
        logger.info('SocketIOContext', '댓글 추가 이벤트 수신', {
          function: 'globalEventHandlers.COMMENT_ADDED',
          cveId: data?.cveId,
          commentId: data?.id
        });
        
        // 해당 CVE의 댓글 쿼리 무효화
        if (data?.cveId) {
          queryClient.invalidateQueries(['comments', data.cveId], {
            refetchActive: true
          });
        }
      }
    };
    
    // 레퍼런스 저장
    globalEventHandlersRef.current = handlers;
    
    // 이벤트 핸들러 등록
    Object.entries(handlers).forEach(([event, handler]) => {
      socketIOService.on(event, handler);
    });
    
    logger.info('SocketIOContext', '글로벌 이벤트 핸들러 설정 완료', {
      function: 'setupGlobalEventHandlers',
      eventCount: Object.keys(handlers).length
    });
    
    // 정리 함수 반환
    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        socketIOService.off(event, handler);
      });
      
      logger.info('SocketIOContext', '글로벌 이벤트 핸들러 정리 완료', {
        function: 'cleanupGlobalEventHandlers'
      });
    };
  }, [queryClient, enqueueSnackbar]);

  // 토큰 상태 정기 확인 및 연결 관리
  useEffect(() => {
    const tokenCheckInterval = setInterval(() => {
      const currentToken = getAccessToken();
      
      // 토큰 변경 감지
      if (currentToken !== tokenRef.current) {
        logger.info('SocketIOContext', '토큰 변경 감지', { 
          function: 'tokenCheckInterval',
          hadTokenBefore: !!tokenRef.current,
          hasTokenNow: !!currentToken,
          tokenChanged: true
        });
        
        // 토큰이 새로 생기면(로그인) 연결 시도
        if (currentToken?.trim() && !tokenRef.current) {
          logger.info('SocketIOContext', '토큰 발급됨 - 연결 시도 가능', { 
            function: 'tokenCheckInterval',
            tokenLength: currentToken.length
          });
          shouldConnectRef.current = true;
          reconnectAttemptsRef.current = 0; // 재시도 카운터 초기화
          
          // Docker 환경 고려하여 약간의 지연 후 연결 시도
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
          }
          
          reconnectTimerRef.current = setTimeout(() => {
            if (currentToken?.trim()) {
              connect();
            }
          }, 2000); // 2초 후에 연결 시도 (Docker 환경 고려)
        } 
        // 토큰이 없어지면(로그아웃) 연결 해제
        else if (!currentToken && tokenRef.current) {
          logger.info('SocketIOContext', '토큰 삭제됨 - 연결 해제', { 
            function: 'tokenCheckInterval',
            wasConnected: connected
          });
          shouldConnectRef.current = false;
          
          // 진행 중인 재연결 타이머 정리
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          
          disconnect();
        }
        
        // 토큰 상태 업데이트
        tokenRef.current = currentToken;
      }
      
      // 토큰이 있고 연결해야 하는 상태일 때만 연결 상태 확인 및 필요시 재연결
      if (tokenRef.current && shouldConnectRef.current) {
        // 연결되지 않은 상태에서만 재연결 시도
        if (!connected && reconnectAttemptsRef.current < maxRetries) {
          // 지수 백오프 적용하여 재연결 시도
          const backoffDelay = Math.min(
            reconnectionDelay * Math.pow(1.5, reconnectAttemptsRef.current),
            SOCKET_CONFIG.RECONNECTION_DELAY_MAX
          );
          
          logger.debug('SocketIOContext', '재연결 시도 예약', { 
            function: 'tokenCheckInterval',
            attempt: reconnectAttemptsRef.current + 1,
            maxRetries: maxRetries,
            delay: `${backoffDelay}ms`
          });
          
          // 이전 타이머 정리
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
          }
          
          // 새 타이머 설정
          reconnectTimerRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, backoffDelay);
        }
      }
    }, 1000);
    
    // 정리 함수
    return () => {
      clearInterval(tokenCheckInterval);
      
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      
      if (connectionCheckerRef.current) {
        clearInterval(connectionCheckerRef.current);
        connectionCheckerRef.current = null;
      }
    };
  }, [connect, disconnect, connected, maxRetries, reconnectionDelay]);

  // 소켓 이벤트 리스너 설정 함수
  const setupEventListeners = useCallback((socket) => {
    if (!socket) {
      logger.warn('SocketIOContext', '소켓이 없어 이벤트 리스너를 설정할 수 없습니다.', { 
        function: 'setupEventListeners', 
        socketExists: false 
      });
      return;
    }

    try {
      // 기본 소켓 이벤트 리스너
      socket.on('connect', () => {
        logger.info('SocketIOContext', '소켓 연결됨', { 
          function: 'setupEventListeners.connect', 
          socketId: socket.id 
        });
        setConnected(true);
      });

      socket.on('connect_error', (error) => {
        logger.error('SocketIOContext', '소켓 연결 오류', { 
          function: 'setupEventListeners.connect_error', 
          error: error.message, 
          socketId: socket?.id 
        });
        setConnected(false);
      });

      socket.on('disconnect', (reason) => {
        logger.warn('SocketIOContext', '소켓 연결 해제됨', { 
          function: 'setupEventListeners.disconnect', 
          reason, 
          socketId: socket?.id 
        });
        setConnected(false);
      });

      socket.on('reconnect_attempt', (attemptNumber) => {
        logger.info('SocketIOContext', '소켓 재연결 시도', { 
          function: 'setupEventListeners.reconnect_attempt', 
          attemptNumber, 
          socketId: socket?.id 
        });
      });

      socket.on('reconnect_failed', () => {
        logger.error('SocketIOContext', '소켓 재연결 실패', { 
          function: 'setupEventListeners.reconnect_failed', 
          socketId: socket?.id 
        });
        setConnected(false);
      });

      socket.on('reconnect', (attemptNumber) => {
        logger.info('SocketIOContext', '소켓 재연결 성공', { 
          function: 'setupEventListeners.reconnect', 
          attemptNumber, 
          socketId: socket.id 
        });
        setConnected(true);
      });

      socket.on('error', (error) => {
        logger.error('SocketIOContext', '소켓 오류 발생', { 
          function: 'setupEventListeners.error', 
          error: error.message, 
          socketId: socket?.id 
        });
      });

      // 비즈니스 이벤트 리스너
      // 구독 업데이트 이벤트
      socket.on(SOCKET_EVENTS.SUBSCRIPTION_UPDATED, (data) => {
        try {
          logger.info('SocketIOContext', '구독 업데이트 이벤트 수신', { 
            function: 'setupEventListeners.SUBSCRIPTION_UPDATED', 
            data: JSON.stringify(data), 
            userId: data?.userId,
            subscriptionId: data?.subscriptionId,
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.SUBSCRIPTION_UPDATED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.SUCCESS,
            socketId: socket.id 
          });
          
          // 구독 관련 쿼리 무효화
          queryClient.invalidateQueries(['subscriptions']);
          enqueueSnackbar('구독 정보가 업데이트되었습니다.', { variant: 'info' });
        } catch (error) {
          logger.error('SocketIOContext', '구독 업데이트 이벤트 처리 중 오류 발생', { 
            function: 'setupEventListeners.SUBSCRIPTION_UPDATED', 
            error: error.message, 
            stack: error.stack,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.SUBSCRIPTION_UPDATED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
            socketId: socket.id 
          });
        }
      });

      // CVE 업데이트 이벤트
      socket.on(SOCKET_EVENTS.CVE_UPDATED, (data) => {
        try {
          logger.info('SocketIOContext', 'CVE 업데이트 이벤트 수신', { 
            function: 'setupEventListeners.CVE_UPDATED', 
            cveId: data?.cveId,
            updatedBy: data?.updatedBy,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.CVE_UPDATED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.SUCCESS,
            [WS_LOG_CONTEXT.TARGET_ID]: data?.cveId,
            socketId: socket.id 
          });
          
          // CVE 관련 쿼리 무효화 - 우선순위 높게 설정
          if (data?.cveId) {
            queryClient.invalidateQueries(['cve', data.cveId], {
              refetchActive: true,
              refetchInactive: false
            });
            enqueueSnackbar(`CVE ${data.cveId}가 업데이트되었습니다.`, { variant: 'info' });
          } 
        } catch (error) {
          logger.error('SocketIOContext', 'CVE 업데이트 이벤트 처리 중 오류 발생', { 
            function: 'setupEventListeners.CVE_UPDATED', 
            error: error.message, 
            stack: error.stack,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.CVE_UPDATED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
            socketId: socket.id 
          });
        }
      });

      // CVE 생성 이벤트
      socket.on(SOCKET_EVENTS.CVE_CREATED, (data) => {
        try {
          logger.info('SocketIOContext', 'CVE 생성 이벤트 수신', { 
            function: 'setupEventListeners.CVE_CREATED', 
            cveId: data?.cveId,
            createdBy: data?.createdBy,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.CVE_CREATED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.SUCCESS,
            [WS_LOG_CONTEXT.TARGET_ID]: data?.cveId,
            socketId: socket.id 
          });
          
          // CVE 목록 쿼리 무효화
          queryClient.invalidateQueries(['cves']);
          
          if (data?.cveId) {
            enqueueSnackbar(`새로운 CVE ${data.cveId}가 생성되었습니다.`, { variant: 'success' });
          } else {
            logger.warn('SocketIOContext', 'CVE 생성 이벤트에 cveId가 없습니다.', { 
              function: 'setupEventListeners.CVE_CREATED', 
              data: JSON.stringify(data),
              [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.CVE_CREATED,
              [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
              [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
              socketId: socket.id 
            });
          }
        } catch (error) {
          logger.error('SocketIOContext', 'CVE 생성 이벤트 처리 중 오류 발생', { 
            function: 'setupEventListeners.CVE_CREATED', 
            error: error.message, 
            stack: error.stack,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.CVE_CREATED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
            socketId: socket.id 
          });
        }
      });

      // CVE 캐시 무효화 이벤트
      socket.on(SOCKET_EVENTS.CVE_CACHE_INVALIDATED, (data) => {
        try {
          logger.info('SocketIOContext', 'CVE 캐시 무효화 이벤트 수신', { 
            function: 'setupEventListeners.CVE_CACHE_INVALIDATED', 
            reason: data?.reason,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.CVE_CACHE_INVALIDATED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.SUCCESS,
            socketId: socket.id 
          });
          
          // 모든 CVE 관련 쿼리 무효화 - 우선순위 높게 설정
          queryClient.invalidateQueries(['cves'], {
            refetchActive: true,
            refetchInactive: false
          });
          enqueueSnackbar('CVE 정보가 업데이트되었습니다.', { variant: 'info' });
        } catch (error) {
          logger.error('SocketIOContext', 'CVE 캐시 무효화 이벤트 처리 중 오류 발생', { 
            function: 'setupEventListeners.CVE_CACHE_INVALIDATED', 
            error: error.message, 
            stack: error.stack,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.CVE_CACHE_INVALIDATED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
            socketId: socket.id 
          });
        }
      });

      // 댓글 추가 이벤트
      socket.on(SOCKET_EVENTS.COMMENT_ADDED, (data) => {
        try {
          logger.info('SocketIOContext', '댓글 추가 이벤트 수신', { 
            function: 'setupEventListeners.COMMENT_ADDED', 
            cveId: data?.cveId,
            commentId: data?.commentId,
            authorId: data?.authorId,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_ADDED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.SUCCESS,
            [WS_LOG_CONTEXT.TARGET_ID]: data?.commentId,
            socketId: socket.id 
          });
          
          // 댓글 관련 쿼리 무효화
          if (data?.cveId) {
            queryClient.invalidateQueries(['comments', data.cveId], {
              refetchActive: true,
              refetchInactive: false
            });
            enqueueSnackbar('새로운 댓글이 추가되었습니다.', { variant: 'info' });
          } else {
            logger.warn('SocketIOContext', '댓글 추가 이벤트에 cveId가 없습니다.', { 
              function: 'setupEventListeners.COMMENT_ADDED', 
              data: JSON.stringify(data),
              [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_ADDED,
              [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
              [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
              socketId: socket.id 
            });
          }
        } catch (error) {
          logger.error('SocketIOContext', '댓글 추가 이벤트 처리 중 오류 발생', { 
            function: 'setupEventListeners.COMMENT_ADDED', 
            error: error.message, 
            stack: error.stack,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_ADDED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
            socketId: socket.id 
          });
        }
      });

      // 댓글 업데이트 이벤트
      socket.on(SOCKET_EVENTS.COMMENT_UPDATED, (data) => {
        try {
          logger.info('SocketIOContext', '댓글 업데이트 이벤트 수신', { 
            function: 'setupEventListeners.COMMENT_UPDATED', 
            cveId: data?.cveId,
            commentId: data?.commentId,
            updatedBy: data?.updatedBy,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_UPDATED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.SUCCESS,
            [WS_LOG_CONTEXT.TARGET_ID]: data?.commentId,
            socketId: socket.id 
          });
          
          // 댓글 관련 쿼리 무효화
          if (data?.cveId) {
            queryClient.invalidateQueries(['comments', data.cveId], {
              refetchActive: true,
              refetchInactive: false
            });
            enqueueSnackbar('댓글이 업데이트되었습니다.', { variant: 'info' });
          } else {
            logger.warn('SocketIOContext', '댓글 업데이트 이벤트에 cveId가 없습니다.', { 
              function: 'setupEventListeners.COMMENT_UPDATED', 
              data: JSON.stringify(data),
              [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_UPDATED,
              [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
              [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
              socketId: socket.id 
            });
          }
        } catch (error) {
          logger.error('SocketIOContext', '댓글 업데이트 이벤트 처리 중 오류 발생', { 
            function: 'setupEventListeners.COMMENT_UPDATED', 
            error: error.message, 
            stack: error.stack,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_UPDATED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
            socketId: socket.id 
          });
        }
      });

      // 댓글 삭제 이벤트
      socket.on(SOCKET_EVENTS.COMMENT_DELETED, (data) => {
        try {
          logger.info('SocketIOContext', '댓글 삭제 이벤트 수신', { 
            function: 'setupEventListeners.COMMENT_DELETED', 
            cveId: data?.cveId,
            commentId: data?.commentId,
            deletedBy: data?.deletedBy,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_DELETED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.SUCCESS,
            [WS_LOG_CONTEXT.TARGET_ID]: data?.commentId,
            socketId: socket.id 
          });
          
          // 댓글 관련 쿼리 무효화
          if (data?.cveId) {
            queryClient.invalidateQueries(['comments', data.cveId]);
            enqueueSnackbar('댓글이 삭제되었습니다.', { variant: 'info' });
          } else {
            logger.warn('SocketIOContext', '댓글 삭제 이벤트에 cveId가 없습니다.', { 
              function: 'setupEventListeners.COMMENT_DELETED', 
              data: JSON.stringify(data),
              [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_DELETED,
              [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
              [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
              socketId: socket.id 
            });
          }
        } catch (error) {
          logger.error('SocketIOContext', '댓글 삭제 이벤트 처리 중 오류 발생', { 
            function: 'setupEventListeners.COMMENT_DELETED', 
            error: error.message, 
            stack: error.stack,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_DELETED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
            socketId: socket.id 
          });
        }
      });

      // 댓글 반응 추가 이벤트
      socket.on(SOCKET_EVENTS.COMMENT_REACTION_ADDED, (data) => {
        try {
          logger.info('SocketIOContext', '댓글 반응 추가 이벤트 수신', { 
            function: 'setupEventListeners.COMMENT_REACTION_ADDED', 
            cveId: data?.cveId,
            commentId: data?.commentId,
            userId: data?.userId,
            reactionType: data?.reactionType,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_REACTION_ADDED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.SUCCESS,
            [WS_LOG_CONTEXT.TARGET_ID]: data?.commentId,
            socketId: socket.id 
          });
          
          // 댓글 관련 쿼리 무효화
          if (data?.cveId && data?.commentId) {
            queryClient.invalidateQueries(['comments', data.cveId]);
          } else {
            logger.warn('SocketIOContext', '댓글 반응 추가 이벤트에 필수 정보가 없습니다.', { 
              function: 'setupEventListeners.COMMENT_REACTION_ADDED', 
              data: JSON.stringify(data),
              [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_REACTION_ADDED,
              [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
              [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
              socketId: socket.id 
            });
          }
        } catch (error) {
          logger.error('SocketIOContext', '댓글 반응 추가 이벤트 처리 중 오류 발생', { 
            function: 'setupEventListeners.COMMENT_REACTION_ADDED', 
            error: error.message, 
            stack: error.stack,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_REACTION_ADDED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
            socketId: socket.id 
          });
        }
      });

      // 댓글 반응 제거 이벤트
      socket.on(SOCKET_EVENTS.COMMENT_REACTION_REMOVED, (data) => {
        try {
          logger.info('SocketIOContext', '댓글 반응 제거 이벤트 수신', { 
            function: 'setupEventListeners.COMMENT_REACTION_REMOVED', 
            cveId: data?.cveId,
            commentId: data?.commentId,
            userId: data?.userId,
            reactionType: data?.reactionType,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_REACTION_REMOVED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.SUCCESS,
            [WS_LOG_CONTEXT.TARGET_ID]: data?.commentId,
            socketId: socket.id 
          });
          
          // 댓글 관련 쿼리 무효화
          if (data?.cveId && data?.commentId) {
            queryClient.invalidateQueries(['comments', data.cveId]);
          } else {
            logger.warn('SocketIOContext', '댓글 반응 제거 이벤트에 필수 정보가 없습니다.', { 
              function: 'setupEventListeners.COMMENT_REACTION_REMOVED', 
              data: JSON.stringify(data),
              [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_REACTION_REMOVED,
              [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
              [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
              socketId: socket.id 
            });
          }
        } catch (error) {
          logger.error('SocketIOContext', '댓글 반응 제거 이벤트 처리 중 오류 발생', { 
            function: 'setupEventListeners.COMMENT_REACTION_REMOVED', 
            error: error.message, 
            stack: error.stack,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_REACTION_REMOVED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
            socketId: socket.id 
          });
        }
      });

      // 댓글 멘션 추가 이벤트
      socket.on(SOCKET_EVENTS.COMMENT_MENTION_ADDED, (data) => {
        try {
          logger.info('SocketIOContext', '댓글 멘션 추가 이벤트 수신', { 
            function: 'setupEventListeners.COMMENT_MENTION_ADDED', 
            cveId: data?.cveId,
            commentId: data?.commentId,
            mentionedUserId: data?.mentionedUserId,
            authorId: data?.authorId,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_MENTION_ADDED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.SUCCESS,
            [WS_LOG_CONTEXT.TARGET_ID]: data?.commentId,
            socketId: socket.id 
          });
          
          // 현재 사용자가 멘션된 경우에만 알림 표시
          const currentUser = queryClient.getQueryData(['currentUser']);
          if (data?.mentionedUserId === currentUser?.id) {
            enqueueSnackbar(`${data?.authorName || '사용자'}님이 댓글에서 회원님을 언급했습니다.`, { variant: 'info' });
          }
          
          // 댓글 관련 쿼리 무효화
          if (data?.cveId) {
            queryClient.invalidateQueries(['comments', data.cveId]);
          } else {
            logger.warn('SocketIOContext', '댓글 멘션 추가 이벤트에 cveId가 없습니다.', { 
              function: 'setupEventListeners.COMMENT_MENTION_ADDED', 
              data: JSON.stringify(data),
              [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_MENTION_ADDED,
              [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
              [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
              socketId: socket.id 
            });
          }
        } catch (error) {
          logger.error('SocketIOContext', '댓글 멘션 추가 이벤트 처리 중 오류 발생', { 
            function: 'setupEventListeners.COMMENT_MENTION_ADDED', 
            error: error.message, 
            stack: error.stack,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_MENTION_ADDED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
            socketId: socket.id 
          });
        }
      });

      // 댓글 답글 추가 이벤트
      socket.on(SOCKET_EVENTS.COMMENT_REPLY_ADDED, (data) => {
        try {
          logger.info('SocketIOContext', '댓글 답글 추가 이벤트 수신', { 
            function: 'setupEventListeners.COMMENT_REPLY_ADDED', 
            cveId: data?.cveId,
            commentId: data?.commentId,
            replyId: data?.replyId,
            parentCommentId: data?.parentCommentId,
            authorId: data?.authorId,
            parentAuthorId: data?.parentAuthorId,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_REPLY_ADDED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.SUCCESS,
            [WS_LOG_CONTEXT.TARGET_ID]: data?.replyId,
            socketId: socket.id 
          });
          
          // 현재 사용자가 원 댓글 작성자인 경우에만 알림 표시
          const currentUser = queryClient.getQueryData(['currentUser']);
          if (data?.parentAuthorId === currentUser?.id && data?.authorId !== currentUser?.id) {
            enqueueSnackbar(`${data?.authorName || '사용자'}님이 회원님의 댓글에 답글을 달았습니다.`, { variant: 'info' });
          }
          
          // 댓글 관련 쿼리 무효화
          if (data?.cveId) {
            queryClient.invalidateQueries(['comments', data.cveId]);
          } else {
            logger.warn('SocketIOContext', '댓글 답글 추가 이벤트에 cveId가 없습니다.', { 
              function: 'setupEventListeners.COMMENT_REPLY_ADDED', 
              data: JSON.stringify(data),
              [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_REPLY_ADDED,
              [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
              [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
              socketId: socket.id 
            });
          }
        } catch (error) {
          logger.error('SocketIOContext', '댓글 답글 추가 이벤트 처리 중 오류 발생', { 
            function: 'setupEventListeners.COMMENT_REPLY_ADDED', 
            error: error.message, 
            stack: error.stack,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_REPLY_ADDED,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
            socketId: socket.id 
          });
        }
      });

      // 댓글 수 업데이트 이벤트
      socket.on(SOCKET_EVENTS.COMMENT_COUNT_UPDATE, (data) => {
        try {
          logger.info('SocketIOContext', '댓글 수 업데이트 이벤트 수신', { 
            function: 'setupEventListeners.COMMENT_COUNT_UPDATE', 
            cveId: data?.cveId,
            count: data?.count,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_COUNT_UPDATE,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.SUCCESS,
            [WS_LOG_CONTEXT.TARGET_ID]: data?.cveId,
            socketId: socket.id 
          });
          
          // CVE 목록 쿼리 무효화 (댓글 수가 표시되는 경우)
          if (data?.cveId) {
            queryClient.invalidateQueries(['cves']);
            queryClient.invalidateQueries(['cve', data.cveId]);
          } else {
            logger.warn('SocketIOContext', '댓글 수 업데이트 이벤트에 cveId가 없습니다.', { 
              function: 'setupEventListeners.COMMENT_COUNT_UPDATE', 
              data: JSON.stringify(data),
              [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_COUNT_UPDATE,
              [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
              [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
              socketId: socket.id 
            });
          }
        } catch (error) {
          logger.error('SocketIOContext', '댓글 수 업데이트 이벤트 처리 중 오류 발생', { 
            function: 'setupEventListeners.COMMENT_COUNT_UPDATE', 
            error: error.message, 
            stack: error.stack,
            data: JSON.stringify(data),
            [WS_LOG_CONTEXT.EVENT_TYPE]: SOCKET_EVENTS.COMMENT_COUNT_UPDATE,
            [WS_LOG_CONTEXT.EVENT_DIRECTION]: WS_DIRECTION.INCOMING,
            [WS_LOG_CONTEXT.STATUS]: WS_STATUS.FAILURE,
            socketId: socket.id 
          });
        }
      });

      logger.info('SocketIOContext', '모든 이벤트 리스너 설정 완료', { 
        function: 'setupEventListeners', 
        socketId: socket.id,
        eventCount: 17
      });
    } catch (error) {
      logger.error('SocketIOContext', '이벤트 리스너 설정 중 오류 발생', { 
        function: 'setupEventListeners', 
        error: error.message, 
        stack: error.stack,
        socketId: socket?.id 
      });
    }
  }, [queryClient, enqueueSnackbar]);

  // 소켓 서비스 이벤트 리스너 설정
  useEffect(() => {
    logger.info('SocketIOContext', '소켓 서비스 이벤트 리스너 설정 시작', { 
      function: 'useEffect.socketServiceEventListener',
      socketExists: !!socket,
      socketId: socket?.id,
      connected: socket?.connected
    });
    
    // 연결 상태 변경 이벤트 리스너
    const handleConnected = () => {
      logger.info('SocketIOContext', '소켓 연결됨', { function: 'socketServiceEventListener' });
      handleConnectionStatusChange(SOCKET_STATE.CONNECTED);
      
      // 소켓 객체 참조 업데이트
      const socketInstance = socketIOService.getSocket();
      socketInstanceRef.current = socketInstance;
      setSocket(socketInstance);
      
      // 소켓 객체 상태 로깅
      logger.debug('SocketIOContext', '소켓 객체 상태 (연결 후)', {
        function: 'socketServiceEventListener',
        socketExists: !!socketInstance,
        socketId: socketInstance?.id,
        connected: socketInstance?.connected
      });
    };
    
    const handleDisconnected = () => {
      logger.info('SocketIOContext', '소켓 연결 끊김', { function: 'socketServiceEventListener' });
      handleConnectionStatusChange(SOCKET_STATE.DISCONNECTED);
    };

    const handleError = (error) => {
      logger.error('SocketIOContext', '소켓 오류', { function: 'socketServiceEventListener', error });
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
          function: 'socketServiceEventListener',
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

  // 소켓 이벤트 리스너 설정
  useEffect(() => {
    logger.info('SocketIOContext', '소켓 이벤트 리스너 설정 시작', { 
      function: 'useEffect.setupListeners',
      socketExists: !!socket,
      socketId: socket?.id,
      connected: socket?.connected
    });
    
    if (socket) {
      // 이벤트 리스너 설정
      setupEventListeners(socket);
    }
    
    // 컴포넌트 언마운트 시 정리
    return () => {
      logger.info('SocketIOContext', '소켓 이벤트 리스너 정리', { 
        function: 'useEffect.cleanup',
        socketExists: !!socket,
        socketId: socket?.id
      });
      
      if (socket) {
        try {
          // 기본 이벤트 리스너 제거
          socket.off('connect');
          socket.off('connect_error');
          socket.off('disconnect');
          socket.off('reconnect_attempt');
          socket.off('reconnect_failed');
          socket.off('reconnect');
          socket.off('error');
          
          // 비즈니스 이벤트 리스너 제거
          socket.off(SOCKET_EVENTS.SUBSCRIPTION_UPDATED);
          socket.off(SOCKET_EVENTS.CVE_UPDATED);
          socket.off(SOCKET_EVENTS.CVE_CREATED);
          socket.off(SOCKET_EVENTS.CVE_CACHE_INVALIDATED);
          
          // 댓글 관련 이벤트 리스너 제거
          socket.off(SOCKET_EVENTS.COMMENT_ADDED);
          socket.off(SOCKET_EVENTS.COMMENT_UPDATED);
          socket.off(SOCKET_EVENTS.COMMENT_DELETED);
          socket.off(SOCKET_EVENTS.COMMENT_REACTION_ADDED);
          socket.off(SOCKET_EVENTS.COMMENT_REACTION_REMOVED);
          socket.off(SOCKET_EVENTS.COMMENT_COUNT_UPDATE);
          socket.off(SOCKET_EVENTS.COMMENT_MENTION_ADDED);
          socket.off(SOCKET_EVENTS.COMMENT_REPLY_ADDED);
          
          logger.info('SocketIOContext', '모든 이벤트 리스너 제거 완료', { 
            function: 'useEffect.cleanup',
            socketId: socket.id,
            eventCount: 17
          });
        } catch (error) {
          logger.error('SocketIOContext', '이벤트 리스너 제거 중 오류 발생', {
            function: 'useEffect.cleanup',
            error: error.message,
            stack: error.stack
          });
        }
      }
    };
  }, [socket, setupEventListeners]);

  // 관련 쿼리 무효화 함수
  const invalidateRelevantQueries = useCallback(() => {
    try {
      logger.info('SocketIOContext', '관련 쿼리 무효화 시작', { 
        function: 'invalidateRelevantQueries',
        queryKeys: ['cves', 'subscriptions', 'comments']
      });
      
      // CVE 관련 쿼리 무효화
      queryClient.invalidateQueries(['cves']);
      
      // 구독 관련 쿼리 무효화
      queryClient.invalidateQueries(['subscriptions']);
      
      // 댓글 관련 쿼리 무효화 (모든 CVE의 댓글)
      queryClient.invalidateQueries({ queryKey: ['comments'] });
      
      logger.info('SocketIOContext', '관련 쿼리 무효화 완료', { 
        function: 'invalidateRelevantQueries',
        invalidatedQueryCount: 3
      });
    } catch (error) {
      logger.error('SocketIOContext', '관련 쿼리 무효화 중 오류 발생', { 
        function: 'invalidateRelevantQueries',
        error: error.message,
        stack: error.stack
      });
    }
  }, [queryClient]);

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