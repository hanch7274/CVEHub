/**
 * Socket.IO 이벤트 상수 정의
 * 서버와 클라이언트 간의 일관된 이벤트 이름을 유지하기 위해 사용합니다.
 * 백엔드의 WSMessageType 열거형과 일치하도록 유지해야 합니다.
 */

export const SOCKET_EVENTS = {
  // 연결 관련
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  RECONNECT: 'reconnect',
  CONNECT_ACK: 'connect_ack', // 백엔드 WSMessageType.CONNECT_ACK와 일치
  CONNECTED: 'connected', // 백엔드 WSMessageType.CONNECTED와 일치
  SESSION_INFO_ACK: 'session_info_ack', // 백엔드 WSMessageType.SESSION_INFO_ACK와 일치
  CONNECTION_STATE_CHANGE: 'connection_state_change', // 프론트엔드 전용: 연결 상태 변경
  
  // 핑/퐁 관련
  PING: 'ping', // 백엔드 WSMessageType.PING와 일치
  PONG: 'pong', // 백엔드 WSMessageType.PONG와 일치
  
  // 오류 관련
  ERROR: 'error', // 백엔드 WSMessageType.ERROR와 일치
  
  // CVE 관련
  CVE_UPDATED: 'cve_updated', // 백엔드 WSMessageType.CVE_UPDATED와 일치
  CVE_CREATED: 'cve_created', // 백엔드 WSMessageType.CVE_CREATED와 일치
  CVE_DELETED: 'cve_deleted', // 백엔드 WSMessageType.CVE_DELETED와 일치
  CVE_DETAIL_UPDATED: 'cve_detail_updated', // 프론트엔드 전용: CVE 상세 정보 업데이트
  
  // 구독 관련 (프론트엔드 전용)
  SUBSCRIBE_CVE: 'subscribe_cve', // 프론트엔드 전용: CVE 구독 요청
  UNSUBSCRIBE_CVE: 'unsubscribe_cve', // 프론트엔드 전용: CVE 구독 취소 요청
  SUBSCRIPTION_UPDATED: 'subscription_updated', // 프론트엔드 전용: 구독 상태 업데이트
  SUBSCRIBE_ACK: 'subscribe_ack', // 프론트엔드 전용: 구독 요청 확인
  UNSUBSCRIBE_ACK: 'unsubscribe_ack', // 프론트엔드 전용: 구독 취소 요청 확인
  SUBSCRIBE_CVES: 'subscribe:cves', // 프론트엔드 전용: CVE 목록 구독 요청
  UNSUBSCRIBE_CVES: 'unsubscribe:cves', // 프론트엔드 전용: CVE 목록 구독 취소 요청
  GET_CVE_SUBSCRIBERS: 'get_cve_subscribers', // 프론트엔드 전용: CVE 구독자 목록 요청
  SUBSCRIBE_CVE_SUCCESS: 'subscribe_cve_success', // 프론트엔드 전용: CVE 구독 성공
  UNSUBSCRIBE_CVE_SUCCESS: 'unsubscribe_cve_success', // 프론트엔드 전용: CVE 구독 취소 성공
  CVE_SUBSCRIBERS_UPDATED: 'cve_subscribers_updated', // 프론트엔드 전용: CVE 구독자 목록 업데이트
  
  // 댓글 관련
  COMMENT_ADDED: 'comment_added', // 백엔드 WSMessageType.COMMENT_ADDED와 일치
  COMMENT_UPDATED: 'comment_updated', // 백엔드 WSMessageType.COMMENT_UPDATED와 일치
  COMMENT_DELETED: 'comment_deleted', // 백엔드 WSMessageType.COMMENT_DELETED와 일치
  COMMENT_REACTION_ADDED: 'comment_reaction_added', // 백엔드 WSMessageType.COMMENT_REACTION_ADDED와 일치
  COMMENT_REACTION_REMOVED: 'comment_reaction_removed', // 백엔드 WSMessageType.COMMENT_REACTION_REMOVED와 일치
  COMMENT_COUNT_UPDATE: 'comment_count_update', // 백엔드 WSMessageType.COMMENT_COUNT_UPDATE와 일치
  COMMENT_MENTION_ADDED: 'comment_mention_added', // 백엔드 WSMessageType.COMMENT_MENTION_ADDED와 일치
  COMMENT_REPLY_ADDED: 'comment_reply_added', // 백엔드 WSMessageType.COMMENT_REPLY_ADDED와 일치
  
  // 알림 관련
  NOTIFICATION: 'notification', // 백엔드 WSMessageType.NOTIFICATION와 일치
  NOTIFICATION_READ: 'notification_read', // 백엔드 WSMessageType.NOTIFICATION_READ와 일치
  ALL_NOTIFICATIONS_READ: 'all_notifications_read', // 백엔드 WSMessageType.ALL_NOTIFICATIONS_READ와 일치
  MENTION_ADDED: 'mention_added', // 프론트엔드 전용: 멘션 추가 알림
  
  // 데이터 관련 (프론트엔드 전용)
  DATA_ADDED: 'data_added', // 프론트엔드 전용: 데이터 추가
  DATA_UPDATED: 'data_updated', // 프론트엔드 전용: 데이터 업데이트
  DATA_DELETED: 'data_deleted', // 프론트엔드 전용: 데이터 삭제
  
  // 크롤러 관련
  CRAWLER_UPDATE_PROGRESS: 'crawler_update_progress', // 백엔드 WSMessageType.CRAWLER_UPDATE_PROGRESS와 일치
  CRAWLER_COMPLETED: 'crawler_completed', // 프론트엔드 전용: 크롤러 작업 완료
  CRAWLER_ERROR: 'crawler_error', // 프론트엔드 전용: 크롤러 오류
  
  // 캐시 관련 (프론트엔드 전용)
  CVE_CACHE_INVALIDATED: 'cve_cache_invalidated', // 프론트엔드 전용: CVE 캐시 무효화
  ALL_CACHE_INVALIDATED: 'all_cache_invalidated', // 프론트엔드 전용: 모든 캐시 무효화
  CACHE_STATUS_UPDATE: 'cache_status_update', // 프론트엔드 전용: 캐시 상태 업데이트
} as const;

