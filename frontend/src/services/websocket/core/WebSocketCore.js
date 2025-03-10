import { getAccessToken } from '../../../utils/storage/tokenStorage';
import { WEBSOCKET } from '../../../api/config/endpoints';
import eventSystem from '../eventSystem';
import { snakeToCamel } from '../../../utils/caseConverter';
import { WS_EVENT, WS_STATE, WS_CONFIG } from '../utils/configUtils';
import logger from '../utils/loggingService';

/**
 * WebSocket 코어 클래스
 * 웹소켓 연결 관리, 메시지 송수신, 이벤트 처리를 통합적으로 관리
 */
class WebSocketCore {
  constructor() {
    // 싱글톤 인스턴스 설정
    if (WebSocketCore.instance) {
      return WebSocketCore.instance;
    }
    WebSocketCore.instance = this;

    // 웹소켓 연결 관련 상태
    this.ws = null;
    this.state = WS_STATE.DISCONNECTED;
    this._isReady = false; // isReady 상태를 내부 변수로 관리
    this.lastMessageTime = Date.now();
    
    // 재연결 관련 설정
    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;
    this.autoReconnect = WS_CONFIG.AUTO_RECONNECT !== false;
    this.maxReconnectAttempts = WS_CONFIG.MAX_RECONNECT_ATTEMPTS || 10;
    
    // 메시지 처리 관련
    this.handlers = new Map(); // 메시지 타입별 핸들러
    this._connectAckProcessed = false;
    this._lastProcessedMessages = new Map(); // 메시지 타입별 마지막 처리 시간
    this._connectionAttemptTime = 0;
    this._isConnecting = false;
    
    // 타이머 관리
    this._timers = {
      connectionTimeout: null,
      connectionCheck: null,
      ping: null
    };
    
    // 이벤트 시스템 참조
    this.eventSystem = eventSystem;
    
    // 페이지 언로드 시 처리
    this._setupUnloadListener();
    
    // 초기 설정 로깅
    logger.debug('WebSocketCore', '인스턴스 생성됨', {
      autoReconnect: this.autoReconnect,
      maxReconnectAttempts: this.maxReconnectAttempts
    });
  }

  /**
   * 연결 상태 확인
   * @returns {boolean} 연결 여부
   */
  checkConnectionState() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
  
  /**
   * @deprecated isConnected() 대신 checkConnectionState() 사용
   */
  checkConnection() {
    return this.checkConnectionState();
  }
  
  /**
   * 준비 상태 확인 (호환성 유지용)
   * @returns {boolean} 준비 상태 여부
   */
  isReady() {
    return this._isReady;
  }
  
  /**
   * 연결 및 준비 상태를 포함한 전체 상태 객체 반환
   * 외부에서 상태 접근 시 이 메서드 사용 권장
   */
  getConnectionState() {
    return {
      isConnected: this.checkConnectionState(),
      isReady: this._isReady,
      state: this.state,
      reconnectAttempts: this.reconnectAttempts,
      lastMessageTime: this.lastMessageTime
    };
  }
  
  /**
   * 연결 상태 getter (속성)
   */
  get isConnected() {
    return this.checkConnectionState();
  }
  
  /**
   * 연결 상태 setter (속성) - 직접 설정 방지
   */
  set isConnected(value) {
    // 직접 설정 방지 (무시됨)
    logger.warn('WebSocketCore', 'isConnected 속성은 직접 설정할 수 없음');
  }
  
  /**
   * Ready 상태 getter (호환성 유지용)
   */
  get isReady() {
    return this._isReady;
  }
  
  /**
   * Ready 상태 setter (내부용)
   */
  set isReady(value) {
    const oldValue = this._isReady;
    this._isReady = !!value;
    
    // 상태 변경 시 이벤트 발생
    if (oldValue !== this._isReady) {
      this._emitStateChanged();
    }
  }
  
  /**
   * 상태 변경 이벤트 발생
   * @private
   */
  _emitStateChanged() {
    this._emitEvent('stateChanged', this.getConnectionState());
  }
  
  /**
   * WebSocket 연결 시작
   * @returns {Promise<boolean>} 연결 성공 여부
   */
  async connect() {
    // 이미 연결되었거나 연결 중인 경우
    if (this.checkConnection()) {
      this._log('이미 연결되어 있음, 새 연결 시도 건너뜀');
      return true;
    }
    
    if (this._isConnecting) {
      this._log('이미 연결 중, 중복 연결 시도 건너뜀');
      return true;
    }
    
    // 기존 연결이 있으면 정리
    if (this.ws) {
      this._log('새 연결 시도 전 기존 연결 정리');
      try {
        await this.disconnect(true);
      } catch (error) {
        this._log('기존 연결 정리 중 오류 (무시됨)', error);
      }
    }
    
    // 연결 초기화
    this._isConnecting = true;
    this._connectionAttemptTime = Date.now();
    this._cleanup();
    
    try {
      // 인증 토큰 및 URL 확인
      const token = getAccessToken();
      if (!token) {
        logger.error('WebSocketCore', '인증 토큰 없음');
        this._isConnecting = false;
        return false;
      }
      
      const wsUrl = WEBSOCKET.getWebSocketURL(token);
      if (!wsUrl) {
        logger.error('WebSocketCore', 'WebSocket URL 생성 실패');
        this._isConnecting = false;
        return false;
      }
      
      // 이전의 연결 상태 이벤트 발생
      this._emitEvent('stateChanged', { 
        state: WS_STATE.CONNECTING,
        isConnecting: true,
        timestamp: Date.now()
      });
      
      // 연결 생성
      this.ws = new WebSocket(wsUrl);
      this._setupHandlers();
      this._setupConnectionTimeout();
      
      return true;
    } catch (error) {
      console.error('[웹소켓] 연결 중 오류:', error);
      this._handleError(error);
      this._isConnecting = false;
      return false;
    }
  }
  
