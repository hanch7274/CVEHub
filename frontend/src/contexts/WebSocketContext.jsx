import React, { createContext, useContext, useEffect, useState, useReducer, useMemo, useCallback, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useSnackbar } from 'notistack';
import webSocketService, { WS_EVENT } from '../services/websocket/index';
import {
  wsConnecting,
  wsConnected,
  wsDisconnected,
  setReady
} from '../store/slices/websocketSlice';
import { Button } from '@mui/material';
import { useWebSocketMessage, useCVEWebSocketUpdate, useWebSocketConnection } from '../services/websocket/hooks/WebSocketHooks';

// 상태와 액션을 분리하여 컨텍스트 생성
const WebSocketStateContext = createContext(null);
const WebSocketActionsContext = createContext(null);

// 초기 상태
const initialState = {
  isConnected: false,
  isReady: false,
  connectionStatus: 'disconnected',
  lastActivity: Date.now(),
  error: null,
  notificationKey: null
};

// 리듀서 액션 타입
const WS_CONTEXT_ACTIONS = {
  CONNECTED: 'ws/connected',
  DISCONNECTED: 'ws/disconnected',
  CONNECTING: 'ws/connecting',
  ERROR: 'ws/error',
  SET_READY: 'ws/setReady',
  SET_NOTIFICATION: 'ws/setNotification',
  CLEAR_NOTIFICATION: 'ws/clearNotification'
};

// 웹소켓 상태 리듀서
function webSocketReducer(state, action) {
  switch (action.type) {
    case WS_CONTEXT_ACTIONS.CONNECTED:
      return {
        ...state,
        isConnected: true,
        isReady: true,
        connectionStatus: 'connected',
        lastActivity: Date.now(),
        error: null
      };
    
    case WS_CONTEXT_ACTIONS.DISCONNECTED:
      return {
        ...state,
        isConnected: false,
        isReady: false,
        connectionStatus: 'disconnected',
        lastActivity: Date.now()
      };
    
    case WS_CONTEXT_ACTIONS.CONNECTING:
      return {
        ...state,
        connectionStatus: 'connecting',
        lastActivity: Date.now()
      };
    
    case WS_CONTEXT_ACTIONS.ERROR:
      return {
        ...state,
        connectionStatus: 'error',
        error: action.payload,
        lastActivity: Date.now()
      };
    
    case WS_CONTEXT_ACTIONS.SET_READY:
      return {
        ...state,
        isReady: action.payload
      };
    
    case WS_CONTEXT_ACTIONS.SET_NOTIFICATION:
      return {
        ...state,
        notificationKey: action.payload
      };
    
    case WS_CONTEXT_ACTIONS.CLEAR_NOTIFICATION:
      return {
        ...state,
        notificationKey: null
      };
    
    default:
      return state;
  }
}

/**
 * 웹소켓 컨텍스트 프로바이더 컴포넌트
 * 웹소켓 연결 상태를 관리하고 하위 컴포넌트에 제공합니다.
 */