/**
 * Socket.IO 연결 상태 상수
 */
export const SOCKET_STATE = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
} as const;

/**
 * 웹소켓 이벤트 로깅 관련 상수
 */
export const WS_LOG_CONTEXT = {
  EVENT_TYPE: 'eventType',     // 이벤트 타입
  EVENT_DIRECTION: 'direction', // 이벤트 방향 (수신/발신)
  PAYLOAD_SIZE: 'payloadSize',  // 페이로드 크기
  SESSION_ID: 'sessionId',      // 세션 ID
  USER_ID: 'userId',            // 사용자 ID
  TARGET_ID: 'targetId',        // 대상 ID (CVE ID, 댓글 ID 등)
  LATENCY: 'latency',           // 지연 시간 (ms)
  STATUS: 'status'              // 상태 (성공/실패)
} as const;

/**
 * 웹소켓 이벤트 방향
 */
export const WS_DIRECTION = {
  INCOMING: 'incoming', // 수신
  OUTGOING: 'outgoing'  // 발신
} as const;

/**
 * 웹소켓 이벤트 상태
 */
export const WS_STATUS = {
  SUCCESS: 'success',   // 성공
  FAILURE: 'failure',   // 실패
  PENDING: 'pending'    // 대기 중
} as const;

// 타입 유틸리티: 객체의 값 타입을 추출
export type ValueOf<T> = T[keyof T];

// 각 상수에 대한 타입 정의
export type SocketEvent = ValueOf<typeof SOCKET_EVENTS>;
export type SocketState = ValueOf<typeof SOCKET_STATE>;
export type WSLogContext = ValueOf<typeof WS_LOG_CONTEXT>;
export type WSDirection = ValueOf<typeof WS_DIRECTION>;
export type WSStatus = ValueOf<typeof WS_STATUS>;

// 이벤트 핸들러 타입
export type SocketEventHandler<T = any> = (data: T) => void;

// ConnectionStateChangeEvent 타입 정의
export interface ConnectionStateChangeEvent {
  state: SocketState;
}

export default SOCKET_EVENTS;