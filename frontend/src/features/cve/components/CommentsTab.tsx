import React, { useState, useEffect, useCallback, useMemo, useRef, memo, Fragment } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
} from '@mui/material';
import Comment from './Comment';
import MentionInput from './MentionInput';
import api from 'shared/api/config/axios';
import { useSnackbar } from 'notistack';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
  ListHeader,
  EmptyState
} from './CommonStyles';
import { Comment as CommentIcon } from '@mui/icons-material';
import { SOCKET_EVENTS } from 'core/socket/services/constants';
import logger from 'shared/utils/logging';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import { useSocket } from 'core/socket/hooks/useSocket';

// 커스텀 훅과 타입 임포트
import { useCommentMutations } from 'features/cve/hooks/useCommentMutation';
import { CommentData, CommentProps } from 'features/cve/types/CommentTypes';
import { MentionUser } from '../types';

// 사용자 타입 정의
interface User {
  id: string;
  username: string;
  displayName?: string;
  profileImage?: string;
  isAdmin?: boolean;
}

// CVE 상세 데이터 타입
interface CVEDetailData {
  cveId: string;
  comments?: CommentData[];
  [key: string]: any;
}

// 컴포넌트 Props 타입
interface CommentsTabProps {
  cve: CVEDetailData;
  onCommentCountChange?: (count: number) => void;
  currentUser?: User | null;
  refreshTrigger?: number;
  parentSendMessage?: (type: string, data: Record<string, unknown>) => Promise<boolean | null> | boolean | null;
  highlightCommentId?: string | null;
}

/**
 * 댓글 탭 컴포넌트
 */
