import { WS_BASE_URL } from '../../config';

// Auth endpoints
export const AUTH = {
  LOGIN: '/auth/token',
  SIGNUP: '/auth/signup',
  REFRESH: '/auth/refresh',
  LOGOUT: '/auth/logout',
  ME: '/auth/me',
};

// CVE endpoints
export const CVE = {
  BASE: '/cves',
  DETAIL: (id) => `/cves/${id}`,
  SEARCH: '/cves/search',
  COMMENTS: (id) => `/cves/${id}/comments`,
  COMMENT: (cveId, commentId) => `/cves/${cveId}/comments/${commentId}`,
  POC: (id) => `/cves/${id}/pocs`,
  SNORT_RULE: (id) => `/cves/${id}/snort-rules`,
  LOCK: (id) => `/cves/${id}/lock`
};

// Notification endpoints
export const NOTIFICATION = {
  BASE: '/notifications',
  READ: (id) => `/notifications/${id}/read`,
  READ_ALL: '/notifications/read-all',
  UNREAD_COUNT: '/notifications/unread/count',
};

// Crawler endpoints
export const CRAWLER = {
  BULK_CREATE: '/crawler/bulk-create',
  BULK_UPDATE: '/crawler/bulk-update',
};

// WebSocket endpoints
export const WEBSOCKET = {
  BASE_URL: process.env.REACT_APP_WS_URL || 'ws://localhost:8000',
  CONNECT: (token) => {
    // 기본 WebSocket URL 설정
    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';
    
    // 경로 검증 및 로깅
    console.log('[WEBSOCKET.CONNECT] WebSocket URL 구성:');
    console.log(`- 기본 URL: ${wsUrl}`);
    console.log(`- 토큰 길이: ${token ? token.length : 0}`);
    
    // URL 끝에 슬래시가 있는지 확인하고 적절히 처리
    const baseUrl = wsUrl.endsWith('/') ? wsUrl.slice(0, -1) : wsUrl;
    
    // 최종 WebSocket URL 구성
    const finalUrl = `${baseUrl}/ws?token=${encodeURIComponent(token)}`;
    console.log(`- 최종 URL: ${finalUrl}`);
    
    return finalUrl;
  }
};

export const getWebSocketURL = (path) => {
    return `${WS_BASE_URL}${path}`;
}; 