export const WebSocketProvider = ({ children }) => {
  const [state, dispatch] = useReducer(webSocketReducer, initialState);
  const reduxDispatch = useDispatch();
  const eventSubscriptions = useRef({});
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const notificationRef = useRef(null);
  // isFirstMount ref를 컴포넌트 최상위 레벨로 이동
  const isFirstMount = useRef(true);
  
  // 알림 관리 메모이제이션
  const showNotification = useCallback((message, options = {}) => {
    // 기존 알림이 있으면 닫기
    if (state.notificationKey) {
      closeSnackbar(state.notificationKey);
    }
    
    // 새 알림 표시
    const key = enqueueSnackbar(message, {
      variant: 'warning',
      persist: true,
      ...options
    });
    
    dispatch({ type: WS_CONTEXT_ACTIONS.SET_NOTIFICATION, payload: key });
    return key;
  }, [enqueueSnackbar, closeSnackbar, state.notificationKey]);
  
  const clearNotification = useCallback(() => {
    if (state.notificationKey) {
      closeSnackbar(state.notificationKey);
      dispatch({ type: WS_CONTEXT_ACTIONS.CLEAR_NOTIFICATION });
    }
  }, [closeSnackbar, state.notificationKey]);
  
  // 연결 관리 함수 메모이제이션
  const connect = useCallback(() => {
    if (state.connectionStatus === 'connecting') return;
    
    dispatch({ type: WS_CONTEXT_ACTIONS.CONNECTING });
    reduxDispatch(wsConnecting());
    webSocketService.connect();
  }, [reduxDispatch, state.connectionStatus]);
  
  const reconnect = useCallback(() => {
    dispatch({ type: WS_CONTEXT_ACTIONS.CONNECTING });
    reduxDispatch(wsConnecting());
    webSocketService.reconnect();
  }, [reduxDispatch]);
  
  const disconnect = useCallback(() => {
    webSocketService.disconnect();
  }, []);
  
  // 메시지 전송 함수 메모이제이션
  const sendMessage = useCallback(async (type, data = {}) => {
    if (!state.isConnected) return false;
    
    try {
      return await webSocketService.send(type, data);
    } catch (error) {
      console.error('[웹소켓] 메시지 전송 중 오류:', error);
      return false;
    }
  }, [state.isConnected]);
  
  // 웹소켓 이벤트 구독
  useEffect(() => {
    let connectionTimer = null;
    
    // 구독 설정 함수
    const setupSubscriptions = () => {
      console.log('[WebSocketContext] 이벤트 구독 설정 시작');
      
      // 이전 구독 정리 - 이미 구독된 경우만 정리
      Object.entries(eventSubscriptions.current).forEach(([key, unsub]) => {
        if (typeof unsub === 'function') {
          console.log(`[WebSocketContext] 이전 구독 정리: ${key}`);
          unsub();
          eventSubscriptions.current[key] = null;
        }
      });
      
      // 새 구독 객체 초기화
      eventSubscriptions.current = {};
      
      // 연결 이벤트
      eventSubscriptions.current.connected = webSocketService.on(WS_EVENT.CONNECTED, () => {
        console.log('[WebSocketContext] 연결됨 이벤트 수신');
        dispatch({ type: WS_CONTEXT_ACTIONS.CONNECTED });
        reduxDispatch(wsConnected());
        reduxDispatch(setReady(true));
        clearNotification();
      });
      
      // 연결 확인 이벤트 (connect_ack)
      eventSubscriptions.current.connectAck = webSocketService.on(WS_EVENT.CONNECT_ACK, (data) => {
        console.log('[WebSocketContext] 연결 확인(connect_ack) 이벤트 수신', data);
        
        // 이미 연결 상태인 경우는 무시
        if (state.isConnected && state.isReady) {
          console.log('[WebSocketContext] 이미 연결된 상태, connect_ack 무시');
          return;
        }
        
        // 연결 상태 업데이트
        dispatch({ type: WS_CONTEXT_ACTIONS.CONNECTED });
        reduxDispatch(wsConnected());
        reduxDispatch(setReady(true));
      });
      
      // 연결 끊김 이벤트
      eventSubscriptions.current.disconnected = webSocketService.on(WS_EVENT.DISCONNECTED, (data) => {
        console.log('[WebSocketContext] 연결 끊김 이벤트 수신', data);
        dispatch({ type: WS_CONTEXT_ACTIONS.DISCONNECTED });
        reduxDispatch(wsDisconnected());
        reduxDispatch(setReady(false));
        
        // 사용자가 페이지를 떠난 경우는 알림 표시하지 않음
        if (data?.isUserLeftPage) {
          console.log('[WebSocketContext] 사용자가 페이지를 떠나서 연결이 종료됨, 알림 표시 안함');
          return;
        }
        
        // 재연결 알림
        showNotification('웹소켓 연결이 끊겼습니다. 재연결을 시도합니다...', {
          action: (key) => (
            <Button onClick={() => { 
              reconnect();
              closeSnackbar(key);
            }} color="inherit">
              지금 재연결
            </Button>
          )
        });
      });
      
      // 오류 이벤트
      eventSubscriptions.current.error = webSocketService.on(WS_EVENT.ERROR, (error) => {
        console.log('[WebSocketContext] 오류 이벤트 수신', error);
        dispatch({ 
          type: WS_CONTEXT_ACTIONS.ERROR, 
          payload: error.message || '알 수 없는 오류'
        });
        
        // 오류 알림
        showNotification(`웹소켓 오류: ${error.message || '알 수 없는 오류'}`, {
          variant: 'error',
          autoHideDuration: 5000,
          action: (key) => (
            <Button onClick={() => closeSnackbar(key)} color="inherit">
              닫기
            </Button>
          )
        });
      });
      
      console.log('[WebSocketContext] 이벤트 구독 설정 완료');
    };
    
    const initConnection = () => {
      // 이미 연결 중이거나 연결된 상태면 새로 연결하지 않음
      if (state.isConnected || state.connectionStatus === 'connecting') {
        console.log('[WebSocketContext] 이미 연결되어 있거나 연결 중, 연결 시작 무시');
        return;
      }
      
      console.log('[WebSocketContext] 웹소켓 연결 시작');
      connect();
    };
    
    // 최초 마운트 시에만 구독 설정
    // useRef 호출을 컴포넌트 최상위 레벨로 이동했으므로 여기서는 참조만 함
    if (isFirstMount.current) {
      console.log('[WebSocketContext] 최초 마운트 - 이벤트 구독 설정');
      setupSubscriptions();
      isFirstMount.current = false;
      
      // 초기 연결 시도 - 약간의 지연 추가 (페이지 로드 우선순위)
      console.log('[WebSocketContext] 웹소켓 연결 시작 예약 (250ms 지연)');
      connectionTimer = setTimeout(initConnection, 250); // 250ms 지연으로 페이지 로딩 완료 후 연결 시작
    }
    
    // 컴포넌트 언마운트 시 정리
    return () => {
      // 타이머 정리
      if (connectionTimer) {
        clearTimeout(connectionTimer);
      }
      
      // 구독 해제는 컨텍스트 프로바이더가 완전히 언마운트될 때만 수행
      // 일반적인 페이지 전환에서는 구독을 유지하여 재구독 반복 방지
      if (typeof window !== 'undefined' && window.isUnloading) {
        // 페이지 언로드 시에만 모든 구독 정리
        console.log('[WebSocketContext] 페이지 언로드 - 구독 정리');
        Object.entries(eventSubscriptions.current).forEach(([key, unsub]) => {
          if (typeof unsub === 'function') {
            console.log(`[WebSocketContext] 언마운트 구독 정리: ${key}`);
            unsub();
          }
        });
        eventSubscriptions.current = {};
      }
      
      // 알림 정리
      clearNotification();
    };
  }, [connect, reconnect, clearNotification, showNotification, state.isConnected, state.connectionStatus, state.isReady, reduxDispatch]);

  // 액션 객체 메모이제이션
  const actions = useMemo(() => ({
    connect,
    disconnect,
    reconnect,
    sendMessage
  }), [connect, disconnect, reconnect, sendMessage]);
  
  // 상태 객체 메모이제이션
  const memoizedState = useMemo(() => ({
    isConnected: state.isConnected,
    isReady: state.isReady,
    connectionStatus: state.connectionStatus,
    error: state.error,
    lastActivity: state.lastActivity
  }), [state.isConnected, state.isReady, state.connectionStatus, 
       state.error, state.lastActivity]);
  
  // 페이지 언로드 감지 설정
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 페이지 언로드 플래그 초기화
      window.isUnloading = false;
      
      // 언로드 이벤트 리스너
      const handleBeforeUnload = () => {
        console.log('[WebSocketContext] 페이지 언로드 감지');
        window.isUnloading = true;
        
        // 세션 스토리지에 재연결 시 세션 리셋 플래그 설정
        try {
          sessionStorage.setItem('wsResetOnNextConnect', 'true');
        } catch (error) {
          console.error('[WebSocketContext] 세션 스토리지 설정 실패:', error);
        }
        
        // 연결 강제 종료 (페이지 언로드 플래그 포함)
        if (webSocketService.isConnected) {
          webSocketService.disconnect({ isUserLeftPage: true });
        }
      };
      
      // 이벤트 리스너 등록
      window.addEventListener('beforeunload', handleBeforeUnload);
      
      // 정리 함수
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, []);
  
  return (
    <WebSocketStateContext.Provider value={memoizedState}>
      <WebSocketActionsContext.Provider value={actions}>
        {children}
      </WebSocketActionsContext.Provider>
    </WebSocketStateContext.Provider>
  );
};

// 웹소켓 상태 훅 (상태만 필요한 컴포넌트용)
export const useWebSocketState = () => {
  const context = useContext(WebSocketStateContext);
  if (context === undefined) {
    throw new Error('useWebSocketState must be used within a WebSocketProvider');
  }
  return context;
};

// 웹소켓 액션 훅 (액션만 필요한 컴포넌트용)
export const useWebSocketActions = () => {
  const context = useContext(WebSocketActionsContext);
  if (context === undefined) {
    throw new Error('useWebSocketActions must be used within a WebSocketProvider');
  }
  return context;
};

// 웹소켓 컨텍스트 통합 훅 (이전 인터페이스와의 호환성 유지)
export const useWebSocketContext = () => {
  return {
    ...useWebSocketState(),
    ...useWebSocketActions()
  };
};

// 분리된 훅 재내보내기 - 다른 컴포넌트에서 쉽게 접근할 수 있도록
export { useWebSocketMessage, useCVEWebSocketUpdate };