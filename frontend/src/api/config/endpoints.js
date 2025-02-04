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
  BASE: '/cve',
  DETAIL: (id) => `/cve/${id}`,
  SEARCH: '/cve/search',
  COMMENTS: (id) => `/cve/${id}/comments`,
  COMMENT: (cveId, commentId) => `/cve/${cveId}/comments/${commentId}`,
  POC: (id) => `/cve/${id}/poc`,
  SNORT_RULE: (id) => `/cve/${id}/snort-rule`,
};

// Notification endpoints
export const NOTIFICATION = {
  BASE: '/notification',
  READ: (id) => `/notification/${id}/read`,
  READ_ALL: '/notification/read-all',
  UNREAD_COUNT: '/notification/unread-count',
};

// Crawler endpoints
export const CRAWLER = {
  BULK_CREATE: '/crawler/bulk-create',
  BULK_UPDATE: '/crawler/bulk-update',
};

// WebSocket endpoints
export const WEBSOCKET = {
  CONNECT: (token, sessionId) => 
    `/ws?token=${encodeURIComponent(token)}&session_id=${sessionId}`,
}; 