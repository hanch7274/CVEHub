import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Button
} from '@mui/material';
import Comment from './Comment';
import MentionInput from './MentionInput';
import { api } from '../../../utils/auth';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import {
  ListHeader,
  EmptyState
} from './CommonStyles';
import { Comment as CommentIcon } from '@mui/icons-material';
import { SOCKET_EVENTS } from '../../../services/socketio/constants';
import logger from '../../../utils/logging';

// 멘션된 사용자를 추출하는 유틸리티 함수
const extractMentions = (content) =>
  content.match(/@(\w+)/g)?.map(mention => mention.substring(1)) || [];

// 시간 포맷팅
const formatDate = (dateString) => {
  if (!dateString) return '';
  try {
    // KST 시간대로 변환 (UTC+9)
    const date = new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true, locale: ko });
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

const CommentsTab = React.memo(({
  cve,
  onUpdate,
  onCommentCountChange,
  currentUser,
  refreshTrigger,
  open,
  parentSendMessage
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  
  // 웹소켓 메시지를 통해 새로운 댓글 알림을 처리하는 콜백 함수
  const handleCommentNotification = useCallback((message) => {
    if (message.type === SOCKET_EVENTS.COMMENT_ADDED && message.data?.author !== currentUser?.username) {
      logger.info('CommentsTab', '새로운 댓글 알림 수신', { author: message.data?.author });
      enqueueSnackbar('새로운 댓글이 작성되었습니다.', { 
        variant: 'info',
        autoHideDuration: 3000
      });
    }
  }, [currentUser?.username, enqueueSnackbar]);
  
  // useCVEWebSocketUpdate 훅을 사용하여 웹소켓 메시지 처리 및 알림
  //const { sendCustomMessage } = useCVEWebSocketUpdate(cve.cveId, handleCommentNotification);

  // 상위 상태
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mentionInputKey, setMentionInputKey] = useState(0);
  const [users, setUsers] = useState([]);

  // 최상위 댓글 입력값을 위한 ref - 객체로 올바르게 사용
  const commentInputRef = useRef(null);

  // 수정 모드 핸들러
  const handleStartEdit = useCallback((commentId) => {
    setEditingCommentId(commentId);
  }, []);

  const handleFinishEdit = useCallback(() => {
    setEditingCommentId(null);
  }, []);

  // 사용자 목록 가져오기
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await api.get('/users/search');
        setUsers(response.data);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      }
    };
    fetchUsers();
  }, []);

  // 댓글 계층화
  const organizeComments = useCallback((commentsArray) => {
    const commentMap = new Map();
    const rootComments = [];
    commentsArray.forEach(comment => {
      commentMap.set(comment.id, { ...comment, children: [], depth: 0 });
    });
    commentsArray.forEach(comment => {
      const current = commentMap.get(comment.id);
      if (comment.parentId && commentMap.has(comment.parentId)) {
        const parent = commentMap.get(comment.parentId);
        current.depth = parent.depth + 1;
        parent.children.push(current);
      } else {
        current.depth = 0;
        rootComments.push(current);
      }
    });
    const sortByDate = (arr) => {
      arr.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      arr.forEach(item => {
        if (item.children.length > 0) sortByDate(item.children);
      });
    };
    sortByDate(rootComments);
    return rootComments;
  }, []);

  // 활성 댓글 수 계산 (삭제되지 않은 댓글만)
  const activeCommentCount = useMemo(() => {
    return (cve.comments || []).filter(comment => !comment.isDeleted).length;
  }, [cve.comments]);

  // 댓글 구조화
  const organizedComments = useMemo(() => {
    if (!cve.comments) return [];
    return organizeComments(cve.comments);
  }, [cve.comments, organizeComments]);

  // 댓글 수 변경 시 콜백 호출
  useEffect(() => {
    onCommentCountChange?.(activeCommentCount);
  }, [activeCommentCount, onCommentCountChange]);

  // 댓글 삭제 함수
  const handleDelete = useCallback(async (commentId, permanent = false) => {
    try {
      setLoading(true);
      const response = await api.delete(`/cves/${cve.cveId}/comments/${commentId}`, {
        params: { permanent }
      });

      if (response) {
        await parentSendMessage(
          SOCKET_EVENTS.COMMENT_DELETED,
          {
            cveId: cve.cveId,
            field: 'comments',
            cve: response.data
          }
        );
        
        // 즉시 데이터 갱신 호출 제거
        enqueueSnackbar(
          permanent ? '댓글이 완전히 삭제되었습니다.' : '댓글이 삭제되었습니다.',
          { variant: 'success' }
        );
      }
    } catch (error) {
      console.error('댓글 삭제 중 오류:', error);
      enqueueSnackbar(
        error.response?.data?.detail || '댓글 삭제 중 오류가 발생했습니다.',
        { variant: 'error' }
      );
    } finally {
      setLoading(false);
    }
  }, [cve.cveId, parentSendMessage, enqueueSnackbar]);

  // 댓글 수정 함수
  const handleEdit = useCallback(async (commentId, content) => {
    try {
      setLoading(true);
      const mentions = extractMentions(content);
      const response = await api.patch(`/cves/${cve.cveId}/comments/${commentId}`, {
        content,
        parentId: null
      });

      if (response) {
        if (mentions.length > 0) {
          await parentSendMessage(
            SOCKET_EVENTS.MENTION_ADDED,
            {
              type: 'mention',
              recipients: mentions,
              content: `${currentUser.username}님이 댓글에서 회원님을 멘션했습니다.`,
              metadata: {
                cveId: cve.cveId,
                commentId: commentId,
                comment_content: content
              }
            }
          );
        }
        
        // WebSocket 메시지 전송 - 필드 정보 추가
        await parentSendMessage(
          SOCKET_EVENTS.COMMENT_UPDATED,
          {
            cveId: cve.cveId,
            field: 'comments',
            cve: response.data
          }
        );
        
        // 즉시 데이터 갱신 호출 제거
        enqueueSnackbar('댓글이 수정되었습니다.', { variant: 'success' });
        handleFinishEdit();
      }
    } catch (error) {
      console.error('댓글 수정 중 오류:', error);
      enqueueSnackbar(
        error.response?.data?.detail || '댓글 수정 중 오류가 발생했습니다.',
        { variant: 'error' }
      );
    } finally {
      setLoading(false);
    }
  }, [cve.cveId, currentUser, parentSendMessage, enqueueSnackbar, handleFinishEdit]);

  // 답글 작성 함수
  const handleReplySubmit = useCallback(async (parentId, content) => {
    try {
      setLoading(true);
      const mentions = extractMentions(content);
      const response = await api.post(`/cves/${cve.cveId}/comments`, {
        content,
        parent_id: parentId,
        mentions
      });

      if (response) {
        if (mentions.length > 0) {
          await parentSendMessage(
            SOCKET_EVENTS.MENTION_ADDED,
            {
              type: 'mention',
              recipients: mentions,
              content: `${currentUser.username}님이 답글에서 회원님을 멘션했습니다.`,
              metadata: {
                cveId: cve.cveId,
                commentId: response.data.id,
                comment_content: content
              }
            }
          );
        }
        
        setReplyingTo(null);
        
        // 즉시 데이터 갱신 호출 제거
        enqueueSnackbar('답글이 작성되었습니다.', { variant: 'success' });
      }
    } catch (error) {
      console.error('Failed to submit reply:', error);
      enqueueSnackbar(
        error.response?.data?.detail || '답글 작성 중 오류가 발생했습니다.',
        { variant: 'error' }
      );
    } finally {
      setLoading(false);
    }
  }, [cve.cveId, currentUser, parentSendMessage, enqueueSnackbar]);

  // 개별 댓글 아이템 (메모이제이션)
  const CommentItem = useCallback(({ comment }) => {
    const isEditingThis = editingCommentId === comment.id;
    const replyMode = replyingTo?.id === comment.id;

    return (
      <Comment
        comment={comment}
        isEditing={isEditingThis}
        replyMode={replyMode}
        onStartEdit={handleStartEdit}
        onFinishEdit={handleFinishEdit}
        onEdit={handleEdit}
        onReply={(c) => setReplyingTo(c)}
        onReplyCancel={() => setReplyingTo(null)}
        onReplySubmit={handleReplySubmit}
        onDelete={handleDelete}
        currentUsername={currentUser?.username}
        isAdmin={currentUser?.isAdmin}
        depth={comment.depth || 0}
        cveId={cve.cveId}
      />
    );
  }, [
    editingCommentId,
    replyingTo,
    handleStartEdit,
    handleFinishEdit,
    handleEdit,
    handleReplySubmit,
    handleDelete,
    currentUser,
    cve.cveId
  ]);

  // 메모이제이션된 댓글 컴포넌트
  const MemoizedCommentItem = useMemo(() => React.memo(CommentItem), [CommentItem]);

  // 재귀적으로 댓글 렌더링하는 함수
  const renderComment = useCallback((comment) => {
    return (
      <React.Fragment key={comment.id}>
        <MemoizedCommentItem comment={comment} />
        {comment.children?.map(child => renderComment(child))}
      </React.Fragment>
    );
  }, []);

  // 댓글 목록 재조회
  const updateLocalComments = useCallback(async () => {
    try {
      setLoading(true);
      // CVE detail에 이미 comments가 포함되어 있으므로 별도 요청 제거
      const organized = organizeComments(cve.comments || []);
      const currentActiveCount = (cve.comments || []).filter(comment => !comment.isDeleted).length;
      onCommentCountChange?.(currentActiveCount);
    } catch (error) {
      console.error('Error updating comments:', error);
      enqueueSnackbar('댓글을 불러오는데 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [
    cve.comments,
    organizeComments,
    onCommentCountChange,
    enqueueSnackbar
  ]);

  // 댓글 입력 중 멘션 처리
  const handleCommentChange = useCallback((e) => {
    const value = e.target.value;
    setNewComment(value);
    // commentInputRef는 객체를 저장하는 ref이므로 값을 직접 할당하지 않음
  }, []);

  // 댓글 작성 함수
  const handleSubmit = useCallback(async () => {
    try {
      if (!newComment.trim()) {
        enqueueSnackbar('댓글 내용을 입력해주세요.', { variant: 'warning' });
        return;
      }

      setLoading(true);
      const mentions = extractMentions(newComment);
      const response = await api.post(`/cves/${cve.cveId}/comments`, {
        content: newComment,
        mentions
      });

      if (response) {
        // 멘션이 있을 경우 알림 전송
        if (mentions.length > 0) {
          await parentSendMessage(
            SOCKET_EVENTS.MENTION_ADDED,
            {
              type: 'mention',
              recipients: mentions,
              content: `${currentUser.username}님이 댓글에서 회원님을 멘션했습니다.`,
              metadata: {
                cveId: cve.cveId,
                commentId: response.data.id,
                comment_content: newComment
              }
            }
          );
        }

        // WebSocket 메시지 전송 - 필드 정보 추가
        await parentSendMessage(
          SOCKET_EVENTS.COMMENT_ADDED,
          {
            type: SOCKET_EVENTS.COMMENT_ADDED,
            cveId: cve.cveId,
            field: 'comments',
            content: '새로운 댓글이 작성되었습니다.',
            data: response.data
          }
        );
        
        setNewComment('');
        // commentInputRef 올바르게 초기화
        setMentionInputKey(prev => prev + 1);
        
        // 즉시 데이터 갱신 호출 제거
        enqueueSnackbar('댓글이 작성되었습니다.', { variant: 'success' });
      }
    } catch (error) {
      console.error('Failed to submit comment:', error);
      enqueueSnackbar(
        error.response?.data?.detail || '댓글 작성 중 오류가 발생했습니다.',
        { variant: 'error' }
      );
    } finally {
      setLoading(false);
    }
  }, [cve.cveId, newComment, currentUser, parentSendMessage, enqueueSnackbar]);

  // 초기 로딩
  useEffect(() => {
    let isMounted = true;

    const initializeComments = async () => {
      if (isMounted) {
        await updateLocalComments();
      }
    };

    initializeComments();

    return () => {
      isMounted = false;
    };
  }, [updateLocalComments, refreshTrigger]);

  // 새 업데이트 알림
  useEffect(() => {
    let isMounted = true;

    const handleRefresh = async () => {
      if (refreshTrigger > 0 && isMounted) {
        await queryClient.invalidateQueries(['cve', cve.cveId]);
      }
    };

    handleRefresh();

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger, queryClient, cve.cveId]);

  // 상위 MentionInput
  const MemoizedMentionInput = useMemo(() => (
    <MentionInput
      key={mentionInputKey}
      value={commentInputRef.current || newComment}
      onChange={handleCommentChange}
      onSubmit={handleSubmit}
      placeholder="댓글을 입력하세요..."
      loading={loading}
      users={users}
    />
  ), [newComment, handleSubmit, loading, users, mentionInputKey, handleCommentChange]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ListHeader>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CommentIcon color="primary" />
          <Typography variant="h6" color="text.primary">
            Comments ({activeCommentCount})
          </Typography>
        </Box>
      </ListHeader>

      {/* 수정 중이거나 답글 중이면 최상위 입력창 숨기기 */}
      {(!editingCommentId && !replyingTo) && (
        <Box sx={{ mb: 3, px: 2 }}>
          <Box sx={{ 
            display: 'flex', 
            gap: 2,
            alignItems: 'flex-start'  // 입력창과 버튼의 상단을 맞춤
          }}>
            <Box sx={{ flex: 1 }}>
              {MemoizedMentionInput}
            </Box>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!newComment.trim() || loading}
              sx={{
                height: '40px',  // MentionInput의 기본 높이에 맞춤
                minWidth: '100px',
                whiteSpace: 'nowrap'
              }}
            >
              댓글 작성
            </Button>
          </Box>
        </Box>
      )}

      {(!cve.comments || cve.comments.length === 0) ? (
        <EmptyState>
          <CommentIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.7 }} />
          <Typography variant="h6" gutterBottom>
            No Comments Available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            이 CVE에 대한 첫 번째 댓글을 작성해보세요.
          </Typography>
        </EmptyState>
      ) : (
        <Box sx={{
          flex: 1,
          overflowY: 'auto',
          px: 2,
          py: 1,
          '& > *:not(:last-child)': { mb: 2 }
        }}>
          {organizedComments.map(comment => renderComment(comment))}
        </Box>
      )}
    </Box>
  );
}, (prevProps, nextProps) => {
  // 댓글 목록 변경 비교 - 효율적인 방식으로 개선
  const commentsChanged = 
    prevProps.cve.comments?.length !== nextProps.cve.comments?.length ||
    prevProps.cve.comments?.some((prevComment, index) => {
      const nextComment = nextProps.cve.comments?.[index];
      if (!nextComment) return true;
      
      return prevComment.id !== nextComment.id || 
             prevComment.content !== nextComment.content ||
             prevComment.updatedAt !== nextComment.updatedAt ||
             prevComment.isDeleted !== nextComment.isDeleted;
    });
  
  if (commentsChanged) {
    return false; // 변경되었으므로 리렌더링 필요
  }
  
  // 그 외의 경우 기존 로직 유지
  return prevProps.refreshTrigger === nextProps.refreshTrigger &&
         prevProps.cve.cveId === nextProps.cve.cveId &&
         prevProps.currentUser?.id === nextProps.currentUser?.id &&
         prevProps.open === nextProps.open;
});

export default CommentsTab;
