import React, { createContext, useContext, useCallback, useEffect, useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import useWebSocket from '../hooks/useWebSocket';
import { addNotification } from '../store/slices/notificationSlice';
import { updateCVEFromWebSocket } from '../store/cveSlice';
import { useSnackbar } from 'notistack';
import { WS_EVENT_TYPE } from '../services/websocket';
import { getAccessToken } from '../utils/storage/tokenStorage';
import { getSessionId } from '../utils/auth';

const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
  const { isAuthenticated } = useSelector(state => state.auth);
  const [lastMessage, setLastMessage] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const messageQueueRef = useRef([]);
  const dispatch = useDispatch();
  const { enqueueSnackbar } = useSnackbar();

  // 메시지 핸들러 맵
  const messageHandlers = {
    [WS_EVENT_TYPE.NOTIFICATION]: (data) => {
      dispatch(addNotification(data.notification));
      setUnreadCount(data.unreadCount);
      enqueueSnackbar(`새로운 알림: ${data.notification.message}`, {
        variant: 'info',
        anchorOrigin: { vertical: 'top', horizontal: 'right' },
      });
    },
    [WS_EVENT_TYPE.NOTIFICATION_READ]: (data) => {
      setUnreadCount(data.unreadCount);
    },
    [WS_EVENT_TYPE.ALL_NOTIFICATIONS_READ]: () => {
      setUnreadCount(0);
    },
    // CVE 업데이트 핸들러 추가
    'cve_updated': (data) => {
      if (data.cve) {
        dispatch(updateCVEFromWebSocket(data.cve));
        enqueueSnackbar('CVE 정보가 업데이트되었습니다.', {
          variant: 'info',
          anchorOrigin: { vertical: 'top', horizontal: 'right' },
        });
      }
    }
  };

  // 메시지 처리
  const handleMessage = useCallback((data) => {
    if (!isAuthenticated || !getAccessToken()) return;

    // connected 메시지는 무시 (이미 WebSocketService에서 처리)
    if (data.type === 'connected') return;

    setLastMessage(data);
    
    // 메시지 타입에 따른 핸들러 실행
    const handler = messageHandlers[data.type];
    if (handler) {
      handler(data.data);
    }
  }, [isAuthenticated, dispatch, enqueueSnackbar]);

  // 에러 처리
  const handleError = useCallback((error) => {
    if (!isAuthenticated || !getAccessToken()) return;

    console.error('[WebSocket] 오류:', error);
    enqueueSnackbar(error, {
      variant: 'error',
      anchorOrigin: { vertical: 'top', horizontal: 'right' },
    });
  }, [enqueueSnackbar, isAuthenticated]);

  // 연결 상태 변경 처리
  const handleConnectionChange = useCallback((connected, error) => {
    if (!isAuthenticated || !getAccessToken()) return;

    if (process.env.NODE_ENV === 'development') {
      console.log('[WebSocket] 연결 상태:', {
        isConnected: connected,
        timestamp: new Date().toISOString()
      });
    }

    // 연결 상태가 실제로 변경된 경우에만 처리
    setIsConnected(prevState => {
      if (prevState !== connected) {
        return connected;
      }
      return prevState;
    });

    if (error) {
      handleError(error);
    }
  }, [handleError, isAuthenticated]);

  // WebSocket 훅 사용
  const {
    error,
    sendMessage,
    disconnect,
    reconnect
  } = useWebSocket({
    onMessage: handleMessage,
    onError: handleError,
    onConnectionChange: handleConnectionChange,
    reconnectAttempts: 5,
    reconnectInterval: 5000
  });

  // 큐에 있는 메시지 처리를 위한 별도의 effect
  useEffect(() => {
    if (isConnected && messageQueueRef.current.length > 0 && sendMessage) {
      console.log('[WebSocket] 큐에 있는 메시지 전송 시작:', messageQueueRef.current.length);
      messageQueueRef.current.forEach(({ type, data }) => {
        sendMessage({ type, data });
      });
      messageQueueRef.current = [];
    }
  }, [isConnected, sendMessage]);

  // 인증 상태 변경 감지 및 WebSocket 연결 관리
  useEffect(() => {
    const token = getAccessToken();
    const shouldConnect = isAuthenticated && token && !isConnected;
    const shouldDisconnect = (!isAuthenticated || !token) && isConnected;

    console.log('=== WebSocket Connection Debug ===', {
      isAuthenticated,
      hasToken: !!token,
      isConnected,
      shouldConnect,
      shouldDisconnect,
      timestamp: new Date().toISOString()
    });

    if (shouldDisconnect) {
      console.log('Disconnecting WebSocket...');
      disconnect();
      setLastMessage(null);
      setUnreadCount(0);
      setIsConnected(false);
    } else if (shouldConnect) {
      // 연결 시도 전 상태 로깅
      console.log('Preparing to connect WebSocket...', {
        isAuthenticated,
        hasToken: !!token,
        isConnected,
        timestamp: new Date().toISOString()
      });
      
      // 약간의 지연 후 연결 시도 (React Strict Mode 및 상태 안정화를 위해)
      const connectTimeout = setTimeout(() => {
        console.log('Attempting WebSocket connection...');
        reconnect();
      }, 1000);  // 1초 지연

      return () => {
        console.log('Cleaning up connection attempt...');
        clearTimeout(connectTimeout);
      };
    }
  }, [isAuthenticated, isConnected, disconnect, reconnect]);

  // 컴포넌트 언마운트 시 연결 정리
  useEffect(() => {
    return () => {
      if (isConnected) {
        console.log('Component unmounting, cleaning up WebSocket connection...');
        disconnect();
      }
    };
  }, [isConnected, disconnect]);

  // Context 값 업데이트 로직 개선
  const contextValue = {
    isConnected: isAuthenticated && isConnected && !!getAccessToken(),
    error: isAuthenticated ? error : null,
    lastMessage: isAuthenticated ? lastMessage : null,
    unreadCount: isAuthenticated ? unreadCount : 0,
    sendMessage: (isAuthenticated && getAccessToken()) ? sendMessage : () => {
      console.warn('WebSocket is not connected: User is not authenticated or token is missing');
    },
    disconnect,
    reconnect: (isAuthenticated && getAccessToken()) ? reconnect : () => {
      console.warn('Cannot reconnect: User is not authenticated or token is missing');
    }
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

// 커스텀 훅: WebSocket Context 사용
export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};

// 메시지 전송 헬퍼 함수들
export const useWebSocketMessage = () => {
  const { sendMessage, isConnected } = useWebSocketContext();
  const { isAuthenticated } = useSelector(state => state.auth);
  const messageQueueRef = useRef([]);

  const sendMessageIfConnected = useCallback((type, data) => {
    if (!isAuthenticated || !getAccessToken()) {
      console.warn('Cannot send message: User is not authenticated or token is missing');
      return;
    }

    // 연결이 되어있지 않으면 메시지를 큐에 저장
    if (!isConnected) {
      console.log('[WebSocket] 메시지를 큐에 저장:', { type, data });
      messageQueueRef.current.push({ type, data });
      return;
    }

    // 연결이 되어있으면 바로 전송
    sendMessage({ type, data });
  }, [isAuthenticated, isConnected, sendMessage]);

  return {
    // 알림 읽음 표시
    markNotificationAsRead: (notificationId) => {
      sendMessageIfConnected('notification_read', { notificationId });
    },

    // 모든 알림 읽음 표시
    markAllNotificationsAsRead: () => {
      sendMessageIfConnected('all_notifications_read');
    },

    // 채팅 메시지 전송
    sendChatMessage: (message) => {
      sendMessageIfConnected('chat_message', { message });
    },

    // 사용자 정의 메시지 전송
    sendCustomMessage: (type, data) => {
      sendMessageIfConnected(type, data);
    }
  };
};
