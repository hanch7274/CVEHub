import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDispatch } from 'react-redux';
import {
  Box,
  Typography,
  Button
} from '@mui/material';
import Comment from './Comment';
import MentionInput from './MentionInput';
import { fetchCVEDetail } from '../../../store/slices/cveSlice';
import { api } from '../../../utils/auth';
import { formatDistanceToNow, parseISO, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { debounce } from 'lodash';
import { useSnackbar } from 'notistack';
import { useWebSocketMessage } from '../../../contexts/WebSocketContext';
import {
  ListHeader,
  StyledListItem,
  EmptyState
} from './CommonStyles';
import { Comment as CommentIcon } from '@mui/icons-material';

// 멘션된 사용자를 추출하는 유틸리티 함수
const extractMentions = (content) =>
  content.match(/@(\w+)/g)?.map(mention => mention.substring(1)) || [];

// KST 시간대로 변환
const convertToKST = (dateString) => {
  if (!dateString) return null;
  try {
    const date = parseISO(dateString);
    return new Date(date.getTime() + 9 * 60 * 60 * 1000); // UTC+9
  } catch (error) {
    console.error('Invalid date:', dateString);
    return null;
  }
};

// 시간 포맷팅
const formatDate = (dateString) => {
  const kstDate = convertToKST(dateString);
  if (!kstDate) return '';
  try {
    return formatDistanceToNow(kstDate, { addSuffix: true, locale: ko });
  } catch (error) {
    console.error('Error formatting date:', error);
    return format(kstDate, 'yyyy-MM-dd HH:mm:ss', { locale: ko });
  }
};

const CommentsTab = React.memo(({
  cve,
  onUpdate,
  onCommentCountChange,
  currentUser,
  refreshTrigger
}) => {
  const dispatch = useDispatch();
  const { sendCustomMessage } = useWebSocketMessage();
  const { enqueueSnackbar } = useSnackbar();

  // 상위 상태
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);        // 답글 모드
  const [editingCommentId, setEditingCommentId] = useState(null); // 수정 중인 댓글 ID
  const [loading, setLoading] = useState(false);
  const [mentionInputKey, setMentionInputKey] = useState(0);
  const [users, setUsers] = useState([]);
  const [activeCommentCount, setActiveCommentCount] = useState(0);

  // 최상위 댓글 입력값
  const commentInputRef = useRef('');

  // 사용자 목록 가져오기
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await api.get('/user/search');
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

  const countActiveComments = useCallback((commentsArray) => {
    let count = 0;
    const countRecursive = (arr) => {
      arr.forEach(comment => {
        if (!comment.isDeleted) count++;
        if (comment.children?.length) countRecursive(comment.children);
      });
    };
    countRecursive(commentsArray);
    return count;
  }, []);

  // Debounce로 댓글 수 업데이트
  const debouncedUpdate = useMemo(() => {
    const fn = debounce((newComments) => {
      const newCount = countActiveComments(newComments);
      setActiveCommentCount(newCount);
      onCommentCountChange?.(newCount);
    }, 300);
    return fn;
  }, [countActiveComments, onCommentCountChange]);

  useEffect(() => {
    return () => {
      debouncedUpdate.cancel();
    };
  }, [debouncedUpdate]);

  // cve.comments를 정렬
  const organizedComments = useMemo(() => {
    if (!cve.comments) return [];
    const newComments = [...cve.comments].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });
    debouncedUpdate(newComments);
    return newComments;
  }, [cve.comments, debouncedUpdate]);

  // 댓글 목록 재조회
  const updateLocalComments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/cves/${cve.cveId}/comments`);
      const organized = organizeComments(response.data);
      const activeCount = countActiveComments(organized);
      setActiveCommentCount(activeCount);
      onCommentCountChange?.(activeCount);
      dispatch(fetchCVEDetail(cve.cveId));
    } catch (error) {
      console.error('Error updating comments:', error);
      enqueueSnackbar('댓글을 불러오는데 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [
    cve.cveId,
    organizeComments,
    countActiveComments,
    onCommentCountChange,
    dispatch,
    enqueueSnackbar
  ]);

  // 최상위 댓글 작성
  const handleCommentChange = useCallback((e) => {
    const value = e.target.value;
    setNewComment(value);
    commentInputRef.current = value;
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!newComment.trim()) return;
    try {
      setLoading(true);
      await api.post(`/cves/${cve.cveId}/comments`, {
        content: newComment,
        mentions: extractMentions(newComment)
      });
      setNewComment('');
      commentInputRef.current = '';
      await updateLocalComments();
      setMentionInputKey(prev => prev + 1);
      enqueueSnackbar('댓글이 작성되었습니다.', { variant: 'success' });
    } catch (error) {
      console.error('Error creating comment:', error);
      enqueueSnackbar('댓글 작성에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [cve.cveId, newComment, updateLocalComments, enqueueSnackbar]);

  // 댓글 삭제
  const handleDelete = useCallback(async (commentId, permanent = false) => {
    try {
      setLoading(true);
      await api.delete(`/cves/${cve.cveId}/comments/${commentId}`, {
        params: { permanent }
      });
      await updateLocalComments();
      enqueueSnackbar(
        permanent ? '댓글이 완전히 삭제되었습니다.' : '댓글이 삭제되었습니다.',
        { variant: 'success' }
      );
    } catch (error) {
      console.error('댓글 삭제 중 오류:', error);
      enqueueSnackbar(
        error.response?.data?.detail || '댓글 삭제 중 오류가 발생했습니다.',
        { variant: 'error' }
      );
    } finally {
      setLoading(false);
    }
  }, [cve.cveId, updateLocalComments, enqueueSnackbar]);

  // 댓글 수정
  const handleStartEdit = useCallback((commentId) => {
    setEditingCommentId(commentId);
  }, []);

  const handleFinishEdit = useCallback(() => {
    setEditingCommentId(null);
  }, []);

  const handleEdit = useCallback(async (commentId, content) => {
    try {
      setLoading(true);
      await api.patch(`/cves/${cve.cveId}/comments/${commentId}`, {
        content,
        parentId: null
      });
      await updateLocalComments();
      enqueueSnackbar('댓글이 수정되었습니다.', { variant: 'success' });
    } catch (error) {
      console.error('댓글 수정 중 오류:', error);
      enqueueSnackbar(
        error.response?.data?.detail || '댓글 수정 중 오류가 발생했습니다.',
        { variant: 'error' }
      );
    } finally {
      setLoading(false);
      handleFinishEdit();
    }
  }, [cve.cveId, updateLocalComments, enqueueSnackbar, handleFinishEdit]);

  // 답글
  const handleReplySubmit = useCallback(async (parentId, content) => {
    try {
      setLoading(true);
      await api.post(`/cves/${cve.cveId}/comments`, {
        content,
        parent_id: parentId,
        mentions: extractMentions(content)
      });
      setReplyingTo(null);
      enqueueSnackbar('답글이 작성되었습니다.', { variant: 'success' });
      await dispatch(fetchCVEDetail(cve.cveId));
      onUpdate?.();
    } catch (error) {
      console.error('Failed to submit reply:', error);
      enqueueSnackbar(
        error.response?.data?.detail || '답글 작성 중 오류가 발생했습니다.',
        { variant: 'error' }
      );
    } finally {
      setLoading(false);
    }
  }, [cve.cveId, dispatch, enqueueSnackbar, onUpdate]);

  // WebSocket 메시지
  const handleWebSocketMessage = useCallback((message) => {
    if (message.type === 'comment_added' && message.data.cveId === cve.cveId) {
      updateLocalComments();
    }
  }, [cve.cveId, updateLocalComments]);

  useEffect(() => {
    const subscribeToComments = async () => {
      try {
        await sendCustomMessage('subscribe_cve', { cveId: cve.cveId });
      } catch (error) {
        console.error('Failed to subscribe to comments:', error);
      }
    };
    subscribeToComments();
    return () => {
      const unsubscribe = async () => {
        try {
          await sendCustomMessage('unsubscribe_cve', { cveId: cve.cveId });
        } catch (error) {
          console.error('Failed to unsubscribe from comments:', error);
        }
      };
      unsubscribe();
    };
  }, [cve.cveId, sendCustomMessage]);

  // 초기 로딩
  useEffect(() => {
    updateLocalComments();
  }, [updateLocalComments, refreshTrigger]);

  // 개별 댓글 아이템 (메모이제이션)
  const MemoizedCommentItem = React.memo(({ comment }) => {
    const isEditingThis = editingCommentId === comment.id;
    const replyMode = replyingTo?.id === comment.id;

    return (
      // 직접 <Comment>만 렌더링. 
      // 테두리/배경/elevation 등은 Comment.jsx의 <StyledListItem>에서 처리
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
  });

  // 댓글 목록 렌더링
  const renderComments = useMemo(
    () => organizedComments.map(comment => (
      <MemoizedCommentItem key={comment.id} comment={comment} />
    )),
    [organizedComments, replyingTo, editingCommentId]
  );

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

  // 새 업데이트 알림
  useEffect(() => {
    if (refreshTrigger > 0) {
      const currentComments = JSON.stringify(cve?.comments || []);
      dispatch(fetchCVEDetail(cve.cveId)).then((action) => {
        const newComments = JSON.stringify(action.payload?.comments || []);
        if (currentComments !== newComments) {
          enqueueSnackbar('댓글에 새로운 업데이트가 있습니다.', {
            variant: 'info',
            action: (key) => (
              <Button color="inherit" size="small" onClick={() => enqueueSnackbar.closeSnackbar(key)}>
                확인
              </Button>
            )
          });
        }
      });
    }
  }, [refreshTrigger, dispatch, cve?.cveId, enqueueSnackbar]);

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
          {MemoizedMentionInput}
          <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!newComment.trim() || loading}
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
          {renderComments}
        </Box>
      )}
    </Box>
  );
});

export default CommentsTab;
