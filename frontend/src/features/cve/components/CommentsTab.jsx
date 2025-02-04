import React, { useState, useEffect, useCallback } from 'react';
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
  Alert
} from '@mui/material';
import Comment from './Comment';
import MentionInput from '../../../features/comment/components/MentionInput';
import { updateCVEDetail } from '../../../store/cveSlice';
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
  const dispatch = useDispatch();
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

  // 댓글 목록 로드 및 댓글 수 업데이트
  useEffect(() => {
    const loadComments = async () => {
      if (!cve?.cveId) return;

      try {
        const response = await api.get(`/cves/${cve.cveId}/comments`);
        const organizedComments = organizeComments(response.data);
        
        await dispatch(updateCVEDetail({
          cveId: cve.cveId,
          data: {
            comments: response.data
          }
        })).unwrap();
        
        setComments(organizedComments);
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
  }, [cve?.cveId, organizeComments, countActiveComments, onCommentCountChange, dispatch]);

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

      const response = await api.post(`/cves/${cve.cveId}/comments`, commentData);
      const updatedComments = [...(cve.comments || []), response.data];
      
      await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: {
          comments: updatedComments
        }
      })).unwrap();

      setNewComment('');
      const organizedComments = organizeComments(updatedComments);
      setComments(organizedComments);
      const activeCount = countActiveComments(organizedComments);
      setActiveCommentCount(activeCount);
      onCommentCountChange?.(activeCount);
      
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
      const updatedComments = [...cve.comments, response.data];
      
      await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: {
          comments: updatedComments
        }
      })).unwrap();

      const organizedComments = organizeComments(updatedComments);
      setComments(organizedComments);
      setReplyingTo(null);
      
      const activeCount = countActiveComments(organizedComments);
      setActiveCommentCount(activeCount);
      onCommentCountChange?.(activeCount);
      
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
      const updatedComments = cve.comments.map(comment => 
        comment.id === commentId ? response.data : comment
      );
      
      await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: {
          comments: updatedComments
        }
      })).unwrap();

      const organizedComments = organizeComments(updatedComments);
      setComments(organizedComments);
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

      const updatedComments = cve.comments.map(comment => 
        comment.id === commentId ? { ...comment, isDeleted: true } : comment
      );
      
      await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: {
          comments: updatedComments
        }
      })).unwrap();

      const organizedComments = organizeComments(updatedComments);
      setComments(organizedComments);
      const activeCount = countActiveComments(organizedComments);
      setActiveCommentCount(activeCount);
      onCommentCountChange?.(activeCount);
      
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

      <Snackbar
        open={successMessage !== null}
        autoHideDuration={2000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSuccessMessage(null)}
          severity="success"
          variant="filled"
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
          <Button onClick={() => setDeleteDialog({ open: false, comment: null })}>
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
