/**
 * 컴포넌트 관련 타입 정의 파일
 */

import { ReactNode } from 'react';
import { Theme } from '@mui/material/styles';
import { SxProps } from '@mui/system';
import { CVEDetail, CVEBase } from './cve';
import { User } from './auth';

/**
 * 공통 컴포넌트 프롭스 인터페이스
 */
export interface CommonComponentProps {
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  sx?: SxProps<Theme>;
}

/**
 * 레이아웃 컴포넌트 프롭스 인터페이스
 */
export interface LayoutProps extends CommonComponentProps {
  title?: string;
}

/**
 * CVE 컴포넌트 관련 프롭스 인터페이스
 */

// CVE 상세 정보 컴포넌트 프롭스
export interface CVEDetailProps {
  cveId: string;
  open?: boolean;
  onClose: () => void;
  highlightCommentId?: string | null;
}

// CVE 목록 컴포넌트 프롭스
export interface CVEListProps extends CommonComponentProps {
  selectedCVE?: string;
  setSelectedCVE?: (cveId: string) => void;
}

// CVE 생성 컴포넌트 프롭스
export interface CreateCVEProps extends CommonComponentProps {
  onSuccess?: (cveId: string) => void;
  onCancel?: () => void;
}

// 인라인 수정 텍스트 컴포넌트 프롭스
export interface InlineEditTextProps {
  value?: string;
  onSave: (newValue: string) => void;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  fontSize?: string | number;
  externalEdit?: boolean;
  onEditingStart?: () => void;
  onEditingEnd?: () => void;
}

// 댓글 컴포넌트 프롭스
export interface CommentProps {
  comment: any; // Comment 타입
  cveId: string;
  currentUser: User;
  onReply?: (commentId: string) => void;
  onEdit?: (commentId: string, newContent: string) => void;
  onDelete?: (commentId: string) => void;
  sendMessage?: (type: string, data: any) => Promise<any>;
  depth?: number;
  refreshTrigger?: number;
}

// 댓글 탭 컴포넌트 프롭스
export interface CommentsTabProps {
  cve: CVEDetail;
  currentUser: User;
  refreshTrigger?: number;
  onCountChange?: (count: number) => void;
  parentSendMessage?: (type: string, data: any) => Promise<any>;
}

// 히스토리 탭 컴포넌트 프롭스
export interface HistoryTabProps {
  modificationHistory: any[]; // ModificationHistory[]
}

// 일반 데이터 탭 컴포넌트 프롭스
export interface GenericDataTabProps {
  cve: CVEDetail;
  currentUser: User;
  refreshTrigger?: number;
  tabConfig: any; // TabConfig
  onCountChange?: (count: number) => void;
  parentSendMessage?: (type: string, data: any) => Promise<any>;
}

// 태그 상태
export interface TagState {
  id: string | number;
  text: string;
}

// 멘션 입력 컴포넌트 프롭스
export interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  mentions?: any[]; // User[]
  onMention?: (user: any) => void;
  onSubmit?: () => void;
}

/**
 * 알림 컴포넌트 관련 프롭스 인터페이스
 */
export interface NotificationBellProps extends CommonComponentProps {
  count?: number;
  onClick?: () => void;
  onOpenCVEDetail?: (cveId: string, commentId?: string) => void;
}

/**
 * 사용자 인증 컴포넌트 관련 프롭스 인터페이스
 */
export interface LoginFormProps extends CommonComponentProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export interface SignUpProps extends CommonComponentProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * 탭 패널 컴포넌트 프롭스 인터페이스
 */
export interface TabPanelProps {
  children?: ReactNode;
  index: number;
  value: number;
}