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
  getWebSocketURL: (token) => {
    if (!token) {
      console.error('[WEBSOCKET.CONNECT] 토큰이 제공되지 않았습니다.');
      return null;
    }
    
    try {
      // 기본 WebSocket URL 설정
      const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';
      
      // URL 검증
      if (!wsUrl) {
        console.error('[WEBSOCKET.CONNECT] WebSocket URL이 설정되지 않았습니다.');
        return null;
      }
      
      // 경로 검증 및 로깅 (개발 환경에서만)
      const isDebug = process.env.NODE_ENV === 'development';
      if (isDebug) {
        console.log('[WEBSOCKET.CONNECT] WebSocket URL 구성:');
        console.log(`- 기본 URL: ${wsUrl}`);
        console.log(`- 토큰 길이: ${token ? token.length : 0}`);
      }
      
      // URL 끝에 슬래시가 있는지 확인하고 적절히 처리
      const baseUrl = wsUrl.endsWith('/') ? wsUrl.slice(0, -1) : wsUrl;
      
      // 토큰에 특수 문자가 있는지 확인하고 인코딩
      const encodedToken = encodeURIComponent(token);
      
      // 최종 WebSocket URL 구성
      const finalUrl = `${baseUrl}/ws?token=${encodedToken}`;
      
      // 개발 환경에서만 최종 URL 로깅
      if (isDebug) {
        // 토큰 일부만 표시하여 보안 유지
        const maskedToken = token.substring(0, 20) + '...' + token.substring(token.length - 10);
        console.log(`- 최종 URL: ${baseUrl}/ws?token=${maskedToken}`);
      }
      
      return finalUrl;
    } catch (error) {
      console.error('[WEBSOCKET.CONNECT] WebSocket URL 생성 중 오류:', error);
      return null;
    }
  }
};

// 다음의 함수는 제거하거나 필요한 경우 유지할 수 있습니다
// export const getWebSocketURL = (path) => {
//     return `${WS_BASE_URL}${path}`;
// }; 