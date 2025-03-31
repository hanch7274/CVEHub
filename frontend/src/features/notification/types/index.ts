/**
 * 알림 관련 타입 정의 파일
 */

/**
 * 알림 타입 열거형
 */
export enum NotificationType {
  CVE_CREATED = 'CVE_CREATED',
  CVE_UPDATED = 'CVE_UPDATED',
  COMMENT_ADDED = 'COMMENT_ADDED',
  MENTION = 'MENTION',
  SYSTEM = 'SYSTEM',
}

/**
 * 알림 우선순위 열거형
 */
export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

/**
 * 기본 알림 인터페이스
 */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string | Date;
  isRead: boolean;
  priority?: NotificationPriority;
  targetUrl?: string;
  data?: Record<string, any>;
}

/**
 * CVE 관련 알림 인터페이스
 */
export interface CVENotification extends Notification {
  type: NotificationType.CVE_CREATED | NotificationType.CVE_UPDATED;
  data: {
    cveId: string;
    title?: string;
    fieldUpdated?: string;
    updatedBy?: string;
  };
}

/**
 * 댓글 관련 알림 인터페이스
 */
export interface CommentNotification extends Notification {
  type: NotificationType.COMMENT_ADDED;
  data: {
    cveId: string;
    commentId: string;
    commentAuthor: string;
  };
}

/**
 * 언급 알림 인터페이스
 */
export interface MentionNotification extends Notification {
  type: NotificationType.MENTION;
  data: {
    cveId: string;
    commentId: string;
    mentionedBy: string;
    commentText?: string;
  };
}

/**
 * 시스템 알림 인터페이스
 */
export interface SystemNotification extends Notification {
  type: NotificationType.SYSTEM;
  data?: {
    severity?: 'info' | 'warning' | 'error';
    action?: string;
  };
}

/**
 * 알림 필터 옵션 인터페이스
 */
export interface NotificationFilterOptions {
  isRead?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
  fromDate?: string | Date;
  toDate?: string | Date;
}

/**
 * 알림 업데이트 요청 인터페이스
 */
export interface NotificationUpdateRequest {
  isRead?: boolean;
}

/**
 * 알림 설정 인터페이스
 */
export interface NotificationSettings {
  emailNotifications: boolean;
  browserNotifications: boolean;
  notifyOnCveCreated: boolean;
  notifyOnCveUpdated: boolean;
  notifyOnCommentAdded: boolean;
  notifyOnMention: boolean;
  notifyOnSystem: boolean;
}