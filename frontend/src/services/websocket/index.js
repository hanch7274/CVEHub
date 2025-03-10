/**
 * 웹소켓 서비스 모듈
 * 간단한 API를 통해 웹소켓 기능에 접근할 수 있도록 합니다.
 */
import webSocketCore from './core/WebSocketCore';
import { WS_EVENT, WS_STATE, WS_CONFIG } from './utils/configUtils';
import logger from './utils/loggingService';

// 상수 내보내기
export { WS_EVENT, WS_STATE, WS_CONFIG };

/**
 * 웹소켓 서비스 파사드
 * 코어 모듈의 복잡한 기능을 간단한 API로 제공합니다.
 */
const webSocketService = {
  // 연결 관리
  connect: () => {
    logger.info('WebSocketService', '웹소켓 연결 시작');
    console.time('websocket-connect');
    
    // 연결 시작 시간 기록
    const connectStartTime = Date.now();
    
    // 연결 시도 전에 이전 세션 ID 초기화 검토
    const shouldResetSession = sessionStorage.getItem('wsResetOnNextConnect') === 'true';
    if (shouldResetSession) {
      logger.info('WebSocketService', '새 세션으로 연결 시도, 이전 세션 ID 초기화');
      sessionStorage.removeItem('wsSessionId');
      sessionStorage.removeItem('wsResetOnNextConnect');
    }
    
    // 현재 연결 상태 체크
    const currentState = webSocketCore.getConnectionState();
    logger.debug('WebSocketService', '연결 시작 전 상태', currentState);
    
    // 연결 성공 시 타이머 종료
    const connectResult = webSocketCore.connect();
    
    // connect_ack 이벤트를 수신하기 위한 일회성 구독 설정
    const unsubscribe = webSocketCore.on(WS_EVENT.CONNECT_ACK, (data) => {
      console.timeEnd('websocket-connect');
      const connectionTime = Date.now() - connectStartTime;
      logger.info('WebSocketService', 'connect_ack 이벤트 수신 완료', { 
        connectionTime: connectionTime + 'ms',
        hasData: !!data
      });
      
      // 일회성 구독 해제
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    
    return connectResult;
  },
  
  disconnect: (cleanDisconnect = true) => {
    // 연결 종료 후 다음 연결 시 새 세션 ID 사용하도록 플래그 설정
    sessionStorage.setItem('wsResetOnNextConnect', 'true');
    return webSocketCore.disconnect(cleanDisconnect);
  },
  
  reconnect: () => webSocketCore.reconnect(),
  
  // 연결 상태 확인
  isConnected: () => webSocketCore.checkConnectionState(),
  checkConnection: () => webSocketCore.checkConnectionState(), // 호환성 유지
  
  // 전체 연결 상태 객체 반환 (권장)
  getConnectionState: () => webSocketCore.getConnectionState(),
  
  // 상태 접근용 getter
  get state() { return webSocketCore.state; },
  get isReady() { return webSocketCore.isReady; },
  
  // 메시지 송수신
  send: (type, data) => webSocketCore.send(type, data),
  ping: () => webSocketCore.sendPing(),
  
  // 이벤트 관리
  on: (event, callback) => webSocketCore.on(event, callback),
  off: (event, callback) => webSocketCore.off(event, callback),
  
  // 메시지 핸들러 관리 (직접 사용은 권장하지 않음)
  addHandler: (type, handler) => webSocketCore.addHandler(type, handler),
  removeHandler: (type, handler) => webSocketCore.removeHandler(type, handler),
  
  // 리소스 구독 관리
  subscribe: async (resourceId, resourceType = 'cve') => {
    if (!resourceId) {
      logger.warn('WebSocketService', '구독 실패: 리소스 ID가 없음');
      return false;
    }
    
    try {
      if (typeof resourceId !== 'string') {
        logger.error('WebSocketService', '잘못된 리소스 ID 타입', {
          resourceId, 
          type: typeof resourceId
        });
        return false;
      }
      
      return await webSocketCore.send(`subscribe_${resourceType}`, { 
        [`${resourceType}Id`]: resourceId,
        sessionId: sessionStorage.getItem('wsSessionId')
      });
    } catch (error) {
      logger.error('WebSocketService', `${resourceId} 구독 실패`, error);
      return false;
    }
  },
  
  unsubscribe: async (resourceId, resourceType = 'cve') => {
    if (!resourceId) {
      logger.warn('WebSocketService', '구독 해제 실패: 리소스 ID가 없음');
      return false;
    }
    
    try {
      return await webSocketCore.send(`unsubscribe_${resourceType}`, { 
        [`${resourceType}Id`]: resourceId,
        sessionId: sessionStorage.getItem('wsSessionId')
      });
    } catch (error) {
      logger.error('WebSocketService', `${resourceId} 구독 해제 실패`, error);
      return false;
    }
  },
  
  // 기타 유틸리티
  setCacheInvalidation: (enabled) => {
    webSocketCore._cacheInvalidationEnabled = !!enabled;
    logger.debug('WebSocketService', `캐시 무효화 ${enabled ? '활성화' : '비활성화'}`);
  },
  
  // 디버그 기능
  getStats: () => {
    const state = webSocketCore.getConnectionState();
    return {
      ...state,
      lastMessageTime: new Date(webSocketCore.lastMessageTime).toISOString(),
      webSocketStatus: webSocketCore.ws ? webSocketCore.ws.readyState : 'no websocket'
    };
  },
  
  // 로깅 제어
  setLogLevel: (level) => logger.setLogLevel(level),
  enableLogging: (enabled = true) => logger.setEnabled(enabled),
  getRecentLogs: (count) => logger.getRecentLogs(count)
};

// 개발 모드에서 전역으로 접근 가능하게 설정
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  window._webSocketService = webSocketService;
  window._webSocketCore = webSocketCore;
  logger.info('WebSocketService', '디버그 모드 활성화: window._webSocketService로 접근 가능');
}

export default webSocketService;
