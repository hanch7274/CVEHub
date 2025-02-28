import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSnackbar } from 'notistack';
import webSocketInstance, { WS_EVENT_TYPE } from '../services/websocket';
import { 
  selectCVEDetail, 
  invalidateCache, 
  fetchCVEDetail, 
  updateCVEFromWebSocket 
} from '../store/slices/cveSlice';
import {
  selectWebSocketConnected,
  selectWebSocketError,
  wsConnecting,
} from '../store/slices/websocketSlice';
import { Button } from '@mui/material';

// 세션 스토리지 키
const ACTIVE_SUBSCRIPTIONS_KEY = 'cvehub_active_subscriptions';

/**
 * 세션 스토리지에 활성 구독 저장
 * @param {string} cveId - 구독할 CVE ID
 * @param {boolean} isSubscribing - true: 구독 추가, false: 구독 해제
 */
const updateSubscriptionStorage = (cveId, isSubscribing) => {
  try {
    let activeSubscriptions = JSON.parse(sessionStorage.getItem(ACTIVE_SUBSCRIPTIONS_KEY) || '[]');
    
    if (isSubscribing) {
      // 중복 없이 추가
      if (!activeSubscriptions.includes(cveId)) {
        activeSubscriptions.push(cveId);
      }
    } else {
      // 제거
      activeSubscriptions = activeSubscriptions.filter(id => id !== cveId);
    }
    
    sessionStorage.setItem(ACTIVE_SUBSCRIPTIONS_KEY, JSON.stringify(activeSubscriptions));
    console.log(`[WebSocket] 세션 스토리지 구독 정보 업데이트: ${activeSubscriptions.join(', ')}`);
  } catch (error) {
    console.error('[WebSocket] 세션 스토리지 업데이트 오류:', error);
  }
};

/**
 * 페이지 로드 시 이전 세션의 구독 정보 확인 및 정리
 */
const cleanupPreviousSubscriptions = async () => {
  try {
    const activeSubscriptions = JSON.parse(sessionStorage.getItem(ACTIVE_SUBSCRIPTIONS_KEY) || '[]');
    
    if (activeSubscriptions.length > 0) {
      console.log(`[WebSocket] 이전 세션의 구독 정보 발견: ${activeSubscriptions.join(', ')}`);
      
      // 모든 이전 구독 해제
      for (const cveId of activeSubscriptions) {
        console.log(`[WebSocket] 이전 세션의 구독 해제 중: ${cveId}`);
        await webSocketInstance.unsubscribeFromCVE(cveId);
      }
      
      // 세션 스토리지 초기화
      sessionStorage.setItem(ACTIVE_SUBSCRIPTIONS_KEY, '[]');
    }
  } catch (error) {
    console.error('[WebSocket] 이전 구독 정리 오류:', error);
  }
};

export const WebSocketContext = createContext({
  isConnected: false,
  isReady: false,
  error: null,
  currentCVE: null,
  sendMessage: () => {},
  invalidateCVECache: () => {},
});

/**
 * useCVEWebSocketUpdate:
 * 특정 CVE ID에 대한 업데이트 메시지를 처리하여 데이터를 자동으로 갱신
 * @param {string} cveId - 모니터링할 CVE ID
 * @param {function} onUpdateReceived - 업데이트 수신 시 추가로 실행할 콜백 함수 (선택적)
 * @param {function} onRefreshTriggered - refreshTrigger 업데이트가 필요할 때 호출되는 콜백 (선택적)
 * @param {function} onSubscribersChange - 구독자 정보 변경 시 호출되는 콜백 (선택적)
 */
