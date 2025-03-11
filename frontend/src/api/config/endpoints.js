import { WS_BASE_URL, SOCKET_IO_PATH } from '../../config';
import logger from '../../services/socketio/loggingService';

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
  BASE_URL: WS_BASE_URL || 'http://localhost:8000',
  getWebSocketURL: (token) => {
    if (!token) {
      logger.error('WEBSOCKET.CONNECT', '토큰이 제공되지 않았습니다.');
      return null;
    }
    
    try {
      // 기본 URL 설정 (config.js에서 가져옴)
      const baseUrl = WS_BASE_URL || 'http://localhost:8000';
      
      // 개발 환경에서만 로깅
      if (process.env.NODE_ENV === 'development') {
        logger.debug('WEBSOCKET.CONNECT', 'WebSocket URL 구성:', {
          baseUrl,
          socketIOPath: SOCKET_IO_PATH,
          tokenLength: token.length
        });
      }
      
      // URL 끝에 슬래시가 있는지 확인하고 적절히 처리
      const normalizedUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      
      // 토큰 인코딩
      const encodedToken = encodeURIComponent(token);
      
      // Socket.IO 프로토콜에 맞게 URL 구성
      // 참고: Socket.IO 클라이언트는 자동으로 '/socket.io' 경로를 추가하므로
      // 여기서는 baseUrl만 반환하고 path 옵션은 socketio.js에서 설정
      return normalizedUrl;
    } catch (error) {
      logger.error('WEBSOCKET.CONNECT', 'WebSocket URL 생성 중 오류:', error);
      return null;
    }
  }
};

// 다음의 함수는 제거하거나 필요한 경우 유지할 수 있습니다
// export const getWebSocketURL = (path) => {
//     return `${WS_BASE_URL}${path}`;
// }; 