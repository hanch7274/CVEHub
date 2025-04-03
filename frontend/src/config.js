/**
 * 애플리케이션 전역 설정
 * 
 * 이 파일은 애플리케이션 전체에서 사용되는 설정값을 정의합니다.
 * 환경 변수는 .env 파일 또는 docker-compose.yml에서 관리됩니다.
 */

// 브라우저 환경에서 현재 호스트 기반 URL 가져오기
const getCurrentOrigin = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return null;
};

// API 기본 URL - 우선순위: 환경변수 > 현재 호스트 > 기본값
export const API_BASE_URL = process.env.REACT_APP_API_URL || getCurrentOrigin() || 'http://localhost:8000';

// WebSocket 기본 URL - 우선순위: 환경변수 > 현재 호스트 > 기본값
// Socket.IO 연결에 사용됨
export const WS_BASE_URL = process.env.REACT_APP_WS_URL || getCurrentOrigin() || 'http://localhost:8000';

// Socket.IO 경로 설정 - 백엔드의 마운트 경로와 일치해야 함
export const SOCKET_IO_PATH = '/socket.io';

// WebSocket 연결 설정
export const SOCKET_CONFIG = {
  RECONNECTION: true,
  RECONNECTION_ATTEMPTS: parseInt(process.env.REACT_APP_WS_RECONNECTION_ATTEMPTS) || 10,
  RECONNECTION_DELAY: parseInt(process.env.REACT_APP_WS_RECONNECTION_DELAY) || 1000,
  RECONNECTION_DELAY_MAX: parseInt(process.env.REACT_APP_WS_RECONNECTION_DELAY_MAX) || 30000,
  TIMEOUT: parseInt(process.env.REACT_APP_WS_TIMEOUT) || 20000,
  LOG_PING_PONG: process.env.REACT_APP_WS_LOG_PING_PONG === 'true' || false,
  AUTO_CONNECT: false, // 수동으로 연결 관리
  CONNECTION_CHECK_INTERVAL: 5000, // 연결 상태 체크 간격 (ms)
  CONNECTION_CHECK_TIMEOUT: 10000, // 연결 체크 타임아웃 (ms)
};

// 인증이 필요하지 않은 공개 엔드포인트 목록
export const PUBLIC_ENDPOINTS = [
    '/auth/token',
    '/auth/login',
    '/auth/signup',
    '/auth/refresh',
    '/auth/verify',
    '/auth/password/reset',
    '/auth/password/reset/verify',
    '/health'
];

// API 엔드포인트 설정
export const API_ENDPOINTS = {
    /**
     * 인증 관련 엔드포인트
     */
    AUTH: {
        LOGIN: '/auth/token',
        SIGNUP: '/auth/signup',
        REFRESH: '/auth/refresh',
        LOGOUT: '/auth/logout',
        ME: '/auth/me'
    },
    /**
     * 알림 관련 엔드포인트
     */
    NOTIFICATION: {
        BASE: '/notifications',
        READ: (id) => `/notifications/${id}/read`,
        READ_ALL: '/notifications/read-all',
        UNREAD_COUNT: '/notifications/unread/count'
    },
    /**
     * 취약점 관련 엔드포인트
     */
    CVE: {
        BASE: '/cves',
        DETAIL: (id) => `/cves/${id}`,
        SEARCH: '/cves/search',
        COMMENTS: (id) => `/cves/${id}/comments`,
        COMMENT: (cveId, commentId) => `/cves/${cveId}/comments/${commentId}`,
        POC: (id) => `/cves/${id}/pocs`,
        SNORT_RULE: (id) => `/cves/${id}/snort-rules`,
        LOCK: (id) => `/cves/${id}/lock`
    },
    /**
     * 사용자 관련 엔드포인트
     */
    USER: {
        SEARCH: '/users/search'
    },
    /**
     * WebSocket 관련 엔드포인트
     */
    WEBSOCKET: {
        CONNECT: (token) => `/socket.io?token=${encodeURIComponent(token)}`
    }
};

// 케이스 변환 관련 설정
export const CASE_CONVERSION_CONFIG = {
    // 변환 활성화 여부
    ENABLED: true,
    
    // 디버그 모드 (변환 전후 로깅)
    DEBUG: true, // 항상 디버그 모드 활성화
    
    // 변환에서 제외할 필드 목록 (필요한 경우 추가)
    EXCLUDED_FIELDS: ['access_token', 'refresh_token', 'token_type', 'expires_in']
};

// 기타 설정
export const DEFAULT_ERROR_MESSAGE = '오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
export const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5분 (밀리초) 

// 토큰 갱신 관련 설정
export const TOKEN_REFRESH_CONFIG = {
    // 토큰 만료 전 갱신 시작 시간 (초)
    REFRESH_BEFORE_EXPIRY: 300, // 5분
    
    // 토큰 갱신 최대 재시도 횟수
    MAX_RETRY_COUNT: 3,
    
    // 토큰 갱신 요청 간 최소 간격 (밀리초)
    MIN_REFRESH_INTERVAL: 10 * 1000, // 10초
    
    // 디버그 모드
    DEBUG: false
};