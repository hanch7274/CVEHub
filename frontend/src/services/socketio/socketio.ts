import { io, Socket } from 'socket.io-client';
import { 
  SOCKET_EVENTS, 
  SOCKET_STATE, 
  WS_DIRECTION, 
  WS_STATUS
} from './constants';
import { 
  SocketEventCallback, 
  SocketEventListeners, 
  SocketOptions, 
  CrawlerUpdateData, 
  WebSocketLogData,
  ISocketIOService,
  SocketCaseConverterOptions,
  LOG_LEVEL,
  SOCKET_CONFIG,
  SOCKET_IO_PATH
} from '../../types/socket';
import logger from '../../utils/logging';
import { getAccessToken } from '../../utils/storage/tokenStorage';
import { snakeToCamel, camelToSnake } from '../../utils/caseConverter';
import { 
  getUTCTimestamp, 
  formatWithTimeZone, 
  DATE_FORMATS, 
  TIME_ZONES 
} from '../../utils/dateUtils';

// 로그 레벨 설정 (개발 환경에서 디버그 레벨로 설정)
if (process.env.NODE_ENV === 'development') {
  logger.setLogLevel(LOG_LEVEL.DEBUG);
  logger.setEnabled(true);
  logger.info('SocketIOService', '로그 레벨 설정됨', { level: 'DEBUG', enabled: true });
}

// 변환에서 제외할 필드 목록
const EXCLUDED_FIELDS: string[] = ['id', 'uuid', 'created_at', 'updated_at', 'deleted_at'];

// Socket.IO URL을 가져오는 함수
const getSocketIOURL = (): string => {
  // 기본적으로 현재 호스트 사용
  const host = window.location.hostname;
  const port = process.env.NODE_ENV === 'development' ? '8000' : window.location.port;
  return `${host}${port ? `:${port}` : ''}`;
};

class SocketIOService implements ISocketIOService {
  socket: Socket | null;
  isConnected: boolean;
  private _connectionState: string;
  listeners: SocketEventListeners;
  options: SocketOptions | null;
  private pingInterval: NodeJS.Timeout | null;
  private originalEmit: ((event: string, ...args: any[]) => Socket) | null;
  private pingTimeoutId: NodeJS.Timeout | null;
  private lastPingTime: number | null;
  private eventTimestamps: Map<string, number>;

  constructor() {
    this.socket = null;
    this.isConnected = false;
    this._connectionState = SOCKET_STATE.DISCONNECTED;
    this.listeners = {};
    this.options = this._createOptions();
    this.pingInterval = null;
    this.originalEmit = null; // 원본 emit 메서드 저장용
    this.pingTimeoutId = null; // 핑 타임아웃 ID
    this.lastPingTime = null; // 마지막 핑 전송 시간
    this.eventTimestamps = new Map<string, number>(); // 이벤트 타임스탬프 저장용
  }

