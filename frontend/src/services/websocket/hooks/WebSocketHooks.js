import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import webSocketService from '../../websocket';
import { WS_EVENT } from '../utils/configUtils';
import { updateCVEFromWebSocket } from '../../../store/slices/cveSlice';

/**
 * 웹소켓 메시지 구독 훅
 * 특정 이벤트 타입에 대한 메시지를 구독합니다.
 * 
 * @param {string} eventType - 구독할 이벤트 타입 (기본값: 'message')
 * @param {function} callback - 메시지 수신 시 콜백 함수
 * @param {function} [filterFn] - 메시지 필터링 함수 (선택적)
 */
export const useWebSocketMessage = (eventType = 'message', callback, filterFn) => {
  // 콜백 참조 유지
  const callbackRef = useRef(callback);
  const filterRef = useRef(filterFn);
  // 구독 취소 함수 참조
  const unsubscribeRef = useRef(null);
  // 훅 마운트 상태 추적
  const isMounted = useRef(true);
  // eventType 참조 유지 (문자열 변환 보장)
  const eventTypeRef = useRef(typeof eventType === 'string' ? eventType : 'message');
  
  // eventType이 변경되면 참조 업데이트
  useEffect(() => {
    if (typeof eventType === 'string') {
      eventTypeRef.current = eventType;
    } else {
      console.error('[WebSocketHooks] 잘못된 eventType:', eventType, '- "message"로 대체됨');
      eventTypeRef.current = 'message';
    }
  }, [eventType]);
  
  // 콜백 업데이트
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  // 필터 함수 업데이트
  useEffect(() => {
    filterRef.current = filterFn;
  }, [filterFn]);
  
  // 마운트/언마운트 추적
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  // 이벤트 구독 설정
  useEffect(() => {
    // 유효성 검사
    if (!eventTypeRef.current) {
      console.error('[WebSocketHooks] 유효하지 않은 eventType 무시됨');
      return;
    }
    
    // 이미 구독 중인 경우 이전 구독 취소
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    try {
      // 메시지 핸들러 함수
      const handleMessage = (data) => {
        if (!isMounted.current) return;
        
        // 필터링 함수가 있고 조건을 만족하지 않으면 무시
        if (filterRef.current && typeof filterRef.current === 'function' && !filterRef.current(data)) {
          return;
        }
        
        // 콜백 함수가 있으면 호출
        if (callbackRef.current && typeof callbackRef.current === 'function') {
          callbackRef.current(data);
        }
      };
      
      // 이벤트 구독 및 취소 함수 저장
      const currentEventType = eventTypeRef.current;
      unsubscribeRef.current = webSocketService.on(currentEventType, handleMessage);
    } catch (error) {
      console.error('[WebSocketHooks] 이벤트 구독 중 오류:', error);
    }
    
    // 정리 함수
    return () => {
      if (unsubscribeRef.current) {
        try {
          unsubscribeRef.current();
        } catch (err) {
          console.error('[WebSocketHooks] 이벤트 구독 취소 중 오류:', err);
        }
        unsubscribeRef.current = null;
      }
    };
  }, [eventTypeRef.current]); // eventType 참조가 변경될 때만 이펙트 실행
};

/**
 * CVE 웹소켓 업데이트 구독 훅
 * 특정 CVE ID에 대한 업데이트를 구독합니다.
 * 
 * @param {string} cveId - 구독할 CVE ID
 * @param {object} options - 옵션 객체
 * @param {function} options.onUpdate - 업데이트 수신 시 콜백
 * @param {function} options.onSubscribersChange - 구독자 정보 변경 시 콜백
 * @returns {object} - 구독 관련 기능
 */
