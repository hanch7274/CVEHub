// services/socketio/socketService.ts
import { io, Socket } from 'socket.io-client';
import { Observable, Subject, fromEvent, EMPTY, throwError, BehaviorSubject } from 'rxjs';
import { shareReplay, map, filter, catchError, retry, takeUntil, finalize } from 'rxjs/operators';
import { 
  SOCKET_EVENTS, 
  SOCKET_STATE, 
  WS_DIRECTION, 
  WS_STATUS,
  CONNECTION_EVENTS,
  SUBSCRIPTION_EVENTS
} from './constants';
import { 
  SocketEventCallback, 
  SocketEventListeners, 
  SocketOptions, 
  WebSocketLogData,
  ISocketIOService,
  SocketCaseConverterOptions,
  LOG_LEVEL,
  SOCKET_CONFIG,
  SOCKET_IO_PATH
} from '../types';
import _ from 'lodash';
import socketStoreAdapter from './socketStoreAdapter';
import logger from 'shared/utils/logging';
import { getAccessToken, getUser } from 'shared/utils/storage/tokenStorage';
import useSocketStore, { socketActions } from '../state/socketStore';
import { camelToSnake, snakeToCamel } from 'shared/utils/caseConverter';

// 변환에서 제외할 필드 목록
const EXCLUDED_FIELDS: string[] = ['id', 'uuid', 'created_at', 'updated_at', 'deleted_at'];

// Socket.IO URL을 가져오는 함수
const getSocketIOURL = (): string => {
  // 기본적으로 현재 호스트 사용
  const host = window.location.hostname;
  const port = process.env.NODE_ENV === 'development' ? '8000' : window.location.port;
  return `${host}${port ? `:${port}` : ''}`;
};

/**
 * Socket.IO 서비스와 RxJS를 통합한 서비스
 * 
 * 기존의 socketioWithStore와 socketRxService의 기능을 통합하여 
 * 단일 인터페이스를 제공합니다. 기본 Socket.IO 연결 관리와 
 * RxJS 기반 이벤트 처리를 모두 지원합니다.
 */
class SocketService implements ISocketIOService {
  // socketioWithStore에서 가져온 속성들
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
  private eventCache: Map<string, { data: any, timestamp: number }>;
  private caseConversionCache: Map<string, any>;
  private syncInterval: NodeJS.Timeout | null;
  private reconnectBackoffTimer: NodeJS.Timeout | null;
  private connectionMetrics: {
    connectAttempts: number;
    lastConnectTime: number | null;
    disconnectCount: number;
    errorCount: number;
    lastErrorTime: number | null;
    averageLatency: number | null;
    pingHistory: number[];
  };
  
  // 구독 상태 관리
  private subscribedCVEs: Set<string> = new Set<string>();
  private pendingSubscriptions: Set<string> = new Set<string>();
  private autoReconnectEnabled: boolean = true;
  private maxReconnectAttempts: number = 10;
  private currentReconnectAttempts: number = 0;
  private LOCAL_STORAGE_KEY = 'cvehub_subscribed_cves';
  private subscriptionChangeSubject: Subject<string[]> = new Subject<string[]>();

  // socketRxService에서 가져온 속성들
  private eventObservables: Map<string, Observable<any>> = new Map();
  private destroySubjects: Map<string, Subject<void>> = new Map();
  private connectionStateSubject: BehaviorSubject<string>;

