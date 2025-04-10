// index.ts - 명시적 내보내기로 충돌 해결
// 공통 타입들
export type { User } from './CommentTypes';

// 댓글 관련 타입들
export type { 
  CommentData,
  CommentProps,
  CommentsTabProps
} from './CommentTypes';

// 멘션 관련 타입들
export type {
  MentionUser,
  MentionState,
  MentionInputProps
} from './MentionTypes';

// UI 관련 타입들
export type {
  InlineEditTextProps,
  StyledComponentProps,
  SeverityChipProps,
  TabPanelProps
} from './UITypes';

// 탭 관련 타입들
export type {
  TabConfig,
  PoCSourceInfo,
  RuleTypeInfo,
  BaseItem,
  PoCItem,
  SnortRuleItem,
  ReferenceItem,
  DataItem,
  ExtendedTabConfig
} from './TabTypes';

// CVE 관련 핵심 타입들 (중복되지 않는 타입들만)
export type {
  CVEBase,
  CVEListResponse,
  CVEDetail,
  CVEDetailData,
  Reference,
  PoC,
  SnortRule,
  ModificationHistory,
  Comment,
  CommentExtended,
  CommentState,
  Subscriber,
  RefreshTriggers,
  TabCounts,
  CVEDetailHeaderProps,
  CVEDetailInfoPanelProps,
  CVEDetailTabsProps,
  CVEDetailProps,
  SubscriberCountProps,
  CVEFilterOptions,
  CVEUpdateRequest,
  OperationResponse,
  ApiResponse,
  FormData,
  PoCFile,
  SnortRuleFile,
  ReferenceFile,
  CVEData,
  SelectOption,
  GenericDataTabBaseProps,
  SnortRuleTabProps,
  PoCTabProps,
  ReferenceTabProps,
  GenericDataTabProps,
  WebSocketUpdateData,
  HistoryChange,
  HistoryItem,
  HistoryTabProps
} from './cve';

// 생성된 타입 export 추가
export * from './generated/cve';

// 함수 내보내기
export { countActiveComments } from './cve';