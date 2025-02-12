import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDispatch } from 'react-redux';
import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  Paper
} from '@mui/material';
import Comment from './Comment';
import MentionInput from './MentionInput';
import { updateCVEDetail, fetchCVEDetail } from '../../../store/slices/cveSlice';
import { api } from '../../../utils/auth';
import { formatDistanceToNow, parseISO, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { zonedTimeToUtc } from 'date-fns-tz';
import { formatRelativeTime } from '../../../utils/dateUtils';
import { useWebSocketMessage } from '../../../contexts/WebSocketContext';
import { WS_EVENT_TYPE } from '../../../services/websocket';
import { formatToKST } from '../../../utils/dateUtils';
import { debounce } from 'lodash';
import { useSnackbar } from 'notistack';

// 멘션된 사용자를 추출하는 유틸리티 함수
const extractMentions = (content) => {
  return content.match(/@(\w+)/g)?.map(mention => mention.substring(1)) || [];
};

// KST 시간대로 변환하는 유틸리티 함수
const convertToKST = (dateString) => {
  if (!dateString) return null;
  try {
    const date = parseISO(dateString);
    const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000)); // UTC+9 (KST)
    return kstDate;
  } catch (error) {
    console.error('Invalid date:', dateString);
    return null;
  }
};

// 시간 포맷팅 유틸리티 함수
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
  setError,
  onCommentCountChange,
  currentUser,
  refreshTrigger
}) => {
  const dispatch = useDispatch();
  const { sendCustomMessage } = useWebSocketMessage();
  const [comments, setComments] = useState([]);
  const [activeCommentCount, setActiveCommentCount] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [parentCommentId, setParentCommentId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    comment: null
  });
  const [mentionInputKey, setMentionInputKey] = useState(0);
  const [users, setUsers] = useState([]);
  const commentsRef = useRef(cve.comments || []);
  const updateTimeoutRef = useRef(null);
  const { enqueueSnackbar } = useSnackbar();

  // 댓글 입력 상태를 ref로 관리하여 리렌더링에도 유지
  const commentInputRef = useRef('');

  // 사용자 목록 가져오기
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        console.log('Fetching users from:', '/user/search');
        const response = await api.get('/user/search');
        console.log('Response received:', response);
        setUsers(response.data);
      } catch (error) {
        console.error('Failed to fetch users:', error);
        console.error('Error response:', error.response);
        console.error('Error request:', error.request);
        console.error('Error config:', error.config);
      }
    };

    fetchUsers();
  }, []);

  // 댓글을 계층 구조로 정렬하는 함수
  const organizeComments = useCallback((commentsArray) => {
    const commentMap = new Map();
    const rootComments = [];

    commentsArray.forEach(comment => {
      commentMap.set(comment.id, { ...comment, children: [] });
    });

    commentsArray.forEach(comment => {
      const commentWithChildren = commentMap.get(comment.id);
      if (comment.parentId) {
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          parent.children.push(commentWithChildren);
        } else {
          rootComments.push(commentWithChildren);
        }
      } else {
        rootComments.push(commentWithChildren);
      }
    });

    const sortByDate = (comments) => {
      comments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      comments.forEach(comment => {
        if (comment.children.length > 0) {
          sortByDate(comment.children);
        }
      });
    };

    sortByDate(rootComments);
    return rootComments;
  }, []);

  const countActiveComments = useCallback((commentsArray) => {
    let count = 0;
    const countRecursive = (comments) => {
      for (const comment of comments) {
        if (!comment.isDeleted) {
          count++;
        }
        if (comment.children && comment.children.length > 0) {
          countRecursive(comment.children);
        }
      }
    };
    countRecursive(commentsArray);
    return count;
  }, []);

  // 댓글 업데이트를 디바운스 처리
  const debouncedUpdate = useMemo(
    () => debounce((newComments) => {
      if (JSON.stringify(commentsRef.current) !== JSON.stringify(newComments)) {
        commentsRef.current = newComments;
        const count = countActiveComments(newComments);
        setActiveCommentCount(count);
        onCommentCountChange?.(count);
      }
    }, 300),
    [countActiveComments, onCommentCountChange]
  );

  // 댓글 데이터 메모이제이션 및 업데이트 최적화
  const organizedComments = useMemo(() => {
    if (!cve.comments) return [];
    
    const newComments = [...cve.comments].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateA - dateB;
    });

    // 댓글 변경 시 디바운스된 업데이트 호출
    debouncedUpdate(newComments);
    return newComments;
  }, [cve.comments, debouncedUpdate]);

  // 로컬 댓글 업데이트 함수
  const updateLocalComments = useCallback((updatedComment, action) => {
    const currentComments = [...commentsRef.current];
    
    switch (action) {
      case 'add':
        currentComments.push(updatedComment);
        break;
      case 'edit':
        const editIndex = currentComments.findIndex(c => c.id === updatedComment.id);
        if (editIndex !== -1) {
          currentComments[editIndex] = { ...currentComments[editIndex], ...updatedComment };
        }
        break;
      case 'delete':
        const deleteIndex = currentComments.findIndex(c => c.id === updatedComment.id);
        if (deleteIndex !== -1) {
          currentComments[deleteIndex] = { 
            ...currentComments[deleteIndex], 
            is_deleted: true,
            content: '삭제된 댓글입니다.'
          };
        }
        break;
      default:
        break;
    }

    debouncedUpdate(currentComments);
  }, [debouncedUpdate]);

  // 댓글 입력값 변경 시 ref에도 저장
  const handleCommentChange = useCallback((e) => {
    const value = e.target.value;
    setNewComment(value);
    commentInputRef.current = value;
  }, []);

  // cve.comments가 변경될 때 댓글 목록만 업데이트
  useEffect(() => {
    setComments(cve.comments || []);
    const activeCount = countActiveComments(cve.comments || []);
    setActiveCommentCount(activeCount);
    onCommentCountChange?.(activeCount);
  }, [cve.comments, countActiveComments, onCommentCountChange]);

  // 댓글 추가 핸들러
  const handleAddComment = useCallback(async () => {
    const commentToSubmit = commentInputRef.current;
    if (!commentToSubmit?.trim()) return;

    const requestData = {
        content: commentToSubmit,
        parentId: null,
        mentions: extractMentions(commentToSubmit),  // 멘션된 사용자 추출
        isDeleted: false
    };

    try {
        setLoading(true);
        const response = await api.post(`/cves/${cve.cveId}/comments`, requestData);

        if (response.data) {
            setComments(response.data.comments || []);
            setNewComment('');
            commentInputRef.current = '';
            enqueueSnackbar('댓글이 추가되었습니다.', { variant: 'success' });
            
            // 댓글 수 업데이트
            const activeCount = countActiveComments(response.data.comments || []);
            setActiveCommentCount(activeCount);
            onCommentCountChange?.(activeCount);

            // 백엔드에서 멘션된 사용자들에게 알림을 보내므로
            // 추가적인 WebSocket 메시지는 불필요

            onUpdate?.();
        }
    } catch (error) {
        console.error('댓글 추가 중 오류:', error);
        enqueueSnackbar('댓글 추가 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
        setLoading(false);
    }
}, [cve.cveId, countActiveComments, onCommentCountChange, onUpdate]);

  // WebSocket 메시지 수신 처리 추가
  useEffect(() => {
    const handleWebSocketMessage = (message) => {
      // 알림 메시지를 통해 댓글 업데이트 처리
      if (message.type === WS_EVENT_TYPE.NOTIFICATION && 
          message.data.type === 'mention' &&
          message.data.cveId === cve.cveId) {
        onUpdate?.();
      }
    };

    window.addEventListener('websocket-message', handleWebSocketMessage);

    return () => {
      window.removeEventListener('websocket-message', handleWebSocketMessage);
    };
  }, [cve.cveId, onUpdate]);

  // 댓글 삭제 핸들러 최적화
  const handleDelete = useCallback(async (commentId, isAdmin) => {
    try {
      setLoading(true);
      await api.delete(`/cves/${cve.cveId}/comments/${commentId}`, {
        params: { permanent: isAdmin }
      });
      
      updateLocalComments({ id: commentId }, 'delete');
      enqueueSnackbar('댓글이 삭제되었습니다.', { variant: 'success' });
    } catch (error) {
      console.error('댓글 삭제 중 오류:', error);
      enqueueSnackbar('댓글 삭제 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [cve.cveId, updateLocalComments]);

  // 댓글 수정 핸들러 최적화
  const handleEdit = useCallback(async (commentId, content) => {
    try {
      setLoading(true);
      const response = await api.put(`/cves/${cve.cveId}/comments/${commentId}`, { 
        content,
        parentId: null
      });
      
      if (response.data) {
        updateLocalComments(response.data, 'edit');
        enqueueSnackbar('댓글이 수정되었습니다.', { variant: 'success' });
      }
    } catch (error) {
      console.error('댓글 수정 중 오류:', error);
      enqueueSnackbar('댓글 수정 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [cve.cveId, updateLocalComments]);

  // 댓글 컴포넌트 메모이제이션
  const CommentItem = useMemo(() => React.memo(({ comment }) => (
    <Comment
      comment={comment}
      currentUser={currentUser}
      onDelete={handleDelete}
      onEdit={handleEdit}
      canModify={comment.username === currentUser?.username || currentUser?.is_admin}
    />
  ), {
    // 커스텀 비교 함수로 필요한 prop만 비교
    areEqual: (prevProps, nextProps) => {
      const prevComment = prevProps.comment;
      const nextComment = nextProps.comment;
      return (
        prevComment.id === nextComment.id &&
        prevComment.content === nextComment.content &&
        prevComment.is_deleted === nextComment.is_deleted &&
        prevComment.updated_at === nextComment.updated_at
      );
    }
  }), [currentUser, handleDelete, handleEdit]);

  // 댓글 목록 메모이제이션
  const commentsList = useMemo(() => (
    organizedComments.map(comment => (
      <CommentItem key={comment.id} comment={comment} />
    ))
  ), [organizedComments, CommentItem]);

  // MentionInput 메모이제이션 - 입력 중인 댓글 유지
  const MemoizedMentionInput = useMemo(() => (
    <MentionInput
      key={mentionInputKey}
      value={commentInputRef.current || newComment}  // ref 값을 우선 사용
      onChange={handleCommentChange}
      onSubmit={handleAddComment}
      placeholder="댓글을 입력하세요..."
      loading={loading}
      users={users}
    />
  ), [newComment, handleAddComment, loading, users, mentionInputKey, handleCommentChange]);

  // 새로운 업데이트가 있을 때 스낵바 표시
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
    <Box>
      <Typography variant="h6" gutterBottom>
        Comments ({activeCommentCount})
      </Typography>

      <Box sx={{ mb: 3 }}>
        {MemoizedMentionInput}
      </Box>

      <Box sx={{ mt: 2 }}>
        {commentsList}
      </Box>

      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, comment: null })}
      >
        <DialogTitle>댓글 삭제 확인</DialogTitle>
        <DialogContent>
          <Typography>
            {currentUser?.isAdmin ? '이 댓글을 완전히 삭제하시겠습니까?' : '이 댓글을 삭제하시겠습니까?'}
            {currentUser?.isAdmin && <Typography color="error" sx={{ mt: 1 }}>
              * 완전 삭제된 댓글은 복구할 수 없습니다.
            </Typography>}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, comment: null })}>
            취소
          </Button>
          <Button
            onClick={() => {
              handleDelete(deleteDialog.comment?.id, Boolean(currentUser?.isAdmin));
              setDeleteDialog({ open: false, comment: null });
            }}
            color="error"
            disabled={loading}
          >
            {currentUser?.isAdmin ? '완전 삭제' : '삭제'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

export default CommentsTab;
