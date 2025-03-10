/**
 * 웹소켓 설정 및 상수
 */

// 환경 변수 직접 로드 함수 (안전한 접근 보장)
const getEnvVariable = (name, defaultValue = '') => {
  try {
    const value = process.env[name];
    return value !== undefined ? value : defaultValue;
  } catch (error) {
    console.error(`[WebSocket Config] 환경변수 접근 오류 (${name}):`, error);
    return defaultValue;
  }
};

// 환경 변수에서 URL 가져오기
const WS_BASE_URL = getEnvVariable('REACT_APP_WS_URL');
const API_BASE_URL = getEnvVariable('REACT_APP_API_URL', 'http://localhost:8000');

// 개발 모드에서 환경 변수 확인 로깅
if (process.env.NODE_ENV === 'development') {
  console.log('[WebSocket Config] 환경 변수 확인:');
  console.log('- REACT_APP_WS_URL:', getEnvVariable('REACT_APP_WS_URL'));
  console.log('- REACT_APP_API_URL:', getEnvVariable('REACT_APP_API_URL'));
  console.log('- WS_BASE_URL 변수값:', WS_BASE_URL);
}

// WebSocket URL 생성 함수 (안정적인 URL 결정)
const getWebSocketURL = () => {
  try {
    // 1. 직접 환경 변수에서 가져오기 (최우선)
    const envWsUrl = getEnvVariable('REACT_APP_WS_URL');
    if (envWsUrl) {
      console.log('[WebSocket] 환경 변수에서 WS URL 직접 사용:', envWsUrl);
      return envWsUrl;
    }
    
    // 2. API_BASE_URL 기반으로 생성 (대체 방법)
    if (API_BASE_URL) {
      const protocol = API_BASE_URL.startsWith('https') ? 'wss:' : 'ws:';
      const hostWithPath = API_BASE_URL.replace(/^https?:\/\//, '');
      const wsUrl = `${protocol}//${hostWithPath}/ws`;
      console.log('[WebSocket] API URL에서 생성된 URL 사용:', wsUrl);
      return wsUrl;
    }
    
    // 3. 하드코딩된 기본값 (최후의 수단)
    const defaultUrl = 'ws://localhost:8000/ws';
    console.log('[WebSocket] 기본 URL 사용:', defaultUrl);
    return defaultUrl;
  } catch (error) {
    console.error('[WebSocket] URL 생성 중 오류:', error);
    return 'ws://localhost:8000/ws';
  }
};

// 최종 WebSocket URL 결정 및 로깅 (한 번만 실행)
const finalWsUrl = getWebSocketURL();
console.log('[WebSocket CONFIG] 최종 웹소켓 URL:', finalWsUrl);

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
  CLEANUP_RESPONSE: 'cleanup_response',
  
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
  // 직접 환경 변수 접근을 위한 함수 제공
  getEnvVariable,
  
  // 웹소켓 URL 관련 (중요)
  WS_BASE_URL: WS_BASE_URL,
  API_URL: finalWsUrl,
  
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

// URL 관련 유틸리티 함수 내보내기
export const getWebSocketURLFn = getWebSocketURL;

export default configUtils; 