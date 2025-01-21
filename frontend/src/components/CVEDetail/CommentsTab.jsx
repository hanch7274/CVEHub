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
import MentionInput from '../common/MentionInput';
import { api } from '../../utils/auth';

const CommentsTab = ({ cve }) => {
  const [comments, setComments] = useState([]);
  const [activeCommentCount, setActiveCommentCount] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [parentCommentId, setParentCommentId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    comment: null
  });
  
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

  const refreshComments = useCallback(async () => {
    try {
      const response = await api.get(`/cves/${cve.cveId}/comments`);
      const organizedComments = organizeComments(response.data);
      setComments(organizedComments);
      setActiveCommentCount(countActiveComments(organizedComments));
    } catch (error) {
      console.error('Error fetching comments:', error);
      setSnackbar({
        open: true,
        message: '댓글을 불러오는데 실패했습니다.',
        severity: 'error'
      });
    }
  }, [cve.cveId, organizeComments]);

  useEffect(() => {
    refreshComments();
  }, [refreshComments]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;

    setLoading(true);
    try {
      const commentData = {
        content: newComment,
        ...(parentCommentId && { parent_id: parentCommentId })
      };

      console.log('댓글 요청 데이터:', commentData);
      const response = await api.post(`/cves/${cve.cveId}/comments`, commentData);
      console.log('댓글 응답:', response.data);
      
      setNewComment('');
      await refreshComments();
      
      setSnackbar({
        open: true,
        message: '댓글이 등록되었습니다.',
        severity: 'success'
      });
    } catch (error) {
      console.error('댓글 등록 에러:', error.response?.data || error);
      setSnackbar({
        open: true,
        message: error.response?.data?.detail?.[0]?.msg || '댓글 등록에 실패했습니다.',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReplySubmit = async (parentId, content) => {
    if (!content.trim()) return;

    setLoading(true);
    try {
      const response = await api.post(`/cves/${cve.cveId}/comments`, {
        content,
        parent_id: parentId
      });
      
      setReplyingTo(null);
      await refreshComments();
      
      setSnackbar({
        open: true,
        message: '답글이 등록되었습니다.',
        severity: 'success'
      });
    } catch (error) {
      console.error('답글 등록 에러:', error);
      setSnackbar({
        open: true,
        message: '답글 등록에 실패했습니다.',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (commentId, newContent) => {
    try {
      const response = await api.patch(`/cves/${cve.cveId}/comments/${commentId}`, {
        content: newContent
      });
      
      await refreshComments();
      
      setSnackbar({
        open: true,
        message: '댓글이 수정되었습니다.',
        severity: 'success'
      });
    } catch (error) {
      console.error('댓글 수정 에러:', error);
      setSnackbar({
        open: true,
        message: '댓글 수정에 실패했습니다.',
        severity: 'error'
      });
    }
  };

  const handleDelete = async (commentId, isPermanent = false) => {
    try {
      if (isPermanent) {
        await api.delete(`/cves/${cve.cveId}/comments/${commentId}/permanent`);
      } else {
        await api.delete(`/cves/${cve.cveId}/comments/${commentId}`);
      }
      
      refreshComments();
      
      setSnackbar({
        open: true,
        message: isPermanent ? '댓글이 완전히 삭제되었습니다.' : '댓글이 삭제되었습니다.',
        severity: 'success'
      });
    } catch (error) {
      console.error('Error deleting comment:', error);
      setSnackbar({
        open: true,
        message: error.response?.data?.detail || '댓글 삭제에 실패했습니다.',
        severity: 'error'
      });
    }
  };

  const countActiveComments = (comments) => {
    return comments.reduce((count, comment) => {
      // 삭제되지 않은 댓글만 카운트
      const currentCount = comment.isDeleted ? 0 : 1;
      // 대댓글이 있다면 재귀적으로 카운트
      const childCount = comment.children ? countActiveComments(comment.children) : 0;
      return count + currentCount + childCount;
    }, 0);
  };

  const renderComments = (commentsToRender) => {
    return commentsToRender.map((comment) => (
      <React.Fragment key={comment.id}>
        <Box 
          sx={{
            p: 1.5,
            transition: 'background-color 0.2s',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.02)'
            }
          }}
        >
          <Comment
            comment={comment}
            currentUsername={currentUser?.username}
            onReply={(commentId) => setParentCommentId(commentId)}  
            onEdit={handleEdit}
            onDelete={handleDelete}
            depth={comment.depth || 0}
            replyMode={parentCommentId === comment.id}  
            onReplySubmit={handleReplySubmit}
            onReplyCancel={() => setParentCommentId(null)}
            cveId={cve.cveId}
          />
          {comment.children && comment.children.length > 0 && (
            <Box 
              sx={{ 
                ml: 5,
                mt: 1
              }}
            >
              {renderComments(comment.children)}
            </Box>
          )}
        </Box>
      </React.Fragment>
    ));
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        댓글 ({activeCommentCount})
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

      {comments.length > 0 ? (
        renderComments(comments)
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
          아직 댓글이 없습니다.
        </Typography>
      )}

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
