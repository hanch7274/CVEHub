import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    connected: false,
    error: null,
    lastMessage: null,
    reconnectAttempts: 0,
    connectionStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'error'
    ready: false, // 웹소켓이 메시지 전송 준비가 되었는지 여부
    activeSubscriptions: [] // 현재 활성화된 구독 목록
};

const websocketSlice = createSlice({
    name: 'websocket',
    initialState,
    reducers: {
        wsConnecting: (state) => {
            state.connectionStatus = 'connecting';
            state.error = null;
        },
        wsConnected: (state) => {
            state.connected = true;
            state.connectionStatus = 'connected';
            state.error = null;
            state.reconnectAttempts = 0;
            state.ready = true;
        },
        wsDisconnected: (state) => {
            state.connected = false;
            state.connectionStatus = 'disconnected';
            state.reconnectAttempts += 1;
            state.ready = false;
        },
        wsError: (state, action) => {
            state.connected = false;
            state.connectionStatus = 'error';
            state.error = action.payload;
            state.ready = false;
        },
        wsMessageReceived: (state, action) => {
            state.lastMessage = action.payload;
            
            // 구독 관련 메시지 처리
            if (action.payload.type === 'subscribe_cve' && action.payload.data?.cveId) {
                if (!state.activeSubscriptions.includes(action.payload.data.cveId)) {
                    state.activeSubscriptions.push(action.payload.data.cveId);
                }
            } else if (action.payload.type === 'unsubscribe_cve' && action.payload.data?.cveId) {
                state.activeSubscriptions = state.activeSubscriptions.filter(
                    id => id !== action.payload.data.cveId
                );
            }
        },
        clearError: (state) => {
            state.error = null;
        },
        resetReconnectAttempts: (state) => {
            state.reconnectAttempts = 0;
        },
        setReady: (state, action) => {
            state.ready = action.payload;
        },
        clearSubscriptions: (state) => {
            state.activeSubscriptions = [];
        },
        addSubscription: (state, action) => {
            if (!state.activeSubscriptions.includes(action.payload)) {
                state.activeSubscriptions.push(action.payload);
            }
        },
        removeSubscription: (state, action) => {
            state.activeSubscriptions = state.activeSubscriptions.filter(
                id => id !== action.payload
            );
        }
    }
});

export const {
    wsConnecting,
    wsConnected,
    wsDisconnected,
    wsError,
    wsMessageReceived,
    clearError,
    resetReconnectAttempts,
    setReady,
    clearSubscriptions,
    addSubscription,
    removeSubscription
} = websocketSlice.actions;

// 선택자
export const selectWebSocketConnected = state => state.websocket.connected;
export const selectWebSocketError = state => state.websocket.error;
export const selectWebSocketStatus = state => state.websocket.connectionStatus;
export const selectLastMessage = state => state.websocket.lastMessage;
export const selectReconnectAttempts = state => state.websocket.reconnectAttempts;
export const selectWebSocketReady = state => state.websocket.ready;
export const selectActiveSubscriptions = state => state.websocket.activeSubscriptions;

// 특정 CVE ID의 구독 상태 확인 선택자
export const selectIsSubscribed = (state, cveId) => 
    state.websocket.activeSubscriptions.includes(cveId);

export default websocketSlice.reducer; 