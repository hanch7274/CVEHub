import React from 'react';
import { MentionUser } from './MentionTypes';

/**
 * 확장된 댓글 데이터 타입
 */
export interface CommentData {
  /** 댓글 고유 ID */
  id: string;
  
  /** 댓글 내용 */
  content: string;
  
  /** 작성자 (username) */
  author?: string;
  
  /** 작성자 이름 */
  authorName?: string;
  
  /** 프로필 이미지 URL */
  profileImage?: string;
  
  /** 작성 시간 */
  createdAt: string | Date;
  
  /** 마지막 수정 시간 */
  lastModifiedAt?: string | Date;
  
  /** 부모 댓글 ID (대댓글인 경우) */
  parentId?: string;
  
  /** 삭제 여부 */
  isDeleted?: boolean;
  
  /** 낙관적 업데이트용 플래그 */
  isOptimistic?: boolean;
  
  /** 자식 댓글 목록 */
  children?: CommentData[];
  
  /** 댓글 깊이 (중첩 레벨) */
  depth?: number;
  
  /** 작성자 ID (username) */
  createdBy?: string;
  
  /** 기타 속성 */
  [key: string]: unknown;
}

/**
 * Comment 컴포넌트 Props 인터페이스
 */
export interface CommentProps {
  /** 댓글 데이터 */
  comment: CommentData;
  
  /** 댓글 깊이 (대댓글이면 1,2...) */
  depth?: number;
  
  /** 현재 로그인한 사용자명 */
  currentUsername?: string;
  
  /** 관리자 여부 */
  isAdmin?: boolean;
  
  /** 현재 이 댓글이 "수정 중"인지 여부 */
  isEditing?: boolean;
  
  /** 현재 이 댓글이 "답글 모드"인지 여부 */
  replyMode?: boolean;
  
  /** CVE ID */
  cveId?: string;
  
  /** 멘션 가능한 사용자 목록 */
  usersForMention?: MentionUser[];
  
  /** 제출 중 여부 (로딩 상태) */
  isSubmitting?: boolean;
  
  /** 부모 메시지 전송 함수 */
  parentSendMessage?: (type: string, data: Record<string, unknown>) => Promise<boolean | null> | boolean | null;
  
  /** 수정 시작 콜백 */
  onStartEdit: (commentId: string) => void;
  
  /** 수정 종료 콜백 */
  onFinishEdit: () => void;
  
  /** 수정 콜백 */
  onEdit: (commentId: string, content: string) => Promise<any>;
  
  /** 답글 모드 시작 콜백 */
  onReply: (comment: CommentData) => void;
  
  /** 답글 모드 취소 콜백 */
  onReplyCancel: () => void;
  
  /** 답글 제출 콜백 */
  onReplySubmit: (parentCommentId: string, content: string) => Promise<any>;
  
  /** 삭제 콜백 */
  onDelete: (commentId: string, permanent: boolean) => Promise<any>;
  
  /** 자식 (중첩 댓글) 렌더링 컨텐츠 */
  children?: React.ReactNode;
}

/**
 * 사용자 기본 정보 인터페이스
 */
export interface User {
  id?: string;
  username: string;
  displayName?: string;
  profileImage?: string;
  isAdmin?: boolean;
}

/**
 * CommentsTab 컴포넌트 Props 인터페이스
 */
export interface CommentsTabProps {
  /** CVE 상세 데이터 */
  cve: {
    cveId: string;
    comments?: CommentData[];
    [key: string]: any;
  };
  
  /** 댓글 수 변경 콜백 */
  onCommentCountChange?: (count: number) => void;
  
  /** 현재 사용자 정보 */
  currentUser?: User | null;
  
  /** 새로고침 트리거 */
  refreshTrigger?: number;
  
  /** 부모 메시지 전송 함수 */
  parentSendMessage?: (type: string, data: Record<string, unknown>) => Promise<boolean | null> | boolean | null;
  
  /** 강조할 댓글 ID */
  highlightCommentId?: string | null;
}