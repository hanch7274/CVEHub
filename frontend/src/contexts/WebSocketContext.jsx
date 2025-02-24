import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from 'react';
import { useSelector } from 'react-redux';
import { useSnackbar } from 'notistack';
import WebSocketService, { WS_EVENT_TYPE } from '../services/websocket';
import { selectCVEDetail } from '../store/slices/cveSlice';

// 단일 인스턴스 생성 (전역 사용)
const webSocketInstance = new WebSocketService();

export const WebSocketContext = createContext({
  isConnected: false,
  isReady: false,
  error: null,
  currentCVE: null,
  sendMessage: () => {},
});

/**
 * useWebSocketMessage:
 * 메시지 핸들러 등록 및 sendCustomMessage 제공
 */
export const useWebSocketMessage = (messageHandler) => {
  const stableMessageHandler = useCallback((message) => {
    if (typeof messageHandler === 'function') {
      messageHandler(message);
    }
  }, [messageHandler]);

  useEffect(() => {
    if (webSocketInstance) {
      webSocketInstance.addHandler('message', stableMessageHandler);
      return () => {
        webSocketInstance.removeHandler('message', stableMessageHandler);
      };
    }
  }, [stableMessageHandler]);

  const sendCustomMessage = useCallback(async (type, data) => {
    if (webSocketInstance) {
      await webSocketInstance.send(type, data);
    }
  }, []);

  return { sendCustomMessage };
};

/**
 * WebSocketProvider:
 * 인증 상태 변화에 따라 연결 관리 및 상태 제공
 */
export const WebSocketProvider = ({ children }) => {
  const { isAuthenticated } = useSelector((state) => state.auth);
  const currentCVE = useSelector(selectCVEDetail);
  const { enqueueSnackbar } = useSnackbar();
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  const handleConnectionChange = useCallback(
    (connected, connectionError) => {
      console.log('[WebSocket] Connection state changed:', { connected, connectionError });
      setIsConnected(connected);
      setError(connectionError);
      setIsReady(connected); // 연결 성공 시 isReady true
      if (connectionError && !connectionError.message?.includes('401')) {
        enqueueSnackbar(connectionError.message || '연결 오류가 발생했습니다.', {
          variant: 'error',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
        });
      }
    },
    [enqueueSnackbar]
  );

  useEffect(() => {
    if (isAuthenticated) {
      webSocketInstance.connect();
    } else {
      webSocketInstance.disconnect();
      setIsConnected(false);
      setIsReady(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    webSocketInstance.addHandler('connection', handleConnectionChange);
    return () => {
      webSocketInstance.removeHandler('connection', handleConnectionChange);
    };
  }, [handleConnectionChange]);

  const value = useMemo(
    () => ({
      isConnected,
      isReady,
      error,
      currentCVE,
      sendMessage: webSocketInstance.send.bind(webSocketInstance),
    }),
    [isConnected, isReady, error, currentCVE]
  );

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

/**
 * useWebSocketContext:
 * WebSocketContext를 사용하기 위한 커스텀 훅
 */
export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};
