// frontend/src/services/websocket.js

import { getAccessToken, refreshAccessToken } from '../utils/storage/tokenStorage';
import { WEBSOCKET } from '../api/config/endpoints';
import { refreshTokenFn } from '../utils/auth';
import { cveService } from '../api/services/cveService';
import { store } from '../store'; // default export가 아닌 named export로 가져오기
import { invalidateCache } from '../store/slices/cveSlice';

// WebSocket 상태 상수
export const WS_STATUS = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

export const WS_EVENT_TYPE = {
  CONNECTED: "connected",
  CONNECT_ACK: "connect_ack",
  PING: "ping",
  PONG: "pong",
  ERROR: "error",
  NOTIFICATION: "notification",
  NOTIFICATION_READ: "notification_read",
  ALL_NOTIFICATIONS_READ: "all_notifications_read",
  CVE_CREATED: "cve_created",
  CVE_UPDATED: "cve_updated",
  CVE_DELETED: "cve_deleted",
  POC_ADDED: "poc_added",
  POC_UPDATED: "poc_updated",
  SNORT_RULE_ADDED: "snort_rule_added",
  REFERENCE_ADDED: "reference_added"
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
    this.cacheInvalidationEnabled = true;
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
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      this.ws.send(messageStr);
    } catch (error) {
      console.error('[WebSocket] Send error:', error);
    }
  }

  send = async (type, data) => {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message = { type, data };
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('[WebSocket] Error sending message:', error);
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

      // WEBSOCKET 엔드포인트를 활용하여 URL 구성
      const wsUrl = WEBSOCKET.CONNECT(token);
      console.log('[WebSocket] Connecting to:', wsUrl);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        this._isConnected = true;
        this.reconnectAttempts = 0;
        this.updateConnectionState(true);
      };

      this.setupMessageHandler();

      this.ws.onclose = (event) => {
        console.log('[WebSocket] Connection closed:', event);
        this._isConnected = false;
        this.attemptReconnect();
      };

      this.ws.onerror = async (error) => {
        console.error('[WebSocket] Connection error:', error);
        if (error.target?.readyState === WebSocket.CLOSED) {
          console.log('[WebSocket] Attempting token refresh and reconnect');
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
    console.log('[WebSocket] Notifying state:', { connected, error, readyState: this.ws?.readyState });
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
    console.log(`[WebSocket] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  addHandler(type, handler) {
    const handlers = type === 'message' ? this.messageHandlers : this.connectionHandlers;
    handlers.add(handler);
  }

  removeHandler(type, handler) {
    const handlers = type === 'message' ? this.messageHandlers : this.connectionHandlers;
    handlers.delete(handler);
  }

  async handleMessage(message) {
    try {
      if (this.cacheInvalidationEnabled) {
        if (message.type === WS_EVENT_TYPE.CVE_UPDATED && message.data?.cveId) {
          cveService.invalidateCache(message.data.cveId);
          
          store.dispatch(invalidateCache(message.data.cveId));
          console.log(`[WebSocket] Invalidated cache for CVE ${message.data.cveId}`);
        }
      }
      
      for (const handler of this.messageHandlers) {
        try {
          await Promise.resolve(handler(message));
        } catch (handlerError) {
          console.error('[WebSocket] Handler error:', handlerError);
        }
      }
    } catch (err) {
      console.error('[WebSocket] Error handling message:', err);
    }
  }

  setupMessageHandler() {
    if (!this.ws) return;
    
    this.ws.onmessage = async (event) => {
      try {
        const rawMessage = event.data;
        console.log('[WebSocket] 메시지 수신 (raw):', rawMessage);
        
        // JSON 파싱
        const message = JSON.parse(rawMessage);
        console.log('[WebSocket] 파싱된 메시지:', message);
        
        // 타입 별 상세 로그 (디버깅용)
        if (message.type === 'crawler_update_progress') {
          console.log(`[WebSocket] 크롤러 업데이트 수신:`, message.data);
          
          // 단계별 처리 로깅 추가
          const stage = message.data.stage || '';
          console.log(`[WebSocket] 크롤러 단계: ${stage}, 진행률: ${message.data.percent}%`);
        }
        
        // 핸들러 호출
        this._callHandlers('message', message);
        
        // 특정 타입의 메시지에 대한 핸들러 호출
        if (message.type) {
          this._callHandlers(message.type, message);
        }
      } catch (error) {
        console.error('[WebSocket] 메시지 처리 오류:', error);
      }
    };
  }

  setCacheInvalidation(enabled) {
    this.cacheInvalidationEnabled = enabled;
  }

  async connectToCrawler() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] 이미 연결되어 있습니다');
      return true;
    }
    
    try {
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
      console.log(`[WebSocket] 크롤러 웹소켓에 연결 시도: ${wsUrl}`);
      
      this.ws = new WebSocket(wsUrl);
      this._setupEventHandlers();
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('웹소켓 연결 시간 초과'));
        }, 5000);
        
        this.ws.onopen = () => {
          clearTimeout(timeout);
          console.log('[WebSocket] 크롤러 웹소켓에 연결됨');
          this._isConnected = true;
          this.notifyConnectionState(true);
          
          // 연결 테스트 메시지 전송
          this.ws.send(JSON.stringify({
            type: "ping",
            data: { timestamp: new Date().toISOString() }
          }));
          
          resolve(true);
        };
        
        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error('[WebSocket] 연결 오류:', error);
          reject(error);
        };
      });
    } catch (error) {
      console.error('[WebSocket] 연결 설정 오류:', error);
      throw error;
    }
  }

  _setupEventHandlers() {
    if (!this.ws) return;
    
    this.ws.onopen = () => {
      console.log('[WebSocket] 연결됨');
      this._isConnected = true;
      this.notifyConnectionState(true);
    };
    
    this.ws.onclose = (event) => {
      console.log(`[WebSocket] 연결 종료: ${event.code} ${event.reason}`);
      this._isConnected = false;
      this.notifyConnectionState(false);
      
      // 재연결 로직
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * this.reconnectAttempts, 5000);
        console.log(`[WebSocket] ${delay}ms 후 재연결 시도...`);
        
        setTimeout(() => {
          this.connectToCrawler().catch(error => {
            console.error('[WebSocket] 재연결 실패:', error);
          });
        }, delay);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('[WebSocket] 오류:', error);
    };
    
    this.setupMessageHandler();
  }

  _callHandlers(eventType, data) {
    const handlers = this.messageHandlers.size > 0 ? this.messageHandlers : this.connectionHandlers;
    console.log(`[WebSocket] ${eventType} 이벤트 핸들러 호출 (${handlers.size}개)`);
    
    // 모든 관련 핸들러 호출
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        console.error(`[WebSocket] 핸들러 실행 오류 (${eventType}):`, error);
      }
    }
  }
}

export default WebSocketService;
