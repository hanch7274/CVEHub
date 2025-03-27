/**
 * 웹소켓 관련 타입 정의 파일
 */

import { Socket } from 'socket.io-client';
import { User } from './auth';
import { CVEDetail } from './cve';
import { Comment } from './cve';
import { SOCKET_EVENTS, SOCKET_STATE, WS_DIRECTION, WS_STATUS, WS_LOG_CONTEXT } from '../services/socketio/constants';

/**
 * 로그 레벨 상수
 */
export enum LOG_LEVEL {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

/**
 * 소켓 설정 상수
 */
export const SOCKET_CONFIG = {
  RECONNECTION: true,
  RECONNECTION_ATTEMPTS: 10,
  RECONNECTION_DELAY: 1000,
  RECONNECTION_DELAY_MAX: 5000,
  TIMEOUT: 20000,
  AUTO_CONNECT: true
};

/**
 * 소켓 경로 상수
 */
export const SOCKET_IO_PATH = '/socket.io';

/**
 * 이벤트 핸들러 타입 정의
 */
export type EventHandler<T = any> = (data: T) => void;

/**
 * 이벤트 핸들러 저장소 인터페이스
 */
export interface EventHandlers {
  [key: string]: EventHandler[];
}

/**
 * 대기 중인 구독 인터페이스
 */
export interface PendingSubscriptions {
  [key: string]: EventHandler[];
}

/**
 * 웹소켓 연결 상태 인터페이스
 */
export interface SocketConnectionState {
  connected: boolean;
  lastConnected?: Date;
  reconnectAttempts?: number;
  error?: Error;
}

/**
 * 소켓 이벤트 콜백 함수 타입
 */
export type SocketEventCallback = (data?: any) => void;

/**
 * 소켓 이벤트 리스너 맵 타입
 */
export interface SocketEventListeners {
  [event: string]: SocketEventCallback[];
}

/**
 * 케이스 변환 옵션 타입
 */
export interface SocketCaseConverterOptions {
  excludeFields?: string[];
  isTopLevel?: boolean;
  [key: string]: any;
}

/**
 * 소켓 옵션 타입
 */
export interface SocketOptions {
  path: string;
  transports: string[];
  reconnection: boolean;
  reconnectionAttempts: number;
  reconnectionDelay: number;
  reconnectionDelayMax: number;
  timeout: number;
  autoConnect: boolean;
  auth: {
    token: string;
    session_id?: string;
    client_id?: string;
  };
  extraHeaders: {
    Authorization: string;
  };
}

/**
 * 크롤러 업데이트 데이터 타입
 */
export interface CrawlerUpdateData {
  stage?: string;
  stage_label?: string;
  percent?: number;
  message?: string;
  isRunning?: boolean;
  hasError?: boolean;
  updatedCves?: string[];
}

/**
 * 소켓 서비스 인터페이스
 */
export interface ISocketIOService {
  socket: Socket | null;
  isConnected: boolean;
  listeners: SocketEventListeners;
  options: SocketOptions | null;
  connect(url?: string): void;
  disconnect(): void;
  on(event: string, callback: SocketEventCallback): () => void;
  addEventListener(event: string, callback: SocketEventCallback): () => void;
  off(event: string, callback: SocketEventCallback): void;
  emit(event: string, data?: any): void;
  isSocketConnected(): boolean;
  getSocket(): Socket | null;
  getConnectionStatus(): boolean;
  handleAuthStateChange(isAuthenticated: boolean): void;
  subscribeCVE(cveId: string): void;
  unsubscribeCVE(cveId: string): void;
  convertKeysRecursive(data: any, toCamelCase: boolean, options?: SocketCaseConverterOptions): any;
}

/**
 * 웹소켓 이벤트 로깅 데이터 타입
 */
export interface WebSocketLogData {
  eventName: string;
  direction: string;
  status: string;
  error?: {
    message: string;
    [key: string]: any;
  };
  message: string;
  context: string;
  dataSummary?: string;
  origin?: string;
  timestamp?: string | number;
}

/**
 * 기본 소켓 메시지 인터페이스
 */
export interface SocketMessage {
  type: string;
  timestamp: string | Date;
  sender?: string;
}

/**
 * 연결 응답 메시지 인터페이스
 */
export interface ConnectionAckMessage {
  user_id: string;
  username: string;
  connected_at: string;
  session_id?: string;
  client_id?: string;
}

/**
 * 세션 정보 응답 메시지 인터페이스
 */
export interface SessionInfoAckMessage {
  session_id: string;
  subscribed_cves: string[];
  last_activity?: string;
}

/**
 * CVE 업데이트 메시지 인터페이스
 */
export interface CVEUpdateMessage extends SocketMessage {
  type: typeof SOCKET_EVENTS.CVE_UPDATED;
  cveId: string;
  field_key?: string;
  updateId?: string | number;
  updatedBy?: string;
  data?: Partial<CVEDetail>;
}

/**
 * 구독 상태 메시지 인터페이스
 */
export interface SubscriptionStatusMessage {
  cve_id: string;
  subscribed: boolean;
  subscriber_count: number;
  user_id: string;
  success: boolean;
  error?: string;
}

/**
 * 댓글 추가 메시지 인터페이스
 */
export interface CommentAddedMessage extends SocketMessage {
  type: typeof SOCKET_EVENTS.COMMENT_ADDED;
  cveId: string;
  commentId: string;
  comment: Comment;
  parentId?: string;
}

/**
 * 댓글 업데이트 메시지 인터페이스
 */
export interface CommentUpdatedMessage extends SocketMessage {
  type: typeof SOCKET_EVENTS.COMMENT_UPDATED;
  cveId: string;
  commentId: string;
  updatedContent: string;
  updatedAt: string | Date;
}

/**
 * 댓글 삭제 메시지 인터페이스
 */
export interface CommentDeletedMessage extends SocketMessage {
  type: typeof SOCKET_EVENTS.COMMENT_DELETED;
  cveId: string;
  commentId: string;
}

/**
 * 사용자 구독 메시지 인터페이스
 */
export interface UserSubscribedMessage extends SocketMessage {
  type: typeof SOCKET_EVENTS.USER_ONLINE;
  cveId: string;
  user: Pick<User, 'id' | 'username' | 'displayName' | 'profileImage'>;
}

/**
 * 사용자 구독 취소 메시지 인터페이스
 */
export interface UserUnsubscribedMessage extends SocketMessage {
  type: typeof SOCKET_EVENTS.USER_OFFLINE;
  cveId: string;
  userId: string;
}

/**
 * 알림 메시지 인터페이스
 */
export interface NotificationMessage extends SocketMessage {
  type: typeof SOCKET_EVENTS.NOTIFICATION;
  notification_id: string;
  message: string;
  related_id?: string;
  related_type?: string;
  user_id: string;
  read: boolean;
  created_at: string;
}

/**
 * 시스템 메시지 인터페이스
 */
export interface SystemMessage extends SocketMessage {
  type: typeof SOCKET_EVENTS.SYSTEM_MESSAGE;
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
  action?: string;
  data?: any;
}

/**
 * 소켓 컨텍스트 인터페이스
 */
export interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  isReady: boolean;
  error: Error | null;
  connecting: boolean;
  reconnectAttempts: number;
  connect: () => void;
  disconnect: () => void;
  subscribeEvent: <T = any>(event: string, handler: (data: T) => void) => () => void;
  unsubscribeEvent: (event: string, handler: (data: any) => void) => void;
  isSubscribed: (event: string, handler: (data: any) => void) => boolean;
  emit: <T = any>(event: string, data?: T, callback?: (response: any) => void) => boolean;
  subscribeCVEDetail: (cveId: string) => boolean;
  unsubscribeCVEDetail: (cveId: string) => boolean;
  getActiveSubscriptions: () => Record<string, number>;
  subscribeWhenReady: (event: string, handler: EventHandler) => boolean;
  handleAuthStateChange: () => void;
  publishInternalEvent: (event: string, data: any) => void; // 내부 이벤트 발행 함수
}