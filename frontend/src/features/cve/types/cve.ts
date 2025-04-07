/**
 * CVE 관련 타입 정의 파일
 */

// 다른 타입 파일에서 중복된 타입 임포트
import { CommentProps as ImportedCommentProps } from './CommentTypes';
import { CommentsTabProps as ImportedCommentsTabProps } from './CommentTypes';
import { MentionUser as ImportedMentionUser } from './MentionTypes';
import { TabConfig as ImportedTabConfig } from './TabTypes';
import { SeverityChipProps as ImportedSeverityChipProps } from './UITypes';
import { TabPanelProps as ImportedTabPanelProps } from './UITypes';

// 중복 타입을 재내보내기 (타입 호환성 유지)
export type CommentProps = ImportedCommentProps;
export type CommentsTabProps = ImportedCommentsTabProps;
export type MentionUser = ImportedMentionUser;
export type TabConfig = ImportedTabConfig;
export type SeverityChipProps = ImportedSeverityChipProps;
export type TabPanelProps = ImportedTabPanelProps;

/**
 * CVE 기본 정보 인터페이스
 */
export interface CVEBase {
  id?: string;
  cveId: string;
  title?: string;
  status: string;
  createdAt: string | Date;
  lastModifiedAt?: string | Date;
  severity?: string;
}

/**
 * CVE 목록 응답 인터페이스
 */
export interface CVEListResponse {
  items: CVEBase[];
  total: number;
  page: number;
  limit: number;
}

/**
 * CVE 상세 정보 인터페이스
 */
export interface CVEDetail extends CVEBase {
  description?: string;
  references: Reference[];
  pocs: PoC[];
  snortRules: SnortRule[];
  modificationHistory: ModificationHistory[];
  createdBy?: string;
  lastModifiedBy?: string;
  comments?: Comment[];
  // CVEDetailData 타입과의 호환성을 위한 인덱스 시그니처 추가
  [key: string]: unknown;
}

/**
 * CVE 상세 데이터 인터페이스 - API 응답 또는 캐시된 데이터를 위한 확장 인터페이스
 * 백엔드와 프론트엔드 간의 필드명 차이를 허용하기 위한 유연한 인터페이스
 */
export interface CVEDetailData {
  cveId: string;
  createdAt?: string | Date;
  created_at?: string | Date;
  lastModifiedAt?: string | Date;
  last_modified_at?: string | Date;
  fromCache?: boolean;
  _cachedAt?: number | string;
  cachedAt?: number | string;
  pocs?: unknown[];
  poc?: unknown[];
  PoCs?: unknown[];
  pocList?: unknown[];
  snortRules?: unknown[];
  snort_rules?: unknown[];
  references?: unknown[];
  refs?: unknown[];
  comments?: Comment[];
  [key: string]: unknown;
}

/**
 * 참고자료 인터페이스
 */
export interface Reference {
  id?: string;
  url: string;
  description?: string;
  addedBy?: string;
  addedAt?: string | Date;
  // CVEData 타입과의 호환성을 위한 인덱스 시그니처 추가
  [key: string]: unknown;
}

/**
 * PoC (Proof of Concept) 인터페이스
 */
export interface PoC {
  id?: string;
  code: string;
  language: string;
  description?: string;
  addedBy?: string;
  addedAt?: string | Date;
  // CVEData 타입과의 호환성을 위한 인덱스 시그니처 추가
  [key: string]: unknown;
}

/**
 * Snort 규칙 인터페이스
 */
export interface SnortRule {
  id?: string;
  rule: string;
  description?: string;
  addedBy?: string;
  addedAt?: string | Date;
  // CVEData 타입과의 호환성을 위한 인덱스 시그니처 추가
  [key: string]: unknown;
}

/**
 * 수정 이력 인터페이스
 */
export interface ModificationHistory {
  id?: string;
  field: string;
  oldValue?: any;
  newValue?: any;
  modifiedBy: string;
  modifiedAt: string | Date;
}

/**
 * 댓글 인터페이스
 */
export interface Comment {
  id?: string;
  content?: string;
  author?: unknown;
  created_at?: string | Date;
  updated_at?: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  createdBy?: string;
  isDeleted?: boolean;
  is_deleted?: boolean;
  children?: Comment[];
  parentId?: string;
  depth?: number;
  lastModifiedAt?: string | Date;
  [key: string]: unknown;
}

