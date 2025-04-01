/**
 * Socket.IO 이벤트 상수 정의
 * 서버와 클라이언트 간의 일관된 이벤트 이름을 유지하기 위해 사용합니다.
 * 백엔드의 WSMessageType 열거형과 일치하도록 유지해야 합니다.
 */

// 연결 관련 이벤트
export const CONNECTION_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  RECONNECT: 'reconnect',
  CONNECT_ACK: 'connect_ack', // 백엔드 WSMessageType.CONNECT_ACK와 일치
  CONNECTED: 'connected', // 백엔드 WSMessageType.CONNECTED와 일치
  SESSION_INFO_ACK: 'session_info_ack', // 백엔드 WSMessageType.SESSION_INFO_ACK와 일치
  CONNECTION_STATE_CHANGE: 'connection_state_change', // 프론트엔드 전용: 연결 상태 변경
};

// 핑/퐁 관련 이벤트
export const PING_PONG_EVENTS = {
  PING: 'ping', // 백엔드 WSMessageType.PING와 일치
  PONG: 'pong', // 백엔드 WSMessageType.PONG와 일치
};

// 오류 관련 이벤트
export const ERROR_EVENTS = {
  ERROR: 'error', // 백엔드 WSMessageType.ERROR와 일치
};

// CVE 관련 이벤트
export const CVE_EVENTS = {
  CVE_UPDATED: 'cve_updated', // 백엔드 WSMessageType.CVE_UPDATED와 일치
  CVE_CREATED: 'cve_created', // 백엔드 WSMessageType.CVE_CREATED와 일치
  CVE_DELETED: 'cve_deleted', // 백엔드 WSMessageType.CVE_DELETED와 일치
  CVE_DETAIL_UPDATED: 'cve_detail_updated', // 프론트엔드 전용: CVE 상세 정보 업데이트
};

// 구독 관련 이벤트
export const SUBSCRIPTION_EVENTS = {
  SUBSCRIBE_CVE: 'subscribe_cve', // 백엔드 WSMessageType.SUBSCRIBE_CVE와 일치
  UNSUBSCRIBE_CVE: 'unsubscribe_cve', // 백엔드 WSMessageType.UNSUBSCRIBE_CVE와 일치
  SUBSCRIPTION_STATUS: 'subscription_status', // 백엔드 WSMessageType.SUBSCRIPTION_STATUS와 일치
  SUBSCRIPTION_UPDATED: 'subscription_updated', // 프론트엔드 전용: 구독 상태 업데이트
  SUBSCRIBE_ACK: 'subscribe_ack', // 프론트엔드 전용: 구독 요청 확인
  UNSUBSCRIBE_ACK: 'unsubscribe_ack', // 프론트엔드 전용: 구독 취소 요청 확인
  SUBSCRIPTION_ERROR: 'subscription_error', // 프론트엔드 전용: 구독 오류
  UNSUBSCRIPTION_ERROR: 'unsubscription_error', // 프론트엔드 전용: 구독 취소 오류
  SUBSCRIBE_CVES: 'subscribe:cves', // 프론트엔드 전용: CVE 목록 구독 요청
  UNSUBSCRIBE_CVES: 'unsubscribe:cves', // 프론트엔드 전용: CVE 목록 구독 취소 요청
  GET_CVE_SUBSCRIBERS: 'get_cve_subscribers', // 프론트엔드 전용: CVE 구독자 목록 요청
  SUBSCRIBE_CVE_SUCCESS: 'subscribe_cve_success', // 프론트엔드 전용: CVE 구독 성공
  UNSUBSCRIBE_CVE_SUCCESS: 'unsubscribe_cve_success', // 프론트엔드 전용: CVE 구독 취소 성공
  CVE_SUBSCRIBERS_UPDATED: 'cve_subscribers_updated', // 백엔드 WSMessageType.CVE_SUBSCRIBERS_UPDATED와 일치
};

