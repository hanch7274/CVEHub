import { getAccessToken } from '../../../utils/storage/tokenStorage';
import { WEBSOCKET } from '../../../api/config/endpoints';
import eventSystem from '../eventSystem';
import { snakeToCamel } from '../../../utils/caseConverter';
import { WS_EVENT, WS_STATE, WS_CONFIG, calculateReconnectDelay } from '../utils/configUtils';
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

    // 디버그 모드에서 전역 접근 설정
    if (WS_CONFIG.DEBUG_MODE && typeof window !== 'undefined') {
      window._webSocketCoreInstance = this;
    }
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
    try {
      // 이미 연결 중인 경우 중복 연결 시도 방지
      if (this._isConnecting) {
        this._log('이미 연결 시도 중입니다.');
        return true;
      }
      
      // 이미 연결된 경우
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this._log('이미 연결되어 있습니다.');
        return true;
      }
      
      // 연결 중 상태로 설정
      this._isConnecting = true;
      this._connectionAttemptTime = Date.now();
      
      // 기존 연결 정리
      this._cleanup();
      
      // 연결 상태 초기화
      this.state = WS_STATE.CONNECTING;
      this._connectAckProcessed = false;
      this._connectMessageSent = false;
      
      // 연결 실패 시 재시도 전 지연 시간 계산
      const reconnectDelay = this._calculateReconnectDelay();
      
      // 디버그 로깅: 연결 시도 정보
      this._log(`WebSocket 연결 시도`, {
        apiUrl: WS_CONFIG.API_URL,
        connectionAttempts: this.reconnectAttempts,
        reconnectDelay,
        sessionId: this._getSessionId()
      });
      
      // 연결 상태 이벤트 발생
      this._emitStateChanged();
      
      try {
        // WebSocket 인스턴스 생성
        this.ws = new WebSocket(WS_CONFIG.API_URL);
        
        // WebSocket 이벤트 핸들러 설정
        this._setupHandlers();
        
        // 연결 시간 초과 설정
        this._setupConnectionTimeout();
        
        // 연결 성공 또는 실패까지 대기
        const result = await this._waitForConnection();
        return result;
      } catch (error) {
        logger.error('WebSocketCore', '연결 중 오류 발생', {
          error: error.message,
          stack: error.stack
        });
        
        // 연결 실패 로직 실행
        this._handleConnectionFailure(error);
        return false;
      } finally {
        this._isConnecting = false;
      }
    } catch (error) {
      logger.error('WebSocketCore', '예상치 못한 연결 오류', error);
      this._isConnecting = false;
      return false;
    }
  }
  
  /**
   * 연결 대기 및 결과 반환
   * @returns {Promise<boolean>} 연결 성공 여부
   * @private
   */
  _waitForConnection() {
    return new Promise((resolve) => {
      // 연결 성공 핸들러
      const handleOpen = () => {
        this.ws.removeEventListener('open', handleOpen);
        this.ws.removeEventListener('error', handleError);
        this.ws.removeEventListener('close', handleClose);
        
        if (this._timers.connectionTimeout) {
          clearTimeout(this._timers.connectionTimeout);
          this._timers.connectionTimeout = null;
        }
        
        this.state = WS_STATE.CONNECTED;
        this.lastMessageTime = Date.now();
        this.reconnectAttempts = 0;
        
        // 이벤트 발생
        this._emitEvent(WS_EVENT.CONNECTED, { timestamp: Date.now() });
        
        // 연결 체크 타이머 설정
        this._setupConnectionCheckTimer();
        
        resolve(true);
      };
      
      // 연결 오류 핸들러
      const handleError = (error) => {
        this.ws.removeEventListener('open', handleOpen);
        this.ws.removeEventListener('error', handleError);
        this.ws.removeEventListener('close', handleClose);
        
        if (this._timers.connectionTimeout) {
          clearTimeout(this._timers.connectionTimeout);
          this._timers.connectionTimeout = null;
        }
        
        logger.error('WebSocketCore', '연결 오류 발생', { 
          error: error.message || '알 수 없는 오류',
          stack: error.stack
        });
        
        this.state = WS_STATE.ERROR;
        this._isReady = false;
        this._connectAckProcessed = false;
        
        // 이벤트 발생: 연결 끊김
        this._emitEvent(WS_EVENT.DISCONNECTED, {
          reason: '연결 실패',
          error: error.message || '알 수 없는 오류',
          wasConnected: false,
          timestamp: Date.now()
        });
        
        resolve(false);
      };
      
      // 연결 종료 핸들러 (연결 전 종료)
      const handleClose = (event) => {
        this.ws.removeEventListener('open', handleOpen);
        this.ws.removeEventListener('error', handleError);
        this.ws.removeEventListener('close', handleClose);
        
        if (this._timers.connectionTimeout) {
          clearTimeout(this._timers.connectionTimeout);
          this._timers.connectionTimeout = null;
        }
        
        logger.warn('WebSocketCore', '연결 시도 중 종료됨', { 
          code: event.code,
          reason: event.reason
        });
        
        this.state = WS_STATE.DISCONNECTED;
        this._isReady = false;
        this._connectAckProcessed = false;
        
        // 이벤트 발생: 연결 끊김
        this._emitEvent(WS_EVENT.DISCONNECTED, {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          timestamp: Date.now()
        });
        
        resolve(false);
      };
      
      // 이벤트 리스너 추가
      this.ws.addEventListener('open', handleOpen);
      this.ws.addEventListener('error', handleError);
      this.ws.addEventListener('close', handleClose);
    });
  }
  
  /**
   * 연결 실패 처리
   * @param {Error} error - 연결 오류
   * @private
   */
  _handleConnectionFailure(error) {
    this._log('연결 실패', { error: error.message || '알 수 없는 오류' });
    
    // 연결 상태 업데이트
    this.state = WS_STATE.ERROR;
    this._isReady = false;
    this._connectAckProcessed = false;
    
    // 이벤트 발생: 연결 끊김
    this._emitEvent(WS_EVENT.DISCONNECTED, {
      reason: '연결 실패',
      error: error.message || '알 수 없는 오류',
      wasConnected: false,
      timestamp: Date.now()
    });
    
    // 연결 시도 횟수 증가
    this.reconnectAttempts++;
  }
  
  /**
   * WebSocket 이벤트 핸들러 설정
   * @private
   */
  _setupHandlers() {
    if (!this.ws) return;
    
    this._log('WebSocket 이벤트 핸들러 설정');
    
    // 연결 열림 이벤트
    this.ws.onopen = (event) => {
      try {
        this._handleOpen(event);
      } catch (error) {
        logger.error('WebSocketCore', 'onopen 핸들러 처리 중 오류', error);
      }
    };
    
    // 메시지 수신 이벤트
    this.ws.onmessage = (event) => {
      try {
        this._handleMessage(event);
      } catch (error) {
        logger.error('WebSocketCore', 'onmessage 핸들러 처리 중 오류', error);
      }
    };
    
    // 연결 종료 이벤트
    this.ws.onclose = (event) => {
      try {
        this._handleClose(event);
      } catch (error) {
        logger.error('WebSocketCore', 'onclose 핸들러 처리 중 오류', error);
      }
    };
    
    // 오류 이벤트
    this.ws.onerror = (error) => {
      try {
        this._handleError(error);
      } catch (e) {
        logger.error('WebSocketCore', 'onerror 핸들러 처리 중 오류', e);
      }
    };
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

  /**
   * ping 메시지 처리
   * @param {Object} data - 핑 메시지 데이터
   * @private
   */
  _handlePing(data) {
    try {
      // 핑 메시지 응답으로 퐁 메시지 전송
      this.send(WS_EVENT.PONG, { 
        echo: data?.timestamp,
        timestamp: new Date().toISOString(),
        sessionId: this._getSessionId() 
      });
      
      if (WS_CONFIG.DEBUG_MODE && WS_CONFIG.VERBOSE_LOGGING) {
        this._log('핑 메시지 응답 송신');
      }
      
      // 핑 이벤트는 일반적으로 UI에 표시하지 않으므로 별도 이벤트 발생 안함
    } catch (error) {
      logger.error('WebSocketCore', '핑 메시지 처리 중 오류', { 
        error: error.message,
        stack: error.stack,
        data
      });
    }
  }
  
  /**
   * pong 메시지 처리
   * @param {Object} data - 퐁 메시지 데이터
   * @private
   */
  _handlePong(data) {
    try {
      if (WS_CONFIG.DEBUG_MODE && WS_CONFIG.VERBOSE_LOGGING) {
        const responseTime = data?.echo ? Date.now() - new Date(data.echo).getTime() : null;
        this._log('퐁 메시지 수신', { 
          timestamp: data?.timestamp,
          echo: data?.echo,
          responseTime: responseTime ? `${responseTime}ms` : 'N/A'
        });
      }
      
      // 연결 상태 확인 타이머 갱신
      this._lastPongTime = Date.now();
      
      // 연결 상태 추가 체크는 필요하지 않음
      // 퐁 이벤트는 일반적으로 UI에 표시하지 않으므로 별도 이벤트 발생 안함
    } catch (error) {
      logger.error('WebSocketCore', '퐁 메시지 처리 중 오류', { 
        error: error.message,
        stack: error.stack,
        data
      });
    }
  }

  /**
   * Connect ACK 메시지 처리
   * @param {Object} data - 메시지 데이터
   * @private
   */
  _handleConnectAck(data) {
    try {
      // 연결 타이밍 계산 (성능 측정용)
      const connectionTime = Date.now() - this._connectionAttemptTime;
      
      // 디버깅용 상세 로깅
      logger.info('WebSocketCore', `Connect ACK 수신 (${connectionTime}ms)`, {
        hasUserId: !!data?.userId,
        timestamp: new Date().toISOString(),
        connectAckProcessed: this._connectAckProcessed
      });
      
      // 이미 처리된 경우 중복 처리 방지
      if (this._connectAckProcessed) {
        logger.debug('WebSocketCore', 'Connect ACK 중복 수신 - 무시함', data);
        return;
      }
      
      // Connect ACK 처리 완료 표시
      this._connectAckProcessed = true;
      
      // 마지막 메시지 시간 업데이트
      this.lastMessageTime = Date.now();
      
      // 세션 정보 업데이트 (새 세션 ID가 있는 경우에만)
      if (data?.sessionId) {
        try {
          const currentSessionId = this._getSessionId();
          
          // 세션 ID가 다른 경우만 업데이트
          if (currentSessionId !== data.sessionId) {
            sessionStorage.setItem('wsSessionId', data.sessionId);
            logger.info('WebSocketCore', '세션 ID 업데이트됨', { 
              oldId: currentSessionId, 
              newId: data.sessionId 
            });
          } else {
            logger.debug('WebSocketCore', '세션 ID 유지됨', { sessionId: data.sessionId });
          }
        } catch (error) {
          logger.error('WebSocketCore', '세션 ID 저장 실패', error);
        }
      }
      
      // 다중 연결 정보 처리
      if (data?.connectionInfo?.userConnections > 1) {
        logger.info('WebSocketCore', '다중 연결 감지됨', {
          userConnections: data.connectionInfo.userConnections
        });
        
        // 다중 연결 처리 로직 호출
        this._handleMultipleConnections(data.connectionInfo.userConnections);
      }
      
      // 상태 변경: 연결 준비 완료
      this._isReady = true;
      this.state = WS_STATE.CONNECTED;
      
      // 이벤트 발생 (상태 변경)
      this._emitStateChanged();
      
      // Connect ACK 이벤트 직접 발생
      // 내부 _emitEvent 메서드를 사용하지 않고 eventSystem을 직접 호출하여 성능 최적화
      const enrichedData = {
        ...data,
        receivedAt: Date.now(),
        connectionTime
      };
      
      // 이벤트 시스템을 통해 이벤트 발생
      this.eventSystem.emit(WS_EVENT.CONNECT_ACK, enrichedData);
      
      // 연결 체크 타이머 설정
      this._setupConnectionCheckTimer();
    } catch (error) {
      logger.error('WebSocketCore', 'Connect ACK 처리 중 오류', { 
        error: error.message,
        stack: error.stack,
        data: JSON.stringify(data || {}).substring(0, 100)
      });
    }
  }

  /**
   * 연결 시간 초과 설정
   * @private
   */
  _setupConnectionTimeout() {
    // 기존 타이머가 있으면 제거
    if (this._timers.connectionTimeout) {
      clearTimeout(this._timers.connectionTimeout);
      this._timers.connectionTimeout = null;
    }
    
    // 시간 초과 기간 설정 (기본값 5초로 줄임)
    const timeoutInterval = WS_CONFIG.CONNECTION_TIMEOUT || 5000; 
    
    this._log(`연결 시간 초과 설정: ${timeoutInterval}ms`);
    
    // 시간 초과 타이머 설정
    this._timers.connectionTimeout = setTimeout(() => {
      try {
        // 여전히 연결 중인 상태인지 확인
        if (!this._connectAckProcessed) {
          logger.warn('WebSocketCore', '연결 시간 초과', {
            timeout: timeoutInterval,
            elapsed: Date.now() - this._connectionAttemptTime,
            wsReadyState: this.ws ? this.ws.readyState : 'no socket'
          });
          
          // 연결 종료
          if (this.ws) {
            this.ws.close(1006, '연결 시간 초과');
            this.ws = null;
          }
          
          // 연결 상태 업데이트
          this._isConnecting = false;
          this.state = WS_STATE.ERROR;
          this._isReady = false;
          
          // 이벤트 발생: 오류
          this._emitEvent(WS_EVENT.ERROR, { 
            error: '연결 시간 초과',
            timeout: timeoutInterval,
            timestamp: Date.now()
          });
          
          // 연결 끊김 이벤트 발생
          this._emitEvent(WS_EVENT.DISCONNECTED, {
            reason: '연결 시간 초과',
            wasClean: false,
            timestamp: Date.now()
          });
          
          // 자동 재연결 설정이 활성화된 경우 재연결 시도
          if (this.autoReconnect) {
            logger.info('WebSocketCore', '자동 재연결 시도');
            
            // 바로 재연결하지 않고 짧은 지연 후 재연결
            setTimeout(() => this.reconnect(), 500);
          }
        }
      } catch (error) {
        logger.error('WebSocketCore', '연결 시간 초과 처리 중 오류', { 
          error: error.message,
          stack: error.stack
        });
      } finally {
        // 타이머 초기화
        this._timers.connectionTimeout = null;
      }
    }, timeoutInterval);
  }

  /**
   * 이벤트 구독
   * @param {string} eventType - 이벤트 타입
   * @param {Function} callback - 콜백 함수
   * @returns {Function} 구독 취소 함수
   */
  on(eventType, callback) {
    if (!eventType || typeof callback !== 'function') {
      logger.warn('WebSocketCore', '잘못된 이벤트 구독 요청', { 
        eventType, 
        hasCallback: !!callback 
      });
      return () => {};
    }
    
    // eventSystem을 통한 이벤트 구독
    return this.eventSystem.subscribe(eventType, callback, `core_${Date.now()}`);
  }
  
  /**
   * 이벤트 구독 취소 
   * @param {string} eventType - 이벤트 타입  
   * @param {Function} callback - 콜백 함수
   * @returns {boolean} 구독 취소 성공 여부
   */
  off(eventType, callback) {
    // 이 메서드는 호환성을 위해 유지되지만 사용을 권장하지 않음
    // on()에서 반환된 함수를 사용하는 것이 더 안전함
    logger.warn('WebSocketCore', 'off() 메서드는 권장되지 않습니다. on()이 반환하는 함수를 사용하세요.');
    return true;
  }

  /**
   * WebSocket 연결 종료
   * @param {boolean} cleanDisconnect - 정상 종료 여부
   * @returns {boolean} 성공 여부
   */
  disconnect(cleanDisconnect = true) {
    try {
      // 이미 연결 종료되었거나 없는 경우
      if (!this.ws) {
        logger.debug('WebSocketCore', '연결 이미 종료됨');
        return true;
      }
      
      logger.info('WebSocketCore', '연결 종료 시작', { cleanDisconnect });
      
      // 연결 상태 업데이트
      this.state = WS_STATE.DISCONNECTED;
      this._isReady = false;
      
      // 타이머 정리
      this._cleanup();
      
      // 정상 종료인 경우 1000 코드로 종료
      if (cleanDisconnect && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Normal closure');
      }
      
      // 웹소켓 연결 정리
      this._cleanupConnection();
      
      // 이벤트 발생: 연결 끊김
      this._emitEvent(WS_EVENT.DISCONNECTED, { 
        reason: '사용자 요청으로 종료',
        wasClean: true,
        timestamp: Date.now() 
      });
      
      return true;
    } catch (error) {
      logger.error('WebSocketCore', '연결 종료 중 오류', { 
        error: error.message,
        stack: error.stack 
      });
      return false;
    }
  }
  
  /**
   * 재연결 시도
   * @returns {Promise<boolean>} 재연결 시도 성공 여부
   */
  async reconnect() {
    // 이미 연결된 경우
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      logger.debug('WebSocketCore', '이미 연결됨, 재연결 불필요');
      return true;
    }
    
    // 최대 재연결 시도 횟수 확인
    if (this.reconnectAttempts >= WS_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      logger.error('WebSocketCore', '최대 재연결 시도 횟수 초과', {
        attempts: this.reconnectAttempts,
        max: WS_CONFIG.MAX_RECONNECT_ATTEMPTS
      });
      return false;
    }
    
    try {
      // 재연결 시도 이벤트 발생
      this._emitEvent(WS_EVENT.RECONNECTING, {
        attempt: this.reconnectAttempts + 1,
        maxAttempts: WS_CONFIG.MAX_RECONNECT_ATTEMPTS,
        timestamp: Date.now()
      });
      
      // 연결 시도 (타이머를 사용하지 않고 바로 시도)
      logger.info('WebSocketCore', '재연결 시도', { 
        attempt: this.reconnectAttempts + 1
      });
      
      // 기존 연결 종료
      if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
        this.disconnect(false);
      }
      
      // 새 연결 시작
      return await this.connect();
    } catch (error) {
      logger.error('WebSocketCore', '재연결 중 오류', { 
        error: error.message,
        stack: error.stack 
      });
      return false;
    }
  }
  
  /**
   * 메시지 전송
   * @param {string} type - 메시지 타입
   * @param {Object} data - 메시지 데이터
   * @returns {boolean} 전송 성공 여부
   */
  send(type, data = {}) {
    try {
      // 연결 확인
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        logger.warn('WebSocketCore', '연결되지 않은 상태에서 메시지 전송 시도', { type });
        return false;
      }
      
      // 메시지 객체 구성
      const message = {
        type,
        data,
        timestamp: new Date().toISOString()
      };
      
      // JSON 직렬화
      const jsonMessage = JSON.stringify(message);
      
      // 메시지 전송
      this.ws.send(jsonMessage);
      
      // 핑/퐁 이외의 메시지만 로깅
      if (WS_CONFIG.DEBUG_MODE && ![WS_EVENT.PING, WS_EVENT.PONG].includes(type)) {
        this._log(`메시지 전송: ${type}`, {
          size: jsonMessage.length,
          sample: jsonMessage.substring(0, 100) + (jsonMessage.length > 100 ? '...' : '')
        });
      }
      
      return true;
    } catch (error) {
      logger.error('WebSocketCore', '메시지 전송 중 오류', { 
        type,
        error: error.message,
        stack: error.stack 
      });
      return false;
    }
  }
  
  /**
   * 핑 메시지 전송
   * @returns {boolean} 전송 성공 여부
   */
  sendPing() {
    return this.send(WS_EVENT.PING, { 
      timestamp: new Date().toISOString(),
      sessionId: this._getSessionId() 
    });
  }

  /**
   * 메시지 타입 핸들러 등록
   * @param {string} type - 메시지 타입
   * @param {Function} handler - 핸들러 함수
   * @returns {Function} 핸들러 제거 함수
   */
  addHandler(type, handler) {
    if (!type || typeof handler !== 'function') {
      logger.warn('WebSocketCore', '잘못된 핸들러 등록 요청', { 
        type, 
        hasHandler: !!handler 
      });
      return () => {};
    }
    
    // 핸들러 맵 초기화
    if (!this.handlers) {
      this.handlers = new Map();
    }
    
    // 타입별 핸들러 목록 가져오기
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    
    // 핸들러 추가
    this.handlers.get(type).add(handler);
    
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
    if (!type || typeof handler !== 'function' || !this.handlers) {
      return false;
    }
    
    const handlers = this.handlers.get(type);
    if (!handlers) {
      return false;
    }
    
    const removed = handlers.delete(handler);
    
    // 핸들러가 없으면 해당 타입 항목 제거
    if (handlers.size === 0) {
      this.handlers.delete(type);
    }
    
    return removed;
  }
}

// 싱글톤 인스턴스
const webSocketCore = new WebSocketCore();

export default webSocketCore; 