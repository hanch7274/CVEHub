// services/socketService.ts
import { io, Socket, ManagerOptions, SocketOptions as IOSocketOptions } from 'socket.io-client';
import { Observable, Subject, fromEvent, EMPTY, throwError, BehaviorSubject } from 'rxjs';
import { shareReplay, map, filter, catchError, retry, takeUntil, finalize } from 'rxjs/operators';
import _ from 'lodash';
import { getAccessToken } from 'shared/utils/storage/tokenStorage';
import logger from 'shared/utils/logging';
import socketStoreAdapter from './socketStoreAdapter';
import { socketActions } from '../state/socketStore';
import { getQueryClient } from 'shared/utils/reactQuery';
import socketEventBus from './socketEventBus';
import {
  SOCKET_EVENTS,
  SOCKET_STATE,
  CONNECTION_EVENTS
} from './constants';
import {
  SocketEventCallback,
  SocketOptions
} from '../types';
import { SocketEventManager } from 'core/socket/services/socketEventManager';
import { SocketMetrics } from 'core/socket/services/socketMetrics';

// Socket.io 경로 상수 (constants.ts에 없어서 여기에 직접 정의)
const SOCKET_IO_PATH = '/socket.io';

// 추가 소켓 상태 정의
const EXTENDED_SOCKET_STATE = {
  ...SOCKET_STATE,
  DISCONNECTING: 'disconnecting'
};

/**
 * Socket.IO 서비스 클래스
 * 
 * WebSocket 통신을 관리하고 RxJS를 통한 이벤트 스트림 처리를 제공합니다.
 * 이 클래스는 싱글톤 패턴으로 구현되어 애플리케이션 전체에서 일관된 소켓 연결을 유지합니다.
 */
class SocketService {
  // === 소켓 및 연결 상태 관리 ===
  socket: Socket | null = null;
  isConnected: boolean = false;
  private _connectionState: string = SOCKET_STATE.DISCONNECTED;
  private connectionStateSubject: BehaviorSubject<string>;
  private autoReconnectEnabled: boolean = true;
  private maxReconnectAttempts: number = 10;
  private currentReconnectAttempts: number = 0;
  
  // === 이벤트 및 리스너 관리 ===
  private options: SocketOptions | null = null;
  
  // 이벤트 관리자 및 메트릭 매니저
  private eventManager: SocketEventManager;
  private metricsManager: SocketMetrics;
  
  constructor() {
    // 상태 초기화
    this.connectionStateSubject = new BehaviorSubject<string>(SOCKET_STATE.DISCONNECTED);
    
    // 이벤트 버스에 초기 소켓 서비스 생성 이벤트 발행
    socketEventBus.publish('socketService:created', null);
    
    // 이벤트 관리자 및 메트릭 매니저 초기화 (직접 참조 없이 생성)
    this.eventManager = new SocketEventManager();
    this.metricsManager = new SocketMetrics();
    
    // 브라우저 환경에서 이벤트 리스너 설정
    if (typeof window !== 'undefined') {
      this._setupBrowserListeners();
    }
    
    // 이벤트 구독 설정
    this._setupEventBusSubscriptions();
  }
  
  /**
   * 이벤트 버스 구독 설정
   */
  private _setupEventBusSubscriptions(): void {
    // 소켓 인스턴스 요청 이벤트 구독
    socketEventBus.on('socketManager:getSocket').subscribe(() => {
      socketEventBus.publish('socketService:socket', this.socket);
    });
    
    // 연결 상태 요청 이벤트 구독
    socketEventBus.on('socketManager:getConnectionState').subscribe(() => {
      socketEventBus.publish('socketService:connectionState', this._connectionState);
    });
    
    // 연결 품질 모니터링 시작 요청 이벤트 구독
    socketEventBus.on('metrics:startMonitoring').subscribe(() => {
      // 소켓 인스턴스를 이벤트 페이로드로 전달
      if (this.socket) {
        socketEventBus.publish('socketService:monitorSocket', this.socket);
      }
    });
  }
  
