import { Socket } from 'socket.io-client';
import { CONNECTION_EVENTS, SOCKET_STATE } from './constants';
import logger from 'shared/utils/logging';
import _ from 'lodash';
import useSocketStore, { socketActions } from '../state/socketStore';

/**
 * Socket.IO 서비스와 Zustand 스토어 간의 어댑터
 * 
 * 이 클래스는 Socket.IO 서비스의 이벤트와 상태를 Zustand 스토어에 동기화하는 역할을 합니다.
 * 소켓 연결 상태 변화, 이벤트 발생, 오류 처리 등을 감지하여 중앙화된 스토어에 반영합니다.
 * 이를 통해 애플리케이션 전체에서 일관된 소켓 상태를 유지하고 접근할 수 있습니다.
 */
class SocketStoreAdapter {
  private networkListenersAttached: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionDiagnostics = {
    lastConnectedTime: null as Date | null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    pingTimes: [] as number[]
  };

  /**
   * 생성자
   * 
   * 네트워크 상태 변화 감지 초기화를 수행합니다.
   */
  constructor() {
    // 네트워크 상태 변화 감지 초기화
    this.handleNetworkStatusChange();
  }

  /**
   * 소켓 인스턴스를 스토어에 등록합니다.
   * 
   * 새 소켓 인스턴스가 생성되면 이 메서드를 통해 Zustand 스토어에 등록합니다.
   * 소켓 이벤트 리스너를 설정하고 네트워크 상태 모니터링을 시작합니다.
   * 
   * @param socket - 등록할 Socket.IO 소켓 인스턴스
   */
  registerSocket(socket: Socket | null): void {
    socketActions.setSocket(socket);
    
    if (socket) {
      this.setupSocketListeners(socket);
      this.handleReconnection(socket);
    }
  }
  
  /**
   * 소켓 이벤트 리스너를 설정합니다.
   * 
   * 소켓의 연결, 연결 해제, 오류 등 다양한 이벤트에 대한 리스너를 등록합니다.
   * 각 이벤트 발생 시 Zustand 스토어 상태를 업데이트하여 UI에 반영됩니다.
   * 
   * @param socket - 이벤트 리스너를 설정할 Socket.IO 소켓 인스턴스
   */
  private setupSocketListeners(socket: Socket): void {
    // 연결 이벤트 리스너
    socket.on(CONNECTION_EVENTS.CONNECT, () => {
      socketActions.setConnected(true);
      socketActions.setConnectionError(null);
      
      // 연결 진단 정보 업데이트
      this.connectionDiagnostics.lastConnectedTime = new Date();
      this.connectionDiagnostics.reconnectAttempts = 0;
      
      logger.info('SocketStoreAdapter', '소켓 연결됨', {
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });
      
      // 연결 품질 측정 시작
      this.startConnectionQualityMonitoring(socket);
    });
    
    // 연결 해제 이벤트 리스너
    socket.on(CONNECTION_EVENTS.DISCONNECT, (reason) => {
      socketActions.setConnected(false);
      
      // 계획된 연결 해제인지 확인
      const isPlannedDisconnect = reason === 'io client disconnect';
      
      logger.info('SocketStoreAdapter', '소켓 연결 해제됨', {
        reason,
        isPlannedDisconnect,
        timestamp: new Date().toISOString()
      });
      
      // 계획되지 않은 연결 해제인 경우 재연결 전략 실행
      if (!isPlannedDisconnect) {
        this.handleUnplannedDisconnect(reason);
      }
    });
    
    // 연결 오류 이벤트 리스너
    socket.on(CONNECTION_EVENTS.CONNECT_ERROR, (error) => {
      socketActions.setConnected(false);
      socketActions.setConnectionError(error);
      socketActions.setConnectionState(SOCKET_STATE.ERROR);
      
      // 오류 세부 정보 기록
      const errorDetails = {
        message: error.message,
        type: error.name,
        timestamp: new Date().toISOString()
      };
      
      logger.error('SocketStoreAdapter', '소켓 연결 오류', errorDetails);
      
      // 오류 유형에 따른 차별화된 처리
      this.handleConnectionError(error);
    });
  }
  