export const useCVEWebSocketUpdate = (cveId, onUpdateReceived, onRefreshTriggered, onSubscribersChange) => {
  const dispatch = useDispatch();
  const { enqueueSnackbar } = useSnackbar();
  
  // 콜백 참조 관리를 위한 Ref
  const callbacksRef = useRef({
    onUpdateReceived,
    onRefreshTriggered,
    onSubscribersChange
  });
  
  // 구독 상태 관리
  const subscriptionRef = useRef({ 
    active: false, 
    cveId: null,
    processing: false, // 구독 프로세스 중복 실행 방지
    mountedAt: Date.now() // 마운트 시간 기록
  });
  
  // cveId 참조 관리
  const cveIdRef = useRef(cveId);
  
  // 컴포넌트가 마운트되었는지 추적
  const isMountedRef = useRef(true);
  
  // 참조 업데이트 - 항상 최신 값 참조
  useEffect(() => {
    callbacksRef.current = {
      onUpdateReceived,
      onRefreshTriggered,
      onSubscribersChange
    };
    cveIdRef.current = cveId;
  }, [cveId, onUpdateReceived, onRefreshTriggered, onSubscribersChange]);
  
  // 초기 렌더링 시 이전 세션의 구독 정보 정리
  useEffect(() => {
    // 마운트 시 한 번만 실행
    cleanupPreviousSubscriptions().catch(error => {
      console.error('[WebSocket] 이전 구독 정리 실패:', error);
    });
    
    // 컴포넌트 언마운트 감지
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // CVE 업데이트 핸들러 - 안정적인 함수 참조 유지
  const handleCVEUpdated = useCallback((messageData) => {
    if (!messageData?.cveId || !isMountedRef.current) return;
    
    console.log('[WebSocket] CVE_UPDATED 메시지 수신:', messageData);
    
    // 캐시 무효화 플래그가 설정된 경우 최신 정보 가져오기
    dispatch(invalidateCache(messageData.cveId));
    console.log(`[WebSocket] ${messageData.cveId} 데이터 갱신 중...`);
    dispatch(fetchCVEDetail(messageData.cveId));
    
    // 추가적인 WebSocket 처리 로직이 있을 경우
    if (messageData.cve) {
      console.log(`[WebSocket] WebSocket에서 받은 CVE 데이터로 직접 업데이트`);
      dispatch(updateCVEFromWebSocket({
        cveId: messageData.cveId,
        data: messageData.cve,
        field: messageData.field
      }));
    }
  }, [dispatch]);

  // 메시지 핸들러 - 안정적인 함수 참조 유지
  const messageHandler = useCallback((message) => {
    if (!message?.type || !message?.data || !isMountedRef.current) return;
    
    // 현재 모니터링 중인 CVE ID와 일치하는지 확인
    const currentCveId = cveIdRef.current;
    if (!currentCveId) return;
    
    // CVE 업데이트 메시지 처리
    if (message.type === WS_EVENT_TYPE.CVE_UPDATED && 
        message.data?.cveId === currentCveId) {
      console.log('[WebSocket] CVE 업데이트 메시지 수신:', message.data);
      console.log('[WebSocket] 필드 정보:', message.data?.field);
      
      // 업데이트 처리 함수 호출
      handleCVEUpdated(message.data);
      
      // refreshTrigger 업데이트 콜백이 있으면 호출
      if (typeof callbacksRef.current.onRefreshTriggered === 'function') {
        const field = message.data?.field || null;
        console.log('[WebSocket] 필드 업데이트 트리거:', field);
        callbacksRef.current.onRefreshTriggered(field);
      }
      
      // 추가 콜백이 제공된 경우 실행
      if (typeof callbacksRef.current.onUpdateReceived === 'function') {
        callbacksRef.current.onUpdateReceived(message);
      }
    }
    
    // 구독자 정보 업데이트 메시지 처리
    if ((message.type === 'subscribe_cve' || message.type === 'unsubscribe_cve') && 
        message.data?.cveId === currentCveId) {
      console.log('[WebSocket] 구독자 정보 변경 감지:', message.type, message.data?.subscribers?.length || 0);
      
      // 구독자 정보 변경 콜백이 제공된 경우 실행
      if (typeof callbacksRef.current.onSubscribersChange === 'function') {
        callbacksRef.current.onSubscribersChange(message.data?.subscribers || []);
      }
      
      // 일반 업데이트 콜백이 제공된 경우 실행
      if (typeof callbacksRef.current.onUpdateReceived === 'function') {
        callbacksRef.current.onUpdateReceived(message);
      }
    }
  }, [handleCVEUpdated]);
  
  // 구독 관리 함수 - 안정적인 구현
  const manageCVESubscription = useCallback(async () => {
    // 파라미터 유효성 확인
    const currentCveId = cveIdRef.current;
    if (!currentCveId || !webSocketInstance || !isMountedRef.current) return;
    
    // 이미 처리 중인 경우 중복 실행 방지
    if (subscriptionRef.current.processing) {
      console.log('[WebSocket] 구독 요청이 이미 처리 중입니다.');
      return;
    }
    
    // 이미 같은 CVE ID를 구독 중인 경우 무시
    if (subscriptionRef.current.active && subscriptionRef.current.cveId === currentCveId) {
      console.log(`[WebSocket] 이미 구독 관리 중인 CVE: ${currentCveId}`);
      return;
    }
    
    try {
      // 구독 프로세스 시작
      subscriptionRef.current.processing = true;
      
      // 다른 CVE ID를 이전에 구독했었다면 해제
      if (subscriptionRef.current.active && subscriptionRef.current.cveId !== currentCveId) {
        console.log(`[WebSocket] 이전 CVE 구독 해제 후 새로운 CVE 구독 요청: ${subscriptionRef.current.cveId} -> ${currentCveId}`);
        
        try {
          // 기존 구독 해제
          await webSocketInstance.unsubscribeFromCVE(subscriptionRef.current.cveId);
          // 구독 상태 초기화
          subscriptionRef.current.active = false;
          subscriptionRef.current.cveId = null;
          
          // 세션 스토리지 업데이트
          updateSubscriptionStorage(subscriptionRef.current.cveId, false);
          
          // 서버 응답 대기를 위한 짧은 지연
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`[WebSocket] 이전 CVE 구독 해제 실패:`, error);
        }
      }
      
      // 컴포넌트가 여전히 마운트되어 있는지 확인
      if (!isMountedRef.current) {
        console.log('[WebSocket] 구독 처리 중 컴포넌트가 언마운트되었습니다.');
        return;
      }
      
      // 실제 구독 요청
      console.log(`[WebSocket] CVE 구독 요청: ${currentCveId}`);
      const success = await webSocketInstance.subscribeToCVE(currentCveId);
      
      if (success) {
        console.log(`[WebSocket] CVE 구독 성공: ${currentCveId}`);
        
        // 구독 상태 업데이트
        if (isMountedRef.current) {
          subscriptionRef.current.active = true;
          subscriptionRef.current.cveId = currentCveId;
          
          // 세션 스토리지 업데이트
          updateSubscriptionStorage(currentCveId, true);
        } else {
          console.log('[WebSocket] 구독 성공 후 컴포넌트가 언마운트되어 구독 해제 요청:', currentCveId);
          await webSocketInstance.unsubscribeFromCVE(currentCveId);
        }
      }
    } catch (error) {
      console.error(`[WebSocket] CVE 구독 관리 실패: ${currentCveId}`, error);
    } finally {
      // 구독 프로세스 종료
      subscriptionRef.current.processing = false;
    }
  }, []);
  
  // 메시지 핸들러 등록 및 구독 관리
  useEffect(() => {
    if (!webSocketInstance || !cveId) return;
    
    // 메시지 핸들러 등록
    webSocketInstance.addHandler('message', messageHandler);
    
    // 구독 요청 (약간의 지연 후) - 중복 요청 방지
    const subscriptionTimeout = setTimeout(() => {
      if (isMountedRef.current) {
        manageCVESubscription();
      }
    }, 300);
    
    // 클린업 함수
    return () => {
      // 타임아웃 취소
      clearTimeout(subscriptionTimeout);
      
      // 메시지 핸들러 제거
      webSocketInstance.removeHandler('message', messageHandler);
      
      // 구독 해제 함수
      const unsubscribe = async () => {
        if (subscriptionRef.current.active && subscriptionRef.current.cveId) {
          console.log(`[WebSocket] 구독 해제 요청: ${subscriptionRef.current.cveId}`);
          
          try {
            await webSocketInstance.unsubscribeFromCVE(subscriptionRef.current.cveId);
            console.log(`[WebSocket] 구독 해제 완료: ${subscriptionRef.current.cveId}`);
            
            // 세션 스토리지 업데이트
            updateSubscriptionStorage(subscriptionRef.current.cveId, false);
            
            // 구독 상태 초기화
            subscriptionRef.current = { 
              active: false, 
              cveId: null, 
              processing: false,
              mountedAt: subscriptionRef.current.mountedAt
            };
          } catch (error) {
            console.error(`[WebSocket] 구독 해제 실패: ${subscriptionRef.current.cveId}`, error);
          }
        }
      };
      
      // 비동기 함수 실행
      unsubscribe();
    };
  }, [cveId, messageHandler, manageCVESubscription]);
  
  // sendCustomMessage 함수 - 안정적인 구현
  const sendCustomMessage = useCallback(async (type, data) => {
    if (webSocketInstance) {
      try {
        return await webSocketInstance.send(type, data);
      } catch (error) {
        console.error(`[WebSocket] 메시지 전송 오류 (${type}):`, error);
        throw error;
      }
    }
    throw new Error('[WebSocket] WebSocket 인스턴스가 없습니다');
  }, []);
  
  return { sendCustomMessage };
};

/**
 * useWebSocketMessage:
 * 메시지 핸들러 등록 및 sendCustomMessage 제공
 */
export const useWebSocketMessage = (messageHandler) => {
  // 핸들러 참조를 유지하기 위한 ref 추가
  const handlerRef = useRef(null);
  
  // stableMessageHandler는 컴포넌트 생명주기 동안 안정적으로 유지됩니다
  const stableMessageHandler = useCallback((message) => {
    if (typeof messageHandler === 'function') {
      try {
        messageHandler(message);
      } catch (error) {
        console.error('[WebSocketMessage] 메시지 핸들러 실행 오류:', error);
      }
    }
  }, []);

  // handlerRef 업데이트 - 항상 최신 messageHandler를 참조
  useEffect(() => {
    handlerRef.current = messageHandler;
  }, [messageHandler]);

  // 실제 이벤트 핸들러 함수 - 항상 최신 핸들러 참조를 사용
  const internalHandler = useCallback((message) => {
    if (typeof handlerRef.current === 'function') {
      try {
        handlerRef.current(message);
      } catch (error) {
        console.error('[WebSocketMessage] 메시지 핸들러 실행 오류:', error);
      }
    }
  }, []);

  // 메시지 핸들러 등록 및 제거 - 안정적인 함수 참조 사용
  useEffect(() => {
    if (!webSocketInstance) return;

    // 핸들러 등록 (컴포넌트 마운트 시)
    webSocketInstance.addHandler('message', internalHandler);
    
    return () => {
      // 핸들러 제거 (컴포넌트 언마운트 시)
      webSocketInstance.removeHandler('message', internalHandler);
    };
  }, [internalHandler]);

  // 안정적인 sendCustomMessage 구현
  const sendCustomMessage = useCallback(async (type, data) => {
    if (webSocketInstance) {
      try {
        return await webSocketInstance.send(type, data);
      } catch (error) {
        console.error(`[WebSocketMessage] 메시지 전송 오류 (${type}):`, error);
        throw error;
      }
    }
    throw new Error('[WebSocketMessage] WebSocket 인스턴스가 없습니다');
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
  const isConnected = useSelector(selectWebSocketConnected);
  const wsError = useSelector(selectWebSocketError);
  const { enqueueSnackbar } = useSnackbar();
  const dispatch = useDispatch();
  
  // 컨텍스트에서 직접 상태 관리하는 부분
  const [isReady, setIsReady] = useState(false);

  // RTK Query 캐시 무효화 함수
  const invalidateCVECache = useCallback((cveId) => {
    dispatch(invalidateCache(cveId));
  }, [dispatch]);

  // 인증 상태 변경에 따른 웹소켓 연결 관리
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(wsConnecting());
      webSocketInstance.connect();
      
      // 캐시 무효화 활성화
      webSocketInstance.setCacheInvalidation(true);
    } else {
      webSocketInstance.disconnect();
    }
  }, [isAuthenticated, dispatch]);

  // 웹소켓 연결 상태 변경 처리
  useEffect(() => {
    setIsReady(isConnected);
    
    // 오류 발생 시 스낵바로 알림
    if (wsError && !wsError.message?.includes('401')) {
      enqueueSnackbar(wsError.message || '연결 오류가 발생했습니다.', {
        variant: 'error',
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
      });
    }
  }, [isConnected, wsError, enqueueSnackbar]);

  // 글로벌 메시지 핸들러 등록 - CVE 업데이트 알림
  useEffect(() => {
    const handleGlobalSocketMessage = async (message) => {
      // CVE 업데이트 이벤트 감지
      if (message.type === WS_EVENT_TYPE.CVE_UPDATED && message.data?.cveId) {
        // 현재 보고 있는 CVE가 업데이트된 경우 알림
        if (currentCVE && message.data.cveId === currentCVE.cveId) {
          const fieldName = message.data.field ? 
            (message.data.field === 'snortRules' ? 'Snort Rules' :
             message.data.field === 'poc' ? 'PoC' :
             message.data.field === 'references' ? 'References' :
             message.data.field === 'comments' ? 'Comments' : message.data.field) 
            : '항목';
            
          enqueueSnackbar(`CVE의 ${fieldName}이(가) 업데이트되었습니다.`, { 
            variant: 'info',
            action: (key) => (
              <Button color="inherit" size="small" onClick={() => {
                dispatch(fetchCVEDetail(message.data.cveId));
                enqueueSnackbar('최신 데이터로 업데이트되었습니다.', { variant: 'success' });
              }}>
                지금 갱신
              </Button>
            )
          });
        }
      }
    };
    
    webSocketInstance.addHandler('message', handleGlobalSocketMessage);
    
    return () => {
      webSocketInstance.removeHandler('message', handleGlobalSocketMessage);
    };
  }, [currentCVE, enqueueSnackbar, dispatch]);

  // 컨텍스트 값 생성
  const value = useMemo(
    () => ({
      isConnected,
      isReady,
      error: wsError,
      currentCVE,
      sendMessage: webSocketInstance.send.bind(webSocketInstance),
      invalidateCVECache,
    }),
    [isConnected, isReady, wsError, currentCVE, invalidateCVECache]
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
