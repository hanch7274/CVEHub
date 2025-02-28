// frontend/src/services/websocket.js

import { getAccessToken, refreshAccessToken } from '../utils/storage/tokenStorage';
import { WEBSOCKET } from '../api/config/endpoints';
import { refreshTokenFn } from '../utils/auth';
import { cveService } from '../api/services/cveService';
import { store } from '../store';
import { invalidateCache } from '../store/slices/cveSlice';
import { 
  wsConnected,
  wsDisconnected,
  wsError,
  wsMessageReceived
} from '../store/slices/websocketSlice';
import { snakeToCamel } from '../utils/caseConverter';
import axios from 'axios';

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
  REFERENCE_ADDED: "reference_added",
  SUBSCRIBE_CVE: "subscribe_cve",
  UNSUBSCRIBE_CVE: "unsubscribe_cve"
};

export const WS_STATE = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

export class WebSocketService {
  constructor() {
    // WebSocket 상태
    this.ws = null;
    this.sessionId = this._generateSessionId();
    this.connectionState = WS_STATE.DISCONNECTED;
    this.isReady = false;
    this.lastMessageTime = 0;
    this.reconnectAttempts = 0;
    this.reAuthAttempts = 0;
    this.pingInterval = null;
    this.reconnectTimeout = null;
    this.maxReconnectAttempts = 10; // 최대 재연결 시도 횟수 설정
    
    // 메시지 핸들러
    this.messageHandlers = new Set();
    this.connectionHandlers = new Set();
    
    // 캐시 무효화 기능 활성화 여부
    this.cacheInvalidationEnabled = true;
    // 구독 중인 CVE ID를 추적
    this.activeSubscriptions = new Set();
    // 마지막 구독 시간 추적 (throttling 목적)
    this.lastSubscriptionTimes = {};
    
    // 중복 요청 추적용 세트
    this.pendingSubscriptions = new Set();
    this.pendingUnsubscriptions = new Set();
    
    // 로깅 활성화 여부
    this.debug = process.env.NODE_ENV === 'development';
    
    // 초기 설정
    this._fetchSession();
  }
  
  // 고유한 세션 ID 생성
  _generateSessionId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  
  // 세션 ID 저장
  _saveSessionId() {
    try {
      sessionStorage.setItem('cvehub_ws_session_id', this.sessionId);
    } catch (error) {
      console.error('[WebSocket] 세션 ID 저장 실패:', error);
    }
  }
  
  // 이전 세션의 비정상 종료 확인
  _checkPreviousSession() {
    try {
      const prevSessionId = sessionStorage.getItem('cvehub_ws_session_id');
      const isNewSession = prevSessionId !== this.sessionId;
      
      if (isNewSession && prevSessionId) {
        console.log('[WebSocket] 이전 세션의 비정상 종료 감지:', prevSessionId);
        
        // 서버에 현재 활성 구독 목록 요청 및 정리
        this._cleanupOrphanedSubscriptions();
      }
    } catch (error) {
      console.error('[WebSocket] 이전 세션 확인 오류:', error);
    }
  }
  