const CommentsTab: React.FC<CommentsTabProps> = memo((props) => {
  const {
    cve,
    onCommentCountChange,
    currentUser,
    refreshTrigger = 0,
    parentSendMessage,
  } = props;

  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  // --- 상태 관리 ---
  const [newComment, setNewComment] = useState<string>('');
  const [replyingTo, setReplyingTo] = useState<CommentData | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [mentionInputKey, setMentionInputKey] = useState<number>(0);

  const commentInputRef = useRef<HTMLDivElement>(null);

  // --- useSocket 훅 사용 ---
  const { emit, on, connected } = useSocket();

  // --- 핸들러 함수 ---
  const handleStartEdit = useCallback((commentId: string): void => {
    setEditingCommentId(commentId);
    setReplyingTo(null);
  }, []);

  const handleFinishEdit = useCallback((): void => {
    setEditingCommentId(null);
  }, []);

  const handleStartReply = useCallback((comment: CommentData): void => {
    setReplyingTo(comment);
    setEditingCommentId(null);
  }, []);

  const handleCancelReply = useCallback((): void => {
    setReplyingTo(null);
  }, []);
  
  // --- 댓글 관련 웹소켓 이벤트 처리 ---
  
  // 새 댓글 알림 처리 콜백
  const handleCommentNotification = useCallback((message: { type: string; data?: { author?: string } }): void => {
    if (
      message.type === SOCKET_EVENTS.COMMENT_ADDED &&
      message.data?.author &&
      currentUser?.username &&
      message.data.author !== currentUser.username
    ) {
      logger.info('CommentsTab', '새로운 댓글 알림 수신', { author: message.data.author });
      enqueueSnackbar('새로운 댓글이 작성되었습니다.', {
        variant: 'info',
        autoHideDuration: 3000,
        anchorOrigin: { vertical: 'bottom', horizontal: 'right' }
      });
    }
  }, [currentUser?.username, enqueueSnackbar]);

  // 댓글 캐시 업데이트 함수 (웹소켓 수신 시)
  const updateCommentsCache = useCallback((
    cachedData: CVEDetailData | undefined, 
    eventData: { type: string; data?: { comments?: CommentData[] }; updateId?: string | number }
  ): CVEDetailData | undefined => {
    if (!cachedData || !eventData?.data?.comments) {
      return cachedData; // 업데이트할 데이터 없으면 원본 반환
    }
    logger.info('CommentsTab', '웹소켓: 댓글 캐시 업데이트', { eventType: eventData.type, updateId: eventData.updateId || Date.now() });
    // 새 데이터 객체 생성 및 댓글 업데이트
    return { ...cachedData, comments: eventData.data.comments };
  }, []);

  // 댓글 관련 웹소켓 이벤트 리스너 등록 및 해제
  useEffect(() => {
    if (!connected || !cve.cveId) return; // 연결 및 cveId 확인

    const queryKey = QUERY_KEYS.CVE.detail(cve.cveId);

    const handleSocketEvent = (eventName: string, eventData: any): void => {
      logger.info(`CommentsTab: Socket ${eventName} 수신`, eventData);
      
      // 알림 처리
      if (eventName === SOCKET_EVENTS.COMMENT_ADDED) {
        handleCommentNotification(eventData);
      }
      
      // 캐시 업데이트
      if (eventData?.data?.comments) {
        queryClient.setQueryData<CVEDetailData>(queryKey, (oldData) =>
          updateCommentsCache(oldData, eventData)
        );
        // 댓글 수 업데이트
        const newActiveCount = (eventData.data.comments || []).filter((c: CommentData) => !c.isDeleted).length;
        onCommentCountChange?.(newActiveCount);
      } else {
        // comments 데이터가 없으면 캐시 무효화 고려
        logger.warn(`Socket ${eventName}: comments 데이터 없음, 캐시 무효화`, { eventData });
        queryClient.invalidateQueries({ queryKey });
      }
    };

    const unsubAdded = on(SOCKET_EVENTS.COMMENT_ADDED, (data) => handleSocketEvent(SOCKET_EVENTS.COMMENT_ADDED, data));
    const unsubUpdated = on(SOCKET_EVENTS.COMMENT_UPDATED, (data) => handleSocketEvent(SOCKET_EVENTS.COMMENT_UPDATED, data));
    const unsubDeleted = on(SOCKET_EVENTS.COMMENT_DELETED, (data) => handleSocketEvent(SOCKET_EVENTS.COMMENT_DELETED, data));

    return () => {
      unsubAdded();
      unsubUpdated();
      unsubDeleted();
    };
  }, [connected, cve.cveId, queryClient, handleCommentNotification, updateCommentsCache, on, onCommentCountChange]);

  // --- 사용자 목록 조회 (멘션용) ---
  const { data: users = [], isLoading: isUsersLoading } = useQuery<User[], Error>({
    queryKey: ['users', 'search'],
    queryFn: async (): Promise<User[]> => {
      try {
        const response = await api.get<{ data: User[] }>('/auth/search');
        return response.data?.data || [];
      } catch (error) {
        logger.error('사용자 목록 조회 실패:', error);
        throw new Error('사용자 목록을 불러오는데 실패했습니다.');
      }
    },
    gcTime: 10 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
    initialData: [],
  });

  // --- 데이터 가공 (Memoization) ---
  const organizeComments = useCallback((commentsArray: CommentData[] = []): CommentData[] => {
    // 입력 배열이 없을 경우 빈 배열 반환
    if (!commentsArray || commentsArray.length === 0) return [];

    const commentMap = new Map<string, CommentData>();
    const rootComments: CommentData[] = [];

    commentsArray.forEach(comment => {
      // isDeleted 댓글도 포함하여 Map 생성
      commentMap.set(comment.id, { ...comment, children: [], depth: 0 });
    });

    commentsArray.forEach(comment => {
      const current = commentMap.get(comment.id);
      if (current && comment.parentId && commentMap.has(comment.parentId)) {
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          current.depth = (parent.depth ?? 0) + 1;
          parent.children = parent.children || []; // children 초기화
          parent.children.push(current);
        } else {
          current.depth = 0;
          rootComments.push(current);
        }
      } else if (current) {
        current.depth = 0;
        rootComments.push(current);
      }
    });

    const sortByDate = (arr: CommentData[]): void => {
      // Date 객체로 변환 후 비교 (타입 안정성)
      arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      arr.forEach(item => {
        if (item.children && item.children.length > 0) {
          sortByDate(item.children);
        }
      });
    };

    sortByDate(rootComments);
    return rootComments;
  }, []);

  // 활성 댓글 수 계산
  const activeCommentCount = useMemo((): number => {
    return (cve.comments || []).filter(comment => !comment.isDeleted).length;
  }, [cve.comments]);

  // 계층 구조로 정리된 댓글 목록
  const organizedComments = useMemo((): CommentData[] => {
    return organizeComments(cve.comments); // undefined 방지
  }, [cve.comments, organizeComments]);

  // 댓글 수 변경 시 콜백 호출
  useEffect(() => {
    onCommentCountChange?.(activeCommentCount);
  }, [activeCommentCount, onCommentCountChange]);

  // --- 댓글 관련 mutations 사용 ---
  const {
    createComment,
    editCommentMutation,
    replyCommentMutation,
    deleteCommentMutation,
    isLoading: isMutationLoading
  } = useCommentMutations(
    cve.cveId,
    currentUser,
    onCommentCountChange,
    parentSendMessage
  );

  // --- 입력 핸들러 ---
  const handleCommentChange = useCallback((value: string): void => {
    setNewComment(value);
  }, []);

  // 댓글 제출 핸들러
  const handleSubmit = useCallback((): void => {
    if (!newComment.trim()) {
      enqueueSnackbar('댓글 내용을 입력해주세요.', { variant: 'warning' });
      return;
    }
    createComment(newComment);
    // 성공 시 입력 필드 초기화
    setNewComment('');
    setMentionInputKey(prev => prev + 1);
  }, [newComment, createComment, enqueueSnackbar]);

  // 댓글 수정 핸들러
  const editComment = useCallback((commentId: string, content: string): Promise<any> => {
    return new Promise((resolve) => {
      if (!content.trim()) {
        enqueueSnackbar('댓글 내용을 입력해주세요.', { variant: 'warning' });
        resolve(null);
        return;
      }
      editCommentMutation.mutate({ commentId, content });
      resolve(null);
    });
  }, [editCommentMutation, enqueueSnackbar]);

  // 답글 작성 핸들러
  const replyComment = useCallback((parentId: string, content: string): Promise<any> => {
    return new Promise((resolve) => {
      if (!content.trim()) {
        enqueueSnackbar('답글 내용을 입력해주세요.', { variant: 'warning' });
        resolve(null);
        return;
      }
      replyCommentMutation.mutate({ parentId, content });
      setReplyingTo(null); // 답글 모드 종료
      resolve(null);
    });
  }, [replyCommentMutation, enqueueSnackbar, setReplyingTo]);

  // 댓글 삭제 핸들러
  const deleteComment = useCallback((commentId: string, permanent: boolean): Promise<any> => {
    return new Promise((resolve) => {
      deleteCommentMutation.mutate({ commentId, permanent });
      resolve(null);
    });
  }, [deleteCommentMutation]);

  // --- refreshTrigger 변경 시 캐시 무효화 ---
  useEffect(() => {
    if (refreshTrigger > 0 && cve.cveId) {
      logger.info('CommentsTab: refreshTrigger 변경, 캐시 무효화', { refreshTrigger });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(cve.cveId) });
    }
  }, [refreshTrigger, cve.cveId, queryClient]);

  // --- 댓글 렌더링 ---
  const CommentItem = useCallback(({ comment }: { comment: CommentData }) => {
    const isEditingThis = editingCommentId === comment.id;
    const isReplyingToThis = replyingTo?.id === comment.id;

    // MentionInput에 필요한 users 타입 변환
    const usersForMention: MentionUser[] = users.map(u => ({
      id: u.username,
      display: u.displayName || u.username,
    }));

    const commentProps: CommentProps = {
      comment,
      isEditing: isEditingThis,
      replyMode: isReplyingToThis,
      onStartEdit: handleStartEdit,
      onFinishEdit: handleFinishEdit,
      onEdit: editComment,
      onReply: handleStartReply,
      onReplyCancel: handleCancelReply,
      onReplySubmit: replyComment,
      onDelete: deleteComment,
      currentUsername: currentUser?.username,
      isAdmin: currentUser?.isAdmin ?? false,
      depth: comment.depth ?? 0,
      cveId: cve.cveId,
      usersForMention: usersForMention,
      parentSendMessage,
      isSubmitting: isMutationLoading,
    };
    return <Comment {...commentProps} />;
  }, [
    editingCommentId, 
    replyingTo, 
    handleStartEdit, 
    handleFinishEdit, 
    editComment, 
    handleStartReply, 
    handleCancelReply, 
    replyComment, 
    deleteComment, 
    currentUser, 
    cve.cveId, 
    users, 
    parentSendMessage, 
    isMutationLoading
  ]);

  const MemoizedCommentItem = useMemo(() => memo(CommentItem), [CommentItem]);

  // 재귀 댓글 렌더링
  const renderComment = useCallback((comment: CommentData) => {
    return (
      <Fragment key={comment.id}>
        <MemoizedCommentItem comment={comment} />
        {comment.children?.map(child => renderComment(child))}
      </Fragment>
    );
  }, [MemoizedCommentItem]);

  // MentionInput props 준비
  const mentionInputUsers: MentionUser[] = useMemo(() => users.map(u => ({
    id: u.username,
    display: u.displayName || u.username,
  })), [users]);

  // MentionInput 핸들러
  const handleMentionInputChange = useCallback((value: string | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    if (typeof value === 'string') {
      setNewComment(value);
    } else {
      setNewComment(value.target.value);
    }
  }, []);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ListHeader>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CommentIcon color="action" />
          <Typography variant="h6" color="text.primary">
            댓글 ({activeCommentCount})
          </Typography>
          {(isUsersLoading || isMutationLoading) && <CircularProgress size={20} sx={{ ml: 1 }} />}
        </Box>
      </ListHeader>

      {(!editingCommentId && !replyingTo) && (
        <Box sx={{ mb: 2, px: 2, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1 }}>
              <MentionInput
                key={mentionInputKey}
                value={newComment}
                onChange={handleMentionInputChange}
                onSubmit={handleSubmit}
                placeholder="댓글을 입력하세요... (@로 사용자 멘션)"
                loading={isMutationLoading}
                users={mentionInputUsers}
                inputRef={commentInputRef}
              />
            </Box>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSubmit}
              disabled={isMutationLoading || !newComment.trim()}
              sx={{ mt: '8px', height: 'fit-content' }}
            >
              {isMutationLoading ? '작성중...' : '작성'}
            </Button>
          </Box>
        </Box>
      )}

      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pb: 2 }}>
        {organizedComments.length > 0 ? (
          organizedComments.map(comment => renderComment(comment))
        ) : (
          // 데이터 로딩 중이 아닐 때만 빈 상태 표시
          !isUsersLoading && !isMutationLoading && (
            <EmptyState>
              <Typography variant="body1" color="text.secondary">
                아직 댓글이 없습니다. 첫 댓글을 작성해보세요!
              </Typography>
            </EmptyState>
          )
        )}
      </Box>
    </Box>
  );
});

CommentsTab.displayName = 'CommentsTab';
export default CommentsTab;