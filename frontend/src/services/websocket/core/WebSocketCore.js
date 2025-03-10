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
    this.wsUrl = ''; // WebSocket URL 저장을 위한 프로퍼티
    
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

    // 연결 상태 관련 속성
    this.connectionTime = 0;           // 연결 시간 (타임스탬프)
    this.lastConnectAckTime = 0;       // 마지막 connect_ack 수신 시간
    this._connectionReady = false;     // 논리적 연결 준비 상태
    this._connectAckTimeoutId = null;  // connect_ack 타임아웃 ID
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
      // 기존 연결 정리
      this._cleanup();
      
      // 연결 상태 초기화
      this.state = WS_STATE.CONNECTING;
      this._connectAckProcessed = false;
      this._connectMessageSent = false;
      
      // 연결 실패 시 재시도 전 지연 시간 계산
      const reconnectDelay = this._calculateReconnectDelay();
      
      // 인증 토큰 가져오기
      let token = null;
      try {
        // sessionStorage에서 토큰 가져오기 시도
        token = sessionStorage.getItem('accessToken');
        
        // localStorage에서도 확인 (일부 앱에서는 localStorage에 저장할 수도 있음)
        if (!token) {
          token = localStorage.getItem('accessToken');
        }
        
        // JWT 형식 검증 (간단한 검사)
        if (token && !token.match(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/)) {
          logger.warn('WebSocketCore', '유효하지 않은 JWT 형식', { 
            tokenLength: token ? token.length : 0,
            hasToken: !!token
          });
          
          // 형식이 잘못된 경우 사용하지 않음
          token = null;
        }
      } catch (error) {
        logger.warn('WebSocketCore', '토큰 가져오기 실패', error);
      }
      
      // 토큰 상태 로깅
      logger.debug('WebSocketCore', '토큰 상태', { 
        hasToken: !!token, 
        tokenLength: token ? token.length : 0
      });
      
      // WebSocket URL 결정 (우선순위 적용)
      let wsUrl;
      
      // 1. 환경 변수에서 직접 접근 (가장 우선)
      try {
        wsUrl = process.env.REACT_APP_WS_URL;
        if (wsUrl) {
          logger.debug('WebSocketCore', '환경 변수에서 WebSocket URL 직접 로드', { url: wsUrl });
        }
      } catch (error) {
        logger.warn('WebSocketCore', '환경 변수 접근 중 오류', error);
      }
      
      // 2. WS_CONFIG에서 가져오기 (두 번째 우선순위)
      if (!wsUrl && WS_CONFIG.API_URL) {
        wsUrl = WS_CONFIG.API_URL;
        logger.debug('WebSocketCore', 'WS_CONFIG에서 WebSocket URL 로드', { url: wsUrl });
      }
      
      // 3. 하드코딩된 기본값 (마지막 수단)
      if (!wsUrl) {
        wsUrl = 'ws://localhost:8000/ws';
        logger.warn('WebSocketCore', '기본 WebSocket URL 사용', { url: wsUrl });
      }
      
      // 최종 URL 설정
      this.wsUrl = wsUrl;
      
      // 디버깅을 위한 URL 상태 로깅
      logger.info('WebSocketCore', 'WebSocket URL 결정됨', {
        url: this.wsUrl,
        source: process.env.REACT_APP_WS_URL ? 'env' : (WS_CONFIG.API_URL ? 'config' : 'default')
      });
      
      // URL 유효성 검사 (ws:// 프로토콜로 시작하는지 확인)
      if (!this.wsUrl || typeof this.wsUrl !== 'string' || !this.wsUrl.startsWith('ws')) {
        logger.error('WebSocketCore', '유효하지 않은 WebSocket URL', { url: this.wsUrl });
        this.wsUrl = 'ws://localhost:8000/ws'; // 기본값으로 설정
        logger.info('WebSocketCore', '기본 WebSocket URL로 설정됨', { url: this.wsUrl });
      }
      
      // /ws 경로가 포함되어 있는지 확인
      if (!this.wsUrl.includes('/ws')) {
        logger.warn('WebSocketCore', 'WebSocket URL에 /ws 경로가 누락됨. 추가합니다.', { originalUrl: this.wsUrl });
        this.wsUrl = this.wsUrl.endsWith('/') ? `${this.wsUrl}ws` : `${this.wsUrl}/ws`;
        logger.info('WebSocketCore', '수정된 WebSocket URL', { url: this.wsUrl });
      }
      
      // 토큰 추가
      if (token) {
        const separator = this.wsUrl.includes('?') ? '&' : '?';
        this.wsUrl = `${this.wsUrl}${separator}token=${encodeURIComponent(token)}`;
        logger.debug('WebSocketCore', '인증 토큰이 URL에 추가됨', { 
          urlHasToken: this.wsUrl.includes('token=')
        });
      } else {
        logger.warn('WebSocketCore', '인증 토큰 없이 연결 시도', { 
          url: this.wsUrl 
        });
      }
      
      // 디버그 로깅: 연결 시도 정보
      logger.info('WebSocketCore', '웹소켓 연결 시도', {
        apiUrl: this.wsUrl.replace(/token=([^&]+)/, 'token=REDACTED'), // 로그에서 토큰 가림
        connectionAttempts: this.reconnectAttempts,
        reconnectDelay,
        sessionId: this._getSessionId(),
        hasToken: !!token
      });
      
      // 연결 상태 이벤트 발생
      this._emitStateChanged();
      
      try {
        // WebSocket 인스턴스 생성
        this.ws = new WebSocket(this.wsUrl);
        
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
          stack: error.stack,
          url: this.wsUrl.replace(/token=([^&]+)/, 'token=REDACTED') // 로그에서 토큰 가림
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
      let wsInstance = this.ws; // 현재 웹소켓 인스턴스를 로컬 변수에 저장
      
      // 이벤트 리스너 제거 함수
      const cleanupListeners = () => {
        // 웹소켓 인스턴스가 아직 존재하는지 확인
        if (wsInstance) {
          try {
            wsInstance.removeEventListener('open', handleOpen);
            wsInstance.removeEventListener('error', handleError);
            wsInstance.removeEventListener('close', handleClose);
          } catch (e) {
            logger.error('WebSocketCore', '이벤트 리스너 제거 중 오류', e);
          }
        }
        
        if (this._timers.connectionTimeout) {
          clearTimeout(this._timers.connectionTimeout);
          this._timers.connectionTimeout = null;
        }
      };
      
      // 연결 성공 핸들러
      const handleOpen = () => {
        cleanupListeners();
        resolve(true);
      };
      
      // 연결 오류 핸들러
      const handleError = (error) => {
        cleanupListeners();
        logger.error('WebSocketCore', '연결 오류 발생', { 
          error: '연결 실패', // 이벤트 객체 대신 간단한 메시지 사용
          wsUrl: this.wsUrl ? this.wsUrl.replace(/token=([^&]+)/, 'token=REDACTED') : WS_CONFIG.API_URL
        });
        
        resolve(false);
      };
      
      // 연결 종료 핸들러 (연결 전 종료)
      const handleClose = (event) => {
        cleanupListeners();
        logger.warn('WebSocketCore', '연결 시도 중 종료됨', { 
          code: event.code,
          reason: event.reason || '알 수 없는 이유',
          wsUrl: this.wsUrl ? this.wsUrl.replace(/token=([^&]+)/, 'token=REDACTED') : WS_CONFIG.API_URL
        });
        
        resolve(false);
      };
      
      // 이벤트 리스너 추가
      if (wsInstance) {
        try {
          wsInstance.addEventListener('open', handleOpen);
          wsInstance.addEventListener('error', handleError);
          wsInstance.addEventListener('close', handleClose);
        } catch (e) {
          logger.error('WebSocketCore', '이벤트 리스너 등록 중 오류', e);
          resolve(false);
        }
      } else {
        logger.error('WebSocketCore', '웹소켓 인스턴스 없음');
        resolve(false);
      }
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
    
    // 저수준 이벤트 디버깅을 위한 원시 메시지 핸들러 (디버깅 용도)
    const originalOnMessage = this.ws.onmessage;
    this.ws.onmessage = (event) => {
      try {
        // 원시 메시지 로깅 (디버깅용)
        if (typeof event.data === 'string') {
          const maxLength = 500;
          const truncated = event.data.length > maxLength;
          const displayData = truncated 
            ? event.data.substring(0, maxLength) + '...[truncated]' 
            : event.data;
            
          // connect_ack 문자열 감지
          if (event.data.includes('connect_ack')) {
            logger.info('WebSocketCore', '원시 connect_ack 메시지 감지!', {
              rawMessage: displayData,
              time: new Date().toISOString(),
              messageSize: event.data.length
            });
          } else {
            logger.debug('WebSocketCore', '원시 웹소켓 메시지 수신', {
              rawMessage: displayData,
              time: new Date().toISOString(),
              messageSize: event.data.length
            });
          }
        } else {
          logger.debug('WebSocketCore', '비문자열 웹소켓 메시지 수신', {
            dataType: typeof event.data,
            isBinary: event.data instanceof ArrayBuffer,
            time: new Date().toISOString()
          });
        }
      } catch (e) {
        logger.error('WebSocketCore', '원시 메시지 로깅 중 오류', e);
      }
      
      // 원래 핸들러 호출
      if (originalOnMessage) originalOnMessage.call(this.ws, event);
    };

    // 일반 이벤트 핸들러 설정
    this.ws.onopen = (event) => this._handleOpen(event);
    this.ws.onclose = (event) => this._handleClose(event);
    this.ws.onerror = (error) => this._handleError(error);
    this.ws.onmessage = (event) => this._handleMessage(event);
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
   * 주기적으로 연결 상태 확인
   * @private
   */
  _checkConnectionStatus() {
    // 연결 끊김 상태면 무시
    if (!this.isConnected || this.state !== WS_STATE.CONNECTED) {
      return;
    }
    
    const now = Date.now();
    
    // Connect ACK 상태 확인 (물리적 연결 후 논리적 연결 대기)
    if (!this._connectAckProcessed) {
      // Connect ACK 타임아웃 설정 (15초)
      const connectAckTimeout = 15000; 
      
      // 연결 후 일정 시간 내에 Connect ACK를 받지 못한 경우
      if (this._connectionAttemptTime && (now - this._connectionAttemptTime > connectAckTimeout)) {
        // 심각도 높임: 이전에는 warn 레벨이었지만 실제로 중요한 문제임
        logger.error('WebSocketCore', 'Connect ACK 타임아웃, 연결 재시도 필요', {
          elapsedTime: now - this._connectionAttemptTime,
          timeout: connectAckTimeout,
          state: this.state
        });
        
        // 연결 재시도를 위한 연결 종료
        this.disconnect(false);
        setTimeout(() => this.reconnect(), 1000);
        return;
      }
      
      // 세션 정보 재전송 간격 (5초)
      const resendInterval = 5000;
      const lastSentTime = this._lastSessionInfoSent || 0;
      
      // 5초마다 세션 정보 재전송 시도
      if (now - lastSentTime > resendInterval) {
        logger.warn('WebSocketCore', 'connect_ack 메시지 없음, 세션 정보 재전송', {
          lastSentTime,
          elapsedTime: now - lastSentTime,
          connectionTime: now - this._connectionAttemptTime
        });
        
        // 세션 정보 재전송
        this._sendInitialSessionInfo();
      }
    }
    
    // 핑 메시지 전송 조건
    // - 마지막 메시지 수신 후 PING_INTERVAL 이상 시간이 경과
    // - PING_INTERVAL 기본값은 30초
    if (now - this.lastMessageTime > (WS_CONFIG.PING_INTERVAL || 30000)) {
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
   * 웹소켓 연결 성공 처리
   * @param {Event} event 웹소켓 연결 이벤트
   * @private
   */
  _handleOpen(event) {
    try {
      const now = Date.now();
      
      // 이전 타임아웃 정리
      if (this._connectTimeoutId) {
        clearTimeout(this._connectTimeoutId);
        this._connectTimeoutId = null;
      }
      
      // 연결 시간 측정 및 로깅
      this.connectionTime = now;
      
      logger.info('WebSocketCore', '웹소켓 연결 성공', {
        connectionTime: `${now}ms`,
        wsUrl: this._getSafeWsUrl()
      });
      
      // 연결 상태 업데이트
      this.state = WS_STATE.CONNECTED;
      
      // 상태 변경 이벤트 발생
      this._emitStateChanged();
      
      // 연결 이벤트 발생 (물리적 연결만 수립된 상태)
      eventSystem.emit(WS_EVENT.CONNECTED, {
        timestamp: now,
        connectionTime: now,
        isPhysicalConnection: true,
        isPendingAck: true  // 아직 connect_ack 대기 중
      });
      
      // 세션 정보 전송
      this._sendInitialSessionInfo();
      
      // 연결 상태 체크 타이머 설정
      this._setupConnectionCheckTimer();
      
      // connect_ack 타임아웃 설정 (백엔드 문제 방어를 위한 코드)
      // 5초 후에도 connect_ack가 안 오면 자동으로 준비 상태로 설정
      this._connectAckTimeoutId = setTimeout(() => {
        // connect_ack를 받았는지 확인
        if (!this._connectionReady) {
          logger.warn('WebSocketCore', 'connect_ack 대기 시간 초과, 자동 준비 상태로 전환', {
            connectionTime: this.connectionTime,
            currentTime: Date.now(),
            elapsedTime: Date.now() - this.connectionTime
          });
          
          // 준비 상태로 강제 설정
          this._connectionReady = true;
          this._isReady = true;
          
          // 상태 변경 이벤트 발생
          this._emitStateChanged();
          
          // connect_ack 이벤트 강제 발생 (자동 생성된 데이터)
          try {
            eventSystem.emit(WS_EVENT.CONNECT_ACK, {
              timestamp: Date.now(),
              sessionId: this.sessionId,
              connectionTime: this.connectionTime,
              isAutoGenerated: true,
              message: "자동 생성된 connect_ack (백엔드 응답 없음)"
            });
            
            logger.info('WebSocketCore', '자동 생성 connect_ack 이벤트 발생');
          } catch (autoAckError) {
            logger.error('WebSocketCore', '자동 connect_ack 이벤트 발생 중 오류', autoAckError);
          }
        }
      }, 5000);
      
    } catch (error) {
      logger.error('WebSocketCore', 'WebSocket 연결 성공 처리 중 오류', {
        error,
        stack: error.stack
      });
    }
  }
  
  /**
   * 웹소켓 메시지 수신 처리
   * @param {MessageEvent} event 웹소켓 메시지 이벤트
   * @private
   */
  _handleMessage(event) {
    try {
      // 마지막 메시지 수신 시간 업데이트
      this.lastMessageTime = Date.now();
      
      // 원시 메시지 디버깅 (connect_ack 빠른 감지용)
      if (typeof event.data === 'string') {
        // connect_ack 문자열 포함 여부 검사 (빠른 감지)
        if (event.data.includes('connect_ack')) {
          const sampleData = event.data.length > 200 
            ? event.data.substring(0, 200) + '...' 
            : event.data;
            
          logger.info('WebSocketCore', 'connect_ack 문자열 포함된 원시 메시지 감지', { 
            sampleData,
            timestamp: new Date().toISOString()
          });
          
          // 빠른 처리 시도 (JSON 파싱 전에)
          try {
            const rawData = JSON.parse(event.data);
            if (
              rawData.type === 'connect_ack' || 
              (rawData.data && rawData.data.type === 'connect_ack')
            ) {
              // 데이터 추출 및 카멜케이스 변환
              let ackData = rawData.data || rawData;
              ackData = this._convertToCamelCase(ackData);
              
              // connect_ack 직접 처리
              logger.debug('WebSocketCore', 'connect_ack 빠른 처리 시도');
              this._handleConnectAck(ackData);
            }
          } catch (quickParseError) {
            logger.warn('WebSocketCore', 'connect_ack 빠른 처리 시도 중 오류', {
              error: quickParseError
            });
            // 오류 발생해도 일반 처리는 계속 진행
          }
        }
      }
      
      // 메시지 파싱
      let parsed;
      try {
        parsed = this._parseMessage(event);
      } catch (parseError) {
        logger.warn('WebSocketCore', '메시지 파싱 실패', { 
          error: parseError,
          rawData: typeof event.data === 'string' ? 
            event.data.substring(0, 100) + '...' : 'non-string data'
        });
        return;
      }
      
      const { type, data } = parsed;
      
      // 타입이 없는 경우 처리
      if (!type) {
        logger.warn('WebSocketCore', '알 수 없는 메시지 타입', { 
          data,
          rawData: typeof event.data === 'string' ? event.data.substring(0, 200) : 'non-string data' 
        });
        return;
      }
      
      // 디버깅을 위해 모든 메시지 로깅
      logger.debug('WebSocketCore', '메시지 파싱 결과', {
        type: type,
        typeType: typeof type,
        typeExists: !!type,
        typeIsString: typeof type === 'string',
        data: data
      });
      
      // 타입별 이벤트 발생 (타입 검증 강화)
      if (type && typeof type === 'string') {
        this._emitEvent(type, data);
        
        // 일반 메시지 이벤트 발생 (모든 메시지)
        if (type !== WS_EVENT.MESSAGE) {
          this._emitEvent(WS_EVENT.MESSAGE, { type, data });
        }
      } else {
        logger.error('WebSocketCore', '유효하지 않은 이벤트 타입', {
          type: type,
          typeType: typeof type,
          data: data
        });
      }
      
      // 특별 메시지 처리
      if (type === WS_EVENT.CONNECT_ACK) {
        this._handleConnectAck(data);
      } 
      else if (type === WS_EVENT.PING) {
        this._handlePing(data);
      } 
      else if (type === WS_EVENT.PONG) {
        this._handlePong(data);
      }
      
    } catch (error) {
      // 전역 예외 처리
      logger.error('WebSocketCore', '_handleMessage 전역 예외', {
        error,
        stack: error.stack
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
   * WebSocket 오류 처리
   * @param {Event} errorEvent - WebSocket 오류 이벤트
   * @private
   */
  _handleError(errorEvent) {
    try {
      // 오류 정보 추출 (Event 객체에서 직접 정보 추출은 어려움)
      const errorInfo = {
        type: 'WebSocket Error',
        timestamp: Date.now(),
        readyState: this.ws ? this.ws.readyState : 'no socket',
        wsUrl: this.wsUrl ? this.wsUrl.replace(/token=([^&]+)/, 'token=REDACTED') : WS_CONFIG.API_URL
      };
      
      // 오류 로깅
      logger.error('WebSocketCore', '웹소켓 오류 발생', errorInfo);
      
      // 이벤트 발생: 오류
      this._emitEvent(WS_EVENT.ERROR, {
        error: '웹소켓 연결 오류',
        timestamp: Date.now(),
        details: errorInfo
      });
      
      // 추가 오류 처리 로직
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.close(1000, '오류로 인한 종료');
        } catch (closeError) {
          logger.error('WebSocketCore', 'WebSocket.close() 호출 중 오류', closeError);
        }
      }
      
      // 연결 상태 업데이트
      this.state = WS_STATE.ERROR;
      
      // 자동 재연결 활성화된 경우 재연결 시도
      if (this.autoReconnect && !this._isConnecting) {
        logger.info('WebSocketCore', '오류 후 자동 재연결 시도');
        
        // 바로 재연결하지 않고 짧은 지연 후 재연결
        setTimeout(() => this.reconnect(), 500);
      }
    } catch (error) {
      logger.error('WebSocketCore', '오류 처리 중 추가 오류 발생', error);
    }
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
    try {
      // 이미 연결이 끊어졌거나 소켓이 없는 경우 처리 중단
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        logger.warn('WebSocketCore', '세션 정보 전송 불가 - 웹소켓 연결 없음', {
          hasWs: !!this.ws,
          readyState: this.ws ? this.ws.readyState : 'none'
        });
        return;
      }
      
      // 세션 정보 생성
      const now = Date.now();
      
      // 세션 ID 관리
      if (!this.sessionId) {
        this.sessionId = `ws_${now}_${Math.random().toString(36).substring(2, 10)}`;
        logger.debug('WebSocketCore', '새 세션 ID 생성', { sessionId: this.sessionId });
      }
      
      // 세션 정보 구성
      const sessionInfo = {
        type: "session_info",
        data: {
          session_id: this.sessionId,
          user_agent: navigator.userAgent,
          platform: navigator.platform,
          path: window.location.pathname,
          timestamp: now,
          has_token: !!this._getTokenFromStorage()
        }
      };
      
      // 전송 시도 횟수 기록 (디버깅용)
      this._sessionInfoAttempts = (this._sessionInfoAttempts || 0) + 1;
      
      // 세션 정보 로깅
      logger.info('WebSocketCore', '세션 정보 전송', {
        attempt: this._sessionInfoAttempts,
        sessionId: sessionInfo.data.session_id
      });
      
      // 세션 정보 전송
      try {
        if (typeof this.ws.send === 'function') {
          this.ws.send(JSON.stringify(sessionInfo));
          
          // 세션 정보 전송 성공 로깅
          logger.debug('WebSocketCore', '세션 정보 전송 성공', {
            timestamp: now,
            sessionData: {
              ...sessionInfo.data,
              session_id: sessionInfo.data.session_id.substring(0, 10) + '...' // 세션 ID 일부만 로깅
            }
          });
          
          // 전송 시간 기록
          this._lastSessionInfoSentTime = now;
        } else {
          logger.error('WebSocketCore', '웹소켓 send 메서드 없음', {
            wsObject: typeof this.ws,
            sendMethod: typeof this.ws.send
          });
        }
      } catch (sendError) {
        logger.error('WebSocketCore', '세션 정보 전송 실패', {
          error: sendError,
          state: this.state
        });
      }
      
      // 백엔드 응답이 없을 경우를 대비한 자동 재전송 설정 (백엔드 문제 방어를 위한 코드)
      clearTimeout(this._sessionInfoTimeoutId);
      this._sessionInfoTimeoutId = setTimeout(() => {
        // connect_ack를 받지 않은 경우에만 재전송
        if (!this._connectionReady) {
          const now = Date.now();
          logger.warn('WebSocketCore', 'connect_ack 메시지 없음, 세션 정보 재전송', {
            lastSentTime: this._lastSessionInfoSentTime,
            elapsedTime: now - this._lastSessionInfoSentTime,
            connectionTime: now
          });
          this._sendInitialSessionInfo();
        }
      }, 5000);
      
    } catch (error) {
      logger.error('WebSocketCore', '세션 정보 전송 중 오류', {
        error,
        stack: error.stack
      });
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
   * 웹소켓 메시지 파싱 및 검증
   * @param {MessageEvent} messageEvent 웹소켓 메시지 이벤트
   * @returns {Object} 파싱된 메시지 객체 (type, data)
   * @private
   */
  _parseMessage(messageEvent) {
    let messageData;
    let type = null;
    let data = null;

    try {
      // 원시 데이터 파싱
      if (typeof messageEvent.data === 'string') {
        messageData = JSON.parse(messageEvent.data);
        
        // 원본 메시지 connect_ack 문자열 검사 (특별 처리)
        if (messageEvent.data.includes('connect_ack')) {
          logger.debug('WebSocketCore', 'connect_ack 문자열 포함된 원본 메시지 감지', {
            sample: messageEvent.data.substring(0, 100) + '...'
          });
        }
      } else if (messageEvent.data instanceof ArrayBuffer) {
        // 바이너리 데이터 처리 (필요시 구현)
        logger.warn('WebSocketCore', '바이너리 메시지 수신됨 - 현재 미지원', { 
          size: messageEvent.data.byteLength 
        });
        return { type: null, data: null };
      } else {
        logger.warn('WebSocketCore', '지원되지 않는 메시지 형식', { 
          dataType: typeof messageEvent.data 
        });
        return { type: null, data: null };
      }

      // connect_ack 특별 감지 (다양한 서버 응답 형식 지원)
      if (
        // 직접 타입이 connect_ack인 경우
        (messageData.type === 'connect_ack') || 
        // 상수와 일치하는 경우
        (messageData.type === WS_EVENT.CONNECT_ACK) ||
        // message_type이 connect_ack인 경우
        (messageData.message_type === 'connect_ack') ||
        // 중첩된 데이터 구조인 경우
        (typeof messageData.data === 'object' && messageData.data && messageData.data.type === 'connect_ack')
      ) {
        logger.info('WebSocketCore', 'connect_ack 메시지 감지됨', {
          detectionPath: messageData.type === 'connect_ack' ? 'direct' : 
                       messageData.type === WS_EVENT.CONNECT_ACK ? 'event_const' :
                       messageData.message_type === 'connect_ack' ? 'message_type' : 'nested',
          connectAckConst: WS_EVENT.CONNECT_ACK
        });
        
        // 타입을 표준화 (문자열 확인)
        type = WS_EVENT.CONNECT_ACK;
        logger.debug('WebSocketCore', 'connect_ack 타입 설정됨', {
          typeValue: type,
          typeIsString: typeof type === 'string',
          typeIsEmpty: !type
        });
        
        // 다양한 형식의 데이터 구조 처리
        if (messageData.data) {
          data = messageData.data;
        } else {
          // 데이터 필드가 없는 경우 메시지 자체를 데이터로 사용
          const { type: _, ...rest } = messageData;
          data = Object.keys(rest).length > 0 ? rest : {};
        }
        
        // 카멜케이스로 변환
        data = this._convertToCamelCase(data);
        
        return { type: WS_EVENT.CONNECT_ACK, data }; // 타입을 명시적으로 지정
      }

      // 일반 메시지 처리
      if (messageData && typeof messageData === 'object') {
        // 메시지 타입 추출
        type = messageData.type || messageData.message_type || 'unknown';
        
        // 데이터 필드 추출 (다양한 형식 지원)
        if (messageData.data !== undefined) {
          data = messageData.data;
        } else if (messageData.message !== undefined) {
          data = messageData.message;
        } else {
          // 타입 정보만 있는 경우 나머지를 데이터로 취급
          const { type: _, message_type: __, ...rest } = messageData;
          data = Object.keys(rest).length > 0 ? rest : {};
        }
        
        // 카멜케이스 변환
        if (data) {
          data = this._convertToCamelCase(data);
        }
      } else {
        logger.warn('WebSocketCore', '유효하지 않은 메시지 구조', { messageData });
      }

    } catch (error) {
      logger.error('WebSocketCore', '메시지 파싱 오류', { 
        error, 
        rawData: typeof messageEvent.data === 'string' 
          ? (messageEvent.data.length > 100 ? messageEvent.data.substring(0, 100) + '...' : messageEvent.data)
          : 'non-string data'
      });
    }

    return { type, data };
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
   * connect_ack 메시지 처리
   * @param {Object} data - connect_ack 메시지 데이터
   * @private
   */
  _handleConnectAck(data) {
    try {
      const now = Date.now();
      
      logger.info('WebSocketCore', 'connect_ack 메시지 수신', {
        timestamp: now,
        processingDelay: now - (this.connectionTime || now),
        dataKeys: data ? Object.keys(data) : []
      });
      
      // 타입 존재 여부 확인 및 후처리
      if (data && data.type === 'connect_ack') {
        // 중첩된 데이터 구조 처리 
        data = {
          ...data,
          type: undefined // 타입 제거하여 혼란 방지
        };
      }
      
      // 연결 준비 상태 설정
      this._connectionReady = true;
      
      // 세션 ID 업데이트 (있는 경우에만)
      if (data && data.sessionId) {
        this.sessionId = data.sessionId;
        logger.debug('WebSocketCore', '세션 ID 업데이트', { sessionId: this.sessionId });
      }
      
      // 사용자 연결 정보 처리 (있는 경우에만)
      if (data && data.connectionInfo) {
        // 다중 연결 감지 및 처리
        if (data.connectionInfo.userConnections > 1) {
          this._handleMultipleConnections(data.connectionInfo.userConnections);
        }
      }
      
      // 연결 상태 업데이트 및 이벤트 발생
      this.state = WS_STATE.CONNECTED;
      this._isReady = true;
      
      // 상태 변경 이벤트 발생
      this._emitStateChanged();
      
      // connect_ack 이벤트 발생 (직접 eventSystem 호출)
      // _emitEvent를 우회하여 타입 문제 방지
      try {
        eventSystem.emit(WS_EVENT.CONNECT_ACK, {
          timestamp: now,
          sessionId: this.sessionId,
          connectionTime: this.connectionTime || now,
          ...(data || {})
        });
        
        logger.info('WebSocketCore', 'connect_ack 이벤트 직접 발생 성공');
      } catch (emitError) {
        logger.error('WebSocketCore', 'connect_ack 이벤트 발생 실패', {
          error: emitError,
          stack: emitError.stack
        });
      }
      
      logger.info('WebSocketCore', 'connect_ack 처리 완료, 연결 준비 상태로 전환');
      
    } catch (error) {
      logger.error('WebSocketCore', 'connect_ack 처리 중 오류', {
        error,
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
            this.ws.close(1000, '연결 시간 초과');
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
   * 이벤트 발생
   * @param {string} eventType - 이벤트 타입
   * @param {*} eventData - 이벤트 데이터
   * @private
   */
  _emitEvent(eventType, eventData = null) {
    // 성능 모니터링 (개발 모드)
    const startTime = WS_CONFIG.DEBUG_MODE ? performance.now() : 0;
    
    try {
      // 이벤트 타입 검증 (더 상세한 로깅)
      if (!eventType) {
        const error = new Error('이벤트 타입이 누락되었습니다');
        logger.error('WebSocketCore', '이벤트 타입 누락 (undefined/null)', { 
          event: eventType, 
          eventTypeOf: typeof eventType,
          dataType: eventData && eventData.type,
          data: eventData,
          stack: error.stack,
          wsEventConsts: Object.entries(WS_EVENT).map(([k, v]) => `${k}=${v}`)
        });
        return;
      }
      
      // 문자열이 아닌 이벤트 타입 변환
      let safeEventType = eventType;
      if (typeof eventType !== 'string') {
        logger.warn('WebSocketCore', '문자열이 아닌 이벤트 타입 자동 변환', {
          originalEvent: eventType,
          originalType: typeof eventType,
          connectAckConst: WS_EVENT.CONNECT_ACK,
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
      
      // connect_ack 이벤트인 경우 특별 처리 (타입 보장)
      if (safeEventType === 'connect_ack' || safeEventType === WS_EVENT.CONNECT_ACK) {
        safeEventType = WS_EVENT.CONNECT_ACK; // 항상 상수 사용
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

  /**
   * 토큰 정보가 제거된 안전한 WebSocket URL 반환
   * @returns {string} 로깅용 안전한 WebSocket URL
   * @private
   */
  _getSafeWsUrl() {
    if (!this.wsUrl) return 'unknown';
    
    // URL에서 토큰 파라미터 가리기
    return this.wsUrl.replace(/token=([^&]+)/, 'token=REDACTED');
  }

  /**
   * 세션 스토리지에서 인증 토큰 가져오기
   * @returns {string|null} 인증 토큰 또는 null
   * @private
   */
  _getTokenFromStorage() {
    try {
      const token = sessionStorage.getItem('accessToken');
      return token;
    } catch (error) {
      logger.warn('WebSocketCore', '토큰 가져오기 실패', {
        error,
        timestamp: Date.now()
      });
      return null;
    }
  }
}

// 싱글톤 인스턴스
const webSocketCore = new WebSocketCore();

export default webSocketCore;