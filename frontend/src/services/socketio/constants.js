/**
 * Socket.IO 이벤트 상수 정의
 * 서버와 클라이언트 간의 일관된 이벤트 이름을 유지하기 위해 사용합니다.
 */

export const SOCKET_EVENTS = {
  // 연결 관련
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  RECONNECT: 'reconnect',
  CONNECT_ACK: 'connect_ack', // 백엔드에서 사용하는 연결 확인 이벤트
  
  // 핑/퐁 관련
  PING: 'ping',
  PONG: 'pong',
  
  // CVE 관련
  CVE_UPDATED: 'cve_updated', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  CVE_CREATED: 'cve_created', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  CVE_DELETED: 'cve_deleted', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  CVE_DETAIL_UPDATED: 'cve_detail_updated', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  
  // 구독 관련
  SUBSCRIBE_CVE: 'subscribe_cve', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  UNSUBSCRIBE_CVE: 'unsubscribe_cve', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  SUBSCRIPTION_UPDATED: 'subscription_updated', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  SUBSCRIBE_ACK: 'subscribe_ack', // 구독 확인 이벤트
  UNSUBSCRIBE_ACK: 'unsubscribe_ack', // 구독 해제 확인 이벤트
  
  // 댓글 관련
  COMMENT_ADDED: 'comment_added', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  COMMENT_UPDATED: 'comment_updated', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  COMMENT_DELETED: 'comment_deleted', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  COMMENT_REACTION_ADDED: 'comment_reaction_added', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  COMMENT_REACTION_REMOVED: 'comment_reaction_removed', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  
  // 알림 관련
  NOTIFICATION: 'notification',
  MENTION_ADDED: 'mention_added', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  
  // 데이터 관련
  DATA_ADDED: 'data_added', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  DATA_UPDATED: 'data_updated', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  DATA_DELETED: 'data_deleted', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  
  // 크롤러 관련
  CRAWLER_UPDATE_PROGRESS: 'crawler_update_progress', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  CRAWLER_COMPLETED: 'crawler_completed', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  CRAWLER_ERROR: 'crawler_error', // 백엔드 형식에 맞게 변경 (스네이크 케이스)
  
  // 캐시 관련
  CACHE_INVALIDATED: 'cache_invalidated' // 백엔드 형식에 맞게 변경 (스네이크 케이스)
};

/**
 * Socket.IO 연결 상태 상수
 */
export const SOCKET_STATE = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
};

export default SOCKET_EVENTS;