  /**
   * 소켓 연결 생성
   * @param token JWT 토큰 (옵션)
   * @returns 소켓 인스턴스
   */
  connect(token?: string): Socket {
    try {
      // 이미 연결된 경우 기존 소켓 반환
      if (this.socket && this.isConnected) {
        return this.socket;
      }
      
      // 토큰이 없는 경우 토큰 가져오기 시도
      const accessToken = token || getAccessToken();
      
      // 토큰이 없으면 실패 처리
      if (!accessToken) {
        this._updateConnectionState(SOCKET_STATE.AUTH_ERROR);
        throw new Error('인증 토큰이 없어 WebSocket 연결을 시작할 수 없습니다.');
      }
      
      // 소켓 옵션 생성
      this.options = this._createOptions(accessToken);
      
      if (!this.options) {
        this._updateConnectionState(SOCKET_STATE.CONFIG_ERROR);
        throw new Error('WebSocket 설정을 생성할 수 없습니다.');
      }
      
      // 연결 상태 업데이트
      this._updateConnectionState(SOCKET_STATE.CONNECTING);
      
      // Socket.IO 인스턴스 생성
      const socketURL = this._getSocketIOURL();
      this.socket = io(socketURL, this.options);
      socketStoreAdapter.registerSocket(this.socket);
      
      // 이벤트 핸들러 설정
      this._setupEventHandlers();
      
      // 개발 환경에서 디버그 로깅 설정
      if (process.env.NODE_ENV === 'development') {
        this._setupDebugLogging();
      }
      
      // 소켓 인스턴스 생성 이벤트 발행
      if (this.socket) {
        socketEventBus.publish('socketService:socketCreated', this.socket);
      }
      
      // 메트릭 수집 시작 이벤트 발행
      socketEventBus.publish('socketService:connected', null);
      
      return this.socket;
    } catch (error) {
      this._updateConnectionState(SOCKET_STATE.ERROR);
      logger.error('SocketService', 'Socket.IO 연결 실패', error);
      throw error;
    }
  }
  
  /**
   * 소켓 연결 해제
   */
  disconnect(): void {
    if (!this.socket) {
      return;
    }
    
    try {
      logger.info('SocketService', '소켓 연결 해제 시작');
      
      // 연결 상태 업데이트
      this._updateConnectionState(EXTENDED_SOCKET_STATE.DISCONNECTING);
      
      // 연결 해제 이벤트 발행
      socketEventBus.publish('socketService:disconnecting', null);
      
      // 자동 재연결 비활성화
      this.autoReconnectEnabled = false;
      
      // 소켓 연결 해제
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      
      // 연결 상태 업데이트
      this._updateConnectionState(SOCKET_STATE.DISCONNECTED);
      
      // 연결 해제 완료 이벤트 발행
      socketEventBus.publish('socketService:disconnected', null);
      
      logger.info('SocketService', '소켓 연결 해제 완료');
    } catch (error) {
      logger.error('SocketService', '소켓 연결 해제 중 오류 발생', error);
    }
  }

  /**
   * 개발 환경에서 디버그 로깅 설정
   */
  private _setupDebugLogging(): void {
    if (!this.socket || process.env.NODE_ENV !== 'development') {
      return;
    }
    
    // 디버그 모드 활성화
    this.socket.onAny((event, ...args) => {
      console.log(`[소켓 수신] ${event}:`, ...args);
    });
    
    // 원본 emit 함수 저장
    const originalEmit = this.socket.emit;
    
    // emit 함수 오버라이드 (로깅 추가)
    this.socket.emit = function (event: string, ...args: any[]): any {
      console.log(`[소켓 전송] ${event}:`, ...args);
      return originalEmit.apply(this, [event, ...args]);
    };
  }
  
  /**
   * 소켓 연결 상태 확인
   */
  isSocketConnected(): boolean {
    return this.socket !== null && this.isConnected;
  }
  