  /**
   * WebSocket 연결 종료
   * @param {boolean} cleanDisconnect 정상 종료 여부
   * @returns {boolean} 종료 성공 여부
   */
  disconnect(cleanDisconnect = true) {
    if (!this.ws) return true;
    
    try {
      // 연결 상태 업데이트
      this.state = WS_STATE.DISCONNECTED;
      
      // 재연결 중지
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      // 정상 종료 처리
      if (cleanDisconnect && this.checkConnection()) {
        this.ws.close(1000, 'Normal closure');
      }
      
      // 리소스 정리
      this._cleanup();
      
      // 이벤트 발생
      this._emitEvent(WS_EVENT.DISCONNECTED, { timestamp: Date.now() });
      
      return true;
    } catch (error) {
      console.error('[웹소켓] 연결 종료 중 오류:', error);
      return false;
    }
  }
  
  /**
   * 재연결 시도
   * @returns {boolean} 재연결 시도 성공 여부
   */
  reconnect() {
    // 이미 연결된 경우
    if (this.checkConnection()) return true;
    
    // 재연결 최대 시도 횟수 초과
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[웹소켓] 재연결 최대 시도 횟수(${this.maxReconnectAttempts}) 초과`);
      return false;
    }
    
    // 재연결 타이머가 이미 설정된 경우
    if (this.reconnectTimeout) return true;
    
    // 재연결 지연 시간 계산
    this.reconnectAttempts++;
    const delay = this._calculateReconnectDelay();
    
    this._log(`${delay}ms 후 재연결 시도 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    // 재연결 타이머 설정
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      
      try {
        // 재연결 상태 업데이트
        this._emitEvent(WS_EVENT.RECONNECTING, { attempt: this.reconnectAttempts });
        
        // 기존 리소스 정리 후 연결 시도
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
        
        await this.connect();
      } catch (error) {
        console.error('[웹소켓] 재연결 중 오류:', error);
      }
    }, delay);
    
    return true;
  }
  
  /**
   * 메시지 전송
   * @param {string} type 메시지 타입
   * @param {object} data 메시지 데이터
   * @returns {Promise<boolean>} 전송 성공 여부
   */
  async send(type, data = {}) {
    if (!this.checkConnection()) {
      console.error('[웹소켓] 연결되지 않은 상태에서 메시지 전송 시도:', type);
      return false;
    }
    
    try {
      // 메시지 객체 생성
      const message = {
        type,
        data,
        timestamp: Date.now()
      };
      
      // 메시지 직렬화
      const jsonMessage = JSON.stringify(message);
      
      // 메시지 전송
      this.ws.send(jsonMessage);
      
      // 핑/퐁 제외한 메시지 로깅
      if (this.debug && ![WS_EVENT.PING, WS_EVENT.PONG].includes(type)) {
        console.log(`[웹소켓] 메시지 전송: ${type}`);
      }
      
      return true;
    } catch (error) {
      console.error('[웹소켓] 메시지 전송 중 오류:', error);
      return false;
    }
  }
  
  /**
   * Ping 메시지 전송
   * @returns {boolean} 전송 성공 여부
   */
  sendPing() {
    return this.send(WS_EVENT.PING, { timestamp: Date.now() });
  }
  
  /**
   * 이벤트 구독
   * @param {string} event - 구독할 이벤트 타입
   * @param {Function} callback - 콜백 함수
   * @returns {Function} 구독 취소 함수
   */
  on(event, callback) {
    if (!event || typeof callback !== 'function') {
      logger.warn('WebSocketCore', '잘못된 이벤트 구독 요청', { event, hasCallback: !!callback });
      return () => {};
    }
    
    // eventSystem을 통한 이벤트 구독
    return this.eventSystem.subscribe(event, callback, `core_${Date.now()}`);
  }
  
  /**
   * 이벤트 구독 취소
   * @param {string} event - 이벤트 타입
   * @param {Function} callback - 콜백 함수
   * @returns {boolean} 구독 취소 성공 여부
   */
  off(event, callback) {
    // eventSystem은 구독 취소 함수를 반환하므로 직접 취소가 필요 없음
    // 하지만 호환성을 위해 유지
    logger.warn('WebSocketCore', 'off() 메서드는 더 이상 사용되지 않습니다. on()에서 반환된 함수를 사용하세요.');
    return true;
  }
  
  /**
   * 메시지 타입 핸들러 등록
   * @param {string} type - 메시지 타입
   * @param {Function} handler - 핸들러 함수
   * @returns {Function} 핸들러 제거 함수
   */
  addHandler(type, handler) {
    if (!type || typeof handler !== 'function') {
      logger.warn('WebSocketCore', '잘못된 핸들러 등록 요청', { type, hasHandler: !!handler });
      return () => {};
    }
    
    // 핸들러 맵에 추가
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    
    this.handlers.get(type).add(handler);
    
    logger.debug('WebSocketCore', `'${type}' 메시지 핸들러 등록됨`);
    
    // 핸들러 제거 함수 반환
    return () => this.removeHandler(type, handler);
  }
  
  /**
   * 메시지 타입 핸들러 제거
   * @param {string} type - 메시지 타입
   * @param {Function} handler - 핸들러 함수
   * @returns {boolean} 제거 성공 여부
   */
  removeHandler(type, handler) {
    if (!type || typeof handler !== 'function') return false;
    
    const typeHandlers = this.handlers.get(type);
    if (!typeHandlers) return false;
    
    const removed = typeHandlers.delete(handler);
    
    // 핸들러가 없으면 맵에서 해당 타입 제거
    if (typeHandlers.size === 0) {
      this.handlers.delete(type);
    }
    
    if (removed) {
      logger.debug('WebSocketCore', `'${type}' 메시지 핸들러 제거됨`);
    }
    
    return removed;
  }
  
  /* === 내부 메서드 === */
  
  /**
   * 웹소켓 이벤트 핸들러 설정
   * @private
   */
  _setupHandlers() {
    if (!this.ws) return;
    
    // 기본 이벤트 핸들러 설정
    this.ws.onopen = this._handleOpen.bind(this);
    this.ws.onmessage = this._handleMessage.bind(this);
    this.ws.onclose = this._handleClose.bind(this);
    this.ws.onerror = this._handleError.bind(this);
    
    // 기존 connect_ack 핸들러 제거 후 새로 등록 (중복 방지)
    this.removeHandler(WS_EVENT.CONNECT_ACK, this._handleConnectAck.bind(this));
    this.addHandler(WS_EVENT.CONNECT_ACK, this._handleConnectAck.bind(this));
    
    // 핸들러 설정 로깅
    if (WS_CONFIG.DEBUG_MODE) {
      console.debug('[웹소켓] 이벤트 핸들러 설정 완료');
    }
  }
  
  /**
   * 연결 시간 초과 설정
   * @private
   */
  _setupConnectionTimeout() {
    if (this._timers.connectionTimeout) {
      clearTimeout(this._timers.connectionTimeout);
    }
    
    this._timers.connectionTimeout = setTimeout(() => {
      if (this.state !== WS_STATE.CONNECTED) {
        console.warn('[웹소켓] 연결 시간 초과');
        
        try {
          if (this.ws) {
            this.ws.close();
            this.ws = null;
          }
          
          this._isConnecting = false;
          this.state = WS_STATE.DISCONNECTED;
          
          // 이벤트 발생
          this._emitEvent(WS_EVENT.ERROR, { 
            error: '연결 시간 초과',
            timestamp: Date.now()
          });
          
          if (this.autoReconnect) {
            this.reconnect();
          }
        } catch (error) {
          console.error('[웹소켓] 연결 시간 초과 처리 중 오류:', error);
        }
      }
      
      this._timers.connectionTimeout = null;
    }, WS_CONFIG.CONNECTION_TIMEOUT);
  }
  
  /**
   * Connect ACK 메시지 처리
   * @param {Object} data - 메시지 데이터
   * @private
   */
  _handleConnectAck(data) {
    // 연결 타이밍 계산 (성능 측정용)
    const connectionTime = Date.now() - this._connectionAttemptTime;
    
    // 상세 디버깅: 전체 Connect ACK 데이터 로깅
    this._log(`Connect ACK 수신 (${connectionTime}ms)`, {
      connectAckProcessed: this._connectAckProcessed,
      hasUserId: !!data?.userId,
      hasSessionId: !!data?.sessionId,
      hasConnectionInfo: !!data?.connectionInfo,
      receiveTime: new Date().toISOString()
    });
    
    // 이미 처리된 경우 중복 처리 방지
    if (this._connectAckProcessed) {
      logger.debug('WebSocketCore', '중복 Connect ACK 무시됨', data);
      return;
    }
    
    this._connectAckProcessed = true;
    
    // 마지막 메시지 시간 업데이트
    this.lastMessageTime = Date.now();
    
    // 세션 정보 업데이트
    if (data?.sessionId) {
      try {
        // 세션 ID가 다른 경우에만 저장
        const currentSessionId = sessionStorage.getItem('wsSessionId');
        if (currentSessionId !== data.sessionId) {
          sessionStorage.setItem('wsSessionId', data.sessionId);
          logger.info('WebSocketCore', '세션 ID 업데이트됨', { oldId: currentSessionId, newId: data.sessionId });
        }
      } catch (error) {
        logger.error('WebSocketCore', '세션 ID 저장 실패', error);
      }
    }
    
    // 서버가 제공하는 사용자 연결 정보가 있는 경우 처리
    if (data?.connectionInfo && data.connectionInfo.userConnections > 1) {
      this._handleMultipleConnections(data.connectionInfo.userConnections);
    }
    
    // 연결 준비 상태로 변경
    this._isReady = true;
    
    // 상태 변경 이벤트 발생
    this._emitStateChanged();
    
    // 외부 이벤트 리스너에게 직접 connect_ack 이벤트 발생
    try {
      const eventType = WS_EVENT.CONNECT_ACK;
      const enrichedData = { 
        ...data, 
        receivedAt: Date.now(),
        connectionTime: connectionTime
      };
      
      // 이벤트 발생 시스템을 통해 직접 이벤트 발생 (내부 _emitEvent 사용하지 않음)
      this.eventSystem.emit(eventType, enrichedData);
      
      // 로깅
      logger.info('WebSocketCore', '연결 준비 완료', { 
        userId: data?.userId,
        connectionTime: `${connectionTime}ms` 
      });
    } catch (error) {
      logger.error('WebSocketCore', 'Connect ACK 이벤트 발생 중 오류', { 
        error,
        stack: error.stack
      });
    }
    
    // 타이머 설정
    this._setupConnectionCheckTimer();
  }
  
  /**
   * 연결 상태 확인 타이머 설정
   * @private
   */
  _setupConnectionCheckTimer() {
    // 기존 타이머 정리
    if (this._timers.connectionCheck) {
      clearInterval(this._timers.connectionCheck);
      this._timers.connectionCheck = null;
    }
    
    // 연결 상태 확인 타이머 설정
    this._timers.connectionCheck = setInterval(() => {
      this._checkConnectionStatus();
    }, WS_CONFIG.CONNECTION_CHECK_INTERVAL || 15000);
  }
  
  /**
   * 연결 상태 확인 및 필요시 핑 전송
   * @private
   */
  _checkConnectionStatus() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.debug('WebSocketCore', '연결 상태 확인: 연결되지 않음');
      return;
    }
    
    const timeSinceLastMessage = Date.now() - this.lastMessageTime;
    
    // 세션 정보 미수신 시 재전송 (처음 연결된 경우에만)
    if (!this._connectAckProcessed && 
        timeSinceLastMessage > WS_CONFIG.SESSION_RESEND_TIMEOUT) {
      // 이전 5초 이내에 세션 정보를 전송한 적이 없는 경우에만 전송
      const now = Date.now();
      if (!this._lastSessionInfoSentTime || 
          now - this._lastSessionInfoSentTime > 5000) {
        logger.warn('WebSocketCore', 'connect_ack 메시지 없음, 세션 정보 재전송');
        this._sendInitialSessionInfo();
        this._lastSessionInfoSentTime = now;
      }
    }
    
    // 핑 메시지 전송 조건
    // - 마지막 메시지 수신 후 PING_INTERVAL 이상 시간이 경과
    // - PING_INTERVAL 기본값은 30초
    if (timeSinceLastMessage > (WS_CONFIG.PING_INTERVAL || 30000)) {
      this.sendPing();
    }
  }
  
  /**
   * 페이지 언로드 시 WebSocket 연결을 정상적으로 종료하는 리스너 설정
   * 페이지 이동, 새로고침 등에서 정상적인 연결 종료 처리
   * @private
   */
  _setupUnloadListener() {
    if (typeof window === 'undefined') return;
    
    // beforeunload와 unload 모두에 이벤트 리스너 추가
    const handleUnload = () => {
      // 동기적으로 처리하기 위해 try-catch로 감싸기
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // 페이지 종료 시 정상적으로 연결 종료
          this._log('페이지 언로드 이벤트 감지, 연결 종료 시도');
          
          // 비동기 작업을 수행하기 전에 서버에 연결 종료 의사를 알림
          this.send('client_disconnect', {
            reason: 'page_unload',
            sessionId: this._getSessionId(),
            timestamp: Date.now()
          });
          
          // 클라이언트 측에서 깨끗하게 연결 종료 (1000: 정상 종료)
          this.ws.close(1000, 'User left page');
          
          // 내부 상태 정리
          this.state = WS_STATE.DISCONNECTED;
          this._isReady = false;
          this._isConnecting = false;
          this._emitStateChanged();
        }
      } catch (error) {
        // 페이지 종료 중이라 로깅이 보이지 않을 수 있으나, 혹시 모를 오류 처리
        console.error('[웹소켓] 페이지 언로드 중 연결 종료 오류:', error);
      }
    };
    
    // beforeunload와 unload 이벤트 모두 처리
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('unload', handleUnload);
    
    // 이벤트 바인딩용 속성 저장
    this._unloadHandler = handleUnload;
  }
  
  /**
   * 연결 열림 이벤트 핸들러
   * @param {Event} event 이벤트 객체
   * @private
   */
  _handleOpen(event) {
    // 연결 타임아웃 타이머 제거
    if (this._timers.connectionTimeout) {
      clearTimeout(this._timers.connectionTimeout);
      this._timers.connectionTimeout = null;
    }
    
    const connectionTime = Date.now() - this._connectionAttemptTime;
    this._log(`연결됨 (${connectionTime}ms)`);
    
    // 디버그용 WebSocket 객체 상태 출력
    if (WS_CONFIG.DEBUG_MODE) {
      console.debug('[웹소켓] WebSocket 객체 상태:', {
        readyState: this.ws?.readyState,
        protocol: this.ws?.protocol,
        url: this.ws?.url
      });
    }
    
    this.state = WS_STATE.CONNECTED;
    this.lastMessageTime = Date.now();
    this.reconnectAttempts = 0;
    this._isConnecting = false;
    
    // 이벤트 발생
    this._emitEvent(WS_EVENT.CONNECTED, { timestamp: Date.now() });
    
    // 연결 체크 타이머 설정
    this._setupConnectionCheckTimer();
    
    // 초기에는 connect_ack 처리 상태 초기화 후 즉시 세션 정보 전송
    this._connectAckProcessed = false;
    this._sendInitialSessionInfo();
    
    // Ready 상태 즉시 반영
    this._isReady = true;
    this._emitStateChanged();
  }
  
  /**
   * WebSocket 메시지 처리
   * @param {MessageEvent} event - WebSocket 메시지 이벤트
   * @private
   */
  _handleMessage(event) {
    try {
      // 마지막 메시지 시간 업데이트
      this.lastMessageTime = Date.now();
      
      // 원본 메시지 디버깅 로그
      if (WS_CONFIG.DEBUG_MODE && WS_CONFIG.LOG_MESSAGES) {
        const timestamp = new Date().toISOString();
        const dataType = typeof event.data;
        const dataLength = dataType === 'string' ? event.data.length : (event.data?.byteLength || 0);
        const dataSample = dataType === 'string' ? event.data.substring(0, 50) + (event.data.length > 50 ? '...' : '') : '[이진 데이터]';
        
        this._log(`메시지 수신 [${timestamp}]: 타입=${dataType}, 길이=${dataLength}`, dataSample);
      }
      
      // 메시지 파싱
      let parsed;
      try {
        parsed = this._parseMessage(event.data);
      } catch (parseError) {
        logger.warn('WebSocketCore', '메시지 파싱 실패', { 
          error: parseError,
          data: typeof event.data === 'string' ? event.data.substring(0, 100) : '[이진 데이터]'
        });
        return;
      }
      
      // 파싱된 메시지 정보 로깅
      if (WS_CONFIG.DEBUG_MODE && WS_CONFIG.VERBOSE_LOGGING) {
        const typeIsString = typeof parsed.type === 'string';
        const isStandardEvent = typeIsString && Object.values(WS_EVENT).includes(parsed.type);
        
        this._log('파싱된 메시지 정보', {
          type: parsed.type,
          typeIsString,
          isStandardEvent,
          dataType: typeof parsed.data,
          hasData: !!parsed.data
        });
      }
      
      // 타입이 없는 메시지 처리
      if (!parsed.type) {
        logger.warn('WebSocketCore', '메시지 타입 누락', {
          data: JSON.stringify(parsed.data || {}).substring(0, 100),
          parsed
        });
        
        // 타입 없는 메시지는 일반 message 이벤트로 발생
        this._emitEvent(WS_EVENT.MESSAGE, parsed.data);
        return;
      }
      
      // 이벤트 핸들러 호출
      const messageType = String(parsed.type); // 문자열 변환 보장
      
      // 표준 이벤트 처리
      switch (messageType) {
        case WS_EVENT.CONNECT_ACK:
          this._handleConnectAck(parsed.data);
          break;
          
        case WS_EVENT.PING:
          this._handlePing(parsed.data);
          break;
          
        case WS_EVENT.PONG:
          this._handlePong(parsed.data);
          break;
          
        default:
          // 표준 이벤트가 아닌 경우 로깅 (개발 모드에서만)
          if (WS_CONFIG.DEBUG_MODE && WS_CONFIG.LOG_NON_STANDARD_EVENTS) {
            this._log(`비표준 이벤트 수신: ${messageType}`, {
              data: parsed.data
            });
          }
          
          // 특정 이벤트 타입으로 이벤트 발생
          this._emitEvent(messageType, parsed.data);
          
          // 항상 일반 메시지 이벤트도 함께 발생 (이전 버전 호환성)
          if (messageType !== WS_EVENT.MESSAGE) {
            this._emitEvent(WS_EVENT.MESSAGE, {
              type: messageType,
              data: parsed.data
            });
          }
          break;
      }
    } catch (error) {
      // 오류 로깅
      logger.error('WebSocketCore', '메시지 처리 중 오류 발생', {
        error: error.message,
        stack: error.stack,
        eventData: typeof event.data === 'string' 
          ? event.data.substring(0, 100) 
          : '[이진 데이터]'
      });
    }
  }
  
  /**
   * 연결 종료 이벤트 핸들러
   * @param {CloseEvent} closeEvent 종료 이벤트 객체
   * @private
   */
  _handleClose(closeEvent) {
    const prevState = this.state;
    this.state = WS_STATE.DISCONNECTED;
    
    // 연결 자원 정리
    this._cleanupConnection();
    
    // 클라이언트가 페이지를 떠난 경우 처리
    const isUserLeftPage = 
      closeEvent.reason?.includes('User left page') || 
      closeEvent.code === 1000 || 
      closeEvent.code === 1001;
    
    // 이벤트 발생
    this._emitEvent(WS_EVENT.DISCONNECTED, {
      code: closeEvent.code,
      reason: closeEvent.reason,
      wasClean: closeEvent.wasClean,
      timestamp: Date.now(),
      isUserLeftPage: isUserLeftPage
    });
    
    // 정상 종료가 아니고, 이전 상태가 ERROR가 아닌 경우만 자동 재연결
    const isAbnormalClosure = 
      closeEvent.code !== 1000 && 
      closeEvent.code !== 1001 && 
      !isUserLeftPage;
    
    if (isAbnormalClosure && this.autoReconnect && prevState !== WS_STATE.ERROR) {
      logger.info('WebSocketCore', '비정상 종료로 인한 재연결 시도', { 
        code: closeEvent.code,
        reason: closeEvent.reason
      });
      this.reconnect();
    } else {
      logger.debug('WebSocketCore', '재연결 없이 연결 종료', {
        isAbnormalClosure,
        autoReconnect: this.autoReconnect,
        prevState,
        code: closeEvent.code
      });
    }
    
    // 기본 정리 함수 호출 (타이머 등)
    this._cleanup();
  }
  
  /**
   * 오류 이벤트 핸들러
   * @param {Event} error 오류 이벤트 객체
   * @private
   */
  _handleError(error) {
    // ClientDisconnected 또는 ConnectionClosed 오류인 경우 정상적인 연결 종료로 처리
    const errorMessage = error?.message || (error?.toString ? error.toString() : String(error));
    const isClientDisconnected = 
      errorMessage.includes('ClientDisconnected') || 
      errorMessage.includes('ConnectionClosed') ||
      errorMessage.includes('User left page');
    
    if (isClientDisconnected) {
      logger.info('WebSocketCore', '클라이언트 연결 종료', { 
        reason: errorMessage,
        state: this.state
      });
      
      // 정상적인 연결 종료 처리
      this._cleanupConnection();
      this.state = WS_STATE.DISCONNECTED;
      this._isConnecting = false;
      
      // 이벤트 발생 (연결 종료)
      this._emitEvent(WS_EVENT.DISCONNECTED, {
        reason: 'client_disconnected',
        timestamp: Date.now()
      });
      
      return;
    }
    
    // 일반 오류 처리
    logger.error('WebSocketCore', '웹소켓 오류 발생', { error: errorMessage });
    
    // 이벤트 발생
    this._emitEvent(WS_EVENT.ERROR, {
      error: errorMessage || '알 수 없는 오류',
      timestamp: Date.now()
    });
    
    // 연결 종료
    if (this.ws && this.checkConnection()) {
      try {
        this.ws.close();
      } catch (closeError) {
        logger.error('WebSocketCore', '오류 발생 후 연결 종료 중 추가 오류', { error: closeError });
      }
    }
    
    this.state = WS_STATE.ERROR;
    this._isConnecting = false;
  }
  
  /**
   * 다중 사용자 연결 처리
   * @param {number} userConnections 사용자 연결 수
   * @private
   */
  _handleMultipleConnections(userConnections) {
    this._log(`다중 사용자 연결 감지: ${userConnections}`);
    
    // 정리 요청 전송
    const sessionId = this._getSessionId();
    if (sessionId) {
      this.send(WS_EVENT.CLEANUP_CONNECTIONS, {
        sessionId,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * 초기 세션 정보 전송
   * @private
   */
  _sendInitialSessionInfo() {
    if (!this.checkConnection()) {
      this._log('웹소켓이 연결되지 않음, 세션 정보 전송 실패');
      return false;
    }
    
    try {
      const sessionId = this._getSessionId();
      if (!sessionId) {
        this._log('세션 ID 없음, 세션 정보 전송 실패');
        return false;
      }
      
      this._log('초기 세션 정보 전송 중...');
      this.send(WS_EVENT.SESSION_INFO, {
        sessionId,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        path: window.location.pathname,
        timestamp: Date.now()
      });
      
      return true;
    } catch (error) {
      console.error('[웹소켓] 세션 정보 전송 중 오류:', error);
      return false;
    }
  }
  
  /**
   * 객체의 키를 카멜 케이스로 변환
   * @param {object} data 변환할 데이터
   * @returns {object} 변환된 데이터
   * @private
   */
  _convertToCamelCase(data) {
    if (!data || typeof data !== 'object') return data;
    
    try {
      return snakeToCamel(data);
    } catch (error) {
      console.error('[웹소켓] 카멜 케이스 변환 중 오류:', error);
      return data;
    }
  }
  
  /**
   * 이벤트 발생
   * @param {string} eventType - 이벤트 타입
   * @param {*} eventData - 이벤트 데이터
   * @private
   */
  _emitEvent(eventType, eventData = null) {
    // 성능 모니터링 (개발 모드)
    const startTime = WS_CONFIG.DEBUG_MODE ? performance.now() : 0;
    
    try {
      // 이벤트 타입 검증
      if (!eventType) {
        const error = new Error('이벤트 타입이 누락되었습니다');
        logger.error('WebSocketCore', '이벤트 타입 누락 (undefined/null)', { 
          event: eventType, 
          data: eventData,
          stack: error.stack
        });
        return;
      }
      
      // 문자열이 아닌 이벤트 타입 변환
      let safeEventType = eventType;
      if (typeof eventType !== 'string') {
        logger.warn('WebSocketCore', '문자열이 아닌 이벤트 타입 자동 변환', {
          originalEvent: eventType,
          originalType: typeof eventType,
          caller: new Error().stack?.split('\n')[2]?.trim()
        });
        try {
          safeEventType = String(eventType);
        } catch (err) {
          logger.error('WebSocketCore', '이벤트 타입 문자열 변환 실패', { 
            event: eventType, 
            error: err 
          });
          return;
        }
      }
      
      // 디버깅: 이벤트 발생 로깅 (stateChanged 이벤트는 너무 많이 발생하므로 제외)
      if (WS_CONFIG.DEBUG_MODE && safeEventType !== 'stateChanged') {
        this._log(`이벤트 발생: [${safeEventType}]`, {
          eventType: safeEventType,
          dataType: typeof eventData,
          hasData: !!eventData
        });
      }
      
      // 이벤트 발생
      this.eventSystem.emit(safeEventType, eventData);
      
      // 성능 측정 (개발 모드)
      if (WS_CONFIG.DEBUG_MODE && WS_CONFIG.VERBOSE_LOGGING) {
        const emitTime = performance.now() - startTime;
        if (emitTime > 5) { // 5ms 이상 걸리는 이벤트만 로깅
          this._log(`이벤트 발생 지연 감지 [${safeEventType}]: ${emitTime.toFixed(2)}ms`);
        }
      }
    } catch (error) {
      logger.error('WebSocketCore', '이벤트 발생 중 오류', { 
        event: eventType, 
        error: error.message,
        stack: error.stack 
      });
    }
  }
  
  /**
   * 세션 ID 가져오기
   * @returns {string} 세션 ID
   * @private
   */
  _getSessionId() {
    try {
      // 세션 ID를 가져오는 로직 (실제로는 sessionManager에서 가져올 예정)
      // 임시로 로컬 스토리지에서 가져오는 로직 구현
      let sessionId = sessionStorage.getItem('wsSessionId');
      
      if (!sessionId) {
        sessionId = `ws_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        sessionStorage.setItem('wsSessionId', sessionId);
      }
      
      return sessionId;
    } catch (error) {
      console.error('[웹소켓] 세션 ID 가져오기 실패:', error);
      return null;
    }
  }
  
  /**
   * 재연결 지연 시간 계산 (지수 백오프 + 지터)
   * @returns {number} 지연 시간 (ms)
   * @private
   */
  _calculateReconnectDelay() {
    // 최소/최대 딜레이 가져오기 (설정 값이 바뀌어도 적용)
    const minDelay = WS_CONFIG.MIN_RECONNECT_DELAY || 500;
    const maxDelay = WS_CONFIG.MAX_RECONNECT_DELAY || 10000;
    
    // 재시도 횟수에 따른 지수 백오프 계산
    let delay;
    
    if (this.reconnectAttempts <= 0) {
      // 첫 번째 재연결은 최소 지연으로
      delay = minDelay;
    } else {
      // 지수 백오프 적용 (1.5의 지수승)
      delay = minDelay * Math.pow(1.5, this.reconnectAttempts);
      
      // 최대 지연 제한
      delay = Math.min(delay, maxDelay);
    }
    
    // 지터 추가 (±20% 랜덤 변동)
    const jitter = 0.8 + (Math.random() * 0.4);
    delay = Math.floor(delay * jitter);
    
    this._log(`재연결 지연 계산됨: ${delay}ms (시도: ${this.reconnectAttempts})`);
    
    return delay;
  }
  
  /**
   * 리소스 정리
   * @private
   */
  _cleanup() {
    // 타이머 정리
    Object.keys(this._timers).forEach(key => {
      if (this._timers[key]) {
        clearTimeout(this._timers[key]);
        this._timers[key] = null;
      }
    });
  }
  
  /**
   * 디버그 로깅
   * @param {string} message 로그 메시지
   * @param {*} data 추가 데이터
   * @private
   */
  _log(message, data) {
    logger.debug('WebSocketCore', message, data);
  }

  /**
   * 웹소켓 메시지 파싱
   * @param {string|ArrayBuffer} messageData - 웹소켓 메시지 데이터
   * @returns {Object} 파싱된 메시지 객체 {type, data}
   * @private
   */
  _parseMessage(messageData) {
    try {
      // 문자열이 아닌 경우 처리
      if (typeof messageData !== 'string') {
        logger.warn('WebSocketCore', '문자열이 아닌 메시지 데이터 수신', {
          type: typeof messageData,
          isBinary: messageData instanceof ArrayBuffer
        });
        
        // 이진 데이터 처리 (ArrayBuffer)
        if (messageData instanceof ArrayBuffer) {
          // ArrayBuffer를 문자열로 변환 시도
          try {
            const decoder = new TextDecoder();
            messageData = decoder.decode(messageData);
          } catch (e) {
            logger.error('WebSocketCore', '이진 데이터 변환 실패', e);
            return { type: null, data: { error: 'binary_decode_failed' } };
          }
        } else {
          // 처리할 수 없는 메시지 타입 (Blob 등)
          return { type: null, data: { error: 'unsupported_data_type' } };
        }
      }
      
      // 문자열 파싱
      let parsed;
      try {
        parsed = JSON.parse(messageData);
      } catch (jsonError) {
        logger.error('WebSocketCore', 'JSON 파싱 실패', { 
          error: jsonError,
          data: messageData.substring(0, 100) + (messageData.length > 100 ? '...' : '')
        });
        return { type: null, data: { error: 'json_parse_failed', raw: messageData } };
      }
      
      // 타입 추출 (대소문자 구분 없이)
      let type = null;
      
      // 표준 형식: { type, data }
      if (parsed.type) {
        type = parsed.type;
      } 
      // 대체 형식 1: { event, data }
      else if (parsed.event) {
        type = parsed.event;
        logger.debug('WebSocketCore', '대체 형식 메시지 수신 (event)', { 
          event: parsed.event 
        });
      } 
      // 대체 형식 2: { messageType, ... }
      else if (parsed.messageType) {
        type = parsed.messageType;
        logger.debug('WebSocketCore', '대체 형식 메시지 수신 (messageType)', { 
          messageType: parsed.messageType 
        });
      }
      
      // 데이터 추출
      let data;
      
      // 표준 형식: { type, data }
      if (parsed.data !== undefined) {
        data = parsed.data;
      } 
      // 대체 형식: 전체 메시지가 데이터
      else {
        // type을 제외한 나머지가 데이터
        data = { ...parsed };
        delete data.type;
        delete data.event;
        delete data.messageType;
        
        // 데이터 필드가 없으면 로깅
        if (Object.keys(data).length === 0) {
          logger.debug('WebSocketCore', '메시지에 데이터 필드 없음', { type });
        }
      }
      
      // 데이터 카멜케이스 변환
      const camelData = this._convertToCamelCase(data);
      
      return { type, data: camelData };
    } catch (error) {
      logger.error('WebSocketCore', '메시지 파싱 중 오류', { 
        error: error.message,
        stack: error.stack,
        data: typeof messageData === 'string' ? 
          messageData.substring(0, 100) : 
          'non-string data'
      });
      return { type: null, data: { error: 'parse_error' } };
    }
  }

  /**
   * 연결 관련 리소스 정리
   * 연결이 종료될 때 호출되어 연결 관련 자원을 정리함
   * @private
   */
  _cleanupConnection() {
    // 웹소켓 인스턴스 정리
    if (this.ws) {
      // 이벤트 리스너 제거
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
      } catch (error) {
        logger.warn('WebSocketCore', '이벤트 리스너 제거 중 오류', { error });
      }
      
      // 열려있는 경우 닫기
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.close(1000, 'Normal closure');
        }
      } catch (error) {
        logger.warn('WebSocketCore', '연결 종료 중 오류', { error });
      }
      
      this.ws = null;
    }
    
    // 내부 상태 초기화
    this._isReady = false;
    this._connectAckProcessed = false;
    this._isConnecting = false;
    
    // 연결 관련 타이머 정리
    if (this._timers.connectionTimeout) {
      clearTimeout(this._timers.connectionTimeout);
      this._timers.connectionTimeout = null;
    }
    
    if (this._timers.connectionCheck) {
      clearInterval(this._timers.connectionCheck);
      this._timers.connectionCheck = null;
    }
    
    // 자원 정리 로깅
    logger.debug('WebSocketCore', '웹소켓 연결 자원 정리 완료');
  }
}

// 싱글톤 인스턴스
const webSocketCore = new WebSocketCore();

export default webSocketCore; 