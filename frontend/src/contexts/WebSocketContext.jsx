import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import useWebSocket from '../hooks/useWebSocket';
import { addNotification } from '../store/slices/notificationSlice';
import { useSnackbar } from 'notistack';

const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
  const { token, user } = useSelector(state => state.auth);
  const [lastMessage, setLastMessage] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const dispatch = useDispatch();
  const { enqueueSnackbar } = useSnackbar();

  // WebSocket URL 생성 - 기본 경로만 사용
  const wsUrl = user ? '' : null;

  const handleMessage = useCallback((data) => {
    console.log('[WebSocket] 메시지 수신:', {
      type: data.type,
      data: data.data,
      timestamp: new Date().toISOString()
    });
    setLastMessage(data);
    switch (data.type) {
      case 'notification':
        dispatch(addNotification(data.data.notification));
        setUnreadCount(data.data.unreadCount);
        
        // 새로운 알림이 있을 때 토스트 메시지 표시
        enqueueSnackbar(`새로운 알림: ${data.data.notification.message}`, {
          variant: 'info',
          anchorOrigin: {
            vertical: 'top',
            horizontal: 'right',
          },
        });
        break;
      
      case 'notification_read':
        setUnreadCount(data.data.unreadCount);
        break;
      
      case 'all_notifications_read':
        setUnreadCount(0);
        break;
      
      case 'cve_created':
      case 'cve_updated':
        // CVE 업데이트 관련 토스트 메시지 제거
        break;

      case 'comment_update':
        // 댓글 업데이트 메시지는 각 컴포넌트에서 처리하도록 전달만 함
        break;
      
      default:
        console.log('처리되지 않은 메시지 타입:', data.type);
    }
  }, [dispatch, enqueueSnackbar]);

  // WebSocket 연결 설정
  const { isConnected, error, disconnect, reconnect } = useWebSocket(wsUrl, {
    onMessage: handleMessage,
    reconnectAttempts: 5,
    reconnectInterval: 5000
  });

  // 연결 상태 및 오류 로깅 (디버그용)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[WebSocket] 연결 상태 변경:', {
        isConnected,
        userId: user?.id,
        wsUrl,
        timestamp: new Date().toISOString()
      });
    }
    
    if (error) {
      console.error('[WebSocket] 연결 오류:', {
        error,
        userId: user?.id,
        wsUrl,
        timestamp: new Date().toISOString()
      });
      
      enqueueSnackbar(error, {
        variant: 'error',
        anchorOrigin: {
          vertical: 'top',
          horizontal: 'right',
        },
      });
    }
  }, [isConnected, user?.id, wsUrl, error, enqueueSnackbar]);

  const value = {
    isConnected,
    error,
    lastMessage,
    unreadCount,
    disconnect,
    reconnect
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};