/**
 * 확장된 댓글 인터페이스 (Comment 컴포넌트용)
 */
export interface CommentExtended extends Comment {
  parentId?: string;
  depth?: number;
  lastModifiedAt?: string | Date;
}

/**
 * 댓글 상태 관리 인터페이스
 */
export interface CommentState {
  editingId: string | null;
  replyingToId: string | null;
  comments: Comment[];
  loading: boolean;
  error: string | null;
}

/**
 * 구독자 인터페이스
 */
export interface Subscriber {
  id?: string;
  userId?: string;
  displayName?: string;
  username?: string;
  profile_image?: string;
  profileImage?: string;
}

/**
 * 새로고침 트리거 인터페이스
 */
export interface RefreshTriggers {
  general: number;
  poc: number;
  snortRules: number;
  references: number;
  comments: number;
  history: number;
}

/**
 * 탭 카운트 인터페이스
 */
export interface TabCounts {
  poc: number;
  snortRules: number;
  references: number;
  comments: number;
}

/**
 * CVE 상세 헤더 Props 인터페이스
 */
export interface CVEDetailHeaderProps {
  cveId: string;
  subscribers: Subscriber[];
  createdAt: string | Date;
  lastModifiedAt: string | Date;
  isCached: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  onClose: () => void;
}

/**
 * CVE 상세 정보 패널 Props 인터페이스
 */
export interface CVEDetailInfoPanelProps {
  cveData: CVEDetailData;
  onUpdateField: (field: string, value: unknown) => Promise<void>;
  canEdit: boolean;
}

/**
 * CVE 상세 탭 Props 인터페이스
 */
export interface CVEDetailTabsProps {
  cveData: CVEDetailData;
  currentUser: unknown;
  refreshTriggers: RefreshTriggers;
  tabCounts: TabCounts;
  onCountChange: (tabKey: keyof TabCounts, count: number) => void;
  parentSendMessage: (type: string, data: Record<string, unknown>) => Promise<boolean | null>;
  highlightCommentId?: string | null;
}

/**
 * CVE 상세 컴포넌트 Props 인터페이스
 */
export interface CVEDetailProps {
  cveId?: string;
  open?: boolean;
  onClose: () => void;
  highlightCommentId?: string | null;
}

/**
 * 구독자 수 표시 컴포넌트 Props 인터페이스
 */
export interface SubscriberCountProps {
  subscribers: Subscriber[];
  cveId?: string;
}

/**
 * CVE 필터링 옵션 인터페이스
 */
