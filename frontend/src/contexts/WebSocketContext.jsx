import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSnackbar } from 'notistack';
import webSocketInstance, { WS_EVENT_TYPE } from '../services/websocket';
import {
  selectCVEDetail,
  invalidateCache,
  fetchCVEDetail,
  updateCVEFromWebSocket,
} from '../store/slices/cveSlice';
import {
  selectWebSocketConnected,
  selectWebSocketError,
  wsConnecting,
} from '../store/slices/websocketSlice';
import { Button } from '@mui/material';

// 세션 스토리지 키
const ACTIVE_SUBSCRIPTIONS_KEY = 'cvehubActiveSubscriptions';

/**
 * 세션 스토리지에 활성 구독 저장
 * @param {string} cveId - 구독할 CVE ID
 * @param {boolean} isSubscribing - true: 구독 추가, false: 구독 해제
 */
const updateSubscriptionStorage = (cveId, isSubscribing) => {
  try {
    let activeSubscriptions = JSON.parse(
      sessionStorage.getItem(ACTIVE_SUBSCRIPTIONS_KEY) || '[]'
    );
    if (isSubscribing) {
      if (!activeSubscriptions.includes(cveId)) {
        activeSubscriptions.push(cveId);
      }
    } else {
      activeSubscriptions = activeSubscriptions.filter((id) => id !== cveId);
    }
    sessionStorage.setItem(
      ACTIVE_SUBSCRIPTIONS_KEY,
      JSON.stringify(activeSubscriptions)
    );
    console.log(
      `[WebSocket] 세션 스토리지 구독 정보 업데이트: ${activeSubscriptions.join(
        ', '
      )}`
    );
  } catch (error) {
    console.error('[WebSocket] 세션 스토리지 업데이트 오류:', error);
  }
};

/**
 * 세션 스토리지의 구독 정보 전체 정리
 */
const clearSubscriptionStorage = () => {
  try {
    sessionStorage.removeItem(ACTIVE_SUBSCRIPTIONS_KEY);
    console.log('[WebSocket] 세션 스토리지 구독 정보 전체 정리 완료');
  } catch (error) {
    console.error('[WebSocket] 세션 스토리지 구독 정보 정리 오류:', error);
  }
};

/**
 * 페이지 로드 시 이전 세션의 구독 정보 확인 및 정리
 */
