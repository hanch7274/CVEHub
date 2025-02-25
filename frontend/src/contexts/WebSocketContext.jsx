import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSnackbar } from 'notistack';
import WebSocketService, { WS_EVENT_TYPE } from '../services/websocket';
import { selectCVEDetail, invalidateCache } from '../store/slices/cveSlice';
import { cveService } from '../api/services/cveService';

// 단일 인스턴스 생성 (전역 사용)
const webSocketInstance = new WebSocketService();

export const WebSocketContext = createContext({
  isConnected: false,
  isReady: false,
  error: null,
  currentCVE: null,
  sendMessage: () => {},
  invalidateCVECache: () => {},
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
  const dispatch = useDispatch();
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  // 캐시 무효화 함수
  const invalidateCVECache = useCallback((cveId) => {
    if (!cveId) return;
    
    // 서비스 레이어 캐시 무효화
    cveService.invalidateCache(cveId);
    
    // Redux 캐시 무효화
    dispatch(invalidateCache(cveId));
    
    console.log(`[WebSocketContext] Manually invalidated cache for CVE ${cveId}`);
  }, [dispatch]);

  // 웹소켓 메시지 처리에서 캐시 무효화 처리
  const handleGlobalSocketMessage = useCallback(
    (message) => {
      // CVE 업데이트 이벤트 감지
      if (message.type === WS_EVENT_TYPE.CVE_UPDATED && message.data?.cveId) {
        // 이미 WebSocketService에서 처리하지만 중복 보장을 위해 여기서도 처리
        invalidateCVECache(message.data.cveId);
        
        // 현재 보고 있는 CVE가 업데이트된 경우 알림
        if (currentCVE && message.data.cveId === currentCVE.cveId) {
          enqueueSnackbar('CVE 정보가 업데이트되었습니다.', { variant: 'info' });
        }
      }
    },
    [currentCVE, enqueueSnackbar, invalidateCVECache]
  );

  // 연결 상태 변경 핸들러
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

  // 인증 상태 변경에 따른 웹소켓 연결 관리
  useEffect(() => {
    if (isAuthenticated) {
      webSocketInstance.connect();
      
      // 캐시 무효화 활성화
      webSocketInstance.setCacheInvalidation(true);
    } else {
      webSocketInstance.disconnect();
      setIsConnected(false);
      setIsReady(false);
    }
  }, [isAuthenticated]);

  // 글로벌 메시지 핸들러 등록
  useEffect(() => {
    webSocketInstance.addHandler('message', handleGlobalSocketMessage);
    webSocketInstance.addHandler('connection', handleConnectionChange);
    
    return () => {
      webSocketInstance.removeHandler('message', handleGlobalSocketMessage);
      webSocketInstance.removeHandler('connection', handleConnectionChange);
    };
  }, [handleGlobalSocketMessage, handleConnectionChange]);

  // 컨텍스트 값 생성
  const value = useMemo(
    () => ({
      isConnected,
      isReady,
      error,
      currentCVE,
      sendMessage: webSocketInstance.send.bind(webSocketInstance),
      invalidateCVECache,
    }),
    [isConnected, isReady, error, currentCVE, invalidateCVECache]
  );

  console.log('WebSocketContext: Providing context with invalidateCVECache:', !!invalidateCVECache);

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