export const useCVEWebSocketUpdate = (cveId, options = {}) => {
  const dispatch = useDispatch();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribers, setSubscribers] = useState([]);
  
  // 콜백 옵션
  const { onUpdate, onSubscribersChange } = options;
  
  // 콜백 참조 유지
  const callbacksRef = useRef({ onUpdate, onSubscribersChange });
  
  // 콜백 업데이트
  useEffect(() => {
    callbacksRef.current = { onUpdate, onSubscribersChange };
  }, [onUpdate, onSubscribersChange]);
  
  // CVE 업데이트 메시지 핸들러 메모이제이션
  const handleCVEUpdate = useCallback((data) => {
    // 유효성 검사
    if (!data || data.cveId !== cveId) return;
    
    // 콜백 실행
    if (typeof callbacksRef.current.onUpdate === 'function') {
      callbacksRef.current.onUpdate(data);
    }
    
    // 스토어 업데이트 (field와 value가 있는 경우)
    if (data.field && data.value !== undefined) {
      dispatch(updateCVEFromWebSocket({
        cveId,
        field: data.field,
        value: data.value
      }));
    }
  }, [cveId, dispatch]);
  
  // 구독자 변경 메시지 핸들러 메모이제이션
  const handleSubscriptionChange = useCallback((data) => {
    if (!data) return;
    
    // 구독자 정보 업데이트
    if (data.subscribers) {
      setSubscribers(data.subscribers);
      
      // 콜백 실행
      if (typeof callbacksRef.current.onSubscribersChange === 'function') {
        callbacksRef.current.onSubscribersChange(data.subscribers);
      }
    }
    
    // 구독 상태 업데이트
    if (data.action === 'subscribe') {
      setIsSubscribed(true);
    } else if (data.action === 'unsubscribe') {
      setIsSubscribed(false);
    }
  }, []);
  
  // CVE 업데이트 구독
  useEffect(() => {
    if (!cveId) return () => {};
    
    const updateUnsub = webSocketService.on(`${WS_EVENT.CVE_UPDATED}:${cveId}`, handleCVEUpdate);
    const subscriptionUnsub = webSocketService.on(`subscription:${cveId}`, handleSubscriptionChange);
    
    return () => {
      updateUnsub();
      subscriptionUnsub();
    };
  }, [cveId, handleCVEUpdate, handleSubscriptionChange]);
  
  // 구독 함수 메모이제이션
  const subscribe = useCallback(async () => {
    if (!cveId || isSubscribed) return false;
    return webSocketService.subscribe(cveId);
  }, [cveId, isSubscribed]);
  
  // 구독 해제 함수 메모이제이션
  const unsubscribe = useCallback(async () => {
    if (!cveId || !isSubscribed) return false;
    return webSocketService.unsubscribe(cveId);
  }, [cveId, isSubscribed]);
  
  // 업데이트 전송 함수 메모이제이션
  const sendUpdate = useCallback((field, value) => {
    if (!cveId || !field) return false;
    return webSocketService.send('update_cve', { cveId, field, value });
  }, [cveId]);
  
  // 컴포넌트 마운트 시 구독
  useEffect(() => {
    if (cveId && !isSubscribed && webSocketService.checkConnection()) {
      subscribe();
    }
    
    // 언마운트 시 구독 해제
    return () => {
      if (cveId && isSubscribed) {
        unsubscribe();
      }
    };
  }, [cveId, isSubscribed, subscribe, unsubscribe]);
  
  // 반환 객체 메모이제이션
  return useMemo(() => ({
    isSubscribed,
    subscribers,
    subscribe,
    unsubscribe,
    sendUpdate
  }), [isSubscribed, subscribers, subscribe, unsubscribe, sendUpdate]);
};

/**
 * 웹소켓 연결 상태 훅
 * 현재 웹소켓 연결 상태를 추적합니다.
 * 
 * @returns {object} 연결 상태 정보
 */