const cleanupPreviousSubscriptions = async () => {
  try {
    const activeSubscriptions = JSON.parse(
      sessionStorage.getItem(ACTIVE_SUBSCRIPTIONS_KEY) || '[]'
    );
    if (activeSubscriptions.length > 0) {
      console.log(
        `[WebSocket] 이전 세션의 구독 정보 발견: ${activeSubscriptions.join(
          ', '
        )}`
      );
      for (const cveId of activeSubscriptions) {
        console.log(`[WebSocket] 이전 세션의 구독 해제 중: ${cveId}`);
        await webSocketInstance.unsubscribeFromCVE(cveId);
      }
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
export const useCVEWebSocketUpdate = (
  cveId,
  onUpdateReceived,
  onRefreshTriggered,
  onSubscribersChange
) => {
  const dispatch = useDispatch();
  const callbacksRef = useRef({
    onUpdateReceived,
    onRefreshTriggered,
    onSubscribersChange,
  });
  const subscriptionRef = useRef({
    active: false,
    cveId: null,
    processing: false,
    mountedAt: Date.now(),
  });
  const cveIdRef = useRef(cveId);
  const isMountedRef = useRef(true);
  useEffect(() => {
    callbacksRef.current = {
      onUpdateReceived,
      onRefreshTriggered,
      onSubscribersChange,
    };
    cveIdRef.current = cveId;
  }, [cveId, onUpdateReceived, onRefreshTriggered, onSubscribersChange]);
  useEffect(() => {
    cleanupPreviousSubscriptions().catch((error) => {
      console.error('[WebSocket] 이전 구독 정리 실패:', error);
    });
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const handleCVEUpdated = useCallback(
    (messageData) => {
      if (!messageData?.cveId || !isMountedRef.current) return;
      console.log('[WebSocket] CVE_UPDATED 메시지 수신:', messageData);
      dispatch(invalidateCache(messageData.cveId));
      console.log(`[WebSocket] ${messageData.cveId} 데이터 갱신 중...`);
      dispatch(fetchCVEDetail(messageData.cveId));
      if (messageData.cve) {
        console.log(`[WebSocket] WebSocket에서 받은 CVE 데이터로 직접 업데이트`);
        dispatch(
          updateCVEFromWebSocket({
            cveId: messageData.cveId,
            data: messageData.cve,
            field: messageData.field,
          })
        );
      }
    },
    [dispatch]
  );
  const messageHandler = useCallback(
    (message) => {
      if (!message?.type || !message?.data || !isMountedRef.current) return;
      const currentCveId = cveIdRef.current;
      if (!currentCveId) return;
      if (
        message.type === WS_EVENT_TYPE.CVE_UPDATED &&
        message.data?.cveId === currentCveId
      ) {
        console.log('[WebSocket] CVE 업데이트 메시지 수신:', message.data);
        console.log('[WebSocket] 필드 정보:', message.data?.field);
        handleCVEUpdated(message.data);
        if (typeof callbacksRef.current.onRefreshTriggered === 'function') {
          const field = message.data?.field || null;
          console.log('[WebSocket] 필드 업데이트 트리거:', field);
          callbacksRef.current.onRefreshTriggered(field);
        }
        if (typeof callbacksRef.current.onUpdateReceived === 'function') {
          callbacksRef.current.onUpdateReceived(message);
        }
      }
      if (
        (message.type === 'subscribe_cve' ||
          message.type === 'unsubscribe_cve') &&
        message.data?.cveId === currentCveId
      ) {
        console.log(
          '[WebSocket] 구독자 정보 변경 감지:',
          message.type,
          message.data?.subscribers?.length || 0
        );
        if (typeof callbacksRef.current.onSubscribersChange === 'function') {
          callbacksRef.current.onSubscribersChange(message.data?.subscribers || []);
        }
        if (typeof callbacksRef.current.onUpdateReceived === 'function') {
          callbacksRef.current.onUpdateReceived(message);
        }
      }
    },
    [handleCVEUpdated]
  );
  const manageCVESubscription = useCallback(async () => {
    const currentCveId = cveIdRef.current;
    if (!currentCveId || !webSocketInstance || !isMountedRef.current) return;
    if (subscriptionRef.current.processing) {
      console.log('[WebSocket] 구독 요청이 이미 처리 중입니다.');
      return;
    }
    if (subscriptionRef.current.active && subscriptionRef.current.cveId === currentCveId) {
      console.log(`[WebSocket] 이미 구독 관리 중인 CVE: ${currentCveId}`);
      return;
    }
    try {
      subscriptionRef.current.processing = true;
      if (subscriptionRef.current.active && subscriptionRef.current.cveId !== currentCveId) {
        console.log(
          `[WebSocket] 이전 CVE 구독 해제 후 새로운 CVE 구독 요청: ${subscriptionRef.current.cveId} -> ${currentCveId}`
        );
        try {
          await webSocketInstance.unsubscribeFromCVE(subscriptionRef.current.cveId);
          subscriptionRef.current.active = false;
          subscriptionRef.current.cveId = null;
          updateSubscriptionStorage(subscriptionRef.current.cveId, false);
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          console.error('[WebSocket] 이전 CVE 구독 해제 실패:', error);
        }
      }
      if (!isMountedRef.current) {
        console.log('[WebSocket] 구독 처리 중 컴포넌트가 언마운트되었습니다.');
        return;
      }
      console.log(`[WebSocket] CVE 구독 요청: ${currentCveId}`);
      const success = await webSocketInstance.subscribeToCVE(currentCveId);
      if (success) {
        console.log(`[WebSocket] CVE 구독 성공: ${currentCveId}`);
        if (isMountedRef.current) {
          subscriptionRef.current.active = true;
          subscriptionRef.current.cveId = currentCveId;
          updateSubscriptionStorage(currentCveId, true);
        } else {
          console.log(
            '[WebSocket] 구독 성공 후 컴포넌트가 언마운트되어 구독 해제 요청:',
            currentCveId
          );
          await webSocketInstance.unsubscribeFromCVE(currentCveId);
        }
      }
    } catch (error) {
      console.error(`[WebSocket] CVE 구독 관리 실패: ${currentCveId}`, error);
    } finally {
      subscriptionRef.current.processing = false;
    }
  }, []);
  useEffect(() => {
    if (!webSocketInstance || !cveId) return;
    webSocketInstance.addHandler('message', messageHandler);
    const subscriptionTimeout = setTimeout(() => {
      if (isMountedRef.current) {
        manageCVESubscription();
      }
    }, 300);
    return () => {
      clearTimeout(subscriptionTimeout);
      webSocketInstance.removeHandler('message', messageHandler);
      const unsubscribe = async () => {
        if (subscriptionRef.current.active && subscriptionRef.current.cveId) {
          console.log(
            `[WebSocket] 구독 해제 요청: ${subscriptionRef.current.cveId}`
          );
          try {
            await webSocketInstance.unsubscribeFromCVE(subscriptionRef.current.cveId);
            console.log(
              `[WebSocket] 구독 해제 완료: ${subscriptionRef.current.cveId}`
            );
            updateSubscriptionStorage(subscriptionRef.current.cveId, false);
            subscriptionRef.current = {
              active: false,
              cveId: null,
              processing: false,
              mountedAt: subscriptionRef.current.mountedAt,
            };
          } catch (error) {
            console.error(
              `[WebSocket] 구독 해제 실패: ${subscriptionRef.current.cveId}`,
              error
            );
          }
        }
      };
      unsubscribe();
    };
  }, [cveId, messageHandler, manageCVESubscription]);
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
  const handlerRef = useRef(null);
  useEffect(() => {
    handlerRef.current = messageHandler;
  }, [messageHandler]);
  const internalHandler = useCallback((message) => {
    if (typeof handlerRef.current === 'function') {
      try {
        handlerRef.current(message);
      } catch (error) {
        console.error('[WebSocketMessage] 메시지 핸들러 실행 오류:', error);
      }
    }
  }, []);
  useEffect(() => {
    if (!webSocketInstance) return;
    webSocketInstance.addHandler('message', internalHandler);
    return () => {
      webSocketInstance.removeHandler('message', internalHandler);
    };
  }, [internalHandler]);
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
  const [isReady, setIsReady] = useState(false);
  const [lastConnectionStatus, setLastConnectionStatus] = useState({ 
    connected: false, 
    error: null,
    lastCheckedAt: Date.now(),
    lastLogTime: Date.now(),
    ready: false,
  });
  const [connectionCheckCount, setConnectionCheckCount] = useState(0);
  
  const invalidateCVECache = useCallback(
    (cveId) => {
      dispatch(invalidateCache(cveId));
    },
    [dispatch]
  );
  
  // 인증 상태에 따른 WebSocket 연결 관리
  useEffect(() => {
    // 인증되지 않은 경우 아무 작업도 수행하지 않음
    if (!isAuthenticated) {
      // 웹소켓 연결 종료 및 세션 스토리지 정리는 유지
      webSocketInstance.disconnect();
      
      // 인증되지 않은 상태에서 구독 정보 정리
      clearSubscriptionStorage();
      
      // 인증되지 않은 경우 isReady 상태도 false로 설정
      if (isReady) setIsReady(false);
      
      return;
    }
    
    try {
      console.log('[WebSocketProvider] 인증 상태 확인: 인증됨, WebSocket 연결 시도');
      dispatch(wsConnecting());
      webSocketInstance.connect();
      webSocketInstance.setCacheInvalidation(true);
    } catch (error) {
      console.error('[WebSocketProvider] WebSocket 연결 관리 중 오류 발생:', error);
    }
  }, [isAuthenticated, dispatch, isReady]);
  
  // 주기적인 연결 상태 확인 - 인증된 경우에만 실행
  useEffect(() => {
    // 인증되지 않은 경우 타이머 설정하지 않음
    if (!isAuthenticated) {
      return;
    }
    
    console.log('[WebSocketContext] 연결 상태 체크 타이머 시작');
    const interval = setInterval(() => {
      setConnectionCheckCount(prev => prev + 1);
    }, 1000); // 1초마다 체크
    
    return () => {
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  // 초기 구독 정리 - 인증된 경우에만 실행
  useEffect(() => {
    if (!isAuthenticated) return;
    
    // 이전 세션의 구독 정보 정리
    cleanupPreviousSubscriptions();
  }, [isAuthenticated]);
  
  // 연결 상태에 따른 isReady 상태 관리
  useEffect(() => {
    // 인증되지 않은 경우 즉시 반환
    if (!isAuthenticated) {
      if (isReady) {
        console.log('[WebSocketContext] 인증되지 않음, isReady = false로 설정');
        setIsReady(false);
      }
      return;
    }
    
    try {
      // 실제 웹소켓 인스턴스의 연결 상태와 isReady 상태 확인
      const actuallyConnected = webSocketInstance?.isConnected() || false;
      const serviceIsReady = webSocketInstance?.isReady || false;
      
      // isReady 상태 확인 (디버깅용) - 출력 빈도 줄임
      if (connectionCheckCount % 60 === 0) { // 1분마다 로그 출력
        console.log('[WebSocketContext] 정기 isReady 상태 확인:', { 
          reduxConnected: isConnected, 
          serviceConnected: actuallyConnected, 
          serviceIsReady: serviceIsReady,
          contextIsReady: isReady 
        });
      }
      
      // 웹소켓 서비스 객체의 isReady 상태와 컨텍스트의 isReady 상태 동기화
      if (serviceIsReady !== isReady) {
        console.log(`[WebSocketContext] isReady 상태 동기화: ${isReady} → ${serviceIsReady}`);
        setIsReady(serviceIsReady);
      }
      // 이미 isReady가 true인 상태에서 연결이 끊어진 경우 처리
      else if (isReady && !actuallyConnected) {
        console.log('[WebSocketContext] 연결이 끊어진 상태에서 isReady = false로 설정');
        setIsReady(false);
      }
    } catch (error) {
      console.error('[WebSocketContext] isReady 상태 관리 중 오류 발생:', error);
      if (isReady) setIsReady(false);
    }
  }, [isAuthenticated, isConnected, connectionCheckCount]);
  
  // WebSocket 상태 및 오류 처리
  useEffect(() => {
    // 인증되지 않은 경우 처리하지 않음
    if (!isAuthenticated) return;
    
    try {
      // 상태 변경이 있거나 1분마다 1번 상세 로그 출력
      const timeToLog = !lastConnectionStatus.lastLogTime || 
                       (Date.now() - lastConnectionStatus.lastLogTime > 60000); // 1분마다 로깅
      
      if (timeToLog) {
        // 실제 웹소켓 인스턴스의 연결 상태 확인 (로깅 목적)
        const actuallyConnected = webSocketInstance?.isConnected() || false;
        const serviceIsReady = webSocketInstance?.isReady || false;
        
        console.log('[WebSocketProvider] 주기적 연결 상태 진단:');
        console.log(`- Redux 상태: isConnected=${isConnected}`);
        console.log(`- 실제 연결 상태: actuallyConnected=${actuallyConnected}`);
        console.log(`- 서비스 isReady: serviceIsReady=${serviceIsReady}`);
        console.log(`- 컨텍스트 isReady: contextIsReady=${isReady}`);
        console.log(`- 웹소켓 인스턴스 존재 여부: ${!!webSocketInstance}`);
        if (webSocketInstance) {
          console.log(`- 웹소켓 readyState: ${webSocketInstance.ws?.readyState}`);
        }
        
        // 로깅 시간 기록
        setLastConnectionStatus(prev => ({ 
          ...prev, 
          lastLogTime: Date.now() 
        }));
      }
      
      // 오류 처리 (401 인증 오류는 제외)
      if (wsError && !wsError.message?.includes('401')) {
        // 이전에 표시한 것과 동일한 오류면 스킵
        if (lastConnectionStatus.error?.message !== wsError.message) {
          console.error('[WebSocketProvider] WebSocket 오류:', wsError);
          setLastConnectionStatus(prev => ({ ...prev, error: wsError }));
          
          // 사용자에게 오류 알림
          enqueueSnackbar(wsError.message || '연결 오류가 발생했습니다.', {
            variant: 'error',
            anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
            action: (key) => (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  webSocketInstance.connect();
                  enqueueSnackbar('WebSocket 재연결을 시도합니다.', {
                    variant: 'info',
                    anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
                  });
                }}
              >
                재연결
              </Button>
            )
          });
        }
      }
    } catch (error) {
      console.error('[WebSocketProvider] WebSocket 상태 확인 중 오류 발생:', error);
    }
  }, [isAuthenticated, isConnected, wsError, connectionCheckCount, enqueueSnackbar, lastConnectionStatus]);
  
  // 메시지 핸들러
  useEffect(() => {
    // 인증되지 않은 경우 메시지 핸들러를 등록하지 않음
    if (!isAuthenticated) {
      console.log('[WebSocketProvider] 인증되지 않음, 메시지 핸들러 등록하지 않음');
      return;
    }
    
    try {
      const handleGlobalSocketMessage = async (message) => {
        if (!message || !message.type || !message.data) return;
        
        if (message.type === WS_EVENT_TYPE.CVE_UPDATED && message.data?.cveId) {
          if (currentCVE && message.data.cveId === currentCVE.cveId) {
            const fieldName = message.data.field
              ? message.data.field === 'snortRules'
                ? 'Snort Rules'
                : message.data.field === 'poc'
                ? 'PoC'
                : message.data.field === 'references'
                ? 'References'
                : message.data.field === 'comments'
                ? 'Comments'
                : message.data.field
              : '항목';
            enqueueSnackbar(`CVE의 ${fieldName}이(가) 업데이트되었습니다.`, {
              variant: 'info',
              action: (key) => (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    dispatch(fetchCVEDetail(message.data.cveId));
                    enqueueSnackbar('최신 데이터로 업데이트되었습니다.', {
                      variant: 'success',
                    });
                  }}
                >
                  지금 갱신
                </Button>
              ),
            });
          }
        } else if (message.type === "crawler_update_progress" || message.type === WS_EVENT_TYPE.CRAWLER_UPDATE_PROGRESS) {
          // 크롤러 업데이트 메시지 처리
          console.log('[WebSocketContext] 크롤러 업데이트 메시지 수신:', message.data);
          
          // 업데이트된 CVE 개수가 있을 경우 알림 표시
          if (message.data?.stage === "완료" && message.data?.updatedCount) {
            enqueueSnackbar(`크롤러 업데이트 완료: ${message.data.updatedCount}개의 CVE가 업데이트되었습니다.`, {
              variant: 'success',
              autoHideDuration: 5000,
            });
          }
          
          // 오류 발생 시 알림 표시
          if (message.data?.stage === "오류") {
            enqueueSnackbar(`크롤러 업데이트 오류: ${message.data.message || '알 수 없는 오류가 발생했습니다.'}`, {
              variant: 'error',
              autoHideDuration: 7000,
            });
          }
        }
      };
      
      webSocketInstance.addHandler('message', handleGlobalSocketMessage);
      return () => {
        webSocketInstance.removeHandler('message', handleGlobalSocketMessage);
      };
    } catch (error) {
      console.error('[WebSocketProvider] 메시지 핸들러 설정 중 오류 발생:', error);
    }
  }, [currentCVE, enqueueSnackbar, dispatch, isAuthenticated]);
  
  const value = useMemo(() => ({
    isConnected,
    isReady,
    error: wsError,
    currentCVE,
    sendMessage: webSocketInstance.send.bind(webSocketInstance),
    invalidateCVECache,
  }), [isConnected, isReady, wsError, currentCVE, invalidateCVECache]);
  
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
    throw new Error(
      'useWebSocketContext must be used within a WebSocketProvider'
    );
  }
  return context;
};