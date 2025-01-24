import { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';

const useWebSocket = (wsUrl, options = {}) => {
  const {
    onMessage,
    reconnectAttempts = 5,
    reconnectInterval = 3000
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  // 탭별 고유 세션 ID를 컴포넌트 레벨에서 생성
  const tabSessionIdRef = useRef(null);
  const { token } = useSelector(state => state.auth);

  const PING_INTERVAL = 15000;
  const INACTIVE_PING_INTERVAL = 30000;

  // 컴포넌트 마운트 시 세션 ID 초기화
  useEffect(() => {
    if (!tabSessionIdRef.current) {
      tabSessionIdRef.current = uuidv4();
    }
  }, []);

  // 사용자 활동 감지
  useEffect(() => {
    const updateLastActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener('mousemove', updateLastActivity);
    window.addEventListener('keydown', updateLastActivity);
    window.addEventListener('click', updateLastActivity);
    window.addEventListener('scroll', updateLastActivity);
    window.addEventListener('visibilitychange', updateLastActivity);

    return () => {
      window.removeEventListener('mousemove', updateLastActivity);
      window.removeEventListener('keydown', updateLastActivity);
      window.removeEventListener('click', updateLastActivity);
      window.removeEventListener('scroll', updateLastActivity);
      window.removeEventListener('visibilitychange', updateLastActivity);
    };
  }, []);

  // 웹소켓 URL 생성
  const getWebSocketUrl = useCallback(() => {
    if (!token) {
      console.log('[WebSocket] URL 생성 실패: 토큰 없음');
      return null;
    }

    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`;
      const cleanHost = wsHost.replace(/^https?:\/\//, '');
      
      // URL 생성 전 로깅
      console.log('[WebSocket] URL 생성 시작:', {
        wsProtocol,
        cleanHost,
        wsUrl,
        sessionId: tabSessionIdRef.current,
        timestamp: new Date().toISOString()
      });
      
      // 기본 WebSocket URL 생성 (탭별 세션 ID 사용)
      const fullUrl = `${wsProtocol}//${cleanHost}/ws?token=${encodeURIComponent(token)}&session_id=${tabSessionIdRef.current}`;
      
      // 생성된 URL 로깅
      console.log('[WebSocket] URL 생성 완료:', {
        url: fullUrl,
        timestamp: new Date().toISOString()
      });
      
      return fullUrl;
    } catch (error) {
      console.error('[WebSocket] URL 생성 중 오류:', error);
      return null;
    }
  }, [wsUrl, token]);

  // 리소스 정리
  const cleanup = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close(1000, '정상 종료');
      } catch (error) {
        console.error('웹소켓 연결 종료 중 오류:', error);
      }
      wsRef.current = null;
    }
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    setIsConnected(false);
    setError(null);
  }, []);

  // ping interval 설정
  const setupPingInterval = useCallback((socket) => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    pingIntervalRef.current = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          const now = Date.now();
          const timeSinceLastActivity = now - lastActivityRef.current;
          const isActive = timeSinceLastActivity < 5 * 60 * 1000;

          const pingMessage = {
            type: 'ping',
            data: {
              timestamp: new Date().toISOString(),
              lastActivity: lastActivityRef.current,
              sessionId: localStorage.getItem('sessionId')
            }
          };

          socket.send(JSON.stringify(pingMessage));
        } catch (error) {
          console.error('[WebSocket] Ping 전송 중 오류:', error);
          setError('Ping 전송 실패');
          cleanup();
        }
      }
    }, isConnected ? PING_INTERVAL : INACTIVE_PING_INTERVAL);
  }, [cleanup]);

  // 웹소켓 연결 설정
  const setupWebSocket = useCallback((socket) => {
    socket.onopen = () => {
      if (!mountedRef.current) return;
      
      console.log('[WebSocket] 연결 성공:', {
        url: socket.url,
        timestamp: new Date().toISOString()
      });
      
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
      setupPingInterval(socket);
    };

    socket.onclose = (event) => {
      if (!mountedRef.current) return;

      console.log('[WebSocket] 연결 종료:', {
        code: event.code,
        reason: event.reason,
        timestamp: new Date().toISOString()
      });

      cleanup();

      if (event.code !== 1000 && event.code !== 1001 && mountedRef.current) {
        if (reconnectAttemptsRef.current < reconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), reconnectInterval);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              reconnectAttemptsRef.current += 1;
              connect();
            }
          }, delay);
        } else {
          setError('최대 재연결 시도 횟수 초과');
        }
      }
    };

    socket.onerror = (error) => {
      if (!mountedRef.current) return;
      console.error('[WebSocket] 오류 발생:', error);
      setError('웹소켓 연결 오류');
      setIsConnected(false);
    };

    socket.onmessage = (event) => {
      if (!mountedRef.current) return;
      
      try {
        const data = JSON.parse(event.data);
        console.log('[WebSocket] 메시지 수신:', {
          data,
          timestamp: new Date().toISOString()
        });

        switch (data.type) {
          case 'pong':
            // pong 메시지 처리
            break;
          case 'error':
            setError(data.message || '서버 오류 발생');
            break;
          default:
            setLastMessage(data);
            if (onMessage && typeof onMessage === 'function') {
              onMessage(data);
            }
        }
      } catch (error) {
        console.error('[WebSocket] 메시지 처리 중 오류:', error);
        setError('메시지 처리 오류');
      }
    };

    return socket;
  }, [cleanup, setupPingInterval, onMessage, reconnectAttempts, reconnectInterval]);

  // 웹소켓 연결
  const connect = useCallback(() => {
    if (!token) {
      console.log('[WebSocket] 연결 실패: 토큰 없음');
      setError('인증 토큰이 없습니다');
      return;
    }

    const url = getWebSocketUrl();
    if (!url) {
      console.log('[WebSocket] 연결 실패: URL 생성 실패');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('[WebSocket] 이미 연결 중');
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] 이미 연결됨');
      return;
    }

    cleanup();

    try {
      console.log('[WebSocket] 연결 시도:', {
        url,
        timestamp: new Date().toISOString()
      });

      const socket = new WebSocket(url);
      wsRef.current = socket;
      setupWebSocket(socket);
    } catch (error) {
      console.error('[WebSocket] 연결 실패:', error);
      setError('웹소켓 연결 실패');
      setIsConnected(false);
    }
  }, [token, cleanup, setupWebSocket, getWebSocketUrl]);

  // 초기 연결 및 재연결
  useEffect(() => {
    mountedRef.current = true;

    if (token) {
      setTimeout(() => {
        if (mountedRef.current) {
          connect();
        }
      }, 1000);
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [token, connect, cleanup]);

  const disconnect = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    setError(null);
    connect();
  }, [connect]);

  return { isConnected, error, disconnect, reconnect, lastMessage };
};

export default useWebSocket;
