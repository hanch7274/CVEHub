import React, { useState, useEffect, useCallback } from 'react';
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
  Alert
} from '@mui/material';
import { useSelector } from 'react-redux';
import Comment from './Comment';
import MentionInput from '../../../features/comment/components/MentionInput';
import { api } from '../../../utils/auth';

// 멘션된 사용자를 추출하는 유틸리티 함수
const extractMentions = (content) => {
  return content.match(/@(\w+)/g)?.map(mention => mention.substring(1)) || [];
};

const CommentsTab = ({
  cve,
  onUpdate,
  setError,
  onCommentCountChange
}) => {
  const [comments, setComments] = useState([]);
  const [activeCommentCount, setActiveCommentCount] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [parentCommentId, setParentCommentId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    comment: null
  });
  const [successMessage, setSuccessMessage] = useState(null);
  
  const currentUser = useSelector((state) => state.auth.user);

  // 댓글을 계층 구조로 정렬하는 함수
  const organizeComments = useCallback((commentsArray) => {
    // 댓글 맵 생성
    const commentMap = new Map();
    const rootComments = [];

    // 모든 댓글을 맵에 저장
    commentsArray.forEach(comment => {
      commentMap.set(comment.id, { ...comment, children: [] });
    });

    // 부모-자식 관계 설정
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

    // 날짜순으로 정렬
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

  // 댓글 목록 로드 및 댓글 수 업데이트
  useEffect(() => {
    const loadComments = async () => {
      if (!cve?.cveId) return;

      try {
        const response = await api.get(`/cves/${cve.cveId}/comments`);
        const organizedComments = organizeComments(response.data);
        setComments(organizedComments);
        
        // 활성화된 댓글 수 계산 및 업데이트
        const activeCount = countActiveComments(organizedComments);
        setActiveCommentCount(activeCount);
        onCommentCountChange?.(activeCount);
      } catch (error) {
        setSnackbar({
          open: true,
          message: '댓글을 불러오는데 실패했습니다.',
          severity: 'error'
        });
      }
    };

    loadComments();
  }, [cve?.cveId, organizeComments, countActiveComments, onCommentCountChange]);

  // refreshComments 함수 수정
  const refreshComments = useCallback(async () => {
    if (!cve?.cveId) return;

    try {
      const response = await api.get(`/cves/${cve.cveId}/comments`);
      const organizedComments = organizeComments(response.data);
      setComments(organizedComments);
      
      // 활성화된 댓글 수 계산 및 업데이트
      const activeCount = countActiveComments(organizedComments);
      setActiveCommentCount(activeCount);
      onCommentCountChange?.(activeCount);

      // cve 객체 업데이트
      if (onUpdate) {
        const updatedCve = { ...cve, comments: response.data };
        onUpdate(updatedCve);
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: '댓글을 불러오는데 실패했습니다.',
        severity: 'error'
      });
    }
  }, [cve, organizeComments, countActiveComments, onCommentCountChange, onUpdate]);

  const handleSubmit = async (event) => {
    if (event) {
      event.preventDefault();
    }
    if (!newComment.trim()) return;

    try {
      setLoading(true);
      const mentions = extractMentions(newComment);
      const commentData = {
        content: newComment,
        mentions
      };

      await api.post(`/cves/${cve.cveId}/comments`, commentData);
      setNewComment('');
      
      // 댓글 목록 새로고침 및 댓글 수 업데이트
      await refreshComments();
      
      setSuccessMessage('댓글이 성공적으로 작성되었습니다.');
    } catch (error) {
      setSnackbar({
        open: true,
        message: error.response?.data?.detail || '댓글 작성에 실패했습니다.',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReplySubmit = async (parentId, content) => {
    if (!content.trim()) return;

    try {
      setLoading(true);
      const mentions = extractMentions(content);
      const commentData = {
        content,
        mentions,
        parent_id: parentId
      };

      const response = await api.post(`/cves/${cve.cveId}/comments`, commentData);
      
      // 대댓글 추가 후 댓글 목록 업데이트
      const updatedComments = [...comments];
      const addReplyToParent = (commentsList) => {
        for (let comment of commentsList) {
          if (comment.id === parentId) {
            if (!comment.children) comment.children = [];
            comment.children.push({ ...response.data, children: [] });
            return true;
          }
          if (comment.children && comment.children.length > 0) {
            if (addReplyToParent(comment.children)) return true;
          }
        }
        return false;
      };
      addReplyToParent(updatedComments);
      
      setComments(updatedComments);
      setReplyingTo(null);
      
      setSuccessMessage('답글이 성공적으로 작성되었습니다.');
    } catch (error) {
      setSnackbar({
        open: true,
        message: '답글 작성에 실패했습니다.',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (commentId, newContent) => {
    try {
      setLoading(true);
      const mentions = extractMentions(newContent);
      const commentData = {
        content: newContent,
        mentions
      };

      const response = await api.put(`/cves/${cve.cveId}/comments/${commentId}`, commentData);
      
      // 댓글 목록 업데이트
      const updatedComments = comments.map(comment => {
        if (comment.id === commentId) {
          return { ...comment, ...response.data };
        }
        if (comment.children) {
          const updatedChildren = comment.children.map(child => {
            if (child.id === commentId) {
              return { ...child, ...response.data };
            }
            return child;
          });
          return { ...comment, children: updatedChildren };
        }
        return comment;
      });
      
      setComments(updatedComments);
      
      setSuccessMessage('댓글이 성공적으로 수정되었습니다.');
    } catch (error) {
      setSnackbar({
        open: true,
        message: error.response?.data?.detail || '댓글 수정에 실패했습니다.',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (commentId, isPermanent = false) => {
    try {
      setLoading(true);
      if (isPermanent) {
        await api.delete(`/cves/${cve.cveId}/comments/${commentId}/permanent`);
      } else {
        await api.delete(`/cves/${cve.cveId}/comments/${commentId}`);
      }
      
      // 댓글 목록 새로고침 및 댓글 수 업데이트
      await refreshComments();
      
      setSuccessMessage(isPermanent ? '댓글이 완전히 삭제되었습니다.' : '댓글이 삭제되었습니다.');
    } catch (error) {
      setSnackbar({
        open: true,
        message: error.response?.data?.detail || '댓글 삭제에 실패했습니다.',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const renderComment = (comment) => (
    <Comment
      key={comment.id}
      comment={comment}
      currentUsername={currentUser?.username}
      onReply={() => setReplyingTo(comment)}
      onEdit={handleEdit}
      onDelete={handleDelete}
      depth={comment.depth}
      replyMode={replyingTo?.id === comment.id}
      onReplySubmit={handleReplySubmit}
      onReplyCancel={() => setReplyingTo(null)}
      cveId={cve.cveId}
    >
      {comment.children?.map(child => renderComment(child))}
    </Comment>
  );

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Comments ({activeCommentCount})
      </Typography>

      {/* 댓글 입력 */}
      <Box sx={{ mb: 3 }}>
        <MentionInput
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="새로운 댓글을 입력하세요..."
          variant="outlined"
          size="small"
          fullWidth
          multiline
          rows={3}
          disabled={loading}
        />
        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!newComment.trim() || loading}
            size="small"
          >
            {loading ? <CircularProgress size={24} /> : '댓글 작성'}
          </Button>
        </Box>
      </Box>

      <Box sx={{ mt: 3 }}>
        {comments.map(comment => renderComment(comment))}
      </Box>

      {/* Success Snackbar */}
      <Snackbar
        open={successMessage !== null}
        autoHideDuration={2000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          '& .MuiSnackbarContent-root': {
            minWidth: '300px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            backgroundColor: '#4caf50'
          }
        }}
      >
        <Alert
          onClose={() => setSuccessMessage(null)}
          severity="success"
          variant="filled"
          sx={{ 
            width: '100%',
            backgroundColor: '#4caf50',
            '& .MuiAlert-icon': {
              color: '#fff'
            }
          }}
        >
          {successMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, comment: null })}
      >
        <DialogTitle>댓글 삭제 확인</DialogTitle>
        <DialogContent>
          <Typography>
            이 댓글을 삭제하시겠습니까?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialog({ open: false, comment: null })}
          >
            취소
          </Button>
          <Button
            onClick={() => {
              handleDelete(deleteDialog.comment?.id, true);
              setDeleteDialog({ open: false, comment: null });
            }}
            color="error"
            disabled={loading}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CommentsTab;
