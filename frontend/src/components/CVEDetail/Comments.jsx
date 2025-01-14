import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  List,
  ListItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  CircularProgress,
  Paper
} from '@mui/material';
import { Send as SendIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../utils/auth';
import Comment from './Comment';

const DEPTH_COLORS = [
  '#e0e0e0',  // depth 1
  '#90caf9',  // depth 2
  '#81c784',  // depth 3
  '#ffb74d',  // depth 4
  '#ff8a65',  // depth 5+
];

const Comments = ({ cveId }) => {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    comment: null
  });
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });

  const fetchComments = useCallback(async () => {
    try {
      const response = await api.get(`/cves/${cveId}/comments`);
      setComments(response.data);
    } catch (error) {
      console.error('Error fetching comments:', error);
      setSnackbar({
        open: true,
        message: '댓글을 불러오는데 실패했습니다.',
        severity: 'error'
      });
    }
  }, [cveId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const handleNewCommentSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      setLoading(true);
      await api.post(`/cves/${cveId}/comments`, {
        content: newComment.trim()
      });
      await fetchComments();
      setNewComment('');
      setSnackbar({
        open: true,
        message: '댓글이 작성되었습니다.',
        severity: 'success'
      });
    } catch (error) {
      console.error('Error posting comment:', error);
      setSnackbar({
        open: true,
        message: '댓글 작성에 실패했습니다.',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (parentId, content) => {
    try {
      setLoading(true);
      await api.post(`/cves/${cveId}/comments`, {
        content: content.trim(),
        parent_id: parentId
      });
      await fetchComments();
      setActiveReplyId(null);
      setSnackbar({
        open: true,
        message: '답글이 작성되었습니다.',
        severity: 'success'
      });
    } catch (error) {
      console.error('Error posting reply:', error);
      setSnackbar({
        open: true,
        message: '답글 작성에 실패했습니다.',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (commentId, content) => {
    try {
      setLoading(true);
      await api.put(`/cves/${cveId}/comments/${commentId}`, {
        content: content.trim()
      });
      await fetchComments();
      setSnackbar({
        open: true,
        message: '댓글이 수정되었습니다.',
        severity: 'success'
      });
    } catch (error) {
      console.error('Error updating comment:', error);
      setSnackbar({
        open: true,
        message: '댓글 수정에 실패했습니다.',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (comment) => {
    setDeleteDialog({
      open: true,
      comment: comment
    });
  };

  const handleDeleteCancel = () => {
    setDeleteDialog({
      open: false,
      comment: null
    });
  };

  const handleDeleteConfirm = async () => {
    const { comment } = deleteDialog;
    if (!comment?._id) return;

    try {
      setLoading(true);
      await api.delete(`/cves/${cveId}/comments/${comment._id}`);
      await fetchComments();
      handleDeleteCancel();
      setSnackbar({
        open: true,
        message: '댓글이 삭제되었습니다.',
        severity: 'success'
      });
    } catch (error) {
      console.error('Error deleting comment:', error);
      setSnackbar({
        open: true,
        message: '댓글 삭제에 실패했습니다.',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ mt: 3 }}>
      {user && (
        <Box sx={{ mb: 2 }}>
          <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
            <TextField
              fullWidth
              multiline
              rows={3}
              placeholder="댓글을 입력하세요..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={handleNewCommentSubmit}
                disabled={loading || !newComment.trim()}
                endIcon={<SendIcon />}
              >
                댓글 작성
              </Button>
            </Box>
          </Paper>
        </Box>
      )}

      <List>
        {comments.map((comment) => (
          <ListItem
            key={comment._id}
            disableGutters
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              py: 1,
              px: 0
            }}
          >
            <Comment
              comment={comment}
              currentUser={user}
              onReply={handleReply}
              onEdit={handleEdit}
              onDelete={handleDeleteClick}
              isReplyMode={activeReplyId === comment._id}
              onReplyModeChange={setActiveReplyId}
              depthColors={DEPTH_COLORS}
            />
          </ListItem>
        ))}
      </List>

      <Dialog
        open={deleteDialog.open}
        onClose={handleDeleteCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>댓글 삭제</DialogTitle>
        <DialogContent>
          <Typography>
            이 댓글을 삭제하시겠습니까?
          </Typography>
          {deleteDialog.comment && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ 
                mt: 2,
                p: 2,
                bgcolor: 'grey.100',
                borderRadius: 1,
                whiteSpace: 'pre-wrap'
              }}
            >
              {deleteDialog.comment.content}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>
            취소
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : <DeleteIcon />}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Comments;