  // 서버에서 고아가 된 구독 정리 요청
  async _cleanupOrphanedSubscriptions() {
    try {
      const userId = store.getState().auth?.user?.id;
      if (!userId) {
        console.warn('[WebSocket] 사용자 ID를 찾을 수 없어 고아 구독 정리를 건너뜁니다.');
        return;
      }
      
      console.log('[WebSocket] 서버에 고아 구독 정리 요청');
      
      // 새로 추가한 백엔드 API 엔드포인트 호출
      const response = await axios.post('/api/websocket/cleanup-orphaned-subscriptions', {
        session_id: this.sessionId,
        user_id: userId
      });
      
      if (response.data?.status === 'success') {
        console.log('[WebSocket] 고아 구독 정리 성공:', response.data);
      } else {
        console.warn('[WebSocket] 고아 구독 정리 응답이 성공이 아님:', response.data);
      }
    } catch (error) {
      console.error('[WebSocket] 고아 구독 정리 요청 실패:', error);
    }
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

  _validateAndNormalizeMessage(type, data) {
    const validatedData = { ...data };
    
    // CVE 업데이트 관련 메시지인 경우 필드 이름 검증
    if (type === WS_EVENT_TYPE.CVE_UPDATED) {
      // 필드 이름이 없으면 적절한 기본값 할당
      if (!validatedData.field) {
        console.warn('[WebSocket] 메시지에 field 속성이 없습니다. 기본값 "general"로 설정합니다.');
        validatedData.field = 'general';
      }
      
      // 필드 이름이 카멜케이스로 되어 있으면 스네이크 케이스로 변환
      if (validatedData.field === 'snortRules') {
        console.info('[WebSocket] 필드명을 카멜케이스에서 스네이크 케이스로 변환: snortRules -> snort_rules');
        validatedData.field = 'snort_rules';
      }
      
      // cveId 필드 확인
      if (!validatedData.cveId) {
        console.error('[WebSocket] 메시지에 cveId가 없습니다!', validatedData);
      }
    }
    
    return validatedData;
  }

  async send(type, data = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        // 데이터 검증 및 정규화
        const normalizedData = this._validateAndNormalizeMessage(type, data);
        
        const message = {
          type,
          data: normalizedData,
          timestamp: new Date().toISOString()
        };
        
        console.log(`[WebSocket] 메시지 전송: ${type}`, normalizedData);
        this.ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('[WebSocket] 메시지 전송 중 오류:', error);
        this._dispatchEvent('error', new Error(`메시지 전송 실패: ${error.message}`));
        return false;
      }
    } else {
      console.warn('[WebSocket] 연결되지 않은 상태에서 메시지 전송 시도');
      this._dispatchEvent('error', new Error('웹소켓이 연결되지 않았습니다.'));
      return false;
    }
  }

  // 구독 관리 기능
  async subscribeToCVE(cveId) {
    if (!cveId) {
      console.error('[WebSocket] CVE ID가 제공되지 않아 구독할 수 없습니다.');
      return false;
    }

    // 이미 구독 중인지 확인
    if (this.activeSubscriptions.has(cveId)) {
      console.log(`[WebSocket] 이미 구독 중인 CVE입니다: ${cveId}`);
      return true;
    }

    // 진행 중인 구독 요청이 있는지 확인
    if (this.pendingSubscriptions.has(cveId)) {
      console.log(`[WebSocket] ${cveId}에 대한 구독 요청이 이미 진행 중입니다.`);
      return false;
    }

    // 진행 중인 구독 요청 목록에 추가
    this.pendingSubscriptions.add(cveId);

    try {
      // 인증 상태 확인
      const userId = store.getState().auth?.user?.id;
      if (!userId) {
        console.error('[WebSocket] 사용자가 인증되지 않아 CVE를 구독할 수 없습니다.');
        this.pendingSubscriptions.delete(cveId);
        return false;
      }

      // 연결 상태 확인
      if (!this.isReady) {
        console.error('[WebSocket] WebSocket이 연결되지 않아 CVE를 구독할 수 없습니다.');
        this.pendingSubscriptions.delete(cveId);
        return false;
      }

      // 구독 메시지 전송
      await this.send(WS_EVENT_TYPE.SUBSCRIBE_CVE, {
        cveId: cveId,
        userId: userId,
        sessionId: this.sessionId
      });

      // 구독 목록에 추가 (성공 가정)
      this.activeSubscriptions.add(cveId);
      console.log(`[WebSocket] CVE 구독 성공: ${cveId}`);
      
      // 진행 중인 구독 요청 목록에서 제거
      this.pendingSubscriptions.delete(cveId);
      return true;
    } catch (error) {
      console.error(`[WebSocket] CVE 구독 실패: ${cveId}`, error);
      // 진행 중인 구독 요청 목록에서 제거
      this.pendingSubscriptions.delete(cveId);
      return false;
    }
  }

  async unsubscribeFromCVE(cveId) {
    if (!cveId) {
      console.error('[WebSocket] CVE ID가 제공되지 않아 구독 해제할 수 없습니다.');
      return false;
    }

    // 구독 중이 아니라면 무시
    if (!this.activeSubscriptions.has(cveId)) {
      console.log(`[WebSocket] 구독 중이지 않은 CVE를 구독 해제하려고 합니다: ${cveId}`);
      return true; // 이미 구독 해제된 상태로 간주
    }

    // 진행 중인 구독 해제 요청이 있는지 확인
    if (this.pendingUnsubscriptions.has(cveId)) {
      console.log(`[WebSocket] ${cveId}에 대한 구독 해제 요청이 이미 진행 중입니다.`);
      return false;
    }

    // 진행 중인 구독 해제 요청 목록에 추가
    this.pendingUnsubscriptions.add(cveId);

    try {
      // 인증 상태 확인
      const userId = store.getState().auth?.user?.id;
      if (!userId) {
        console.error('[WebSocket] 사용자가 인증되지 않아 CVE 구독을 해제할 수 없습니다.');
        this.pendingUnsubscriptions.delete(cveId);
        return false;
      }

      // 연결 상태 확인
      if (!this.isReady) {
        console.error('[WebSocket] WebSocket이 연결되지 않아 CVE 구독을 해제할 수 없습니다.');
        // 연결이 없어도 로컬 상태는 업데이트
        this.activeSubscriptions.delete(cveId);
        this.pendingUnsubscriptions.delete(cveId);
        return true;
      }

      // 구독 해제 메시지 전송
      await this.send(WS_EVENT_TYPE.UNSUBSCRIBE_CVE, {
        cveId: cveId,
        userId: userId,
        sessionId: this.sessionId
      });

      // 구독 목록에서 제거 (성공 가정)
      this.activeSubscriptions.delete(cveId);
      console.log(`[WebSocket] CVE 구독 해제 성공: ${cveId}`);
      
      // 진행 중인 구독 해제 요청 목록에서 제거
      this.pendingUnsubscriptions.delete(cveId);
      return true;
    } catch (error) {
      console.error(`[WebSocket] CVE 구독 해제 실패: ${cveId}`, error);
      // 진행 중인 구독 해제 요청 목록에서 제거
      this.pendingUnsubscriptions.delete(cveId);
      return false;
    }
  }

  // 모든 활성 구독 해제 (비상 처리용)
  async unsubscribeAll() {
    if (this.activeSubscriptions.size === 0) {
      console.log('[WebSocket] 활성 구독 없음, 일괄 해제 불필요');
      return true;
    }
    
    console.log(`[WebSocket] 모든 구독 해제 시작 (${this.activeSubscriptions.size}개)`);
    
    try {
      // sendBeacon API로 일괄 해제 요청 (페이지 언로드 중에도 작동)
      if (navigator.sendBeacon) {
        const message = JSON.stringify({
          type: 'unsubscribe_all',
          data: {
            sessionId: this.sessionId,
            userId: store.getState().auth?.user?.id,
            cveIds: [...this.activeSubscriptions]
          },
          timestamp: new Date().toISOString()
        });
        
        const apiUrl = `${window.location.origin}/api/websocket/unsubscribe-all`;
        const result = navigator.sendBeacon(apiUrl, message);
        
        if (result) {
          console.log('[WebSocket] 모든 구독 해제 요청 성공');
          this.activeSubscriptions.clear();
          return true;
        } else {
          console.warn('[WebSocket] SendBeacon 요청 실패, 개별 해제 시도');
        }
      }
      
      // SendBeacon 실패 시 개별 해제 시도
      const cveIds = [...this.activeSubscriptions];
      let success = true;
      
      for (const cveId of cveIds) {
        const result = await this.unsubscribeFromCVE(cveId);
        if (!result) success = false;
      }
      
      return success;
    } catch (error) {
      console.error('[WebSocket] 모든 구독 해제 실패:', error);
      return false;
    }
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
        this.isReady = true;
        this.reconnectAttempts = 0;
        this.updateConnectionState(true);
        
        // Redux 상태 업데이트
        store.dispatch(wsConnected());
      };

      this.setupMessageHandler();

      this.ws.onclose = (event) => {
        console.log('[WebSocket] Connection closed:', event);
        this._isConnected = false;
        this.isReady = false;
        this.updateConnectionState(false);
        
        // Redux 상태 업데이트
        store.dispatch(wsDisconnected());
        
        this.attemptReconnect();
      };

      this.ws.onerror = async (error) => {
        console.error('[WebSocket] Connection error:', error);
        
        // Redux 상태 업데이트
        store.dispatch(wsError(error?.message || '웹소켓 연결 오류'));
        
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
      this.isReady = false;
      console.error('[WebSocket] Connection setup error:', error);
      this.updateConnectionState(false, error);
      
      // Redux 상태 업데이트
      store.dispatch(wsError(error?.message || '웹소켓 설정 오류'));
    }
  };

  updateConnectionState(connected, error = null) {
    this._isConnected = connected;
    this.isReady = connected; // isReady 상태도 함께 업데이트
    this.notifyConnectionState(connected, error);
  }

  notifyConnectionState(connected, error = null) {
    console.log('[WebSocket] Notifying state:', { connected, error, readyState: this.ws?.readyState });
    this.connectionHandlers.forEach(handler => handler(connected, error));
  }

  disconnect() {
    // 연결 종료 전 모든 구독 해제 시도
    this.unsubscribeAll().catch(error => {
      console.error('[WebSocket] 연결 종료 전 구독 해제 실패:', error);
    });
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
    this.isReady = false;
    this.reconnectAttempts = 0;
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
    if (typeof handler !== 'function') {
      console.error('[WebSocket] 유효하지 않은 핸들러가 등록되었습니다:', handler);
      return;
    }
    
    const handlers = type === 'message' ? this.messageHandlers : this.connectionHandlers;
    
    // 이미 등록된 핸들러인지 확인하여 중복 등록 방지
    if (handlers.has(handler)) {
      console.log(`[WebSocket] 이미 등록된 ${type} 핸들러입니다. 중복 등록 무시.`);
      return;
    }
    
    handlers.add(handler);
    console.log(`[WebSocket] ${type} 핸들러 등록됨. 현재 등록된 핸들러: ${handlers.size}개`);
  }

  removeHandler(type, handler) {
    if (typeof handler !== 'function') {
      console.error('[WebSocket] 유효하지 않은 핸들러가 제거 요청되었습니다:', handler);
      return;
    }
    
    const handlers = type === 'message' ? this.messageHandlers : this.connectionHandlers;
    
    // 핸들러가 존재하는지 확인
    if (!handlers.has(handler)) {
      console.log(`[WebSocket] 존재하지 않는 ${type} 핸들러를 제거하려고 시도했습니다.`);
      return;
    }
    
    const removed = handlers.delete(handler);
    console.log(`[WebSocket] ${type} 핸들러 ${removed ? '제거됨' : '제거 실패'}. 현재 등록된 핸들러: ${handlers.size}개`);
  }

  // 모든 핸들러 제거
  clearHandlers(type) {
    const handlers = type === 'message' ? this.messageHandlers : this.connectionHandlers;
    const size = handlers.size;
    handlers.clear();
    console.log(`[WebSocket] 모든 ${type} 핸들러 제거됨. 제거된 핸들러: ${size}개`);
  }

  // 이벤트 분배 - 성능 및 오류 처리 개선
  _dispatchEvent(eventType, data) {
    try {
      if (eventType === 'message') {
        // 메시지 핸들러 배열로 변환하여 실행 중 핸들러 등록/제거로 인한 문제 방지
        const handlersArray = Array.from(this.messageHandlers);
        
        for (const handler of handlersArray) {
          try {
            handler(data);
          } catch (error) {
            console.error(`[WebSocket] 메시지 핸들러 실행 중 오류:`, error);
          }
        }
      } else if (eventType === 'connection') {
        // 연결 핸들러 배열로 변환하여 실행 중 핸들러 등록/제거로 인한 문제 방지
        const handlersArray = Array.from(this.connectionHandlers);
        
        for (const handler of handlersArray) {
          try {
            handler(data.connected, data.error);
          } catch (error) {
            console.error(`[WebSocket] 연결 핸들러 실행 중 오류:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`[WebSocket] 이벤트 분배 중 예상치 못한 오류:`, error);
    }
  }

  async handleMessage(message) {
    try {
      // 로그 출력 개선
      const messageType = message.type || '알 수 없음';
      console.log(`[WebSocket] 메시지 수신: 타입=${messageType}`, 
        message.data ? `데이터=${JSON.stringify(message.data).substring(0, 100)}...` : '');
      
      // CVE 업데이트 처리 강화
      if (this.cacheInvalidationEnabled) {
        if (message.type === WS_EVENT_TYPE.CVE_UPDATED && message.data?.cveId) {
          // 캐시 무효화
          cveService.invalidateCache(message.data.cveId);
          store.dispatch(invalidateCache(message.data.cveId));
          console.log(`[WebSocket] ${message.data.cveId} 캐시 무효화됨`);
          
          // Redux 상태 직접 업데이트
          store.dispatch({
            type: 'cve/updateCVEFromWebSocket',
            payload: {
              cveId: message.data.cveId,
              data: message.data.cve,
              field: message.data.field,
              value: message.data.value
            }
          });
        } else if (message.type === WS_EVENT_TYPE.CVE_CREATED && message.data?.cve) {
          // 새 CVE 생성 처리
          store.dispatch({
            type: 'cve/addCVEFromWebSocket',
            payload: message.data.cve
          });
        } else if (message.type === WS_EVENT_TYPE.CVE_DELETED && message.data?.cveId) {
          // CVE 삭제 처리
          store.dispatch({
            type: 'cve/deleteCVEFromWebSocket',
            payload: message.data.cveId
          });
        }
      }
      
      // Redux 상태 업데이트
      store.dispatch(wsMessageReceived(message));
      
      // 모든 메시지 핸들러 호출
      for (const handler of this.messageHandlers) {
        try {
          await Promise.resolve(handler(message));
        } catch (handlerError) {
          console.error('[WebSocket] 핸들러 실행 오류:', handlerError);
        }
      }
    } catch (err) {
      console.error('[WebSocket] 메시지 처리 오류:', err);
    }
  }

  setupMessageHandler() {
    if (!this.ws) return;
    
    this.ws.onmessage = async (event) => {
      try {
        const rawMessage = event.data;
        
        // JSON 파싱
        const parsedMessage = JSON.parse(rawMessage);
        
        // 스네이크 케이스를 카멜 케이스로 변환
        const message = parsedMessage;
        if (message.data) {
          message.data = snakeToCamel(message.data);
        }
        
        // 특별히 상세한 로깅이 필요한 메시지 타입
        if (message.type === 'crawler_update_progress') {
          console.log(`[WebSocket] 크롤러 업데이트: 단계=${message.data.stage || '알 수 없음'}, 진행률=${message.data.percent}%`);
        } else if (message.type === 'subscribe_cve' || message.type === 'unsubscribe_cve') {
          console.log(`[WebSocket] 구독 이벤트: 타입=${message.type}, CVE=${message.data?.cveId}, 구독자=${message.data?.subscribers?.length || 0}명`);
        }
        
        // 핸들러 메서드 호출
        await this.handleMessage(message);
      } catch (error) {
        console.error('[WebSocket] 메시지 처리 오류:', error);
      }
    };
  }

  setCacheInvalidation(enabled) {
    this.cacheInvalidationEnabled = enabled;
    console.log(`[WebSocket] 캐시 무효화 ${enabled ? '활성화' : '비활성화'}`);
  }

  // 세션 ID 가져오기 혹은 새로 생성
  getOrCreateSessionId() {
    if (!this.sessionId) {
      this.sessionId = this._generateSessionId();
    }
    return this.sessionId;
  }
  
  // 세션 ID 가져오기
  getSessionId() {
    return this.sessionId || this._generateSessionId();
  }
  
  // 세션 정보 불러오기
  _fetchSession() {
    // 세션 ID 생성 (브라우저 인스턴스 식별용)
    if (!this.sessionId) {
      this.sessionId = this._generateSessionId();
    }
    
    // 세션 스토리지에 세션 ID 저장
    this._saveSessionId();
    
    // 페이지 로드 시 이전 세션의 비정상 종료 확인
    if (typeof window !== 'undefined') {
      this._checkPreviousSession();
    }
  }
}

// 단일 인스턴스 생성
const webSocketInstance = new WebSocketService();

// beforeunload 이벤트에서 모든 구독 해제 시도
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    console.log('[WebSocket] 페이지 언로드 감지, 모든 구독 해제 시도');
    webSocketInstance.unsubscribeAll();
  });
}

export default webSocketInstance;