  // 설정 옵션 생성
  private _createOptions(): SocketOptions | null {
    const token = getAccessToken();
    
    // 토큰이 비어있는지 확인하고 로그 출력
    if (!token || token.trim() === '') {
      logger.warn('SocketIOService', '인증 토큰이 없습니다. 웹소켓 연결이 실패할 수 있습니다.');
      return null;
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
            expiresIn: decodedPayload.exp ? formatWithTimeZone(new Date(decodedPayload.exp * 1000), DATE_FORMATS.DISPLAY.FULL, TIME_ZONES.KST) : 'unknown',
            currentTime: formatWithTimeZone(new Date(), DATE_FORMATS.DISPLAY.FULL, TIME_ZONES.KST),
            timeLeft: decodedPayload.exp ? Math.floor((decodedPayload.exp * 1000 - Date.now()) / 1000) + '초' : 'unknown'
          });
        } else {
          logger.error('SocketIOService', '토큰 형식이 잘못되었습니다', { tokenFormat: token.substring(0, 10) + '...' });
        }
      } catch (e: any) {
        logger.error('SocketIOService', '토큰 디코딩 중 오류 발생', { error: e.message });
      }
    }
    
    // 중앙 설정에서 Socket.IO 옵션 가져오기
    const options: SocketOptions = {
      // Socket.IO 서버가 백엔드에서 SOCKET_IO_PATH 경로에 마운트됨
      path: SOCKET_IO_PATH,
      transports: ['websocket'],  // 웹소켓만 사용 (폴링 사용 안함)
      reconnection: SOCKET_CONFIG.RECONNECTION,
      reconnectionAttempts: SOCKET_CONFIG.RECONNECTION_ATTEMPTS,
      reconnectionDelay: SOCKET_CONFIG.RECONNECTION_DELAY,
      reconnectionDelayMax: SOCKET_CONFIG.RECONNECTION_DELAY_MAX,
      timeout: SOCKET_CONFIG.TIMEOUT,
      autoConnect: SOCKET_CONFIG.AUTO_CONNECT, // 자동 연결 비활성화
      
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
      reconnectionAttempts: options.reconnectionAttempts,
      reconnectionDelay: options.reconnectionDelay,
      reconnectionDelayMax: options.reconnectionDelayMax,
      timeout: options.timeout,
      autoConnect: options.autoConnect,
      hasToken: !!token,
      tokenLength: token ? token.length : 0
    });
    
    return options;
  }

  // 연결 초기화
  connect(url?: string): void {
    try {
      // 토큰 확인
      const token = getAccessToken();
      if (!token || token.trim() === '') {
        logger.warn('SocketIOService', '인증 토큰이 없어 연결을 시도하지 않습니다');
        this._updateConnectionState(SOCKET_STATE.ERROR);
        return;
      }
      
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
      
      // 소켓 URL 결정 - 호스트만 포함된 URL (프로토콜 없음)
      const socketHost = url || getSocketIOURL();
      
      // 디버깅을 위한 로그 추가
      console.log('%c Socket.IO 연결 시도 중... ', 'background: #4CAF50; color: white; padding: 4px;', {
        socketHost,
        options: this.options,
        token: token ? token.substring(0, 10) + '...' : 'No token'
      });
      
      // 연결 시도 전 상세 로깅
      logger.info('SocketIOService', '웹소켓 연결 시도', { 
        host: socketHost,
        path: this.options?.path || SOCKET_IO_PATH,
        fullUrl: `${window.location.protocol === 'https:' ? 'https' : 'http'}://${socketHost}${this.options?.path || SOCKET_IO_PATH}`,
        connectionState: this._connectionState
      });
      
      // 토큰 재확인
      if (!token) {
        logger.error('SocketIOService', '연결 실패: 인증 토큰이 없습니다');
        this._updateConnectionState(SOCKET_STATE.ERROR);
        return;
      }
      
      // 옵션 업데이트 (토큰이 변경되었을 수 있음)
      this.options = this._createOptions();
      
      // 연결 시도 전 옵션 로깅
      logger.debug('SocketIOService', '연결 옵션', {
        path: this.options?.path,
        transports: this.options?.transports,
        reconnection: this.options?.reconnection,
        auth: { hasToken: !!this.options?.auth?.token }
      });
      
      // 소켓 생성 및 연결 - 디버깅을 위한 추가 옵션 설정
      if (this.options) {
        this.socket = io(socketHost, {
          ...this.options,
          path: SOCKET_IO_PATH, // path 옵션 명시적 설정
          transports: ['websocket'], // 웹소켓만 사용 (폴링 사용 안함)
          forceNew: true, // 강제로 새 연결 생성
          timeout: 10000, // 타임아웃 증가 (10초)
          autoConnect: true, // 자동 연결 활성화
          reconnectionAttempts: 5, // 재연결 시도 횟수
          reconnectionDelay: 1000, // 재연결 지연 시간 (1초)
          reconnectionDelayMax: 5000, // 최대 재연결 지연 시간 (5초)
          randomizationFactor: 0.5, // 지연 시간 랜덤화 계수
        });
      } else {
        logger.error('SocketIOService', '연결 실패: 소켓 옵션이 없습니다');
        this._updateConnectionState(SOCKET_STATE.ERROR);
        return;
      }
      
      // 더 명확한 디버깅 로그
      console.log('%c Socket.IO 연결 객체 생성됨 ', 'background: #2196F3; color: white; padding: 4px;', {
        socketExists: !!this.socket,
        socketId: this.socket?.id,
        connected: this.socket?.connected,
        url: socketHost,
        path: SOCKET_IO_PATH,
        origin: typeof window !== 'undefined' ? window.location.origin : 'unknown'
      });
      
      logger.debug('SocketIOService', '소켓 객체 생성됨', {
        socketExists: !!this.socket,
        socketId: this.socket?.id,
        connected: this.socket?.connected
      });
      
      // 원본 emit 메서드 저장 및 래핑된 emit 메서드로 교체
      if (this.socket) {
        this.originalEmit = this.socket.emit.bind(this.socket);
        this.socket.emit = this._wrappedEmit.bind(this) as any;
      }
      
      // 연결 이벤트 핸들러 설정
      this._setupEventHandlers(socketHost, token);
      
    } catch (error: any) {
      logger.error('SocketIOService', '연결 중 예외 발생', {
        error: error.message,
        stack: error.stack
      });
      this._updateConnectionState(SOCKET_STATE.ERROR);
      this._notifyListeners(SOCKET_EVENTS.ERROR, { error });
    }
  }

  // 이벤트 핸들러 설정
  private _setupEventHandlers(socketHost: string, token: string): void {
    if (!this.socket) return;

    this.socket.on(SOCKET_EVENTS.CONNECT, () => {
      logger.info('SocketIOService', '웹소켓 연결 성공', {
        socketId: this.socket?.id,
        url: socketHost,
        path: this.options?.path,
        connected: this.socket?.connected,
        disconnected: this.socket?.disconnected,
        auth: {
          hasToken: !!this.options?.auth?.token,
          tokenLength: this.options?.auth?.token?.length || 0
        },
        timestamp: new Date().toISOString()
      });
      this._updateConnectionState(SOCKET_STATE.CONNECTED);
      this._notifyListeners(SOCKET_EVENTS.CONNECT);
      
      // 연결 성공 후 핑 타이머 시작
      this._startPingTimer();
    });

    this.socket.on(SOCKET_EVENTS.DISCONNECT, (reason: string) => {
      logger.info('SocketIOService', '웹소켓 연결 해제', { reason });
      this._updateConnectionState(SOCKET_STATE.DISCONNECTED);
      this._notifyListeners(SOCKET_EVENTS.DISCONNECT, { reason });
    });

    this.socket.on(SOCKET_EVENTS.CONNECT_ERROR, (error: any) => {
      // 연결 오류 상세 정보 로깅
      logger.error('SocketIOService', '연결 오류', { 
        message: error.message || '알 수 없는 오류',
        name: error.name,
        description: error.description,
        type: error.type,
        stack: error.stack,
        data: error.data,
        context: {
          url: socketHost,
          path: this.options?.path,
          tokenLength: token ? token.length : 0,
          hasAuthHeader: !!this.options?.extraHeaders?.Authorization
        }
      });
      
      this._updateConnectionState(SOCKET_STATE.ERROR);
      this._notifyListeners(SOCKET_EVENTS.CONNECT_ERROR, error);
    });
    
    // 자동으로 연결 확인 메시지 수신
    this.socket.on(SOCKET_EVENTS.CONNECT_ACK, (data: any) => {
      logger.debug('SocketIOService', '연결 확인 메시지 수신');
      this._notifyListeners(SOCKET_EVENTS.CONNECT_ACK, this._convertDataCasing(data));
    });
    
    // 알림 메시지 수신
    this.socket.on(SOCKET_EVENTS.NOTIFICATION, (data: any) => {
      logger.debug('SocketIOService', '알림 메시지 수신');
      this._notifyListeners(SOCKET_EVENTS.NOTIFICATION, this._convertDataCasing(data));
    });
    
    // CVE 업데이트 메시지 수신
    this.socket.on(SOCKET_EVENTS.CVE_UPDATED, (data: any) => {
      logger.debug('SocketIOService', 'CVE 업데이트 메시지 수신');
      this._notifyListeners(SOCKET_EVENTS.CVE_UPDATED, this._convertDataCasing(data));
    });
    
    // CVE 생성 메시지 수신
    this.socket.on(SOCKET_EVENTS.CVE_CREATED, (data: any) => {
      logger.debug('SocketIOService', 'CVE 생성 메시지 수신');
      this._notifyListeners(SOCKET_EVENTS.CVE_CREATED, this._convertDataCasing(data));
    });
    
    // CVE 삭제 메시지 수신
    this.socket.on(SOCKET_EVENTS.CVE_DELETED, (data: any) => {
      logger.debug('SocketIOService', 'CVE 삭제 메시지 수신');
      this._notifyListeners(SOCKET_EVENTS.CVE_DELETED, this._convertDataCasing(data));
    });
    
    // 구독 확인 메시지 수신
    this.socket.on(SOCKET_EVENTS.SUBSCRIBE_ACK, (data: any) => {
      logger.debug('SocketIOService', '구독 확인 메시지 수신');
      this._notifyListeners(SOCKET_EVENTS.SUBSCRIBE_ACK, this._convertDataCasing(data));
    });
    
    // 구독 해제 확인 메시지 수신
    this.socket.on(SOCKET_EVENTS.UNSUBSCRIBE_ACK, (data: any) => {
      logger.debug('SocketIOService', '구독 해제 확인 메시지 수신');
      this._notifyListeners(SOCKET_EVENTS.UNSUBSCRIBE_ACK, this._convertDataCasing(data));
    });
    
    // 오류 메시지 수신
    this.socket.on(SOCKET_EVENTS.ERROR, (data: any) => {
      logger.error('SocketIOService', '오류 메시지 수신', data);
      this._notifyListeners(SOCKET_EVENTS.ERROR, this._convertDataCasing(data));
    });
    
    // 핑/퐁 메시지 처리
    this.socket.on(SOCKET_EVENTS.PONG, (data: any) => {
      // 퐁 메시지 수신 시 타임아웃 제거
      this._clearPingTimeout();
      this._notifyListeners(SOCKET_EVENTS.PONG, this._convertDataCasing(data));
    });
    
    // 댓글 관련 이벤트 처리 - 로깅 최소화
    this.socket.on(SOCKET_EVENTS.COMMENT_ADDED, (data: any) => {
      this._notifyListeners(SOCKET_EVENTS.COMMENT_ADDED, this._convertDataCasing(data));
    });
    
    this.socket.on(SOCKET_EVENTS.COMMENT_UPDATED, (data: any) => {
      this._notifyListeners(SOCKET_EVENTS.COMMENT_UPDATED, this._convertDataCasing(data));
    });
    
    this.socket.on(SOCKET_EVENTS.COMMENT_DELETED, (data: any) => {
      this._notifyListeners(SOCKET_EVENTS.COMMENT_DELETED, this._convertDataCasing(data));
    });
    
    this.socket.on(SOCKET_EVENTS.COMMENT_REACTION_ADDED, (data: any) => {
      this._notifyListeners(SOCKET_EVENTS.COMMENT_REACTION_ADDED, this._convertDataCasing(data));
    });
    
    this.socket.on(SOCKET_EVENTS.COMMENT_REACTION_REMOVED, (data: any) => {
      this._notifyListeners(SOCKET_EVENTS.COMMENT_REACTION_REMOVED, this._convertDataCasing(data));
    });
    
    this.socket.on(SOCKET_EVENTS.COMMENT_COUNT_UPDATE, (data: any) => {
      this._notifyListeners(SOCKET_EVENTS.COMMENT_COUNT_UPDATE, this._convertDataCasing(data));
    });
    
    this.socket.on(SOCKET_EVENTS.COMMENT_MENTION_ADDED, (data: any) => {
      this._notifyListeners(SOCKET_EVENTS.COMMENT_MENTION_ADDED, this._convertDataCasing(data));
    });
    
    this.socket.on(SOCKET_EVENTS.COMMENT_REPLY_ADDED, (data: any) => {
      this._notifyListeners(SOCKET_EVENTS.COMMENT_REPLY_ADDED, this._convertDataCasing(data));
    });
    
    // 크롤러 업데이트 이벤트
    this.socket.on(SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS, (data: any) => {
      console.log('%c 📨 크롤러 업데이트 원본 수신', 'background: #9c27b0; color: white;', {
        rawData: data,
        timestamp: new Date().toISOString()
      });

      try {
        // 데이터 변환 (JSON 문자열인 경우 파싱)
        const convertedData = this._convertDataCasing(data);
        
        console.log('%c 📨 크롤러 업데이트 변환 데이터', 'background: #2196f3; color: white;', convertedData);

        // 크롤러 업데이트 이벤트 처리 - 중앙화된 처리
        if (convertedData && ((convertedData.data && convertedData.data.type === SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS) || convertedData.type === SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS)) {
          
          // 중첩된 데이터 구조 확인 및 처리
          const targetData = convertedData.data && convertedData.data.data 
            ? convertedData.data.data 
            : (convertedData.data || {});
            
          try {
            // 데이터 검증 및 기본값 설정
            const processedData: CrawlerUpdateData = {
              stage: targetData.stage || '진행 중',
              percent: typeof targetData.percent === 'number' ? 
                targetData.percent : 
                parseInt(targetData.percent, 10) || 0,
              message: targetData.message || '작업 진행 중...',
              isRunning: targetData.isRunning !== undefined ? 
                targetData.isRunning : true,
              hasError: targetData.hasError || false,
              updatedCves: targetData.updatedCves || []
            };
            
            console.log('%c 📨 처리된 데이터', 'background: #4caf50; color: white;', processedData);
            console.log('%c 📢 이벤트 리스너 수', 'background: #607d8b; color: white;', 
                        this.listeners[SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS]?.length || 0);
            
            // 크롤러 업데이트 이벤트 직접 발생 - 구독자에게 처리된 데이터 전달
            this._notifyListeners(SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS, processedData);
          } catch (error: any) {
            console.error('%c ❌ 처리 중 오류', 'background: #f44336; color: white;', error.message);
            logger.error('SocketIOService', '크롤러 업데이트 이벤트 처리 중 오류', {
              error: error.message
            });
          }
        } else {
          console.log('%c 📨 처리 규칙 없음', 'background: #ff9800; color: white;', convertedData);
          this._notifyListeners(SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS, convertedData);
        }
      } catch (error: any) {
        console.error('%c ❌ 변환 중 오류', 'background: #f44336; color: white;', error.message);
        this._notifyListeners(SOCKET_EVENTS.CRAWLER_UPDATE_PROGRESS, data);
      }
    });
    
    // 웹소켓 메시지 수신 이벤트 핸들러
    this._setupMessageHandler();
  }

  // 연결 종료
  disconnect(): void {
    try {
      if (this.socket) {
        logger.info('SocketIOService', '연결 종료 요청');
        
        // 핑 타이머 정리
        this._clearPingTimer();
        
        // 핑 타임아웃 정리
        this._clearPingTimeout();
        
        this.socket.disconnect();
        this.socket = null;
        this._updateConnectionState(SOCKET_STATE.DISCONNECTED);
      }
    } catch (error: any) {
      logger.error('SocketIOService', '연결 종료 중 오류 발생', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  // 이벤트 리스너 등록
  on(event: string, callback: SocketEventCallback): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    
    // 디버깅을 위한 로깅
    logger.debug('SocketIOService', `이벤트 리스너 등록 (${event})`, {
      event,
      totalListeners: this.listeners[event].length,
      connectionState: this._connectionState,
      isConnected: this.isSocketConnected()
    });
    
    return () => {
      this.off(event, callback);
    };
  }
  
  // addEventListener는 on 메서드의 별칭 (React 컴포넌트와의 호환성)
  addEventListener(event: string, callback: SocketEventCallback): () => void {
    return this.on(event, callback);
  }

  // 이벤트 리스너 제거
  off(event: string, callback: SocketEventCallback): void {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  // 모든 리스너에게 이벤트 알림
  private _notifyListeners(event: string, data?: any): void {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error: any) {
          logger.error('SocketIOService', `리스너 호출 중 오류 (${event})`, {
            error: error.message,
            stack: error.stack
          });
        }
      });
    }
  }
  
  // 데이터 케이싱 변환 (snake_case -> camelCase)
  private _convertDataCasing(data: any): any {
    try {
      logger.debug('SocketIOService', '데이터 케이싱 변환 시작', {
        dataType: data === null ? 'null' : typeof data,
        isArray: Array.isArray(data),
        hasData: data !== null && data !== undefined,
        originalData: data
      });
      
      const convertedData = snakeToCamel(data, { 
        excludeFields: EXCLUDED_FIELDS 
      } as SocketCaseConverterOptions);
      
      logger.debug('SocketIOService', '데이터 케이싱 변환 완료', {
        originalKeys: data && typeof data === 'object' ? Object.keys(data) : [],
        convertedKeys: convertedData && typeof convertedData === 'object' ? Object.keys(convertedData) : [],
        convertedData: convertedData
      });
      
      return convertedData;
    } catch (error: any) {
      logger.error('SocketIOService', '데이터 케이싱 변환 중 오류', {
        error: error.message,
        stack: error.stack,
        data: data
      });
      return data;
    }
  }
  
  // 래핑된 emit 메서드 (이벤트 로깅 및 데이터 변환 처리)
  private _wrappedEmit(eventName: string, data?: any): Socket | undefined {
    try {
      // 소켓이 없는 경우 처리
      if (!this.socket) {
        logger.error('SocketIOService', '소켓이 없어 이벤트를 전송할 수 없습니다', {
          eventName: eventName || 'unknown',
          data: data ? JSON.stringify(data) : 'No data'
        });
        return;
      }

      // eventName이 없는 경우 처리
      if (!eventName) {
        // 호출 스택 정보 수집
        const stackTrace = new Error().stack || '';
        
        // 데이터가 문자열인 경우 파싱 시도
        let parsedData = data;
        if (typeof data === 'string') {
          try {
            parsedData = JSON.parse(data);
            logger.debug('SocketIOService', '문자열 데이터를 파싱했습니다', {
              originalData: data,
              parsedData
            });
          } catch (e) {
            logger.debug('SocketIOService', '문자열 데이터 파싱 실패', {
              error: (e as Error).message,
              data
            });
          }
        }
        
        logger.warn('SocketIOService', '이벤트 이름이 없는 웹소켓 이벤트 전송 시도', {
          data: data,
          dataType: typeof data,
          stackTrace: stackTrace.split('\n').slice(1, 5).join('\n')
        });
        
        // 이벤트 이름이 없지만 데이터가 있는 경우, 데이터에서 cveId가 있으면 구독 관련 이벤트로 추정
        if (parsedData && (parsedData.cveId || (parsedData.data && parsedData.data.cveId))) {
          const cveId = parsedData.cveId || (parsedData.data && parsedData.data.cveId);
          logger.info('SocketIOService', 'CVE 관련 이벤트로 추정됨', {
            cveId: cveId,
            assumedEvent: 'subscribe_cve',
            callStack: stackTrace.split('\n').slice(1, 3).join('\n')
          });
          
          // 구독 이벤트로 가정하고 처리
          eventName = SOCKET_EVENTS.SUBSCRIBE_CVE;
        } else {
          // 이벤트 이름을 추정할 수 없는 경우, 원본 emit 메서드 호출
          logger.error('SocketIOService', '이벤트 이름을 추정할 수 없어 일반 메시지로 처리합니다', {
            data: parsedData || data,
            callStack: stackTrace.split('\n').slice(1, 3).join('\n')
          });
          
          if (this.originalEmit && typeof this.originalEmit === 'function') {
            return this.originalEmit('message', data);
          } else if (this.socket) {
            return this.socket.emit('message', data);
          }
          return;
        }
      }

      // 이벤트 전송 시작 시간 기록
      const startTime = Date.now();
      this.eventTimestamps.set(eventName, startTime);
      
      // 이벤트 로깅
      this._logWebSocketEvent(eventName, data, WS_DIRECTION.OUTGOING);
      
      // 데이터가 있는 경우에만 변환 처리
      if (data) {
        logger.debug('SocketIOService', `이벤트 ${eventName} 데이터 변환 전`, {
          eventName,
          originalData: data
        });
        
        // camelCase에서 snake_case로 변환
        const convertedData = camelToSnake(data, { excludeFields: EXCLUDED_FIELDS } as SocketCaseConverterOptions);
        
        logger.debug('SocketIOService', `이벤트 ${eventName} 데이터 변환 후`, {
          eventName,
          convertedData
        });
        
        // 원본 emit 메서드 호출 (변환된 데이터 사용)
        if (this.originalEmit && typeof this.originalEmit === 'function') {
          return this.originalEmit(eventName, convertedData);
        } else if (this.socket) {
          return this.socket.emit(eventName, convertedData);
        }
      } else {
        // 데이터가 없는 경우 그냥 이벤트만 전송
        if (this.originalEmit && typeof this.originalEmit === 'function') {
          return this.originalEmit(eventName);
        } else if (this.socket) {
          return this.socket.emit(eventName);
        }
      }
    } catch (error: any) {
      logger.error('SocketIOService', `이벤트 ${eventName} 전송 중 오류`, {
        error: error.message,
        stack: error.stack
      });
    }
    return;
  }

  // 메시지 핸들러 설정
  private _setupMessageHandler(): void {
    if (!this.socket) return;
    
    // 일반 메시지 이벤트 처리
    this.socket.on('message', (data: any) => {
      try {
        logger.debug('SocketIOService', '일반 메시지 수신', {
          dataType: typeof data,
          isString: typeof data === 'string'
        });
        
        // 문자열인 경우 JSON 파싱 시도
        if (typeof data === 'string') {
          try {
            const parsedData = JSON.parse(data);
            this._notifyListeners('message', this._convertDataCasing(parsedData));
          } catch (e) {
            // 파싱 실패 시 원본 데이터 전달
            this._notifyListeners('message', data);
          }
        } else {
          // 객체인 경우 변환 후 전달
          this._notifyListeners('message', this._convertDataCasing(data));
        }
      } catch (error: any) {
        logger.error('SocketIOService', '메시지 처리 중 오류', {
          error: error.message,
          stack: error.stack
        });
      }
    });
  }

  // 이벤트 전송
  emit(event: string, data?: any): void {
    try {
      if (!this.socket) {
        logger.warn('SocketIOService', '소켓이 연결되지 않아 이벤트를 전송할 수 없습니다', {
          event,
          hasData: !!data
        });
        return;
      }
      
      // 이벤트 전송 전 로깅
      logger.debug('SocketIOService', `이벤트 ${event} 전송`, {
        event,
        hasData: !!data,
        dataType: data ? typeof data : 'undefined'
      });
      
      // 래핑된 emit 메서드 호출
      this._wrappedEmit(event, data);
    } catch (error: any) {
      logger.error('SocketIOService', `이벤트 ${event} 전송 중 오류`, {
        error: error.message,
        stack: error.stack
      });
    }
  }

  // 연결 상태 업데이트
  private _updateConnectionState(state: string): void {
    // 이전 상태와 새 상태가 다른 경우에만 업데이트
    if (this._connectionState !== state) {
      logger.info('SocketIOService', '연결 상태 변경', {
        from: this._connectionState,
        to: state
      });
      
      // 소켓 인스턴스가 있는 경우 실제 연결 상태 확인
      const actualConnected = this.socket?.connected === true;
      
      // 실제 소켓 연결 상태와 요청된 상태가 일치하지 않는 경우 로그 기록
      if (this.socket && ((state === SOCKET_STATE.CONNECTED && !actualConnected) || 
                          (state !== SOCKET_STATE.CONNECTED && actualConnected))) {
        logger.warn('SocketIOService', '소켓 연결 상태 불일치 감지', {
          requestedState: state,
          socketConnected: actualConnected
        });
        
        // 실제 소켓 연결 상태를 우선시
        if (actualConnected) {
          state = SOCKET_STATE.CONNECTED;
        } else if (state === SOCKET_STATE.CONNECTED) {
          state = SOCKET_STATE.DISCONNECTED;
        }
      }
      
      // 상태 업데이트
      this._connectionState = state;
      this.isConnected = state === SOCKET_STATE.CONNECTED;
      
      // 연결 상태 변경 이벤트 발생
      this._notifyListeners(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, { state: this._connectionState });
      
      // 추가 디버깅 로그
      logger.info('SocketIOService', '연결 상태 업데이트 완료', {
        connectionState: this._connectionState,
        isConnected: this.isConnected,
        socketConnected: this.socket?.connected
      });
    }
  }

  // 핑 타이머 시작
  private _startPingTimer(): void {
    // 기존 타이머 정리
    this._clearPingTimer();
    
    // 새 타이머 설정 (30초마다 핑 전송)
    this.pingInterval = setInterval(() => {
      this._sendPing();
    }, 30000);
    
    // 초기 핑 전송
    this._sendPing();
  }

  // 핑 타이머 정리
  private _clearPingTimer(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // 핑 타임아웃 정리
  private _clearPingTimeout(): void {
    if (this.pingTimeoutId) {
      clearTimeout(this.pingTimeoutId);
      this.pingTimeoutId = null;
    }
  }

  // 핑 전송
  private _sendPing(): void {
    if (!this.socket || !this.isConnected) return;
    
    try {
      // 마지막 핑 전송 시간 기록
      this.lastPingTime = Date.now();
      
      // 핑 전송
      this.emit(SOCKET_EVENTS.PING, { timestamp: getUTCTimestamp() });
      
      // 핑 타임아웃 설정 (10초 후에 응답이 없으면 연결 끊김으로 간주)
      this._clearPingTimeout();
      this.pingTimeoutId = setTimeout(() => {
        logger.warn('SocketIOService', '핑 타임아웃 발생');
        
        // 연결 상태 확인
        if (this.socket && this.isConnected) {
          // 소켓이 여전히 연결되어 있다고 생각하는 경우, 실제로는 연결이 끊겼을 수 있음
          logger.warn('SocketIOService', '핑 응답이 없어 연결이 끊어진 것으로 간주합니다');
          this._updateConnectionState(SOCKET_STATE.ERROR);
          
          // 연결 상태 변경 이벤트 발생 (SocketIOContext가 이를 감지하여 처리)
          if (this.socket) {
            this.socket.emit('connection_error', { reason: 'ping_timeout' });
          }
          
          // 연결 해제만 수행 (재연결은 SocketIOContext에서 처리)
          this.disconnect();
        }
      }, 10000);
    } catch (error: any) {
      logger.error('SocketIOService', '핑 전송 중 오류', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  // 인증 상태 변경 처리
  handleAuthStateChange(isAuthenticated: boolean): void {
    logger.info('SocketIOService', `인증 상태 변경: ${isAuthenticated ? '인증됨' : '인증되지 않음'}`, {
      function: 'handleAuthStateChange'
    });
    
    if (isAuthenticated) {
      // 인증된 경우 연결 시도
      this.connect();
    } else {
      // 인증되지 않은 경우 연결 해제
      this.disconnect();
    }
  }

  // 소켓 연결 상태 확인
  isSocketConnected(): boolean {
    return !!(this.socket && this.socket.connected);
  }
  
  // connected 속성에 대한 getter
  get connected(): boolean {
    return this.socket !== null && this.socket.connected === true;
  }

  // 소켓 인스턴스 반환
  getSocket(): Socket | null {
    return this.socket;
  }

  // 연결 상태 확인
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  // 웹소켓 이벤트 로깅 - 중앙화된 로깅 시스템 활용
  private _logWebSocketEvent(eventName: string, data: any, direction: string, status: string = WS_STATUS.SUCCESS, error: Error | null = null): void {
    try {
      // eventName이 undefined인 경우 처리
      if (!eventName) {
        logger.warn('SocketIOService', '이벤트 이름이 없는 웹소켓 이벤트', {
          direction: direction === WS_DIRECTION.INCOMING ? 'INCOMING' : 'OUTGOING',
          status: status === WS_STATUS.SUCCESS ? 'SUCCESS' : 
                 status === WS_STATUS.FAILURE ? 'WARNING' : 'ERROR',
          data: data ? JSON.stringify(data).substring(0, 100) : 'No data'
        });
        return;
      }
      
      // 로깅 제외할 이벤트 목록 (더 많은 이벤트 추가)
      const EXCLUDED_LOG_EVENTS = [
        'ping', 'pong', 'PING', 'PONG',
        'notifications/unread/count',
        'health',
        'user/status',
        'message',
        'connect',
        'disconnect',
        'connect_ack',
        'session_info_ack'
      ];
      
      // 제외 이벤트 확인 (eventName이 문자열인지 확인)
      const isExcludedEvent = typeof eventName === 'string' && EXCLUDED_LOG_EVENTS.some(event => 
        eventName.includes(event) || 
        (data && data.type && typeof data.type === 'string' && data.type.includes(event))
      );
      
      // 제외 이벤트는 로깅하지 않음 (성공 상태일 때만 제외)
      if (isExcludedEvent && status === WS_STATUS.SUCCESS) {
        return;
      }
      
      // 중요 이벤트 확인 (크롤러 업데이트, 에러 등)
      const isImportantEvent = typeof eventName === 'string' && (
        eventName.includes('crawler') || 
        eventName.includes('error') || 
        status !== WS_STATUS.SUCCESS
      );
      
      // 중요하지 않은 이벤트는 로깅하지 않음 (개발 환경에서도)
      if (!isImportantEvent && status === WS_STATUS.SUCCESS) {
        return;
      }
      
      // 로그 레벨 결정 (중요 이벤트만 info 레벨로, 나머지는 debug 레벨로)
      const logLevel = status === WS_STATUS.FAILURE ? 'error' : 
                      status === WS_STATUS.PENDING ? 'warn' : 
                      isImportantEvent ? 'info' : 'debug';
      
      // 로그 데이터 준비 (최소한의 정보만 포함)
      const logData: WebSocketLogData = {
        eventName,
        direction: direction === WS_DIRECTION.INCOMING ? 'INCOMING' : 'OUTGOING',
        status: status === WS_STATUS.SUCCESS ? 'SUCCESS' : 
               status === WS_STATUS.FAILURE ? 'WARNING' : 'ERROR'
      };
      
      // 오류 정보 추가 (오류가 있을 때만)
      if (error) {
        logData.error = {
          message: error.message
        };
      }
      
      // 중요 이벤트의 경우에만 데이터 요약 추가 (개발 환경에서만)
      if (process.env.NODE_ENV === 'development' && data && isImportantEvent) {
        // 데이터 크기 제한 (100자 이내로 요약)
        const dataStr = JSON.stringify(data);
        if (dataStr.length < 100) {
          logData.dataSummary = dataStr;
        } else {
          // 데이터가 너무 크면 요약 정보만 로깅
          logData.dataSummary = `${dataStr.substring(0, 100)}... (${dataStr.length} bytes)`;
        }
      }
      
      // 현재 페이지의 origin 정보 추가
      if (typeof window !== 'undefined') {
        logData.origin = window.location.origin;
      }
      
      // 중앙화된 로깅 시스템 활용 (중요 이벤트만)
      if (logLevel === 'error') {
        logger.error('SocketIOService', `웹소켓 이벤트: ${eventName}`, logData);
      } else if (logLevel === 'warn') {
        logger.warn('SocketIOService', `웹소켓 이벤트: ${eventName}`, logData);
      } else if (logLevel === 'info') {
        logger.info('SocketIOService', `웹소켓 이벤트: ${eventName}`, logData);
      } else {
        logger.debug('SocketIOService', `웹소켓 이벤트: ${eventName}`, logData);
      }
    } catch (logError) {
      // 로깅 자체에서 오류가 발생한 경우 기본 콘솔 로깅으로 폴백
      console.error('[SocketIOService] 웹소켓 이벤트 로깅 중 오류', logError);
    }
  }
}

// 싱글톤 인스턴스 생성
const socketIOService = new SocketIOService();

// 명명된 export와 기본 export 모두 제공
export { socketIOService };
export default socketIOService;