  /**
   * 이벤트 핸들러 등록
   * 
   * 이벤트 이름과 핸들러 함수를 등록하여 이벤트 발생 시 호출할 수 있도록 합니다.
   * 
   * @param event - 이벤트 이름
   * @param handler - 이벤트 핸들러 함수
   */
  registerEventHandler(event: string, handler: (data: any) => void): void {
    socketActions.addEventHandler(event, handler);
    logger.debug('SocketStoreAdapter', `이벤트 핸들러 등록: ${event}`);
  }
  
  /**
   * 이벤트 핸들러 제거
   * 
   * 등록된 이벤트 핸들러를 제거하여 이벤트 발생 시 호출되지 않도록 합니다.
   * 
   * @param event - 이벤트 이름
   * @param handler - 이벤트 핸들러 함수
   */
  unregisterEventHandler(event: string, handler: (data: any) => void): void {
    socketActions.removeEventHandler(event, handler);
    logger.debug('SocketStoreAdapter', `이벤트 핸들러 제거: ${event}`);
  }
  
  /**
   * 이벤트 발생 기록
   * 
   * 소켓 이벤트가 발생할 때 이를 스토어에 기록합니다.
   * 이벤트 이름, 데이터, 타임스탬프 등을 저장하여 디버깅 및 분석에 활용할 수 있습니다.
   * 
   * @param socket - 이벤트가 발생한 Socket.IO 소켓 인스턴스
   * @param event - 발생한 이벤트 이름
   * @param data - 이벤트와 함께 전송된 데이터
   */
  recordEventEmission(socket: Socket, event: string, data: any): void {
    socketActions.emitEvent(socket, event, data);
    logger.debug('SocketStoreAdapter', `이벤트 발생 기록: ${event}`);
  }
  
  /**
   * 연결 재시도 관련 기능 강화
   * 
   * 연결이 끊어진 경우 재연결을 시도합니다.
   * 재연결 시도 횟수, 지연 시간 등을 관리하여 효율적인 재연결 전략을 구현합니다.
   * 
   * @param socket - 재연결을 시도할 Socket.IO 소켓 인스턴스
   */
  handleReconnection(socket: Socket): void {
    // 재연결 시도 이벤트
    socket.on('reconnect_attempt', (attemptNumber) => {
      this.connectionDiagnostics.reconnectAttempts = attemptNumber;
      
      // 스토어 상태 업데이트
      socketActions.setConnectionState(SOCKET_STATE.RECONNECTING);
      
      // 로그 기록
      logger.info('SocketStoreAdapter', `재연결 시도 중 (${attemptNumber}/${this.connectionDiagnostics.maxReconnectAttempts})`, {
        attemptNumber,
        maxAttempts: this.connectionDiagnostics.maxReconnectAttempts,
        timestamp: new Date().toISOString()
      });
    });
    
    // 재연결 실패 이벤트
    socket.on('reconnect_failed', () => {
      // 최대 재시도 횟수 초과
      socketActions.setConnectionState(SOCKET_STATE.ERROR);
      socketActions.setConnectionError(new Error('최대 재연결 시도 횟수를 초과했습니다.'));
      
      logger.error('SocketStoreAdapter', '재연결 실패', {
        attempts: this.connectionDiagnostics.reconnectAttempts,
        maxAttempts: this.connectionDiagnostics.maxReconnectAttempts,
        timestamp: new Date().toISOString()
      });
      
      // 백오프 전략으로 재시도 
      this.executeReconnectBackoffStrategy();
    });
    
    // 재연결 성공 이벤트
    socket.on('reconnect', (attemptNumber) => {
      socketActions.setConnected(true);
      socketActions.setConnectionState(SOCKET_STATE.CONNECTED);
      socketActions.setConnectionError(null);
      
      // 연결 진단 정보 업데이트
      this.connectionDiagnostics.lastConnectedTime = new Date();
      this.connectionDiagnostics.reconnectAttempts = 0;
      
      logger.info('SocketStoreAdapter', `재연결 성공 (${attemptNumber}회 시도)`, {
        attemptNumber,
        timestamp: new Date().toISOString()
      });
      
      // 재시도 타이머 정리
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    });
  }
  