// 댓글 관련 이벤트
export const COMMENT_EVENTS = {
  COMMENT_ADDED: 'comment_added', // 백엔드 WSMessageType.COMMENT_ADDED와 일치
  COMMENT_UPDATED: 'comment_updated', // 백엔드 WSMessageType.COMMENT_UPDATED와 일치
  COMMENT_DELETED: 'comment_deleted', // 백엔드 WSMessageType.COMMENT_DELETED와 일치
  COMMENT_REACTION_ADDED: 'comment_reaction_added', // 백엔드 WSMessageType.COMMENT_REACTION_ADDED와 일치
  COMMENT_REACTION_REMOVED: 'comment_reaction_removed', // 백엔드 WSMessageType.COMMENT_REACTION_REMOVED와 일치
  COMMENT_MENTION_ADDED: 'comment_mention_added', // 백엔드 WSMessageType.COMMENT_MENTION_ADDED와 일치
  COMMENT_REPLY_ADDED: 'comment_reply_added', // 백엔드 WSMessageType.COMMENT_REPLY_ADDED와 일치
  COMMENT_COUNT_UPDATE: 'comment_count_update', // 백엔드 WSMessageType.COMMENT_COUNT_UPDATE와 일치
};

// 알림 관련 이벤트
export const NOTIFICATION_EVENTS = {
  NOTIFICATION: 'notification', // 백엔드 WSMessageType.NOTIFICATION와 일치
  NOTIFICATION_READ: 'notification_read', // 백엔드 WSMessageType.NOTIFICATION_READ와 일치
  NEW_NOTIFICATION: 'new_notification', // 백엔드 WSMessageType.NEW_NOTIFICATION와 일치
  ALL_NOTIFICATIONS_READ: 'all_notifications_read', // 백엔드 WSMessageType.ALL_NOTIFICATIONS_READ와 일치
  MENTION_ADDED: 'mention_added', // 백엔드 WSMessageType.MENTION_ADDED와 일치
};

// 사용자 활동 관련 이벤트
export const USER_EVENTS = {
  USER_ONLINE: 'user_online', // 백엔드 WSMessageType.USER_ONLINE와 일치
  USER_OFFLINE: 'user_offline', // 백엔드 WSMessageType.USER_OFFLINE와 일치
  USER_STATUS_UPDATE: 'user_status_update', // 백엔드 WSMessageType.USER_STATUS_UPDATE와 일치
  USER_ACTIVITY: 'user_activity', // 백엔드 WSMessageType.USER_ACTIVITY와 일치
  USER_ACTIVITY_UPDATED: 'user_activity_updated', // 백엔드 WSMessageType.USER_ACTIVITY_UPDATED와 일치
  TARGET_ACTIVITY_UPDATED: 'target_activity_updated', // 백엔드 WSMessageType.TARGET_ACTIVITY_UPDATED와 일치
  GLOBAL_ACTIVITY_UPDATED: 'global_activity_updated', // 백엔드 WSMessageType.GLOBAL_ACTIVITY_UPDATED와 일치
};

// 크롤러 관련 이벤트
export const CRAWLER_EVENTS = {
  CRAWLER_UPDATE_PROGRESS: 'crawler_update_progress', // 백엔드 WSMessageType.CRAWLER_UPDATE_PROGRESS와 일치
  CRAWLER_COMPLETED: 'crawler_completed', // 백엔드 WSMessageType.CRAWLER_COMPLETED와 일치
  CRAWLER_ERROR: 'crawler_error', // 백엔드 WSMessageType.CRAWLER_ERROR와 일치
};

// 시스템 상태 관련 이벤트
export const SYSTEM_EVENTS = {
  SYSTEM_MESSAGE: 'system_message', // 백엔드 WSMessageType.SYSTEM_MESSAGE와 일치
  SYSTEM_STATUS: 'system_status', // 백엔드 WSMessageType.SYSTEM_STATUS와 일치
  MAINTENANCE_NOTICE: 'maintenance_notice', // 백엔드 WSMessageType.MAINTENANCE_NOTICE와 일치
};

// 캐시 관련 이벤트
export const CACHE_EVENTS = {
  CACHE_INVALIDATED: 'cache_invalidated', // 백엔드 WSMessageType.CACHE_INVALIDATED와 일치
  CACHE_STATUS: 'cache_status', // 백엔드 WSMessageType.CACHE_STATUS와 일치
};

// 데이터 업데이트 관련 이벤트
export const DATA_EVENTS = {
  DATA_UPDATED: 'data_updated', // 프론트엔드 전용: 특정 필드 데이터 업데이트
  DATA_CREATED: 'data_created', // 프론트엔드 전용: 새로운 데이터 생성
  DATA_DELETED: 'data_deleted', // 프론트엔드 전용: 데이터 삭제
};