  constructor() {
    // socketioWithStore 초기화
    this.socket = null;
    this.isConnected = false;
    this._connectionState = SOCKET_STATE.DISCONNECTED;
    this.listeners = {};
    this.options = null;
    this.pingInterval = null;
    this.originalEmit = null;
    this.pingTimeoutId = null;
    this.lastPingTime = null;
    this.eventTimestamps = new Map<string, number>();
    this.eventCache = new Map<string, { data: any, timestamp: number }>();
    this.caseConversionCache = new Map<string, any>();
    this.syncInterval = null;
    this.reconnectBackoffTimer = null;
    this.connectionMetrics = {
      connectAttempts: 0,
      lastConnectTime: null,
      disconnectCount: 0,
      errorCount: 0,
      lastErrorTime: null,
      averageLatency: null,
      pingHistory: []
    };
    
    // 구독 상태 초기화
    this.subscribedCVEs = new Set<string>();
    this.pendingSubscriptions = new Set<string>();
    this._loadSubscribedCVEs(); // 저장된 구독 상태 불러오기
    
    // socketRxService 초기화
    this.connectionStateSubject = new BehaviorSubject<string>(SOCKET_STATE.DISCONNECTED);
    
    // 상태 동기화 타이머 시작
    this._setupStateSynchronization();
    
    // 브라우저 페이지 가시성 이벤트 리스너 등록
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._handleVisibilityChange.bind(this));
    }
    
    // 브라우저 온라인/오프라인 이벤트 리스너 등록
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this._handleOnlineStatus.bind(this));
      window.addEventListener('offline', this._handleOfflineStatus.bind(this));
    }
  }

  // socketioWithStore에서 가져온 메소드들 ==================

  // 최적화: 토큰 디코딩 함수를 _.memoize로 최적화
  private _decodeToken = _.memoize((token: string) => {
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        const [header, payload, signature] = tokenParts;
        return JSON.parse(atob(payload));
      }
      return null;
    } catch (e) {
      logger.error('SocketService', '토큰 디코딩 중 오류 발생', { 
        error: (e as Error).message 
      });
      return null;
    }
  }, (token) => {
    // 캐시 키로 토큰의 처음 10자와 마지막 10자를 사용 (보안상의 이유로 전체 토큰 사용 X)
    return token ? `${token.substring(0, 10)}...${token.substring(token.length - 10)}` : 'no-token';
  });

  // 설정 옵션 생성
  private _createOptions(token?: string): SocketOptions | null {
    if (!token || token.trim() === '') {
      logger.warn('SocketService', '인증 토큰이 없습니다. 웹소켓 연결이 실패할 수 있습니다.');
      return null;
    }
    
    // 사용자 정보 가져오기
    const user = getUser();
    const username = user?.username;
    
    logger.info('SocketService', '소켓 연결 인증 정보', { hasToken: !!token, hasUsername: !!username });
    
    // Socket.IO 옵션 생성
    const options: SocketOptions = {
      path: SOCKET_IO_PATH,
      transports: ['websocket'],
      reconnection: SOCKET_CONFIG.RECONNECTION,
      reconnectionAttempts: SOCKET_CONFIG.RECONNECTION_ATTEMPTS,
      reconnectionDelay: SOCKET_CONFIG.RECONNECTION_DELAY,
      reconnectionDelayMax: SOCKET_CONFIG.RECONNECTION_DELAY_MAX,
      timeout: SOCKET_CONFIG.TIMEOUT,
      autoConnect: SOCKET_CONFIG.AUTO_CONNECT,
      
      // 인증 정보 전달
      auth: {
        token: token,
        username: username // 사용자명 추가
      },
      
      // 추가 디버깅 정보
      extraHeaders: {
        'Authorization': `Bearer ${token}`
      }
    };
    
    return options;
  }

  // 연결 상태 업데이트
  private _updateConnectionState(state: string): void {
    if (this._connectionState === state) return;
    
    this._connectionState = state;
    this.isConnected = state === SOCKET_STATE.CONNECTED;
    
    // 상태 변경 이벤트 발생
    this._notifyListeners(CONNECTION_EVENTS.CONNECTION_STATE_CHANGE, { state });
    
    // Zustand 스토어에 상태 업데이트
    socketActions.setConnectionState(state as any);
    
    // RxJS Subject에도 상태 업데이트
    this.connectionStateSubject.next(state);
    
    logger.info('SocketService', '연결 상태 변경', { 
      previousState: this._connectionState, 
      newState: state,
      isConnected: this.isConnected
    });
  }

  // 연결 초기화
  connect(token?: string): Socket {
    try {
      // 이미 연결된 소켓이 있으면 반환
      if (this.socket && this.isConnected) {
        return this.socket;
      }
      
      // 토큰이 없으면 액세스 토큰 사용
      const accessToken = token || getAccessToken();
      
      if (!accessToken) {
        logger.error('SocketService', '연결 실패: 인증 토큰이 없습니다');
        this._updateConnectionState(SOCKET_STATE.ERROR);
        throw new Error('인증 토큰이 없습니다');
      }
      
      // 연결 상태 업데이트
      this._updateConnectionState(SOCKET_STATE.CONNECTING);
      
      // 접속할 호스트 정보 가져오기
      const socketHost = getSocketIOURL();
      
      // 옵션 생성
      this.options = this._createOptions(accessToken);
      
      if (!this.options) {
        logger.error('SocketService', '연결 실패: 소켓 옵션이 없습니다');
        this._updateConnectionState(SOCKET_STATE.ERROR);
        throw new Error('소켓 옵션이 없습니다');
      }
      
      // 소켓 생성 및 연결
      this.socket = io(socketHost, {
        ...this.options,
        transports: ['websocket'],
        forceNew: true
      });
      
      // Zustand 스토어에 소켓 등록
      socketStoreAdapter.registerSocket(this.socket);
      
      // 이벤트 핸들러 설정
      this._setupEventHandlers();
      
      return this.socket;
      
    } catch (error: any) {
      logger.error('SocketService', '연결 중 예외 발생', {
        error: error.message,
        stack: error.stack
      });
      this._updateConnectionState(SOCKET_STATE.ERROR);
      socketActions.setConnectionError(error);
      throw error;
    }
  }

  // 이벤트 핸들러 설정
  private _setupEventHandlers(): void {
    if (!this.socket) return;
    
    // 연결 이벤트
    this.socket.on(CONNECTION_EVENTS.CONNECT, () => {
      logger.info('SocketService', '웹소켓 연결 성공', {
        socketId: this.socket?.id,
        connected: this.socket?.connected
      });
      
      // 연결 상태 업데이트
      this._updateConnectionState(SOCKET_STATE.CONNECTED);
      
      // 연결 메트릭 업데이트
      this.connectionMetrics.lastConnectTime = Date.now();
      this.currentReconnectAttempts = 0; // 재연결 성공 시 카운터 초기화
      
      // 구독 상태 복원
      this._restoreSubscriptions();
      
      // 모든 리스너에게 연결 이벤트 알림
      this._notifyListeners(CONNECTION_EVENTS.CONNECT);
    });
    
    // 연결 해제 이벤트
    this.socket.on(CONNECTION_EVENTS.DISCONNECT, (reason: string) => {
      logger.info('SocketService', '웹소켓 연결 해제', { reason });
      this._updateConnectionState(SOCKET_STATE.DISCONNECTED);
      this._notifyListeners(CONNECTION_EVENTS.DISCONNECT, { reason });
    });
    
    // 연결 오류 이벤트
    this.socket.on(CONNECTION_EVENTS.CONNECT_ERROR, (error: any) => {
      logger.error('SocketService', '연결 오류', { 
        message: error.message || '알 수 없는 오류'
      });
      
      this._updateConnectionState(SOCKET_STATE.ERROR);
      socketActions.setConnectionError(error);
      this._notifyListeners(CONNECTION_EVENTS.CONNECT_ERROR, error);
    });
  }

  // 연결 해제
  disconnect(): void {
    if (this.socket) {
      logger.info('SocketService', '웹소켓 연결 해제 요청');
      
      // 이벤트 리스너 제거
      this.socket.offAny();
      
      // 연결 해제
      this.socket.disconnect();
      
      // 상태 업데이트
      this._updateConnectionState(SOCKET_STATE.DISCONNECTED);
      
      // Zustand 스토어에서 소켓 제거
      socketStoreAdapter.registerSocket(null);
      
      // 소켓 참조 제거
      this.socket = null;
    }
  }

  // 이벤트 리스너 등록
  on(event: string, callback: SocketEventCallback): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    
    // 이미 등록된 콜백인지 확인
    const isCallbackRegistered = this.listeners[event].some(cb => cb === callback);
    
    if (!isCallbackRegistered) {
      this.listeners[event].push(callback);
      
      // 소켓이 있는 경우 이벤트 리스너 등록
      if (this.socket) {
        this.socket.on(event, (data: any) => {
          // 디버깅: 원본 데이터 로깅 (구독 관련 이벤트만)
          if (event === SOCKET_EVENTS.SUBSCRIPTION_STATUS || event === SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED) {
            logger.debug('Socket.on', `[${event}] 원본 데이터 수신:`, {
              원본데이터: data,
              timestamp: new Date().toISOString()
            });
          }
          
          // 데이터 케이스 변환 처리
          const convertedData = this._convertDataCasing(data, {
            direction: 'incoming',
            sourceName: `소켓이벤트[${event}]`
          });
          
          // 디버깅: 변환된 데이터 로깅 (구독 관련 이벤트만)
          if (event === SOCKET_EVENTS.SUBSCRIPTION_STATUS || event === SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED) {
            logger.debug('Socket.on', `[${event}] 변환 후 데이터:`, {
              변환데이터: convertedData, 
              timestamp: new Date().toISOString()
            });
          }
          
          callback(convertedData);
        });
      }
      
      // Zustand 스토어에 이벤트 핸들러 등록
      socketStoreAdapter.registerEventHandler(event, callback);
      
      logger.debug('SocketService', `이벤트 리스너 등록: ${event}`);
    }
    
    // 이벤트 리스너 제거 함수 반환
    return () => {
      this.off(event, callback);
    };
  }

  // addEventListener는 on의 별칭으로 구현
  addEventListener(event: string, callback: SocketEventCallback): () => void {
    return this.on(event, callback);
  }

  // 이벤트 리스너 제거
  off(event: string, callback: SocketEventCallback): void {
    if (this.listeners[event]) {
      // 콜백 제거
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      
      // 소켓이 있는 경우 이벤트 리스너 제거
      if (this.socket) {
        this.socket.off(event, callback as any);
      }
      
      // Zustand 스토어에서 이벤트 핸들러 제거
      socketStoreAdapter.unregisterEventHandler(event, callback);
      
      logger.debug('SocketService', `이벤트 리스너 제거: ${event}`);
    }
  }

  // 이벤트 발생
  emit(event: string, data: any, callback?: Function): void {
    if (!this.socket) {
      logger.warn('SocketService', `소켓 연결 없이 이벤트 발신 시도: ${event}`);
      return;
    }
    
    // 디버깅: 발신 이벤트 데이터 로깅
    if (event === SOCKET_EVENTS.SUBSCRIBE_CVE || event === SOCKET_EVENTS.UNSUBSCRIBE_CVE) {
      logger.info('SocketService', `[발신] ${event} 이벤트 데이터:`, {
        원본데이터: data,
        hasCveId: data?.cve_id !== undefined,
        hasCveIdCamel: data?.cveId !== undefined,
        timestamp: new Date().toISOString()
      });
    }
    
    // 이벤트별 최적화 전략 적용
    if (this._shouldThrottleEvent(event)) {
      // 스로틀링 적용 이벤트
      this._throttledEmit(event, data, callback);
    } else if (this._shouldDebounceEvent(event)) {
      // 디바운싱 적용 이벤트
      this._debouncedEmit(event, data, callback);
    } else {
      // 일반 이벤트는 즉시 발생
      this._emitImmediate(event, data, callback);
    }
  }
  
  /**
   * 스로틀링된 이벤트 발생 (특정 간격으로 제한)
   * 
   * 자주 발생하는 이벤트(스크롤, 타이핑 등)에 대해 스로틀링을 적용하여
   * 서버로 전송되는 이벤트 수를 제한합니다. 이는 네트워크 트래픽과 서버 부하를 줄입니다.
   * 
   * @param event - 이벤트 이름
   * @param data - 이벤트 데이터
   * @param callback - 콜백 함수
   */
  private _throttledEmit = _.throttle((event: string, data: any, callback?: Function) => {
    this._emitImmediate(event, data, callback);
  }, 300, { leading: true, trailing: true });
  
  /**
   * 디바운스된 이벤트 발생 (마지막 호출 후 지연 시간 적용)
   * 
   * 연속적으로 발생하는 이벤트에서 마지막 이벤트만 전송하여 불필요한 중간 상태 전송을 방지합니다.
   * 검색 쿼리, 필터 변경과 같이 최종 값만 중요한 이벤트에 적합합니다.
   * 
   * @param event - 이벤트 이름
   * @param data - 이벤트 데이터
   * @param callback - 콜백 함수
   */
  private _debouncedEmit = _.debounce((event: string, data: any, callback?: Function) => {
    this._emitImmediate(event, data, callback);
  }, 300);
  
  // 즉시 이벤트 발생 (내부 메서드)
  private _emitImmediate(event: string, data: any, callback?: Function): void {
    try {
      // 디버깅: 데이터 케이스 변환 전 로깅 (구독 관련 이벤트만)
      if (event === SOCKET_EVENTS.SUBSCRIBE_CVE || event === SOCKET_EVENTS.UNSUBSCRIBE_CVE) {
        logger.debug('이벤트 발생', `[${event}] 변환 전 데이터:`, {
          data,
          timestamp: new Date().toISOString()
        });
      }
      
      // 데이터 케이스 변환 처리 (camelCase -> snake_case)
      const convertedData = this._convertDataCasing(data, { 
        direction: 'outgoing',
        sourceName: `이벤트[${event}]`
      });
      
      // 디버깅: 데이터 케이스 변환 후 로깅 (구독 관련 이벤트만)
      if (event === SOCKET_EVENTS.SUBSCRIBE_CVE || event === SOCKET_EVENTS.UNSUBSCRIBE_CVE) {
        logger.debug('이벤트 발생', `[${event}] 변환 후 데이터:`, {
          convertedData,
          timestamp: new Date().toISOString()
        });
      }
      
      // 이벤트 발생
      if (callback) {
        this.socket!.emit(event, convertedData, callback);
      } else {
        this.socket!.emit(event, convertedData);
      }
      
      // 이벤트 기록
      this.eventTimestamps.set(event, Date.now());
      
      // RxJS Subject에도 이벤트 전달
      // 해당 이벤트에 대한 Observable 구독자가 있으면 알림
      const eventSubjects = Array.from(this.eventObservables.keys())
        .filter(key => key.startsWith(`${event}_`))
        .map(key => this.eventObservables.get(key));
      
      eventSubjects.forEach(observable => {
        if (observable && 'source' in observable && observable.source instanceof Subject) {
          (observable.source as Subject<any>).next(convertedData);
        }
      });
      
      // Zustand 스토어에 이벤트 발생 기록
      socketStoreAdapter.recordEventEmission(this.socket!, event, convertedData);
      
      logger.debug('SocketService', `이벤트 발신: ${event}`);
    } catch (error) {
      logger.error('SocketService', `이벤트 발신 중 오류 발생: ${event}`, error);
    }
  }
  
  // 이벤트 스로틀링 적용 여부 결정
  private _shouldThrottleEvent(event: string): boolean {
    // 이벤트가 없거나 문자열이 아닌 경우 스로틀링 적용하지 않음
    if (!event || typeof event !== 'string') {
      return false;
    }
    
    // 디버깅: 이벤트 스로틀링 여부 로깅
    logger.debug('SocketService', '이벤트 스로틀링 여부 확인', {
      event,
      throttle: event.includes('typing') || event.includes('scroll') || event.includes('mouse_move')
    });
    
    // 자주 발생하는 이벤트에 스로틀링 적용
    const throttleEvents = [
      'typing', 'scroll', 'mouse_move', 'position_update',
      'progress_update', 'search_typing'
    ];
    
    return throttleEvents.some(e => event.includes(e));
  }
  
  // 이벤트 디바운싱 적용 여부 결정
  private _shouldDebounceEvent(event: string): boolean {
    // 마지막 값만 중요한 이벤트에 디바운싱 적용
    const debounceEvents = [
      'filter_change', 'search_query', 'input_change',
      'text_complete', 'resize', 'settings_change'
    ];
    
    return debounceEvents.some(e => event.includes(e));
  }

  // 모든 리스너에게 이벤트 알림
  private _notifyListeners(event: string, data?: any): void {
    if (this.listeners[event]) {
      // 디버깅: 데이터 케이스 변환 전 로깅 (구독 관련 이벤트만)
      if (event === SOCKET_EVENTS.SUBSCRIPTION_STATUS || event === SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED) {
        logger.debug('이벤트 수신', `[${event}] 변환 전 데이터:`, {
          원본데이터: data,
          hasCveId: data?.cve_id !== undefined,
          hasCveIdCamel: data?.cveId !== undefined,
          hasSubscribers: data?.subscribers !== undefined,
          hasUsername: data?.username !== undefined,
          hasUserId: data?.user_id !== undefined,
          timestamp: new Date().toISOString()
        });
      }
      
      // 데이터 케이스 변환 처리 (snake_case -> camelCase)
      const convertedData = this._convertDataCasing(data, {
        direction: 'incoming',
        sourceName: `이벤트[${event}]`
      });
      
      // 디버깅: 데이터 케이스 변환 후 로깅 (구독 관련 이벤트만)
      if (event === SOCKET_EVENTS.SUBSCRIPTION_STATUS || event === SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED) {
        logger.debug('이벤트 수신', `[${event}] 변환 후 데이터:`, {
          변환데이터: convertedData,
          hasCveId: convertedData?.cve_id !== undefined,
          hasCveIdCamel: convertedData?.cveId !== undefined,
          hasSubscribers: convertedData?.subscribers !== undefined,
          hasUsername: convertedData?.username !== undefined,
          hasUserId: convertedData?.userId !== undefined,
          timestamp: new Date().toISOString()
        });
      }
      
      // 모든 리스너에게 알림
      this.listeners[event].forEach(callback => {
        try {
          callback(convertedData);
        } catch (error) {
          logger.error('SocketService', `리스너 호출 중 오류 발생: ${event}`, error);
        }
      });
    }
  }
  
  // 스로틀링된 리스너 알림 (많은 이벤트가 짧은 시간에 발생할 때 최적화)
  private _throttledNotifyListeners = _.throttle((event: string, data?: any) => {
    this._notifyListeners(event, data);
  }, 50, { leading: true, trailing: true });

  // 데이터 케이스 변환 처리
  private _convertDataCasing(data: any, options?: SocketCaseConverterOptions): any {
    if (!data) return data;
    
    const direction = options?.direction || 'incoming';
    const converter = direction === 'outgoing' ? camelToSnake : snakeToCamel;
    const sourceName = options?.sourceName || '알 수 없는 소스';
    
    // 디버깅: 변환 전 데이터 구조 로깅
    if (typeof data === 'object' && !Array.isArray(data)) {
      logger.debug('데이터 변환', `[${direction}] ${sourceName} - 변환 전:`, {
        keys: Object.keys(data),
        hasSubscribers: 'subscribers' in data,
        hasCveId: 'cve_id' in data || 'cveId' in data,
        originalData: data
      });
    }
    
    try {
      // 데이터 타입에 따라 변환 처리
      if (typeof data === 'object') {
        if (Array.isArray(data)) {
          return data.map(item => this._convertDataCasing(item, {
            ...options,
            sourceName: `${sourceName}[배열항목]`
          }));
        } else {
          const result: Record<string, any> = {};
          
          for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
              // 제외 필드인 경우 변환하지 않음
              const shouldExclude = EXCLUDED_FIELDS.includes(key);
              const newKey = shouldExclude ? key : converter(key);
              
              // 디버깅: 키 변환 과정 로깅 (필요한 경우 특정 필드만)
              if (key === 'cve_id' || key === 'cveId' || key === 'subscribers' || 
                  key === 'username' || key === 'user_id') {
                logger.debug('키 변환', `[${direction}] ${key} -> ${newKey}`, {
                  excluded: shouldExclude,
                  sourceName
                });
              }
              
              result[newKey] = this._convertDataCasing(data[key], {
                ...options, 
                sourceName: `${sourceName}.${key}`
              });
            }
          }
          
          // 디버깅: 변환 후 데이터 구조 로깅
          logger.debug('데이터 변환', `[${direction}] ${sourceName} - 변환 후:`, {
            keys: Object.keys(result),
            hasSubscribers: 'subscribers' in result,
            hasCveId: 'cve_id' in result || 'cveId' in result,
            convertedData: result
          });
          
          return result;
        }
      }
      
      return data;
    } catch (error) {
      logger.error('SocketService', '데이터 케이스 변환 중 오류 발생', error);
      return data;
    }
  }

  /**
   * 스토어와 서비스 상태 동기화 메서드
   */
  private _syncStoreState(): void {
    if (!this.socket) return;
    
    try {
      // 현재 서비스 상태와 스토어 상태 비교 및 동기화
      const storeState = useSocketStore.getState();
      
      // 연결 상태 동기화 (서비스 → 스토어)
      if (storeState.connectionState !== this._connectionState) {
        socketActions.setConnectionState(this._connectionState as any);
      }
      
      // 연결 여부 동기화
      if (storeState.connected !== this.isConnected) {
        socketActions.setConnected(this.isConnected);
      }
      
      // 연결 메트릭 업데이트
      if (this.isConnected && this.socket) {
        // 핑 테스트 실행
        this._measurePing();
      }
      
      logger.debug('SocketService', '상태 동기화 완료', {
        serviceState: this._connectionState,
        storeState: storeState.connectionState,
        isConnected: this.isConnected
      });
    } catch (error) {
      logger.error('SocketService', '상태 동기화 중 오류 발생', error);
    }
  }
  
  /**
   * 주기적 상태 동기화 설정
   */
  private _setupStateSynchronization(): void {
    // 이미 설정된 경우 중복 설정 방지
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    // 10초마다 상태 동기화
    this.syncInterval = setInterval(() => {
      this._syncStoreState();
    }, 10000);
    
    logger.debug('SocketService', '상태 동기화 타이머 설정됨');
  }
  
  /**
   * 핑 측정 메서드
   */
  private _measurePing(): void {
    if (!this.socket || !this.isConnected) return;
    
    const startTime = Date.now();
    
    // 핑-퐁 요청
    this.socket.emit('ping', () => {
      const pingTime = Date.now() - startTime;
      
      // 핑 기록 업데이트
      this.connectionMetrics.pingHistory.push(pingTime);
      
      // 최대 10개만 유지
      if (this.connectionMetrics.pingHistory.length > 10) {
        this.connectionMetrics.pingHistory.shift();
      }
      
      // 평균 지연 시간 계산
      const sum = this.connectionMetrics.pingHistory.reduce((a, b) => a + b, 0);
      this.connectionMetrics.averageLatency = 
        this.connectionMetrics.pingHistory.length > 0 
          ? sum / this.connectionMetrics.pingHistory.length 
          : null;
      
      logger.debug('SocketService', '핑 측정 완료', {
        pingTime,
        averageLatency: this.connectionMetrics.averageLatency
      });
    });
  }
  
  // 연결 메트릭 가져오기
  getConnectionMetrics(): any {
    return {
      ...this.connectionMetrics,
      currentState: this._connectionState,
      isConnected: this.isConnected,
      socketId: this.socket?.id || null,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 지수 백오프를 사용한 재연결 지연 시간 계산
   */
  private _calculateReconnectDelay(): number {
    const baseDelay = 1000; // 기본 1초
    const attempts = this.connectionMetrics.connectAttempts;
    const maxDelay = 30000; // 최대 30초
    
    // 지수 백오프: 기본 지연 * 2^시도횟수 + 랜덤 지터(0-1000ms)
    const exponentialDelay = baseDelay * Math.pow(2, Math.min(attempts, 5));
    const jitter = Math.random() * 1000;
    
    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  // 소켓 객체 반환
  getSocket(): Socket | null {
    return this.socket;
  }

  // 소켓 연결 상태 확인
  isSocketConnected(): boolean {
    return this.socket !== null && this.socket.connected;
  }

  // 소켓이 연결 중인지 확인
  isConnecting(): boolean {
    return this._connectionState === SOCKET_STATE.CONNECTING;
  }

  // 연결 상태 가져오기
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  // socketRxService에서 가져온 메소드들 ==================

  /**
   * 특정 이벤트를 Observable로 변환
   * 
   * 지정된 Socket.IO 이벤트를 RxJS Observable로 변환합니다.
   * 이를 통해 이벤트 스트림에 대한 다양한 RxJS 연산자 적용이 가능해집니다.
   * 
   * @param eventName - 구독할 이벤트 이름
   * @param componentId - 컴포넌트 식별자 (언마운트 시 정리를 위해 사용)
   * @returns Observable<T> - 이벤트 데이터 스트림
   */
  fromEvent<T = any>(eventName: string, componentId: string = 'global'): Observable<T> {
    const cacheKey = `${eventName}_${componentId}`;
    
    // 캐시된 Observable이 있으면 반환
    if (this.eventObservables.has(cacheKey)) {
      return this.eventObservables.get(cacheKey) as Observable<T>;
    }
    
    // 소켓 상태 및 인스턴스 확인
    if (!this.socket) {
      logger.warn('SocketService', `소켓 인스턴스가 없어 이벤트 스트림 생성 불가: ${eventName}`);
      return EMPTY;
    }
    
    // 컴포넌트별 정리를 위한 Subject 생성 또는 가져오기
    if (!this.destroySubjects.has(componentId)) {
      this.destroySubjects.set(componentId, new Subject<void>());
    }
    const destroySubject = this.destroySubjects.get(componentId)!;
    
    // fromEvent를 사용하여 소켓 이벤트를 Observable로 변환
    const observable = fromEvent<T>(this.socket, eventName).pipe(
      // 로깅
      map(data => {
        logger.debug('SocketService', `이벤트 수신: ${eventName}`, data);
        // 데이터 케이스 변환 처리 (snake_case -> camelCase)
        return this._convertDataCasing(data) as T;
      }),
      // 오류 처리
      catchError(error => {
        logger.error('SocketService', `이벤트 처리 중 오류: ${eventName}`, error);
        return throwError(() => error);
      }),
      // 자동 재시도 (최대 3회)
      retry({ count: 3, delay: 1000 }),
      // 컴포넌트 언마운트 시 구독 해제
      takeUntil(destroySubject),
      // 여러 구독자가 동일한 Observable을 공유하도록 설정
      shareReplay(1),
      // 완료 시 정리
      finalize(() => {
        logger.debug('SocketService', `이벤트 스트림 종료: ${eventName}`);
        this.eventObservables.delete(cacheKey);
      })
    );
    
    // 캐시에 저장
    this.eventObservables.set(cacheKey, observable);
    
    return observable;
  }

  /**
   * 특정 이벤트 스트림에서 필터링된 데이터만 추출
   * 
   * 이벤트 스트림에서 특정 조건을 만족하는 데이터만 필터링합니다.
   * 예를 들어, 특정 사용자 ID에 관한 알림만 구독하는 등의 활용이 가능합니다.
   * 
   * @param eventName - 구독할 이벤트 이름
   * @param predicate - 필터링 조건 함수
   * @param componentId - 컴포넌트 식별자
   * @returns Observable<T> - 필터링된 이벤트 데이터 스트림
   */
  fromFilteredEvent<T = any>(
    eventName: string, 
    predicate: (data: T) => boolean,
    componentId: string = 'global'
  ): Observable<T> {
    return this.fromEvent<T>(eventName, componentId).pipe(
      filter(predicate)
    );
  }

  /**
   * 연결 상태 Observable 반환
   * 
   * 소켓 연결 상태를 관찰할 수 있는 Observable을 반환합니다.
   * 이를 통해 컴포넌트에서 연결 상태 변화에 반응할 수 있습니다.
   * 
   * @returns Observable<string> - 연결 상태 스트림
   */
  getConnectionState(): Observable<string> {
    return this.connectionStateSubject.asObservable();
  }

  /**
   * 특정 연결 상태를 감지하는 Observable 반환
   * 
   * 지정된 연결 상태와 일치할 때만 값을 발행하는 Observable을 반환합니다.
   * 
   * @param state - 감지할 연결 상태
   * @returns Observable<boolean> - 상태 일치 여부 스트림
   */
  whenConnectionState(state: string): Observable<boolean> {
    return this.getConnectionState().pipe(
      map(currentState => currentState === state),
      filter(isMatch => isMatch)
    );
  }

  /**
   * 연결됨 상태를 감지하는 Observable 반환
   * 
   * 소켓이 연결된 상태일 때만 값을 발행하는 Observable을 반환합니다.
   * 
   * @returns Observable<boolean> - 연결 상태 스트림
   */
  whenConnected(): Observable<boolean> {
    return this.whenConnectionState(SOCKET_STATE.CONNECTED);
  }

  /**
   * 컴포넌트 정리
   * 
   * 컴포넌트가 언마운트될 때 해당 컴포넌트의 모든 이벤트 구독을 해제합니다.
   * useEffect의 cleanup 함수에서 호출하여 메모리 누수를 방지합니다.
   * 
   * @param componentId - 정리할 컴포넌트 식별자
   */
  cleanup(componentId: string): void {
    if (this.destroySubjects.has(componentId)) {
      const subject = this.destroySubjects.get(componentId)!;
      subject.next();
      subject.complete();
      this.destroySubjects.delete(componentId);
      
      // 해당 컴포넌트와 관련된 모든 캐시된 Observable 제거
      const keysToRemove: string[] = [];
      this.eventObservables.forEach((_, key) => {
        if (key.endsWith(`_${componentId}`)) {
          keysToRemove.push(key);
        }
      });
      
      keysToRemove.forEach(key => {
        this.eventObservables.delete(key);
      });
      
      logger.debug('SocketService', `컴포넌트 정리 완료: ${componentId}`);
    }
  }

  // 리소스 정리
  cleanupAll(): void {
    // 모든 타이머 정리
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.pingTimeoutId) {
      clearTimeout(this.pingTimeoutId);
      this.pingTimeoutId = null;
    }
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    if (this.reconnectBackoffTimer) {
      clearTimeout(this.reconnectBackoffTimer);
      this.reconnectBackoffTimer = null;
    }
    
    // 모든 RxJS Subject 정리
    this.destroySubjects.forEach((subject) => {
      subject.next();
      subject.complete();
    });
    this.destroySubjects.clear();
    
    // 캐시 정리
    this.eventTimestamps.clear();
    this.eventCache.clear();
    this.caseConversionCache.clear();
    this.eventObservables.clear();
    
    // 연결 해제
    this.disconnect();
    
    logger.info('SocketService', '모든 리소스 정리 완료');
  }

  // 추가 메소드들 (socketioWithStore에서 가져온 메소드들) ==================

  /**
   * CVE 구독 요청
   * 
   * @param cveId - 구독할 CVE ID
   */
  subscribeCVE(cveId: string): void {
    if (!cveId) return;
    
    logger.info('SocketService', `CVE 구독 요청: ${cveId}`);
    
    // 이미 구독중인 경우 중복 구독 방지
    if (this.subscribedCVEs.has(cveId)) {
      logger.info('SocketService', `이미 구독 중인 CVE입니다: ${cveId}`);
      return;
    }
    
    // 구독 상태에 추가
    this.subscribedCVEs.add(cveId);
    this._saveSubscribedCVEs();
    
    // 소켓이 연결된 경우에만 요청 전송
    if (this.isSocketConnected()) {
      // 디버깅: 백엔드에서 기대하는 형식(cve_id)으로 전송
      this.socket?.emit(SOCKET_EVENTS.SUBSCRIBE_CVE, { cve_id: cveId });
    } else {
      // 연결되지 않은 경우 보류 목록에 추가
      logger.info('SocketService', `소켓이 연결되지 않아 구독 요청을 보류합니다: ${cveId}`);
      this.pendingSubscriptions.add(cveId);
    }
    
    // 구독 상태 변경 이벤트 발행
    this._notifySubscriptionChange();
  }
  
  /**
   * CVE 구독 해제 요청
   * 
   * @param cveId - 구독 해제할 CVE ID
   */
  unsubscribeCVE(cveId: string): void {
    if (!cveId) return;
    
    logger.info('SocketService', `CVE 구독 해제 요청: ${cveId}`);
    
    // 구독 목록에서 제거
    this.subscribedCVEs.delete(cveId);
    this.pendingSubscriptions.delete(cveId);
    this._saveSubscribedCVEs();
    
    // 소켓이 연결된 경우에만 요청 전송
    if (this.isSocketConnected()) {
      // 디버깅: 백엔드에서 기대하는 형식(cve_id)으로 전송
      this.socket?.emit(SOCKET_EVENTS.UNSUBSCRIBE_CVE, { cve_id: cveId });
    }
    
    // 구독 상태 변경 이벤트 발행
    this._notifySubscriptionChange();
  }
  
  /**
   * 특정 CVE 구독 상태 확인
   * 
   * @param cveId - 확인할 CVE ID
   * @returns 구독 중인지 여부
   */
  isSubscribedToCVE(cveId: string): boolean {
    return this.subscribedCVEs.has(cveId);
  }
  
  /**
   * 구독 중인 모든 CVE 목록 반환
   * 
   * @returns 구독 중인 CVE ID 배열
   */
  getSubscribedCVEs(): string[] {
    return Array.from(this.subscribedCVEs);
  }
  
  /**
   * 구독 상태 변경 이벤트를 관찰할 수 있는 Observable을 반환
   * 
   * @returns 구독 중인 CVE ID 배열을 포함하는 Observable
   */
  getSubscriptionChanges(): Observable<string[]> {
    return this.subscriptionChangeSubject.asObservable();
  }
  
  /**
   * 구독 상태 변경을 알림
   * 내부 메서드로, 구독 목록이 변경될 때마다 호출됨
   */
  private _notifySubscriptionChange(): void {
    const subscribedCVEs = this.getSubscribedCVEs();
    // 모든 리스너에게 변경 사항 알림 (내부 Subject 이용)
    this.subscriptionChangeSubject.next(subscribedCVEs);
    
    // 소켓 이벤트를 통해 변경 알림 (외부 컴포넌트가 감지할 수 있도록)
    this._notifyListeners(SUBSCRIPTION_EVENTS.SUBSCRIPTIONS_CHANGED, { cveIds: subscribedCVEs });
    
    // 소켓 이벤트 발행 (다른 클라이언트나 탭에서도 감지할 수 있도록)
    if (this.isSocketConnected()) {
      this.socket?.emit(SUBSCRIPTION_EVENTS.SUBSCRIBED_CVES_UPDATED, { cveIds: subscribedCVEs });
    }
    
    logger.debug('SocketService', `구독 상태 변경 알림: ${subscribedCVEs.length}개 CVE`);
  }
  
  // 기존에 구독 중이던 CVE 재구독
  private _restoreSubscriptions(): void {
    if (!this.isSocketConnected()) {
      logger.warn('SocketService', '소켓이 연결되지 않아 구독 복원을 스킵합니다.');
      return;
    }
    
    // 기존에 구독 중이던 CVE 재구독
    this.subscribedCVEs.forEach(cveId => {
      logger.info('SocketService', `구독 복원: ${cveId}`);
      // 디버깅: 백엔드에서 기대하는 형식(cve_id)으로 전송 
      this.socket?.emit(SOCKET_EVENTS.SUBSCRIBE_CVE, { cve_id: cveId });
    });
    
    // 보류 중인 구독 요청 처리
    let pendingAdded = false;
    this.pendingSubscriptions.forEach(cveId => {
      logger.info('SocketService', `보류 중인 구독 처리: ${cveId}`);
      if (!this.subscribedCVEs.has(cveId)) {
        this.subscribedCVEs.add(cveId);
        pendingAdded = true;
      }
      // 디버깅: 백엔드에서 기대하는 형식(cve_id)으로 전송
      this.socket?.emit(SOCKET_EVENTS.SUBSCRIBE_CVE, { cve_id: cveId });
    });
    
    // 보류 중인 요청 목록 비우기
    this.pendingSubscriptions.clear();
    this._saveSubscribedCVEs();
    
    // 보류 중인 구독이 추가되었다면 변경 이벤트 발행
    if (pendingAdded) {
      this._notifySubscriptionChange();
    }
    
    logger.info('SocketService', `구독 복원 완료: ${this.subscribedCVEs.size}개 CVE`);
  }
  
  // 로컬 스토리지에 구독 상태 저장
  private _saveSubscribedCVEs(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(Array.from(this.subscribedCVEs)));
      } catch (error) {
        logger.error('SocketService', '구독 상태 저장 오류', error);
      }
    }
  }
  
  // 로컬 스토리지에서 구독 상태 불러오기
  private _loadSubscribedCVEs(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const savedSubscriptions = localStorage.getItem(this.LOCAL_STORAGE_KEY);
        if (savedSubscriptions) {
          const subscriptions = JSON.parse(savedSubscriptions) as string[];
          let changed = false;
          
          subscriptions.forEach(cveId => {
            if (cveId && !this.subscribedCVEs.has(cveId)) {
              this.subscribedCVEs.add(cveId);
              changed = true;
            }
          });
          
          if (changed) {
            // 구독 상태가 변경된 경우에만 알림
            this._notifySubscriptionChange();
          }
          
          logger.info('SocketService', `저장된 구독 상태 불러오기 완료: ${this.subscribedCVEs.size}개 CVE`);
        }
      } catch (error) {
        logger.error('SocketService', '구독 상태 불러오기 오류', error);
      }
    }
  }
  
  // 페이지 가시성 변경 처리
  private _handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      if (!this.isConnected) {
        logger.info('SocketService', '페이지 가시성 변경됨: 연결 시도');
        this._attemptReconnect();
      }
    }
  }
  
  // 온라인 상태 처리
  private _handleOnlineStatus(): void {
    logger.info('SocketService', '네트워크 상태: 온라인');
    if (!this.isConnected) {
      this._attemptReconnect();
    }
  }
  
  // 오프라인 상태 처리
  private _handleOfflineStatus(): void {
    logger.info('SocketService', '네트워크 상태: 오프라인');
    // 오프라인 상태에서는 별도 처리 없음 - 브라우저가 알아서 연결 끊김 처리
  }
  
  // 재연결 시도
  private _attemptReconnect(): void {
    if (this.autoReconnectEnabled) {
      if (this.currentReconnectAttempts < this.maxReconnectAttempts) {
        logger.info('SocketService', '재연결 시도...');
        this.currentReconnectAttempts++;
        this.connect();
      } else {
        logger.warn('SocketService', `최대 재연결 시도 횟수(${this.maxReconnectAttempts})를 초과했습니다.`);
      }
    }
  }

  // 재귀적 키 변환 (인터페이스 구현용)
  convertKeysRecursive(data: any, toCamelCase: boolean, options?: SocketCaseConverterOptions): any {
    const direction = toCamelCase ? 'incoming' : 'outgoing';
    return this._convertDataCasing(data, { ...options, direction });
  }

  // 인증 상태 변경 처리
  handleAuthStateChange(isAuthenticated: boolean): void {
    if (isAuthenticated) {
      // 인증된 경우 연결
      if (!this.isConnected) {
        this.connect();
      }
    } else {
      // 인증 해제된 경우 연결 해제
      if (this.isConnected) {
        this.disconnect();
      }
    }
  }
}

// 싱글톤 인스턴스 생성
const socketService = new SocketService();

export default socketService;