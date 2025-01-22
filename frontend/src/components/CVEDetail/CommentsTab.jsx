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

// 멘션된 사용자를 추출하는 유틸리티 함수
const extractMentions = (content) => {
  return content.match(/@(\w+)/g)?.map(mention => mention.substring(1)) || [];
};

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!newComment.trim()) return;

    console.log('[CommentsTab] 댓글 작성 시작:', {
      content: newComment,
      mentions: extractMentions(newComment),
      timestamp: new Date().toISOString()
    });

    try {
      setLoading(true);
      const mentions = extractMentions(newComment);
      const commentData = {
        content: newComment,
        mentions: mentions,
        ...(parentCommentId && { parent_id: parentCommentId })
      };

      console.log('[CommentsTab] 댓글 작성 요청 데이터:', {
        commentData,
        timestamp: new Date().toISOString()
      });

      const response = await api.post(`/cves/${cve.cveId}/comments`, commentData);
      
      console.log('[CommentsTab] 댓글 작성 응답:', {
        response: response.data,
        mentions,
        timestamp: new Date().toISOString()
      });

      // 댓글 작성 후 전체 댓글 목록을 새로 불러옴
      await refreshComments();
      setNewComment('');
      
      setSnackbar({
        open: true,
        message: '댓글이 성공적으로 작성되었습니다.',
        severity: 'success'
      });
    } catch (error) {
      console.error('[CommentsTab] 댓글 작성 실패:', {
        error,
        timestamp: new Date().toISOString()
      });
      setSnackbar({
        open: true,
        message: '댓글 작성에 실패했습니다.',
        severity: 'error'
      });
    } finally {
      setLoading(false);
      if (parentCommentId) {
        setParentCommentId(null);
        setReplyingTo(null);
      }
    }
  };

  const handleReplySubmit = async (parentId, content) => {
    if (!content.trim()) return;

    console.log('[CommentsTab] 답글 작성 시작:', {
      parentId,
      content,
      mentions: extractMentions(content),
      timestamp: new Date().toISOString()
    });

    try {
      setLoading(true);
      const mentions = extractMentions(content);
      const commentData = {
        content,
        mentions,
        parent_id: parentId
      };

      console.log('[CommentsTab] 답글 작성 요청 데이터:', {
        commentData,
        timestamp: new Date().toISOString()
      });

      const response = await api.post(`/cves/${cve.cveId}/comments`, commentData);
      
      console.log('[CommentsTab] 답글 작성 응답:', {
        response: response.data,
        timestamp: new Date().toISOString()
      });
      
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
      setActiveCommentCount(countActiveComments(updatedComments));
      setReplyingTo(null);
      
      setSnackbar({
        open: true,
        message: '답글이 성공적으로 작성되었습니다.',
        severity: 'success'
      });
    } catch (error) {
      console.error('[CommentsTab] 답글 작성 실패:', {
        error,
        timestamp: new Date().toISOString()
      });
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
    console.log('[CommentsTab] 댓글 수정 시작:', {
      commentId,
      content: newContent,
      mentions: extractMentions(newContent),
      timestamp: new Date().toISOString()
    });

    try {
      const mentions = extractMentions(newContent);
      const commentData = {
        content: newContent,
        mentions
      };

      console.log('[CommentsTab] 댓글 수정 요청 데이터:', {
        commentData,
        timestamp: new Date().toISOString()
      });

      const response = await api.patch(`/cves/${cve.cveId}/comments/${commentId}`, commentData);
      
      console.log('[CommentsTab] 댓글 수정 응답:', {
        response: response.data,
        timestamp: new Date().toISOString()
      });

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
      
      setSnackbar({
        open: true,
        message: '댓글이 성공적으로 수정되었습니다.',
        severity: 'success'
      });
    } catch (error) {
      console.error('[CommentsTab] 댓글 수정 실패:', {
        error,
        timestamp: new Date().toISOString()
      });
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
      
      // 댓글 삭제 후 목록 업데이트
      const updatedComments = [...comments];
      const updateDeletedStatus = (commentsList) => {
        for (let comment of commentsList) {
          if (comment.id === commentId) {
            if (isPermanent) {
              // 완전 삭제인 경우 배열에서 제거
              return true;
            } else {
              // 소프트 삭제인 경우 isDeleted만 변경
              comment.isDeleted = true;
            }
            return false;
          }
          if (comment.children && comment.children.length > 0) {
            const shouldRemove = updateDeletedStatus(comment.children);
            if (shouldRemove) {
              comment.children = comment.children.filter(child => child.id !== commentId);
            }
          }
        }
        return false;
      };
      
      updateDeletedStatus(updatedComments);
      setComments(updatedComments);
      setActiveCommentCount(countActiveComments(updatedComments));
      
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

  const countActiveComments = (commentsArray) => {
    let count = 0;
    for (const comment of commentsArray) {
      if (!comment.isDeleted) {
        count++;
      }
      if (comment.children && comment.children.length > 0) {
        count += countActiveComments(comment.children);
      }
    }
    return count;
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