// 모든 이벤트를 하나의 객체로 통합 (기존 코드와의 호환성 유지)
export const SOCKET_EVENTS = {
  ...CONNECTION_EVENTS,
  ...PING_PONG_EVENTS,
  ...ERROR_EVENTS,
  ...CVE_EVENTS,
  ...SUBSCRIPTION_EVENTS,
  ...COMMENT_EVENTS,
  ...NOTIFICATION_EVENTS,
  ...USER_EVENTS,
  ...CRAWLER_EVENTS,
  ...SYSTEM_EVENTS,
  ...CACHE_EVENTS,
  ...DATA_EVENTS,
};

// WebSocket 연결 상태에 대한 상수
/**
 * 소켓 연결 상태를 나타내는 상수 집합
 * 
 * @property DISCONNECTED - 소켓 연결이 끊어진 상태
 * @property CONNECTING - 소켓 연결을 시도하는 중인 상태
 * @property CONNECTED - 소켓이 성공적으로 연결된 상태
 * @property ERROR - 일반적인 오류 상태
 * @property RECONNECTING - 재연결을 시도하는 중인 상태
 * @property TRANSPORT_CLOSED - 전송 계층이 닫힌 상태 (서버 종료, 네트워크 문제 등)
 * @property PING_TIMEOUT - 핑 요청에 대한 응답이 타임아웃된 상태
 * @property TRANSPORT_ERROR - 전송 계층에서 오류가 발생한 상태
 * @property AUTH_ERROR - 인증 관련 오류가 발생한 상태
 * @property TIMEOUT - 일반적인 타임아웃 오류가 발생한 상태
 * @property NETWORK_ERROR - 네트워크 연결 문제가 발생한 상태
 */
export const SOCKET_STATE = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
  RECONNECTING: 'reconnecting',
  TRANSPORT_CLOSED: 'transport_closed',
  PING_TIMEOUT: 'ping_timeout',
  TRANSPORT_ERROR: 'transport_error',
  AUTH_ERROR: 'auth_error',
  TIMEOUT: 'timeout',
  NETWORK_ERROR: 'network_error'
};

// 웹소켓 로그 문맥
export const WS_LOG_CONTEXT = {
  CLIENT: 'client',
  SERVER: 'server',
  TRANSPORT: 'transport',
  HANDLER: 'handler',
  CONNECTION: 'connection',
  SUBSCRIPTION: 'subscription',
  EVENT: 'event'
};

// 웹소켓 메시지 방향
export const WS_DIRECTION = {
  INCOMING: 'incoming',
  OUTGOING: 'outgoing',
  INTERNAL: 'internal'
};

// 웹소켓 상태 코드
export const WS_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  FAILURE: 'failure',
  PENDING: 'pending'
};

// 타입 유틸리티: 객체의 값 타입을 추출
export type ValueOf<T> = T[keyof T];

// 각 상수에 대한 타입 정의
export type SocketEvent = ValueOf<typeof SOCKET_EVENTS>;
export type SocketState = ValueOf<typeof SOCKET_STATE>;
export type WSLogContext = ValueOf<typeof WS_LOG_CONTEXT>;
export type WSDirection = ValueOf<typeof WS_DIRECTION>;
export type WSStatus = ValueOf<typeof WS_STATUS>;

// 각 이벤트 그룹에 대한 타입 정의
export type ConnectionEvent = ValueOf<typeof CONNECTION_EVENTS>;
export type PingPongEvent = ValueOf<typeof PING_PONG_EVENTS>;
export type ErrorEvent = ValueOf<typeof ERROR_EVENTS>;
export type CVEEvent = ValueOf<typeof CVE_EVENTS>;
export type SubscriptionEvent = ValueOf<typeof SUBSCRIPTION_EVENTS>;
export type CommentEvent = ValueOf<typeof COMMENT_EVENTS>;
export type NotificationEvent = ValueOf<typeof NOTIFICATION_EVENTS>;
export type UserEvent = ValueOf<typeof USER_EVENTS>;
export type CrawlerEvent = ValueOf<typeof CRAWLER_EVENTS>;
export type SystemEvent = ValueOf<typeof SYSTEM_EVENTS>;
export type CacheEvent = ValueOf<typeof CACHE_EVENTS>;
export type DataEvent = ValueOf<typeof DATA_EVENTS>;

// 이벤트 핸들러 타입
export type SocketEventHandler<T = any> = (data: T) => void;

// ConnectionStateChangeEvent 타입 정의
export interface ConnectionStateChangeEvent {
  state: SocketState;
}

export default SOCKET_EVENTS;