export interface CVEFilterOptions {
  page?: number;
  rowsPerPage?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

/**
 * CVE 생성 요청 인터페이스
 */
export interface CVECreateRequest {
  cveId: string;
  title?: string;
  description?: string;
  status: string;
  severity?: string;
  references?: Reference[];
}

/**
 * CVE 업데이트 요청 인터페이스
 */
export interface CVEUpdateRequest {
  title?: string;
  description?: string;
  status?: string;
  severity?: string;
  references?: Reference[];
  pocs?: PoC[];
  snortRules?: SnortRule[];
}

/**
 * 작업 결과 응답 인터페이스
 */
export interface OperationResponse {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * API 응답 인터페이스 (제네릭)
 */
export interface ApiResponse<T> {
  data?: T;
  success?: boolean;
  message?: string;
  status?: number;
  [key: string]: unknown;
}

/**
 * CreateCVE 폼 데이터 인터페이스
 */
export interface FormData {
  cveId: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  tags: string[];
  exploitStatus: string;
}

/**
 * PoC (Proof of Concept) 파일 인터페이스
 */
export interface PoCFile {
  id?: string;
  source: string;
  url: string;
  created_by?: string;
  last_modified_by?: string;
}

/**
 * Snort 규칙 파일 인터페이스
 */
export interface SnortRuleFile {
  id?: string;
  rule: string;
  type: string;
  created_by?: string;
  last_modified_by?: string;
}

/**
 * 참조 URL 인터페이스
 */
export interface ReferenceFile {
  id?: string;
  url: string;
  created_at?: string;
  created_by?: string;
  last_modified_at?: string | null;
  last_modified_by?: string;
}

/**
 * CVE 데이터 인터페이스 (CreateCVE 컴포넌트용)
 */
export interface CVEData extends FormData {
  pocs: Omit<PoCFile, 'id'>[];
  snortRules: Omit<SnortRuleFile, 'id'>[];
  references: Omit<ReferenceFile, 'id'>[];
}

/**
 * 선택 옵션 인터페이스
 */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * GenericDataTab의 기본 프롭스 인터페이스
 */
export interface GenericDataTabBaseProps {
  cveData: CVEDetail;
  refreshTrigger?: number;
  currentUser?: { username: string; [key: string]: any };
  canEdit?: boolean;
  onTabCountChange?: (key: string, count: number) => void;
  parentSendMessage?: (type: string, data: Record<string, any>) => Promise<boolean | null>;
}

/**
 * SnortRulesTab 컴포넌트의 프롭스 인터페이스
 */
export interface SnortRulesTabProps extends GenericDataTabBaseProps {}

/**
 * PoCTab 컴포넌트의 프롭스 인터페이스
 */
export interface PoCTabProps extends GenericDataTabBaseProps {}

/**
 * ReferencesTab 컴포넌트의 프롭스 인터페이스
 */
export interface ReferencesTabProps extends GenericDataTabBaseProps {}

/**
 * GenericDataTab 프롭스 인터페이스
 */
export interface GenericDataTabProps extends GenericDataTabBaseProps {
  tabConfig: ImportedTabConfig; // 변경된 부분
}

/**
 * 웹소켓 업데이트 데이터 인터페이스
 */
export interface WebSocketUpdateData {
  id?: string;
  cveId?: string;
  field?: string;
  field_key?: string;
  value?: unknown;
  data?: Record<string, unknown>;
  timestamp?: string | number;
  senderId?: string;
  event?: string;
  updateId?: number | string;
  updatedData?: Record<string, any>;
  [key: string]: unknown;
}

/**
 * 운영 중인 댓글 수 계산 함수
 * @param comments 댓글 배열 (중첩 댓글 포함)
 * @returns 삭제되지 않은 댓글의 총 개수
 */
export const countActiveComments = (comments?: Comment[]): number => {
  if (!comments || !Array.isArray(comments)) return 0;
  
  let count = 0;
  comments.forEach(comment => {
    // 삭제되지 않은 댓글만 쪽수
    if (!(comment.isDeleted || comment.is_deleted)) {
      count++;
    }
    // 중첩 댓글 처리
    if (comment.children && Array.isArray(comment.children)) {
      count += countActiveComments(comment.children);
    }
  });
  
  return count;
};

/**
 * HistoryTab 컴포넌트에서 사용하는 수정 이력 인터페이스
 */
export interface HistoryChange {
  /**
   * 변경된 필드명
   */
  field: string;
  
  /**
   * 표시용 필드명
   */
  fieldName?: string;
  
  /**
   * 변경 액션 (add, edit, delete)
   */
  action: 'add' | 'edit' | 'delete';
  
  /**
   * 변경 내용 요약
   */
  summary: string;
  
  /**
   * 상세 표시 타입
   */
  detailType?: 'simple' | 'detailed';
  
  /**
   * 변경 전 값
   */
  before?: string;
  
  /**
   * 변경 후 값
   */
  after?: string;
  
  /**
   * 변경된 아이템 목록 (배열 타입 필드의 경우)
   */
  items?: Array<{
    type?: string;
    rule?: string;
    url?: string;
    [key: string]: unknown;
  }>;
}

/**
 * HistoryTab 컴포넌트에서 사용하는 수정 이력 항목 인터페이스
 */
export interface HistoryItem {
  /**
   * 수정한 사용자명
   */
  username: string;
  
  /**
   * 수정 일시
   */
  modifiedAt?: string | Date;
  
  /**
   * 수정 일시 (백엔드 필드명 호환용)
   */
  lastModifiedAt?: string | Date;
  
  /**
   * 변경 내역 목록
   */
  changes?: HistoryChange[];
}

/**
 * HistoryTab 컴포넌트 Props 인터페이스
 */
export interface HistoryTabProps {
  /**
   * 수정 이력 목록
   */
  modificationHistory?: HistoryItem[];
}