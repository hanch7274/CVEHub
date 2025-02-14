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
import {
  ListHeader,
  ActionButton,
  StyledListItem,
  ActionIconButton,
  ChipLabel
} from './CommonStyles';
import {
  Comment as CommentIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Reply as ReplyIcon
} from '@mui/icons-material';
import { EmptyState } from './CommonStyles';
import { Tooltip } from '@mui/material';
import { Chip } from '@mui/material';

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
  const [mentionInputKey, setMentionInputKey] = useState(0);
  const [users, setUsers] = useState([]);
  const commentsRef = useRef(cve.comments || []);
  const updateTimeoutRef = useRef(null);
  const { enqueueSnackbar } = useSnackbar();
  const [isEditing, setIsEditing] = useState(false);

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

    // 1. 먼저 모든 댓글을 Map에 저장
    commentsArray.forEach(comment => {
      commentMap.set(comment.id, { ...comment, children: [], depth: 0 });
    });

    // 2. 부모-자식 관계 구성 및 깊이 계산
    commentsArray.forEach(comment => {
      const commentWithChildren = commentMap.get(comment.id);
      if (comment.parentId && commentMap.has(comment.parentId)) {
        const parent = commentMap.get(comment.parentId);
        // 부모의 깊이 + 1로 현재 댓글의 깊이 설정
        commentWithChildren.depth = parent.depth + 1;
        parent.children.push(commentWithChildren);
      } else {
        // 부모가 없거나 찾을 수 없는 경우 최상위 댓글로 처리
        commentWithChildren.depth = 0;
        rootComments.push(commentWithChildren);
      }
    });

    // 3. 날짜순 정렬 (최신 댓글이 아래에 표시)
    const sortByDate = (comments) => {
      comments.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateA - dateB;  // 오래된 순으로 정렬
      });
      // 자식 댓글들도 정렬
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

  // 댓글 목록 업데이트 함수 - 계층 구조 유지
  const updateLocalComments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/cves/${cve.cveId}/comments`);
      console.log('Fetched comments:', response.data);  // 디버깅용
      
      // 응답 데이터 구조 확인 및 정리
      const organizedComments = organizeComments(response.data);
      setComments(organizedComments);
      
      // 댓글 수 업데이트
      const activeCount = countActiveComments(organizedComments);
      setActiveCommentCount(activeCount);
      onCommentCountChange?.(activeCount);
      
      // CVE 상태 업데이트를 위해 dispatch
      dispatch(fetchCVEDetail(cve.cveId));
    } catch (error) {
      console.error('Error updating comments:', error);
      enqueueSnackbar('댓글을 불러오는데 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [cve.cveId, onCommentCountChange, organizeComments, countActiveComments, enqueueSnackbar, dispatch]);

  // 댓글 입력값 변경 시 ref에도 저장
  const handleCommentChange = useCallback((e) => {
    const value = e.target.value;
    setNewComment(value);
    commentInputRef.current = value;
  }, []);

  // 새 댓글 작성 핸들러
  const handleSubmit = useCallback(async () => {
    if (!newComment.trim()) return;

    try {
      setLoading(true);
      const response = await api.post(`/cves/${cve.cveId}/comments`, {
        content: newComment,
        mentions: extractMentions(newComment)
      });
      
      console.log('New comment response:', response.data);  // 디버깅용
      
      setNewComment('');
      commentInputRef.current = '';
      
      // 댓글 목록 즉시 업데이트
      await updateLocalComments();
      
      // 입력 필드 초기화
      setMentionInputKey(prev => prev + 1);
      
      enqueueSnackbar('댓글이 작성되었습니다.', { variant: 'success' });
    } catch (error) {
      console.error('Error creating comment:', error);
      enqueueSnackbar('댓글 작성에 실패했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [cve.cveId, newComment, updateLocalComments, enqueueSnackbar, setMentionInputKey]);

  // WebSocket 메시지 핸들러 - 실시간 업데이트
  const handleWebSocketMessage = useCallback((message) => {
    if (message.type === 'comment_added' && message.data.cveId === cve.cveId) {
      updateLocalComments();
    }
  }, [cve.cveId, updateLocalComments]);

  // WebSocket 구독 설정
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

  // 초기 댓글 로딩 및 새로고침 트리거 처리
  useEffect(() => {
    updateLocalComments();
  }, [updateLocalComments, refreshTrigger]);

  // 댓글 삭제 핸들러 - API 호출만 담당
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
      enqueueSnackbar(error.response?.data?.detail || '댓글 삭제 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [cve.cveId, updateLocalComments, enqueueSnackbar]);

  // 수정 시작 핸들러
  const handleStartEdit = () => {
    setIsEditing(true);
  };

  // 수정 완료 핸들러
  const handleFinishEdit = () => {
    setIsEditing(false);
  };

  // 댓글 수정 핸들러 수정
  const handleEdit = useCallback(async (commentId, content) => {
    try {
      setLoading(true);
      console.log('Editing comment:', { commentId, content });  // 디버깅 로그 추가
      const response = await api.patch(`/cves/${cve.cveId}/comments/${commentId}`, {
        content: content,
        parentId: null
      });
      
      if (response.data) {
        await updateLocalComments();
        enqueueSnackbar('댓글이 수정되었습니다.', { variant: 'success' });
        handleFinishEdit();
      }
    } catch (error) {
      console.error('댓글 수정 중 오류:', error);
      enqueueSnackbar(error.response?.data?.detail || '댓글 수정 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [cve.cveId, updateLocalComments, enqueueSnackbar]);

  // 답글 핸들러 추가
  const handleReply = (comment) => {
    setReplyingTo(comment);
  };

  const handleReplySubmit = async (parentId, content) => {
    try {
      setLoading(true);
      const response = await api.post(`/cves/${cve.cveId}/comments`, {
        content,
        parent_id: parentId,
        mentions: extractMentions(content)
      });

      if (response.data) {
        setComments(response.data.comments || []);
        setReplyingTo(null);
        enqueueSnackbar('답글이 작성되었습니다.', { variant: 'success' });
        
        // 전체 데이터 새로고침
        await dispatch(fetchCVEDetail(cve.cveId));
        onUpdate?.();
        
        // 댓글 수 업데이트
        onCommentCountChange?.(response.data.total_comments);
      }
    } catch (error) {
      console.error('Failed to submit reply:', error);
      enqueueSnackbar(error.response?.data?.detail || '답글 작성 중 오류가 발생했습니다.', { 
        variant: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReplyCancel = () => {
    setReplyingTo(null);
  };

  // 댓글 컴포넌트 메모이제이션
  const CommentItem = useMemo(() => React.memo(({ comment }) => (
    <StyledListItem
      elevation={1}
      sx={{
        ml: comment.depth * 2,
        bgcolor: replyingTo?.id === comment.id ? 'action.hover' : 'background.paper',
        border: replyingTo?.id === comment.id ? '1px solid' : '1px solid',
        borderColor: replyingTo?.id === comment.id ? 'primary.main' : 'divider',
      }}
    >
      <Comment
        comment={comment}
        currentUsername={currentUser?.username}
        isAdmin={currentUser?.isAdmin}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onReply={handleReply}
        onReplySubmit={handleReplySubmit}
        onReplyCancel={handleReplyCancel}
        replyMode={replyingTo?.id === comment.id}
        depth={comment.depth || 0}
        cveId={cve.cveId}
        onStartEdit={handleStartEdit}
        onFinishEdit={handleFinishEdit}
        isEditing={isEditing}
      />
    </StyledListItem>
  ), [currentUser, handleDelete, handleEdit, replyingTo, handleReply, handleReplySubmit, handleReplyCancel, isEditing]);

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
      onSubmit={handleSubmit}
      placeholder="댓글을 입력하세요..."
      loading={loading}
      users={users}
    />
  ), [newComment, handleSubmit, loading, users, mentionInputKey, handleCommentChange]);

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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ListHeader>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CommentIcon color="primary" />
          <Typography variant="h6" color="text.primary">
            Comments ({activeCommentCount})
          </Typography>
        </Box>
      </ListHeader>

      {!isEditing && (
        <Box sx={{ mb: 3, px: 2 }}>
          {MemoizedMentionInput}
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
          {organizedComments.map(comment => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </Box>
      )}
    </Box>
  );
});

export default CommentsTab;
