// API 기본 URL
export const API_BASE_URL = process.env.REACT_APP_API_URL;

// WebSocket 기본 URL
export const WS_BASE_URL = process.env.REACT_APP_WS_URL;

// API 엔드포인트 설정
export const API_ENDPOINTS = {
    AUTH: {
        LOGIN: '/auth/token',
        SIGNUP: '/auth/signup',
        REFRESH: '/auth/refresh',
        LOGOUT: '/auth/logout',
        ME: '/auth/me'
    },
    NOTIFICATION: {
        BASE: '/notifications',
        READ: (id) => `/notifications/${id}/read`,
        READ_ALL: '/notifications/read-all',
        UNREAD_COUNT: '/notifications/unread/count'
    },
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
    USER: {
        SEARCH: '/users/search'
    },
    CRAWLER: {
        BULK_CREATE: '/crawler/bulk-create',
        BULK_UPDATE: '/crawler/bulk-update'
    },
    WEBSOCKET: {
        CONNECT: (token) => `/ws?token=${encodeURIComponent(token)}`
    }
};

// 기타 설정
export const DEFAULT_ERROR_MESSAGE = '오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
export const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5분 (밀리초) 