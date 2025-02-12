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
    // 연결 관련
    CONNECTED: "connected",
    CONNECT_ACK: "connect_ack",
    PING: "ping",
    PONG: "pong",
    ERROR: "error",

    // 알림 관련
    NOTIFICATION: "notification",
    NOTIFICATION_READ: 'notification_read',
    ALL_NOTIFICATIONS_READ: 'all_notifications_read',

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
        this._isConnected = false;  // private 상태
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.messageHandlers = new Set();
        this.connectionHandlers = new Set();
        this.pingInterval = null;
        this.reconnectTimer = null;
    }

    // 연결 상태 확인 (단일 메서드)
    isConnected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    // 메시지 전송 통합
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
                data  // data 객체를 직접 전달
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

    // 구독 전용 메서드도 type, data 분리 방식으로 수정
    async subscribeToCVE(cveId) {
        return this.send('subscribe_cve', { cveId });
    }

    async unsubscribeFromCVE(cveId) {
        return this.send('unsubscribe_cve', { cveId });
    }

    startPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        this.pingInterval = setInterval(async () => {
            if (this.isConnected()) {
                //console.log('[WebSocket] Sending ping');
                await this.send('ping', {});
            }
        }, 30000);
    }

    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
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
        // ping/pong이 아닌 경우에만 디버깅
        if (!['ping', 'pong'].includes(message.type)) {
            this.messageHandlers.forEach(handler => handler(message));
        }
    }

    // 메시지 핸들러 관리 - 통합된 메서드만 유지
    addHandler(type, handler) {
        const handlers = type === 'message' ? this.messageHandlers : this.connectionHandlers;
        handlers.add(handler);
    }

    removeHandler(type, handler) {
        const handlers = type === 'message' ? this.messageHandlers : this.connectionHandlers;
        handlers.delete(handler);
    }

    // 중복 제거: onmessage 핸들러와 handleMessage 메서드 통합
    async connect() {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            console.log('[WebSocket] Already connected or connecting, readyState:', this.ws.readyState);
            this.updateConnectionState(this.ws.readyState === WebSocket.OPEN);
            return;
        }

        try {
            let token = getAccessToken();
            
            // 토큰이 없거나 만료된 경우 갱신 시도
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
                this.stopPingInterval();  // 연결 종료 시 ping 중지
                this.attemptReconnect();
            };

            this.ws.onerror = async (error) => {
                console.error('[WebSocket] Connection error:', error);
                
                // 403 에러(토큰 만료)인 경우 토큰 갱신 시도
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
    }

    // 연결 상태 변경 시 일관된 처리
    updateConnectionState(connected, error = null) {
        this._isConnected = connected;
        this.notifyConnectionState(connected, error);
        
        if (connected) {
            this.startPingInterval();
        } else {
            this.stopPingInterval();
        }
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
        this.stopPingInterval();
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
}

export default WebSocketService; 