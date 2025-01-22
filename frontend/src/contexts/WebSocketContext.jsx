import React, { createContext, useContext, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import useWebSocket from '../hooks/useWebSocket';
import { addNotification } from '../store/slices/notificationSlice';
import { useSnackbar } from 'notistack';

const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
  const dispatch = useDispatch();
  const { enqueueSnackbar } = useSnackbar();

  const handleMessage = useCallback((data) => {
    switch (data.type) {
      case 'notification':
        dispatch(addNotification(data.data));
        // 알림 스낵바 표시
        enqueueSnackbar(data.data.content, {
          variant: 'info',
          anchorOrigin: {
            vertical: 'top',
            horizontal: 'right',
          },
        });
        break;
      // 필요한 경우 다른 메시지 타입 처리 추가
      default:
        console.log('처리되지 않은 메시지 타입:', data.type);
    }
  }, [dispatch, enqueueSnackbar]);

  const { isConnected, error, disconnect, reconnect } = useWebSocket({
    onMessage: handleMessage,
    reconnectAttempts: 5,
    reconnectInterval: 3000,
  });

  return (
    <WebSocketContext.Provider value={{ isConnected, error, disconnect, reconnect }}>
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