  /**
   * 소켓 인스턴스 가져오기
   */
  getSocket(): Socket | null {
    return this.socket;
  }
  
  /**
   * 연결 상태 가져오기
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
  
  /**
   * 인증 상태 변경 처리
   * @param isAuthenticated 인증 여부
   */
  handleAuthStateChange(isAuthenticated: boolean): void {
    if (isAuthenticated) {
      // 인증되었으면 연결 시도
      if (!this.isConnected && !this.socket) {
        this.connect();
      }
    } else {
      // 인증이 해제되었으면 연결 해제
      if (this.isConnected || this.socket) {
        this.disconnect();
      }
    }
  }
  
  /**
   * Socket.IO URL 가져오기
   */
  private _getSocketIOURL(): string {
    const host = window.location.hostname;
    const port = process.env.NODE_ENV === 'development' ? '8000' : window.location.port;
    return `${window.location.protocol}//${host}${port ? `:${port}` : ''}`;
  }
  
  /**
   * 소켓 옵션 생성
   */
  private _createOptions(token: string): SocketOptions | null {
    if (!token) {
      return null;
    }
    
    return {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket'],
      auth: {
        token
      },
      path: SOCKET_IO_PATH,
      extraHeaders: {
        Authorization: `Bearer ${token}`
      }
    };
  }
  
  /**
   * 연결 상태 업데이트
   */
  private _updateConnectionState(state: string): void {
    if (this._connectionState === state) {
      return;
    }
    
    this._connectionState = state;
    this.connectionStateSubject.next(state);
    
    // 상태 변경 이벤트 발생
    socketStoreAdapter.dispatch(() => {
      socketActions.updateConnectionState({
        connectionState: state,
        isConnected: state === SOCKET_STATE.CONNECTED
      });
    });
    
    // 로그 출력
    logger.debug('SocketService', '소켓 연결 상태 변경', { state });
  }
  
  /**
   * 이벤트 핸들러 설정
   */
  private _setupEventHandlers(): void {
    if (!this.socket) {
      return;
    }
    
    // 주요 연결 이벤트 설정
    this.socket.on(CONNECTION_EVENTS.CONNECT, this._handleConnect.bind(this));
    this.socket.on(CONNECTION_EVENTS.DISCONNECT, this._handleDisconnect.bind(this));
    this.socket.on(CONNECTION_EVENTS.CONNECT_ERROR, this._handleConnectError.bind(this));
    
    // 재연결 관련 이벤트
    this.socket.on(CONNECTION_EVENTS.RECONNECT_ATTEMPT, (attempt: number) => {
      this._updateConnectionState(SOCKET_STATE.RECONNECTING);
      logger.debug('SocketService', '소켓 재연결 시도', { attempt });
    });
    
    this.socket.on(CONNECTION_EVENTS.RECONNECT, () => {
      this._updateConnectionState(SOCKET_STATE.CONNECTED);
      logger.debug('SocketService', '소켓 재연결 성공');
    });
  }
  
  /**
   * 연결 이벤트 핸들러
   */
  private _handleConnect(): void {
    this.isConnected = true;
    this.currentReconnectAttempts = 0;
    this._updateConnectionState(SOCKET_STATE.CONNECTED);
    
    // 연결 메트릭 업데이트
    this.metricsManager.updateConnectionMetrics({
      lastConnectTime: Date.now(),
      connectAttempts: this.metricsManager.getConnectionMetrics().connectAttempts + 1
    });
    
    logger.info('SocketService', '소켓 연결 성공');
    
    // React Query 클라이언트 무효화 (선택적)
    if (getQueryClient()) {
      getQueryClient().invalidateQueries({ queryKey: ['socket-connected'] });
    }
    
    // 서버로 사용자 정보 전송 (필요시)
    if (this.socket) {
      this.emit('client_connected', { timestamp: new Date().toISOString() });
    }
  }
  