  /**
   * 계획되지 않은 연결 해제 처리
   * 
   * 연결이 끊어졌을 때 호출됩니다.
   * 연결 해제 이유에 따라 다른 상태로 업데이트합니다.
   * 예: 전송 계층 닫힘, 핑 타임아웃, 전송 오류 등
   * 이를 통해 UI에서 사용자에게 적절한 피드백을 제공할 수 있습니다.
   * 
   * @param reason - 연결 해제 이유
   */
  private handleUnplannedDisconnect(reason: string): void {
    // 원인에 따른 적절한 상태 설정
    switch (reason) {
      case 'transport close':
        socketActions.setConnectionState(SOCKET_STATE.TRANSPORT_CLOSED);
        break;
      case 'ping timeout':
        socketActions.setConnectionState(SOCKET_STATE.PING_TIMEOUT);
        break;
      case 'transport error':
        socketActions.setConnectionState(SOCKET_STATE.TRANSPORT_ERROR);
        break;
      default:
        socketActions.setConnectionState(SOCKET_STATE.DISCONNECTED);
    }
    
    // 재연결 전략 실행 여부 결정
    const shouldAttemptReconnect = !navigator.onLine ? false : 
      this.connectionDiagnostics.reconnectAttempts < this.connectionDiagnostics.maxReconnectAttempts;
    
    if (shouldAttemptReconnect) {
      logger.info('SocketStoreAdapter', '자동 재연결 시도 예약됨', {
        reason,
        reconnectAttempts: this.connectionDiagnostics.reconnectAttempts,
        delay: this.calculateReconnectDelay()
      });
    }
  }
  
  /**
   * 연결 오류 처리
   * 
   * 연결 중 오류 발생 시 호출됩니다. 오류 유형에 따라 다른 처리를 합니다.
   * 인증 오류, 타임아웃 등 특정 오류 유형에 대해 맞춤형 처리를 제공합니다.
   * 스토어에 오류 상태를 업데이트하여 UI에서 적절한 오류 메시지를 표시할 수 있게 합니다.
   * 
   * @param error - 발생한 오류 객체
   */
  private handleConnectionError(error: Error): void {
    // 오류 유형에 따른 차별화된 처리
    if (error.message.includes('auth')) {
      // 인증 관련 오류
      socketActions.setConnectionState(SOCKET_STATE.AUTH_ERROR);
      logger.error('SocketStoreAdapter', '인증 오류로 인한 연결 실패', { message: error.message });
      
      // 인증 오류는 즉시 재시도하지 않음 (사용자 개입 필요)
      return;
    }
    
    if (error.message.includes('timeout')) {
      // 타임아웃 오류
      socketActions.setConnectionState(SOCKET_STATE.TIMEOUT);
      logger.error('SocketStoreAdapter', '타임아웃으로 인한 연결 실패', { message: error.message });
    }
    
    // 기본 재연결 전략 실행
    this.executeReconnectBackoffStrategy();
  }
  
  /**
   * 백오프 전략을 사용한 재연결 실행
   * 
   * 재연결 시도 간격을 점진적으로 늘려가며 재연결을 시도합니다.
   * 최대 재시도 횟수에 도달하면 오류를 표시합니다.
   */
  private executeReconnectBackoffStrategy(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    const delay = this.calculateReconnectDelay();
    
    logger.info('SocketStoreAdapter', `${delay}ms 후 재연결 시도 예약됨`, {
      attempts: this.connectionDiagnostics.reconnectAttempts,
      delay
    });
    
    this.reconnectTimer = setTimeout(() => {
      // 재연결 시도
      this.attemptReconnect();
    }, delay);
  }
  
