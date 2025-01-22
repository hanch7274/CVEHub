import { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';

const useWebSocket = (onMessage) => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const { token, user } = useSelector(state => state.auth);
  const userId = user?.id;

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 5000;
  const PING_INTERVAL = 15000;
  const INACTIVE_PING_INTERVAL = 30000;

  // 사용자 활동 감지
  useEffect(() => {
    const updateLastActivity = () => {
      lastActivityRef.current = Date.now();
    };

    // 다양한 사용자 활동 이벤트 리스너 등록
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
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`;
    const cleanHost = wsHost.replace(/^https?:\/\//, '');
    const sessionId = localStorage.getItem('sessionId') || crypto.randomUUID();
    localStorage.setItem('sessionId', sessionId);
    return `${wsProtocol}//${cleanHost}/ws/${userId}?token=${encodeURIComponent(token)}&session_id=${sessionId}`;
  }, [userId, token]);

  // 리소스 정리
  const cleanup = useCallback(() => {
    const wasConnected = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
    
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
    
    // 이전에 연결되어 있었을 때만 상태 업데이트
    if (wasConnected) {
      setIsConnected(false);
    }
  }, []);

  // ping interval 설정을 동적으로 조정
  const setupPingInterval = useCallback((socket) => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    pingIntervalRef.current = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          const now = Date.now();
          const timeSinceLastActivity = now - lastActivityRef.current;
          const isActive = timeSinceLastActivity < 5 * 60 * 1000; // 5분 이내 활동이 있었는지

          // 활성 상태일 때는 더 자주 ping을 보냄
          if (isActive) {
            socket.send(JSON.stringify({ 
              type: 'ping',
              timestamp: new Date().toISOString(),
              lastActivity: lastActivityRef.current
            }));
          } else {
            socket.send(JSON.stringify({ 
              type: 'ping',
              timestamp: new Date().toISOString(),
              lastActivity: lastActivityRef.current
            }));
          }
        } catch (error) {
          console.error('[WebSocket] Ping 전송 중 오류:', error);
          cleanup();
        }
      }
    }, PING_INTERVAL);
  }, [cleanup]);

  // 웹소켓 연결 설정
  const setupWebSocket = useCallback((socket) => {
    socket.onopen = () => {
      if (!mountedRef.current) return;
      
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;

      // 새로운 ping interval 설정 함수 호출
      setupPingInterval(socket);
    };

    socket.onclose = (event) => {
      if (!mountedRef.current) return;

      cleanup();

      // 정상적인 종료(1000, 1001)인 경우에도 재연결을 시도하지 않도록 수정
      if (event.code !== 1000 && event.code !== 1001 && mountedRef.current) {
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), RECONNECT_DELAY);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              reconnectAttemptsRef.current += 1;
              connect();
            }
          }, delay);
        } else {
          console.error('[WebSocket] 최대 재연결 시도 횟수 초과');
        }
      }
    };

    socket.onerror = (error) => {
      if (!mountedRef.current) return;
      console.error('[WebSocket] 오류 발생:', {
        error,
        userId: user?.id,
        timestamp: new Date().toISOString()
      });
      // 오류 발생 시 연결 상태 업데이트
      setIsConnected(false);
    };

    socket.onmessage = (event) => {
      if (!mountedRef.current) {
        return;
      }
      
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'pong') {
          return;
        }

        // onMessage 콜백이 있는 경우 실행
        if (onMessage && typeof onMessage === 'function') {
          onMessage(data);
        }
      } catch (error) {
        console.error('[WebSocket] 메시지 처리 중 오류:', {
          error,
          originalData: event.data,
          userId: user?.id,
          timestamp: new Date().toISOString()
        });
      }
    };

    return socket;
  }, [cleanup, user, setupPingInterval]);

  // 웹소켓 연결
  const connect = useCallback(() => {
    if (!userId || !token) {
      return;
    }

    // 이미 연결이 있거나 연결 중인 경우 처리
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.CONNECTING) {
        return;
      }
      if (wsRef.current.readyState === WebSocket.OPEN) {
        return;
      }
      cleanup();
    }

    try {
      const wsUrl = getWebSocketUrl();

      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;
      setupWebSocket(socket);

    } catch (error) {
      console.error('[WebSocket] 연결 실패:', {
        error,
        userId,
        timestamp: new Date().toISOString()
      });
      setIsConnected(false);
    }
  }, [userId, token, cleanup, setupWebSocket]);

  // 초기 연결 및 재연결
  useEffect(() => {
    mountedRef.current = true;

    if (userId && token) {
      // 초기 연결 시도 전 지연을 더 길게 설정
      setTimeout(() => {
        if (mountedRef.current) {
          connect();
        }
      }, 1000); // 500ms에서 1000ms로 증가
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [userId, token, connect, cleanup]);

  // 메시지 전송 함수
  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // reconnect 함수 추가
  const reconnect = useCallback(() => {
    cleanup();
    connect();
  }, [cleanup, connect]);

  return { isConnected, sendMessage, reconnect };
};

export default useWebSocket;