export const useWebSocketConnection = () => {
  const [isConnected, setIsConnected] = useState(webSocketService.checkConnection());
  const [connectionState, setConnectionState] = useState(webSocketService.state);
  
  // 구독 취소 함수들 참조
  const unsubscriptions = useRef({});
  // 마지막 상태 업데이트 시간 추적 (디바운싱용)
  const lastUpdateRef = useRef(Date.now());
  
  // 상태 업데이트 최적화 (디바운싱)
  const updateConnectionState = useCallback((newState, forceUpdate = false) => {
    const now = Date.now();
    // 100ms 내에 중복 업데이트 방지 (forceUpdate가 아닌 경우)
    if (!forceUpdate && now - lastUpdateRef.current < 100) return;
    
    lastUpdateRef.current = now;
    setConnectionState(newState);
  }, []);
  
  // 이벤트 핸들러 메모이제이션
  const handleConnected = useCallback(() => {
    setIsConnected(true);
    updateConnectionState('connected');
  }, [updateConnectionState]);
  
  const handleDisconnected = useCallback(() => {
    setIsConnected(false);
    updateConnectionState('disconnected');
  }, [updateConnectionState]);
  
  const handleReconnecting = useCallback(() => {
    updateConnectionState('connecting');
  }, [updateConnectionState]);
  
  const handleError = useCallback(() => {
    updateConnectionState('error');
  }, [updateConnectionState]);
  
  // 이벤트 구독 설정
  useEffect(() => {
    // 이전 구독 정리
    Object.values(unsubscriptions.current).forEach(unsub => {
      if (typeof unsub === 'function') unsub();
    });
    unsubscriptions.current = {};
    
    // 새 구독 설정
    unsubscriptions.current.connected = webSocketService.on(WS_EVENT.CONNECTED, handleConnected);
    unsubscriptions.current.disconnected = webSocketService.on(WS_EVENT.DISCONNECTED, handleDisconnected);
    unsubscriptions.current.connectAck = webSocketService.on(WS_EVENT.CONNECT_ACK, () => {
      // connect_ack은 이제 isConnected 상태에 영향을 주지 않음
      // 하지만 이벤트 관찰을 위해 구독은 유지
    });
    unsubscriptions.current.reconnecting = webSocketService.on(WS_EVENT.RECONNECTING, handleReconnecting);
    unsubscriptions.current.error = webSocketService.on(WS_EVENT.ERROR, handleError);
    
    // 정리 함수
    return () => {
      Object.values(unsubscriptions.current).forEach(unsub => {
        if (typeof unsub === 'function') unsub();
      });
      unsubscriptions.current = {};
    };
  }, [handleConnected, handleDisconnected, handleReconnecting, handleError]);
  
  // 초기 상태 동기화
  useEffect(() => {
    // 컴포넌트 마운트 시 현재 연결 상태 확인
    const currentIsConnected = webSocketService.checkConnection();
    const currentState = webSocketService.state;
    
    // 현재 상태와 일치하지 않으면 업데이트
    if (isConnected !== currentIsConnected) {
      setIsConnected(currentIsConnected);
    }
    
    if (connectionState !== currentState) {
      updateConnectionState(currentState, true);
    }
  }, [connectionState, isConnected, updateConnectionState]);
  
  // 연결 함수 메모이제이션
  const connect = useCallback(() => webSocketService.connect(), []);
  const disconnect = useCallback((cleanDisconnect = true) => webSocketService.disconnect(cleanDisconnect), []);
  const reconnect = useCallback(() => webSocketService.reconnect(), []);
  
  // 반환 객체 메모이제이션
  return useMemo(() => ({
    isConnected,
    isReady: isConnected, // isReady는 isConnected와 동일함
    connectionState,
    connect,
    disconnect,
    reconnect
  }), [isConnected, connectionState, connect, disconnect, reconnect]);
};

/**
 * 크롤러 상태 업데이트 훅
 * 크롤러 진행 상황을 구독합니다.
 * 
 * @param {function} onProgressUpdate - 진행 상황 업데이트 시 콜백
 * @returns {object} 크롤러 상태
 */
export const useCrawlerProgress = (onProgressUpdate) => {
  const [crawlerState, setCrawlerState] = useState({
    isRunning: false,
    progress: 0,
    stage: '',
    message: '',
    lastUpdate: null
  });
  
  // 콜백 참조 유지
  const callbackRef = useRef(onProgressUpdate);
  
  // 콜백 업데이트
  useEffect(() => {
    callbackRef.current = onProgressUpdate;
  }, [onProgressUpdate]);
  
  // 크롤러 업데이트 핸들러 메모이제이션
  const handleCrawlerUpdate = useCallback((data) => {
    if (!data) return;
    
    const newState = {
      isRunning: data.isRunning ?? crawlerState.isRunning,
      progress: data.percent ?? crawlerState.progress,
      stage: data.stage ?? crawlerState.stage,
      message: data.message ?? crawlerState.message,
      lastUpdate: new Date()
    };
    
    setCrawlerState(newState);
    
    if (typeof callbackRef.current === 'function') {
      callbackRef.current(newState);
    }
  }, [crawlerState]);
  
  // 크롤러 업데이트 구독
  useEffect(() => {
    const unsubscribe = webSocketService.on(WS_EVENT.CRAWLER_UPDATE_PROGRESS, handleCrawlerUpdate);
    
    return () => {
      unsubscribe();
    };
  }, [handleCrawlerUpdate]);
  
  // 크롤러 제어 함수 메모이제이션
  const startCrawler = useCallback((options = {}) => webSocketService.send('start_crawler', options), []);
  const stopCrawler = useCallback(() => webSocketService.send('stop_crawler'), []);
  
  // 반환 객체 메모이제이션
  return useMemo(() => ({
    ...crawlerState,
    startCrawler,
    stopCrawler
  }), [crawlerState, startCrawler, stopCrawler]);
}; 