  /**
   * 지수 백오프 알고리즘을 사용한 재연결 지연 시간 계산
   * 
   * 재연결 시도 간격을 계산하여 점진적으로 늘려가며 재연결을 시도합니다.
   * 
   * @returns 재연결 지연 시간 (ms)
   */
  private calculateReconnectDelay(): number {
    const baseDelay = 1000; // 기본 1초
    const attempts = this.connectionDiagnostics.reconnectAttempts;
    const maxDelay = 30000; // 최대 30초
    
    // 지수 백오프: 기본 지연 * 2^시도횟수 + 랜덤 지터(0-1000ms)
    const exponentialDelay = baseDelay * Math.pow(2, Math.min(attempts, 5));
    const jitter = Math.random() * 1000;
    
    return Math.min(exponentialDelay + jitter, maxDelay);
  }
  
  /**
   * 재연결 시도
   * 
   * 재연결을 시도합니다. 재연결 성공 또는 실패 시 상태를 업데이트합니다.
   */
  private attemptReconnect(): void {
    this.connectionDiagnostics.reconnectAttempts++;
    
    logger.info('SocketStoreAdapter', '재연결 시도 중', {
      attempt: this.connectionDiagnostics.reconnectAttempts,
      maxAttempts: this.connectionDiagnostics.maxReconnectAttempts
    });
    
    socketActions.setConnectionState(SOCKET_STATE.RECONNECTING);
    
    // 재연결 로직 실행 (외부 함수 호출 필요 - socketIOService.connect)
    // 이 부분은 실제 구현 시 socketIOService를 어댑터에 주입받아 처리해야 함
    // 현재는 외부에서 처리하므로 상태만 업데이트
  }
  
  /**
   * 네트워크 상태 변화 감지 및 처리
   * 
   * 브라우저의 온라인/오프라인 이벤트를 감지하여 네트워크 상태 변화에 대응합니다.
   * 네트워크가 복구되면 자동 재연결을 시도하고, 네트워크가 끊기면 오류 상태를 표시합니다.
   * 중복 설정을 방지하기 위해 리스너 부착 여부를 추적합니다.
   */
  handleNetworkStatusChange(): void {
    if (this.networkListenersAttached) {
      return;
    }
    
    // 온라인/오프라인 상태 변화 감지
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    
    this.networkListenersAttached = true;
    logger.debug('SocketStoreAdapter', '네트워크 상태 변화 감지 시작');
  }
  
  /**
   * 네트워크 연결 복구 처리
   * 
   * 네트워크 연결이 복구되었을 때 호출됩니다.
   * 현재 연결 상태를 확인하고, 연결이 끊어진 상태라면 재연결을 시도합니다.
   * 지연 시간을 두어 네트워크 안정화를 기다린 후 재연결을 시도합니다.
   */
  private handleOnline = (): void => {
    logger.info('SocketStoreAdapter', '네트워크 연결 복구됨');
    
    // 연결이 끊어진 상태에서 네트워크가 복구되면 재연결 시도
    const { connectionState } = useSocketStore.getState();
    const isDisconnected = connectionState === SOCKET_STATE.DISCONNECTED || 
                           connectionState === SOCKET_STATE.ERROR ||
                           connectionState === SOCKET_STATE.NETWORK_ERROR;
    
    if (isDisconnected) {
      // 약간의 지연 후 재연결 시도 (네트워크 안정화를 위해)
      setTimeout(() => {
        logger.info('SocketStoreAdapter', '네트워크 복구 후 재연결 시도');
        // 소켓 연결 재시도 로직은 외부에서 처리
        this.connectionDiagnostics.reconnectAttempts = 0;
        socketActions.setConnectionState(SOCKET_STATE.RECONNECTING);
      }, 2000);
    }
  };
  
  /**
   * 네트워크 연결 끊김 처리
   * 
   * 네트워크 연결이 끊어졌을 때 호출됩니다.
   * 스토어 상태를 'NETWORK_ERROR'로 업데이트하고, 적절한 오류 메시지를 설정합니다.
   * 이를 통해 UI에서 네트워크 문제를 사용자에게 알릴 수 있습니다.
   */
  private handleOffline = (): void => {
    logger.info('SocketStoreAdapter', '네트워크 연결 끊김');
    
    // 네트워크 연결이 끊어진 상태를 스토어에 반영
    socketActions.setConnectionState(SOCKET_STATE.NETWORK_ERROR);
    socketActions.setConnectionError(new Error('네트워크 연결이 끊어졌습니다.'));
  };
  
