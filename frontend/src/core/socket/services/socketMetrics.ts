// services/socketMetrics.ts
import { Socket } from 'socket.io-client';
import logger from 'shared/utils/logging';
import socketEventBus from './socketEventBus';

/**
 * Socket 연결 품질 및 메트릭 관리 클래스
 * 소켓 연결의 성능 및 품질을 모니터링하고 통계를 수집합니다.
 */
export class SocketMetrics {
  // 연결 진단 및 모니터링
  private pingInterval: NodeJS.Timeout | null = null;
  private pingTimeoutId: NodeJS.Timeout | null = null;
  private lastPingTime: number | null = null;
  
  // 연결 메트릭
  private connectionMetrics = {
    connectAttempts: 0,
    lastConnectTime: null as number | null,
    disconnectCount: 0,
    errorCount: 0,
    lastErrorTime: null as number | null,
    averageLatency: null as number | null,
    pingHistory: [] as number[]
  };
  
  // 소켓 인스턴스 및 상태
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private connectionState: string = '';
  
  constructor() {
    // 이벤트 버스 구독 설정
    this._setupEventBusSubscriptions();
    
    logger.debug('SocketMetrics', '메트릭 관리자 초기화 완료');
  }
  
  /**
   * 이벤트 버스 구독 설정
   */
  private _setupEventBusSubscriptions(): void {
    // 소켓 인스턴스 생성 이벤트 구독
    socketEventBus.on('socketService:socketCreated').subscribe((socket: Socket) => {
      this.socket = socket;
      logger.debug('SocketMetrics', '소켓 인스턴스 업데이트됨');
    });
    
    // 소켓 연결 이벤트 구독
    socketEventBus.on('socketService:connected').subscribe(() => {
      this.isConnected = true;
      this.startConnectionQualityMonitoring();
      logger.debug('SocketMetrics', '연결 상태 업데이트됨: 연결됨');
    });
    
    // 소켓 연결 해제 이벤트 구독
    socketEventBus.on('socketService:disconnected').subscribe(() => {
      this.isConnected = false;
      this.socket = null;
      this.stopConnectionQualityMonitoring();
      logger.debug('SocketMetrics', '연결 상태 업데이트됨: 연결 해제됨');
    });
    
    // 소켓 연결 상태 업데이트 이벤트 구독
    socketEventBus.on('socketService:connectionState').subscribe((state: string) => {
      this.connectionState = state;
      logger.debug('SocketMetrics', `연결 상태 업데이트됨: ${state}`);
    });
    
    // 소켓 모니터링 요청 이벤트 구독
    socketEventBus.on('socketService:monitorSocket').subscribe((socket: Socket) => {
      this.socket = socket;
      this.startConnectionQualityMonitoring();
    });
  }
  
  /**
   * 연결 품질 모니터링 시작
   */
  startConnectionQualityMonitoring(): void {
    // 소켓 상태 및 이미 실행 중인지 확인
    if (!this.socket || !this.isConnected || this.pingInterval) {
      return;
    }
    
    // 60초 간격으로 핑 측정
    this.pingInterval = setInterval(() => {
      this._measurePing();
    }, 60000);
    
    logger.debug('SocketMetrics', '연결 품질 모니터링 시작');
  }
  
  /**
   * 연결 품질 모니터링 중지
   */
  stopConnectionQualityMonitoring(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.pingTimeoutId) {
      clearTimeout(this.pingTimeoutId);
      this.pingTimeoutId = null;
    }
    
    logger.debug('SocketMetrics', '연결 품질 모니터링 중지');
  }
  
  /**
   * 핑 측정
   */
  private _measurePing(): void {
    if (!this.socket || !this.isConnected) {
      return;
    }
    
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
      
      logger.debug('SocketMetrics', '핑 측정 완료', {
        pingTime,
        averageLatency: this.connectionMetrics.averageLatency
      });
    });
    
    // 핑 타임아웃 처리
    this.pingTimeoutId = setTimeout(() => {
      logger.warn('SocketMetrics', '핑 타임아웃 발생');
      this.pingTimeoutId = null;
    }, 5000);
  }
  
  /**
   * 연결 메트릭 가져오기
   */
  getConnectionMetrics(): any {
    return {
      ...this.connectionMetrics,
      currentState: this.connectionState,
      isConnected: this.isConnected,
      socketId: this.socket?.id || null,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 연결 메트릭 업데이트
   * @param metrics 업데이트할 메트릭 객체
   */
  updateConnectionMetrics(metrics: Partial<typeof this.connectionMetrics>): void {
    // 메트릭 업데이트
    Object.assign(this.connectionMetrics, metrics);
    
    logger.debug('SocketMetrics', '연결 메트릭 업데이트됨', metrics);
  }
  
  /**
   * 메트릭 리셋
   */
  resetMetrics(): void {
    this.connectionMetrics = {
      connectAttempts: 0,
      lastConnectTime: null,
      disconnectCount: 0,
      errorCount: 0,
      lastErrorTime: null,
      averageLatency: null,
      pingHistory: []
    };
    
    logger.debug('SocketMetrics', '연결 메트릭 초기화');
  }
}
