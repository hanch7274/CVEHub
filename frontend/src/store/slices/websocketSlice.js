import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    connected: false,
    error: null,
    lastMessage: null,
    reconnectAttempts: 0,
    connectionStatus: 'disconnected' // 'disconnected' | 'connecting' | 'connected' | 'error'
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
        },
        wsDisconnected: (state) => {
            state.connected = false;
            state.connectionStatus = 'disconnected';
            state.reconnectAttempts += 1;
        },
        wsError: (state, action) => {
            state.connected = false;
            state.connectionStatus = 'error';
            state.error = action.payload;
        },
        wsMessageReceived: (state, action) => {
            state.lastMessage = action.payload;
        },
        clearError: (state) => {
            state.error = null;
        },
        resetReconnectAttempts: (state) => {
            state.reconnectAttempts = 0;
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
    resetReconnectAttempts
} = websocketSlice.actions;

// 선택자
export const selectWebSocketConnected = state => state.websocket.connected;
export const selectWebSocketError = state => state.websocket.error;
export const selectWebSocketStatus = state => state.websocket.connectionStatus;
export const selectLastMessage = state => state.websocket.lastMessage;
export const selectReconnectAttempts = state => state.websocket.reconnectAttempts;

export default websocketSlice.reducer; 