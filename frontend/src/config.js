/**
 * 애플리케이션 전역 설정
 * 
 * 이 파일은 애플리케이션 전체에서 사용되는 설정값을 정의합니다.
 * 환경 변수는 .env 파일 또는 docker-compose.yml에서 관리됩니다.
 */

// API 기본 URL - process.env 값이 없을 경우 기본값 설정
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// WebSocket 기본 URL - process.env 값이 없을 경우 기본값 설정
// Socket.IO 연결에 사용되며, 경로는 '/socket.io'로 백엔드에 마운트됨
export const WS_BASE_URL = process.env.REACT_APP_WS_URL || 'http://localhost:8000';

// Socket.IO 경로 설정 - 백엔드의 마운트 경로와 일치해야 함
export const SOCKET_IO_PATH = '/socket.io';

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
     * 크롤러 관련 엔드포인트
     */
    CRAWLER: {
        BULK_CREATE: '/crawler/bulk-create',
        BULK_UPDATE: '/crawler/bulk-update'
    },
    /**
     * WebSocket 관련 엔드포인트
     */
    WEBSOCKET: {
        CONNECT: (token) => `/socket.io?token=${encodeURIComponent(token)}`
    }
};

// 케이스 변환 관련 설정
export const CASE_CONVERSION = {
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