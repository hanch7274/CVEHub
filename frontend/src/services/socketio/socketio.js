import { io } from 'socket.io-client';
import { SOCKET_EVENTS, SOCKET_STATE } from './constants';
import logger from './loggingService';
import { getAccessToken } from '../../utils/storage/tokenStorage';
import { getSocketIOURL } from './utils';
import { WS_BASE_URL, SOCKET_IO_PATH, CASE_CONVERSION } from '../../config';
import { snakeToCamel, camelToSnake } from '../../utils/caseConverter';
import { getAPITimestamp, formatToKST, DATE_FORMATS, formatInTimeZone } from '../../utils/dateUtils';

// 변환에서 제외할 필드 목록 (config에서 가져옴)
const EXCLUDED_FIELDS = CASE_CONVERSION.EXCLUDED_FIELDS;

class SocketIOService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.connectionState = SOCKET_STATE.DISCONNECTED;
    this.listeners = {};
    this.options = this._createOptions();
    this.pingInterval = null;
  }

  // 설정 옵션 생성
  _createOptions() {
    const token = getAccessToken();
    
    // 토큰이 비어있는지 확인하고 로그 출력
    if (!token || token.trim() === '') {
      logger.warn('SocketIOService', '인증 토큰이 없습니다. 웹소켓 연결이 실패할 수 있습니다.');
    } else {
      // 토큰 디버깅을 위한 상세 정보 출력
      try {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          const [header, payload, signature] = tokenParts;
          const decodedPayload = JSON.parse(atob(payload));
          logger.debug('SocketIOService', '토큰 디버깅 정보', {
            tokenLength: token.length,
            tokenPreview: `${token.substring(0, 15)}...${token.substring(token.length - 5)}`,
            exp: decodedPayload.exp,
            iat: decodedPayload.iat,
            sub: decodedPayload.sub,
            expiresIn: decodedPayload.exp ? formatInTimeZone(new Date(decodedPayload.exp * 1000), 'Asia/Seoul', DATE_FORMATS.API) : 'unknown',
            currentTime: formatInTimeZone(new Date(), 'Asia/Seoul', DATE_FORMATS.API),
            timeLeft: decodedPayload.exp ? Math.floor((decodedPayload.exp * 1000 - Date.now()) / 1000) + '초' : 'unknown'
          });
        } else {
          logger.error('SocketIOService', '토큰 형식이 잘못되었습니다', { tokenFormat: token.substring(0, 10) + '...' });
        }
      } catch (e) {
        logger.error('SocketIOService', '토큰 디코딩 중 오류 발생', { error: e.message });
      }
    }
    
    // 상세 옵션 로깅
    const options = {
      // Socket.IO 서버가 백엔드에서 SOCKET_IO_PATH 경로에 마운트됨
      path: SOCKET_IO_PATH,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      
      // 인증 정보 전달 - 토큰을 auth 객체에 포함
      auth: {
        token: token
      },
      
      // 추가 디버깅 정보
      extraHeaders: {
        'Authorization': `Bearer ${token}`
      }
    };
    
    logger.debug('SocketIOService', '소켓 옵션 생성', {
      path: options.path,
      transports: options.transports,
      reconnection: options.reconnection,
      hasToken: !!token,
      tokenLength: token ? token.length : 0
    });
    
    return options;
  }

  // 연결 초기화
  connect(url) {
    try {
      // 이미 연결된 경우 중복 연결 방지
      if (this.socket && this.isConnected) {
        logger.warn('SocketIOService', '이미 연결되어 있습니다');
        return;
      }

      // 기존 소켓이 있으면 정리
      if (this.socket) {
        logger.info('SocketIOService', '기존 소켓 정리 후 재연결 시도');
        this.disconnect();
      }
      
      // 연결 상태 업데이트
      this._updateConnectionState(SOCKET_STATE.CONNECTING);
      
      // 소켓 URL 결정
      const socketUrl = url || getSocketIOURL();
      
      // 연결 시도 전 상세 로깅
      logger.info('SocketIOService', '웹소켓 연결 시도', { 
        url: socketUrl,
        connectionState: this.connectionState,
        hasExistingSocket: !!this.socket
      });
      
      // 토큰 재확인
      const token = getAccessToken();
      
      // 토큰 상세 로깅 (보안을 위해 일부만 표시)
      if (!token) {
        logger.error('SocketIOService', '연결 실패: 인증 토큰이 없습니다');
        this._updateConnectionState(SOCKET_STATE.ERROR);
        this._notifyListeners(SOCKET_EVENTS.CONNECT_ERROR, { message: '인증 토큰이 없습니다' });
        return;
      } else {
        try {
          const tokenParts = token.split('.');
          if (tokenParts.length === 3) {
            const [header, payload, signature] = tokenParts;
            try {
              const decodedPayload = JSON.parse(atob(payload));
              const expiresAt = decodedPayload.exp * 1000;
              const currentTime = Date.now();
              const timeLeft = Math.floor((expiresAt - currentTime) / 1000);
              
              logger.debug('SocketIOService', '토큰 검증', {
                tokenExists: true,
                tokenLength: token.length,
                tokenPrefix: token.substring(0, 10) + '...',
                tokenSuffix: '...' + token.substring(token.length - 5),
                isExpired: expiresAt < currentTime,
                timeLeft: timeLeft + '초',
                expiresAt: formatInTimeZone(new Date(expiresAt), 'Asia/Seoul', DATE_FORMATS.API),
                currentTime: formatInTimeZone(new Date(currentTime), 'Asia/Seoul', DATE_FORMATS.API)
              });
              
              if (expiresAt < currentTime) {
                logger.error('SocketIOService', '연결 실패: 인증 토큰이 만료되었습니다', {
                  expiresAt: formatInTimeZone(new Date(expiresAt), 'Asia/Seoul', DATE_FORMATS.API),
                  currentTime: formatInTimeZone(new Date(currentTime), 'Asia/Seoul', DATE_FORMATS.API)
                });
                this._updateConnectionState(SOCKET_STATE.ERROR);
                this._notifyListeners(SOCKET_EVENTS.CONNECT_ERROR, { message: '인증 토큰이 만료되었습니다' });
                return;
              }
            } catch (e) {
              logger.error('SocketIOService', '토큰 페이로드 디코딩 실패', { error: e.message });
            }
          } else {
            logger.warn('SocketIOService', '토큰 형식이 JWT 표준과 다릅니다', { 
              tokenLength: token.length,
              partsCount: tokenParts.length 
            });
          }
        } catch (e) {
          logger.error('SocketIOService', '토큰 검증 중 오류 발생', { error: e.message });
        }
      }
      
      // 옵션 업데이트 (토큰이 변경되었을 수 있음)
      this.options = this._createOptions();
      
      // 연결 시도 전 옵션 로깅
      logger.debug('SocketIOService', '연결 옵션', {
        path: this.options.path,
        transports: this.options.transports,
        reconnection: this.options.reconnection,
        auth: { hasToken: !!this.options.auth.token }
      });
      
      // 소켓 생성 및 연결
      this.socket = io(socketUrl, this.options);
      
      logger.debug('SocketIOService', '소켓 객체 생성됨', {
        socketExists: !!this.socket,
        socketId: this.socket?.id,
        connected: this.socket?.connected
      });
      
      // 연결 이벤트 핸들러 설정
      this.socket.on(SOCKET_EVENTS.CONNECT, () => {
        logger.info('SocketIOService', '웹소켓 연결 성공');
        this._updateConnectionState(SOCKET_STATE.CONNECTED);
        this._notifyListeners(SOCKET_EVENTS.CONNECT);
        
        // 연결 후 소켓 ID 및 핸드셰이크 데이터 로깅
        logger.debug('SocketIOService', '소켓 연결 정보', {
          socketId: this.socket.id,
          transport: this.socket.io.engine.transport.name,
          protocol: this.socket.io.engine.protocol,
          connected: this.socket.connected,
          auth: this.socket.auth
        });
        
        // 연결 성공 후 핑 타이머 시작
        this._startPingTimer();
      });

      this.socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
        logger.info('SocketIOService', '웹소켓 연결 해제', { reason });
        this._updateConnectionState(SOCKET_STATE.DISCONNECTED);
        this._notifyListeners(SOCKET_EVENTS.DISCONNECT, { reason });
      });

      this.socket.on(SOCKET_EVENTS.CONNECT_ERROR, (error) => {
        // 연결 오류 상세 정보 로깅
        logger.error('SocketIOService', '연결 오류', { 
          message: error.message || '알 수 없는 오류',
          type: error.type,
          description: error.description,
          context: error.context,
          stack: error.stack,
          errorObject: JSON.stringify(error, Object.getOwnPropertyNames(error))
        });
        
        this._updateConnectionState(SOCKET_STATE.ERROR);
        this._notifyListeners(SOCKET_EVENTS.CONNECT_ERROR, error);
      });
      
      // 자동으로 연결 확인 메시지 수신
      this.socket.on(SOCKET_EVENTS.CONNECT_ACK, (data) => {
        logger.info('SocketIOService', '연결 확인 메시지 수신', data);
        this._notifyListeners(SOCKET_EVENTS.CONNECT_ACK, this._convertDataCasing(data));
      });
      
      // 알림 메시지 수신
      this.socket.on(SOCKET_EVENTS.NOTIFICATION, (data) => {
        logger.info('SocketIOService', '알림 메시지 수신', data);
        this._notifyListeners(SOCKET_EVENTS.NOTIFICATION, this._convertDataCasing(data));
      });
      
      // CVE 업데이트 메시지 수신
      this.socket.on(SOCKET_EVENTS.CVE_UPDATED, (data) => {
        logger.info('SocketIOService', 'CVE 업데이트 메시지 수신', data);
        this._notifyListeners(SOCKET_EVENTS.CVE_UPDATED, this._convertDataCasing(data));
      });
      
      // CVE 생성 메시지 수신
      this.socket.on(SOCKET_EVENTS.CVE_CREATED, (data) => {
        logger.info('SocketIOService', 'CVE 생성 메시지 수신', data);
        this._notifyListeners(SOCKET_EVENTS.CVE_CREATED, this._convertDataCasing(data));
      });
      
      // CVE 삭제 메시지 수신
      this.socket.on(SOCKET_EVENTS.CVE_DELETED, (data) => {
        logger.info('SocketIOService', 'CVE 삭제 메시지 수신', data);
        this._notifyListeners(SOCKET_EVENTS.CVE_DELETED, this._convertDataCasing(data));
      });
      
      // 구독 확인 메시지 수신
      this.socket.on(SOCKET_EVENTS.SUBSCRIBE_ACK, (data) => {
        logger.info('SocketIOService', '구독 확인 메시지 수신', {
          eventName: SOCKET_EVENTS.SUBSCRIBE_ACK,
          dataType: typeof data,
          dataKeys: data ? Object.keys(data) : [],
          rawData: data
        });
        this._notifyListeners(SOCKET_EVENTS.SUBSCRIBE_ACK, this._convertDataCasing(data));
      });
      
      // 구독 해제 확인 메시지 수신
      this.socket.on(SOCKET_EVENTS.UNSUBSCRIBE_ACK, (data) => {
        logger.info('SocketIOService', '구독 해제 확인 메시지 수신', {
          eventName: SOCKET_EVENTS.UNSUBSCRIBE_ACK,
          dataType: typeof data,
          dataKeys: data ? Object.keys(data) : [],
          rawData: data
        });
        this._notifyListeners(SOCKET_EVENTS.UNSUBSCRIBE_ACK, this._convertDataCasing(data));
      });
      
      // 오류 메시지 수신
      this.socket.on(SOCKET_EVENTS.ERROR, (data) => {
        logger.error('SocketIOService', '오류 메시지 수신', data);
        this._notifyListeners(SOCKET_EVENTS.ERROR, this._convertDataCasing(data));
      });
      
      // 핑/퐁 메시지 처리
      this.socket.on(SOCKET_EVENTS.PONG, (data) => {
        logger.debug('SocketIOService', '퐁 메시지 수신', {
          eventName: SOCKET_EVENTS.PONG,
          dataType: typeof data,
          dataKeys: data ? Object.keys(data) : [],
          rawData: data
        });
        this._notifyListeners(SOCKET_EVENTS.PONG, this._convertDataCasing(data));
      });
      
    } catch (error) {
      logger.error('SocketIOService', '연결 중 예외 발생', error);
      this._updateConnectionState(SOCKET_STATE.ERROR);
      this._notifyListeners(SOCKET_EVENTS.ERROR, { error });
    }
  }

  // 연결 종료
  disconnect() {
    try {
      if (this.socket) {
        logger.info('SocketIOService', '연결 종료 요청');
        
        // 핑 타이머 정리
        this._clearPingTimer();
        
        this.socket.disconnect();
        this.socket = null;
        this._updateConnectionState(SOCKET_STATE.DISCONNECTED);
      }
    } catch (error) {
      logger.error('SocketIOService', '연결 종료 중 오류 발생', error);
    }
  }

  // 이벤트 리스너 등록
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    
    return () => {
      this.off(event, callback);
    };
  }

  // 이벤트 리스너 제거
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  // 모든 리스너에게 이벤트 알림
  _notifyListeners(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error('SocketIOService', `리스너 호출 중 오류 (${event})`, error);
        }
      });
    }
  }
  
  // 데이터 케이싱 변환 (snake_case -> camelCase)
  _convertDataCasing(data) {
    try {
      logger.debug('SocketIOService', '데이터 케이싱 변환 시작', {
        dataType: data === null ? 'null' : typeof data,
        isArray: Array.isArray(data),
        hasData: data !== null && data !== undefined,
        originalData: data
      });
      
      const convertedData = snakeToCamel(data, { 
        isTopLevel: true, 
        excludeFields: EXCLUDED_FIELDS 
      });
      
      logger.debug('SocketIOService', '데이터 케이싱 변환 완료', {
        originalKeys: data && typeof data === 'object' ? Object.keys(data) : [],
        convertedKeys: convertedData && typeof convertedData === 'object' ? Object.keys(convertedData) : [],
        convertedData: convertedData
      });
      
      return convertedData;
    } catch (error) {
      logger.error('SocketIOService', '데이터 케이싱 변환 중 오류', {
        error: error.message,
        stack: error.stack,
        data: data
      });
      return data;
    }
  }
  
  // CVE 구독
  subscribeToCVE(cveId, sessionId) {
    if (!this.socket || !this.isConnected) {
      logger.warn('SocketIOService', 'CVE 구독 실패: 연결되지 않음');
      return false;
    }
    
    if (!cveId) {
      logger.warn('SocketIOService', 'CVE 구독 실패: CVE ID 누락');
      return false;
    }
    
    try {
      // snake_case로 변환하여 전송
      const data = { cve_id: cveId, session_id: sessionId };
      
      logger.info('SocketIOService', 'CVE 구독 요청', { cveId, sessionId });
      this.socket.emit('subscribe_cve', data);
      return true;
    } catch (error) {
      logger.error('SocketIOService', 'CVE 구독 중 오류', error);
      return false;
    }
  }
  
  // CVE 구독 해제
  unsubscribeFromCVE(cveId, sessionId) {
    if (!this.socket || !this.isConnected) {
      logger.warn('SocketIOService', 'CVE 구독 해제 실패: 연결되지 않음');
      return false;
    }
    
    if (!cveId) {
      logger.warn('SocketIOService', 'CVE 구독 해제 실패: CVE ID 누락');
      return false;
    }
    
    try {
      // snake_case로 변환하여 전송
      const data = camelToSnake({
        cveId,
        sessionId
      }, { excludeFields: EXCLUDED_FIELDS });
      
      logger.info('SocketIOService', 'CVE 구독 해제 요청', { cveId, sessionId });
      this.socket.emit('unsubscribe_cve', data);
      return true;
    } catch (error) {
      logger.error('SocketIOService', 'CVE 구독 해제 중 오류', error);
      return false;
    }
  }
  
  // 핑 메시지 전송
  sendPing() {
    if (!this.socket || !this.isConnected) {
      logger.warn('SocketIOService', '핑 메시지 전송 실패: 연결되지 않음');
      return false;
    }
    
    try {
      const pingData = camelToSnake({
        timestamp: getAPITimestamp(),
        clientId: this.socket.id
      }, { excludeFields: EXCLUDED_FIELDS });
      
      logger.debug('SocketIOService', '핑 메시지 전송', pingData);
      this.socket.emit(SOCKET_EVENTS.PING, pingData);
      return true;
    } catch (error) {
      logger.error('SocketIOService', '핑 메시지 전송 중 오류', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }
  
  // 핑 타이머 시작
  _startPingTimer() {
    // 기존 타이머가 있으면 정리
    this._clearPingTimer();
    
    // 30초마다 핑 메시지 전송
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, 30000); // 30초
    
    logger.debug('SocketIOService', '핑 타이머 시작됨');
  }
  
  // 핑 타이머 정리
  _clearPingTimer() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      logger.debug('SocketIOService', '핑 타이머 정리됨');
    }
  }
  
  // 연결 상태 확인
  isSocketConnected() {
    return this.isConnected;
  }
  
  // 연결 상태 확인
  isConnected() {
    return this.isConnected;
  }
  
  // 연결 상태 조회
  getConnectionState() {
    return {
      state: this.connectionState,
      isConnected: this.isConnected,
      socketExists: !!this.socket,
      socketId: this.socket?.id,
      socketConnected: this.socket?.connected,
      hasListeners: Object.keys(this.listeners).length > 0
    };
  }

  // 연결 상태 업데이트 및 알림
  _updateConnectionState(newState) {
    // 상태가 변경된 경우에만 로깅 및 알림
    if (this.connectionState !== newState) {
      logger.info('SocketIOService', `연결 상태 변경: ${this.connectionState} -> ${newState}`);
      this.connectionState = newState;
      
      // 연결 상태에 따라 isConnected 값 업데이트
      if (newState === SOCKET_STATE.CONNECTED) {
        this.isConnected = true;
      } else if (newState === SOCKET_STATE.DISCONNECTED || newState === SOCKET_STATE.ERROR) {
        this.isConnected = false;
      }
      
      // 연결 상태 변경 이벤트 발생
      this._notifyListeners(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, {
        state: newState,
        isConnected: this.isConnected,
        timestamp: formatInTimeZone(new Date(), 'Asia/Seoul', DATE_FORMATS.API)
      });
    }
  }

  // 소켓 인스턴스 반환
  getSocket() {
    return this.socket;
  }

  // 연결 상태 확인
  getConnectionStatus() {
    return this.isConnected;
  }
}

// 싱글톤 인스턴스 생성
const socketIOService = new SocketIOService();

export default socketIOService;