  /**
   * 연결 해제 이벤트 핸들러
   */
  private _handleDisconnect(reason: string): void {
    this.isConnected = false;
    this._updateConnectionState(SOCKET_STATE.DISCONNECTED);
    
    // 메트릭 업데이트
    this.metricsManager.updateConnectionMetrics({
      disconnectCount: this.metricsManager.getConnectionMetrics().disconnectCount + 1
    });
    
    logger.info('SocketService', '소켓 연결 해제', { reason });
    
    // 자동 재연결 처리
    if (this.autoReconnectEnabled && this.currentReconnectAttempts < this.maxReconnectAttempts) {
      this._attemptReconnect();
    }
  }
  
  /**
   * 연결 오류 이벤트 핸들러
   */
  private _handleConnectError(error: any): void {
    this.isConnected = false;
    this._updateConnectionState(SOCKET_STATE.ERROR);
    
    // 메트릭 업데이트
    this.metricsManager.updateConnectionMetrics({
      errorCount: this.metricsManager.getConnectionMetrics().errorCount + 1,
      lastErrorTime: Date.now()
    });
    
    // 에러 로깅
    logger.error('SocketService', '소켓 연결 오류', error);
    
    // 자동 재연결 로직
    if (this.autoReconnectEnabled && this.currentReconnectAttempts < this.maxReconnectAttempts) {
      this._attemptReconnect();
    } else if (this.currentReconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('SocketService', '최대 재연결 시도 횟수 초과');
      this._updateConnectionState(SOCKET_STATE.FAILED);
    }
  }
  
  /**
   * 브라우저 이벤트 리스너 설정
   */
  private _setupBrowserListeners(): void {
    // 페이지 가시성 변경 이벤트
    document.addEventListener('visibilitychange', this._handleVisibilityChange.bind(this));
    
    // 온라인/오프라인 상태 변경 이벤트
    window.addEventListener('online', this._handleOnlineStatus.bind(this));
    window.addEventListener('offline', this._handleOfflineStatus.bind(this));
    
    // 페이지 언로드 이벤트
    window.addEventListener('beforeunload', () => {
      if (this.socket && this.isConnected) {
        this.socket.emit('client_disconnecting');
      }
    });
  }
  
  /**
   * 페이지 가시성 변경 처리
   */
  private _handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      // 페이지가 다시 표시되면 연결 상태 확인 및 필요시 재연결
      if (this.socket && !this.isConnected && this.autoReconnectEnabled) {
        logger.debug('SocketService', '페이지 포커스로 재연결 시도');
        this._attemptReconnect();
      }
      
