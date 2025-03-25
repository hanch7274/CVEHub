/**
 * 웹소켓 관련 타입 정의 파일
 */

import { Socket } from 'socket.io-client';
import { User } from './auth';
import { CVEDetail } from './cve';
import { Comment } from './cve';

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
 * 소켓 이벤트 타입 열거형
 */
export enum SocketEventType {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
  RECONNECT = 'reconnect',
  CVE_UPDATED = 'cve_updated',
  CVE_CREATED = 'cve_created',
  COMMENT_ADDED = 'comment_added',
  COMMENT_UPDATED = 'comment_updated',
  COMMENT_DELETED = 'comment_deleted',
  USER_SUBSCRIBED = 'user_subscribed',
  USER_UNSUBSCRIBED = 'user_unsubscribed',
}

/**
 * 소켓 연결 상태 인터페이스
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
  };
  extraHeaders: {
    Authorization: string;
  };
  [key: string]: any;
}

/**
 * 크롤러 업데이트 데이터 타입
 */
export interface CrawlerUpdateData {
  stage?: string;
  percent?: number;
  message?: string;
  isRunning?: boolean;
  hasError?: boolean;
  updatedCves?: string[];
  [key: string]: any;
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
  dataSummary?: string;
  origin?: string;
  [key: string]: any;
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
 * CVE 업데이트 메시지 인터페이스
 */
export interface CVEUpdateMessage extends SocketMessage {
  type: SocketEventType.CVE_UPDATED;
  cveId: string;
  field_key?: string;
  updateId?: string | number;
  updatedBy?: string;
  data?: Partial<CVEDetail>;
}

/**
 * 댓글 추가 메시지 인터페이스
 */
export interface CommentAddedMessage extends SocketMessage {
  type: SocketEventType.COMMENT_ADDED;
  cveId: string;
  commentId: string;
  comment: Comment;
  parentId?: string;
}

/**
 * 댓글 업데이트 메시지 인터페이스
 */
export interface CommentUpdatedMessage extends SocketMessage {
  type: SocketEventType.COMMENT_UPDATED;
  cveId: string;
  commentId: string;
  updatedContent: string;
  updatedAt: string | Date;
}

/**
 * 댓글 삭제 메시지 인터페이스
 */
export interface CommentDeletedMessage extends SocketMessage {
  type: SocketEventType.COMMENT_DELETED;
  cveId: string;
  commentId: string;
}

/**
 * 사용자 구독 메시지 인터페이스
 */
export interface UserSubscribedMessage extends SocketMessage {
  type: SocketEventType.USER_SUBSCRIBED;
  cveId: string;
  user: Pick<User, 'id' | 'username' | 'displayName' | 'profileImage'>;
}

/**
 * 사용자 구독 취소 메시지 인터페이스
 */
export interface UserUnsubscribedMessage extends SocketMessage {
  type: SocketEventType.USER_UNSUBSCRIBED;
  cveId: string;
  userId: string;
}

/**
 * 소켓 컨텍스트 인터페이스
 */
export interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  error: Error | null;
  connecting: boolean;
  reconnectAttempts: number;
  subscribeEvent: (event: string, handler: (data: any) => void) => (() => void);
  unsubscribeEvent: (event: string, handler: (data: any) => void) => void;
  subscribeCVEDetail?: (cveId: string) => boolean;
  unsubscribeCVEDetail?: (cveId: string) => boolean;
  isSubscribed?: (cveId: string) => boolean;
  subscribers?: Array<Partial<User>>;
  emit: (event: string, data?: any) => void;
  lastConnected?: Date;
  connect?: () => void;
  disconnect?: () => void;
  getActiveSubscriptions?: () => string[];
  isReady?: boolean;
  handleAuthStateChange: (isAuthenticated: boolean) => void;
}