  /**
   * 연결 품질 모니터링 시작
   * 
   * 소켓 연결 품질을 모니터링하여 평균 응답 시간을 계산합니다.
   * 이를 통해 네트워크 상태를 평가하고, 문제가 발생할 경우 조치를 취할 수 있습니다.
   * 
   * @param socket - 연결 품질을 모니터링할 Socket.IO 소켓 인스턴스
   */
  private startConnectionQualityMonitoring(socket: Socket): void {
    // 60초 간격으로 핑 측정
    const pingInterval = setInterval(() => {
      const startTime = Date.now();
      
      socket.emit('ping', () => {
        const rtt = Date.now() - startTime;
        this.connectionDiagnostics.pingTimes.push(rtt);
        
        // 최대 10개까지만 저장
        if (this.connectionDiagnostics.pingTimes.length > 10) {
          this.connectionDiagnostics.pingTimes.shift();
        }
        
        // 평균 RTT 계산
        const avgRtt = this.connectionDiagnostics.pingTimes.reduce((sum, time) => sum + time, 0) / 
                       this.connectionDiagnostics.pingTimes.length;
        
        logger.debug('SocketStoreAdapter', '연결 품질 측정', {
          rtt,
          avgRtt: Math.round(avgRtt),
          measurements: this.connectionDiagnostics.pingTimes.length
        });
      });
    }, 60000);
    
    // 연결 해제 시 정리
    socket.on(CONNECTION_EVENTS.DISCONNECT, () => {
      clearInterval(pingInterval);
    });
  }
  
  /**
   * 연결 진단 정보 가져오기
   * 
   * 현재 연결 상태, 평균 응답 시간, 네트워크 상태 등을 포함한 진단 정보를 반환합니다.
   * 이를 통해 현재 네트워크 상태를 평가하고, 문제가 발생할 경우 조치를 취할 수 있습니다.
   * 
   * @returns 연결 진단 정보
   */
  getConnectionDiagnostics(): any {
    const { connectionState, connected } = useSocketStore.getState();
    
    return {
      ...this.connectionDiagnostics,
      currentState: connectionState,
      connected,
      networkOnline: navigator.onLine,
      averagePing: this.getAveragePing(),
      connectionQuality: this.getConnectionQualityRating(),
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 평균 핑 시간 계산
   * 
   * 최근 측정된 핑 시간의 평균을 계산하여 반환합니다.
   * 
   * @returns 평균 핑 시간
   */
  private getAveragePing(): number {
    if (this.connectionDiagnostics.pingTimes.length === 0) {
      return 0;
    }
    
    const sum = this.connectionDiagnostics.pingTimes.reduce((total, time) => total + time, 0);
    return Math.round(sum / this.connectionDiagnostics.pingTimes.length);
  }
  
  /**
   * 연결 품질 등급 가져오기
   * 
   * 평균 핑 시간을 기준으로 연결 품질 등급을 반환합니다.
   * 
   * @returns 연결 품질 등급
   */
  private getConnectionQualityRating(): string {
    const avgPing = this.getAveragePing();
    
    if (avgPing === 0) return '측정 전';
    if (avgPing < 100) return '우수';
    if (avgPing < 300) return '양호';
    if (avgPing < 600) return '보통';
    return '불량';
  }
  
  /**
   * 정리 및 리소스 해제
   * 
   * 소켓 연결을 해제하고, 리소스를 해제하여 메모리 누수를 방지합니다.
   */
  cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.networkListenersAttached) {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
      this.networkListenersAttached = false;
    }
    
    logger.debug('SocketStoreAdapter', '어댑터 정리 완료');
  }
}

// 싱글톤 인스턴스
const socketStoreAdapter = new SocketStoreAdapter();

export default socketStoreAdapter;