      // 활성 상태 알림 (옵션)
      if (this.socket && this.isConnected) {
        this.socket.emit('client_active');
      }
    } else if (document.visibilityState === 'hidden') {
      // 페이지가 숨겨지면 활동 중지 상태 알림 (옵션)
      if (this.socket && this.isConnected) {
        this.socket.emit('client_inactive');
      }
    }
  }
  
  /**
   * 온라인 상태 처리
   */
  private _handleOnlineStatus(): void {
    logger.debug('SocketService', '네트워크 온라인 상태 감지');
    
    if (!this.isConnected && this.autoReconnectEnabled) {
      this._attemptReconnect();
    }
  }
  
  /**
   * 오프라인 상태 처리
   */
  private _handleOfflineStatus(): void {
    logger.debug('SocketService', '네트워크 오프라인 상태 감지');
    this._updateConnectionState(SOCKET_STATE.OFFLINE);
  }
  
  /**
   * 재연결 시도
   */
  private _attemptReconnect(): void {
    // 이미 연결 중이거나 재연결 중인 경우 건너뛰기
    if (
      this.isConnected || 
      this._connectionState === SOCKET_STATE.CONNECTING || 
      this._connectionState === SOCKET_STATE.RECONNECTING
    ) {
      return;
    }
    
    this.currentReconnectAttempts++;
    this._updateConnectionState(SOCKET_STATE.RECONNECTING);
    
    // 지수 백오프 사용한 재연결 지연 계산
    const delay = this._calculateReconnectDelay();
    
    logger.debug('SocketService', '소켓 재연결 시도 예약', {
      attempt: this.currentReconnectAttempts,
      delay,
      maxAttempts: this.maxReconnectAttempts
    });
    
    // 지연 후 재연결
    setTimeout(() => {
      if (!this.isConnected && this.autoReconnectEnabled) {
        this.connect();
      }
    }, delay);
  }
  
  /**
   * 지수 백오프를 사용한 재연결 지연 시간 계산
   */
  private _calculateReconnectDelay(): number {
    // 기본 지연 시간 (1초)
    const baseDelay = 1000;
    
    // 최대 지연 시간 (1분)
    const maxDelay = 60000;
    
    // 무작위성 추가 (지터)
    const jitter = 0.5 * Math.random();
    
    // 지수 백오프 계산 (2^n * 기본지연)
    const exponentialDelay = Math.min(
      maxDelay,
      baseDelay * Math.pow(2, this.currentReconnectAttempts - 1)
    );
    
    // 지터를 적용한 최종 지연 시간
    return Math.floor(exponentialDelay * (1 + jitter));
  }
  
  /**
   * 이벤트 구독
   * @param event 이벤트 이름
   * @param callback 콜백 함수
   * @returns 구독 해제 함수
   */
  on(event: string, callback: SocketEventCallback): () => void {
    return this.eventManager.on(event, callback);
  }
  
  /**
   * addEventListener는 on의 별칭으로 구현
   */
  addEventListener(event: string, callback: SocketEventCallback): () => void {
    return this.on(event, callback);
  }
  
  /**
   * 이벤트 구독 해제
   * @param event 이벤트 이름
   * @param callback 콜백 함수
   */
  off(event: string, callback: SocketEventCallback): void {
    this.eventManager.off(event, callback);
  }
  
  /**
   * removeEventListener는 off의 별칭으로 구현
   */
  removeEventListener(event: string, callback: SocketEventCallback): void {
    this.off(event, callback);
  }
  
  /**
   * 이벤트 발생
   * @param event 이벤트 이름
   * @param data 이벤트 데이터
   */
  emit(event: string, data?: any): void {
    this.eventManager.emit(event, data);
  }
  
  /**
   * Observable 형태로 이벤트 구독
   * @param event 이벤트 이름
   * @returns 이벤트 스트림
   */
  fromEvent<T = any>(event: string): Observable<T> {
    return this.eventManager.fromEvent<T>(event);
  }
  
  /**
   * 연결 상태 변경 이벤트 스트림
   */
  connectionState$(): Observable<string> {
    return this.connectionStateSubject.asObservable();
  }
  
  /**
   * 연결 품질 메트릭 가져오기
   */
  getConnectionMetrics(): any {
    return this.metricsManager.getConnectionMetrics();
  }
  
  /**
   * 특정 CVE 구독 상태 업데이트
   * @param cveId CVE ID
   * @param isSubscribed 구독 상태
   */
  updateSubscription(cveId: string, isSubscribed: boolean): void {
    try {
      const socket = this.socket;
      
      // 구독 이벤트 처리 및 전송
      if (isSubscribed) {
        // 구독 추가
        logger.debug('SocketService', `CVE 구독 업데이트: ${cveId} (구독)`, { isSubscribed });
        
        // 소켓이 연결된 경우 서버에 이벤트 전송
        if (socket && this.isConnected) {
          this.emit('subscribe_cve', { cve_id: cveId });
        }
      } else {
        // 구독 취소
        logger.debug('SocketService', `CVE 구독 업데이트: ${cveId} (구독 취소)`, { isSubscribed });
        
        // 소켓이 연결된 경우 서버에 이벤트 전송
        if (socket && this.isConnected) {
          this.emit('unsubscribe_cve', { cve_id: cveId });
        }
      }
    } catch (error) {
      logger.error('SocketService', '구독 상태 업데이트 중 오류 발생', error);
    }
  }
}

// 싱글톤 인스턴스 생성
const socketService = new SocketService();

export default socketService;