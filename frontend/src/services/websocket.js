import { getAccessToken, refreshAccessToken } from '../utils/storage/tokenStorage';
import { WS_BASE_URL } from '../config';
import { WEBSOCKET } from '../api/config/endpoints';
import { refreshTokenFn } from '../utils/auth';

// WebSocket 상태 상수
export const WS_STATUS = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3
};

// WebSocket 이벤트 타입
export const WS_EVENT_TYPE = {
    // 시스템 관련
    CONNECTED: "connected",
    CONNECT_ACK: "connect_ack",
    PING: "ping",
    PONG: "pong",
    ERROR: "error",

    // 알림 관련
    NOTIFICATION: "notification",
    NOTIFICATION_READ: "notification_read",
    ALL_NOTIFICATIONS_READ: "all_notifications_read",

    // CVE 관련
    CVE_CREATED: "cve_created",
    CVE_UPDATED: "cve_updated",
    CVE_DELETED: "cve_deleted"
};

// WebSocket 에러 코드
export const WS_ERROR_CODE = {
    NORMAL_CLOSURE: 1000,
    AUTH_FAILED: 4001,
    INVALID_MESSAGE: 4002,
    INTERNAL_ERROR: 4003
};

export const WS_CONNECTION_STATE = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    ERROR: 'error'
};

export class WebSocketService {
    constructor() {
        this.ws = null;
        this._isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.messageHandlers = new Set();
        this.connectionHandlers = new Set();
        this.reconnectTimer = null;
    }

    isConnected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    async sendMessage(message) {
        if (!this.isConnected()) {
            console.warn('[WebSocket] Not connected. Message not sent:', message);
            await this.connect();
            if (!this.isConnected()) return;
        }

        try {
            const messageStr = typeof message === 'string' ? 
                message : JSON.stringify(message);
            this.ws.send(messageStr);
        } catch (error) {
            console.error('[WebSocket] Send error:', error);
        }
    }

    send = async (type, data) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
            const message = {
                type,
                data
            };
            
            try {
                await this.ws.send(JSON.stringify(message));
            } catch (error) {
                console.error('[WebSocket] Error sending message:', error);
                throw error;
            }
        } else {
            console.warn('[WebSocket] Cannot send message - connection not open');
            throw new Error('WebSocket connection not open');
        }
    };

    async subscribeToCVE(cveId) {
        return this.send('subscribe_cve', { cveId });
    }

    async unsubscribeFromCVE(cveId) {
        return this.send('unsubscribe_cve', { cveId });
    }

    connect = async () => {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            console.log('[WebSocket] Already connected or connecting, readyState:', this.ws.readyState);
            this.updateConnectionState(this.ws.readyState === WebSocket.OPEN);
            return;
        }

        try {
            let token = getAccessToken();
            
            if (!token) {
                console.log('[WebSocket] No token found, attempting to refresh');
                token = await refreshAccessToken();
                if (!token) {
                    console.error('[WebSocket] Failed to refresh token');
                    return;
                }
            }

            const wsUrl = `ws://localhost:8000/ws?token=${token}`;
            console.log('[WebSocket] Connecting to:', wsUrl);

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('[WebSocket] Connected successfully');
                this._isConnected = true;
                this.updateConnectionState(true);
            };

            this.ws.onmessage = this.onMessage.bind(this);

            this.ws.onclose = (event) => {
                console.log('[WebSocket] Connection closed:', event);
                this._isConnected = false;
                this.attemptReconnect();
            };

            this.ws.onerror = async (error) => {
                console.error('[WebSocket] Connection error:', error);
                
                if (error.target?.readyState === WebSocket.CLOSED) {
                    console.log('[WebSocket] Attempting to refresh token and reconnect');
                    try {
                        const newToken = await refreshTokenFn();
                        if (newToken) {
                            setTimeout(() => this.connect(), 1000);
                            return;
                        }
                    } catch (error) {
                        console.error('[WebSocket] Token refresh failed:', error);
                    }
                }
                
                this.updateConnectionState(false, error);
            };
        } catch (error) {
            this._isConnected = false;
            console.error('[WebSocket] Connection setup error:', error);
            this.updateConnectionState(false, error);
        }
    };

    updateConnectionState(connected, error = null) {
        this._isConnected = connected;
        this.notifyConnectionState(connected, error);
    }

    notifyConnectionState(connected, error = null) {
        console.log('[WebSocket] Notifying state:', { 
            connected, 
            error,
            readyState: this.ws?.readyState 
        });
        this.connectionHandlers.forEach(handler => handler(connected, error));
    }

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this._isConnected = false;
        this.reconnectAttempts = 0;
        this.messageHandlers.clear();
        this.connectionHandlers.clear();
        this.notifyConnectionState(false);
    }

    attemptReconnect() {
        if (!this._isConnected && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }

    onMessage(event) {
        const message = JSON.parse(event.data);
        this.messageHandlers.forEach(handler => handler(message));
    }

    addHandler(type, handler) {
        const handlers = type === 'message' ? this.messageHandlers : this.connectionHandlers;
        handlers.add(handler);
    }

    removeHandler(type, handler) {
        const handlers = type === 'message' ? this.messageHandlers : this.connectionHandlers;
        handlers.delete(handler);
    }
}

export default WebSocketService; 