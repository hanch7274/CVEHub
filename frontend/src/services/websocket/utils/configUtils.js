/**
 * 웹소켓 설정 및 상수
 */

// WebSocket 이벤트 타입
export const WS_EVENT = {
  // 연결 관련
  CONNECTED: 'connected',
  CONNECT_ACK: 'connect_ack',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error',
  
  // 세션 관리
  SESSION_INFO: 'session_info',
  SESSION_END: 'session_end',
  CLEANUP_CONNECTIONS: 'cleanup_connections',
  
  // 핑/퐁
  PING: 'ping',
  PONG: 'pong',
  
  // CVE 관련
  CVE_UPDATED: 'cve_updated',
  CVE_CREATED: 'cve_created',
  CVE_DELETED: 'cve_deleted',
  SUBSCRIBE_CVE: 'subscribe_cve',
  UNSUBSCRIBE_CVE: 'unsubscribe_cve',
  
  // 알림
  NOTIFICATION: 'notification',
  
  // 크롤러 상태 업데이트
  CRAWLER_UPDATE_PROGRESS: 'crawler_update_progress'
};

// WebSocket 연결 상태
export const WS_STATE = {
  DISCONNECTED: 'disconnected',  // 연결 종료
  CONNECTING: 'connecting',      // 연결 중
  CONNECTED: 'connected',        // 연결됨
  ERROR: 'error'                 // 오류 발생
};

// WebSocket 구성 값
export const WS_CONFIG = {
  // 타이밍 관련 설정
  PING_INTERVAL: 30000,          // 핑 메시지 전송 간격 (30초)
  CONNECTION_CHECK_INTERVAL: 5000, // 연결 상태 확인 간격 (5초)
  CONNECTION_TIMEOUT: 5000,      // 연결 타임아웃 (5초로 단축)
  SESSION_RESEND_TIMEOUT: 3000,  // 세션 정보 재전송 시간 (3초)
  
  // 재연결 관련 설정
  AUTO_RECONNECT: true,          // 자동 재연결 활성화
  MAX_RECONNECT_ATTEMPTS: 10,    // 최대 재연결 시도 횟수
  MIN_RECONNECT_DELAY: 500,      // 최소 재연결 지연 시간 (밀리초)
  MAX_RECONNECT_DELAY: 10000,    // 최대 재연결 지연 시간 (밀리초)
  
  // 기능 설정
  CACHE_INVALIDATION: true,      // 캐시 무효화 활성화
  ENFORCE_SINGLE_TAB: false,     // 단일 탭 강제 여부
  
  // 디버깅 설정
  DEBUG_MODE: true,              // 디버그 모드 활성화
  VERBOSE_LOGGING: true,         // 상세 로깅 활성화
  LOG_MESSAGES: true,            // 메시지 로깅 활성화
  LOG_NON_STANDARD_EVENTS: true, // 비표준 이벤트 로깅
  LOG_TRUNCATE_LENGTH: 500       // 로그 메시지 길이 제한
};

// 세션 스토리지 키
export const STORAGE_KEYS = {
  SESSION_ID: 'wsSessionId',
  ACTIVE_SUBSCRIPTIONS: 'wsActiveSubscriptions',
};

// 재연결 지연 시간 계산 (지수 백오프 알고리즘)
export const calculateReconnectDelay = (attempts, baseDelay = 1000, maxDelay = 30000) => {
  const delay = Math.min(maxDelay, baseDelay * Math.pow(1.5, attempts - 1));
  return Math.floor(delay * (0.8 + Math.random() * 0.4)); // 지터 추가
};

// 기본 내보내기 (이름 지정)
const configUtils = {
  WS_EVENT,
  WS_STATE,
  WS_CONFIG,
  STORAGE_KEYS,
  calculateReconnectDelay
};

export default configUtils; 