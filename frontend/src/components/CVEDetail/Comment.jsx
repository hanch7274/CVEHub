import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  TextField,
  Stack,
  Tooltip
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Reply as ReplyIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  DeleteForever as DeleteForeverIcon
} from '@mui/icons-material';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { api } from '../../utils/auth';

const Comment = ({
  comment,
  onReply,
  onEdit,
  onDelete,
  currentUsername,
  depth = 0,
  replyMode,
  onReplySubmit,
  onReplyCancel,
  cveId
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [showOriginal, setShowOriginal] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  
  const isAdmin = currentUsername === 'admin';
  const isAuthor = currentUsername === comment.username;
  const canModify = isAdmin || isAuthor;
  const isDeleted = comment.isDeleted;

  const handleEdit = () => {
    if (isEditing) {
      onEdit(comment.id, editContent);
      setIsEditing(false);
    } else {
      setEditContent(comment.content);
      setIsEditing(true);
    }
  };

  const handleReplySubmit = () => {
    if (replyContent.trim()) {
      onReplySubmit(comment.id, replyContent);
      setReplyContent('');
    }
  };

  const handlePermanentDelete = async () => {
    if (window.confirm('이 댓글을 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      try {
        await api.delete(`/cves/${cveId}/comments/${comment.id}/permanent`);
        onDelete(comment.id, true);
      } catch (error) {
        console.error('Error permanently deleting comment:', error);
      }
    }
  };

  const formatDate = (dateString) => {
    try {
      if (!dateString) return '';
      const date = parseISO(dateString);
      return formatDistanceToNow(date, { addSuffix: true, locale: ko });
    } catch (error) {
      console.error('Invalid date:', dateString);
      return '';
    }
  };

  const renderContent = () => {
    if (isEditing) {
      return (
        <Box sx={{ mt: 1 }}>
          <TextField
            fullWidth
            multiline
            rows={2}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            variant="outlined"
            size="small"
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              variant="contained"
              size="small"
              onClick={handleEdit}
              disabled={!editContent.trim()}
            >
              저장
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setIsEditing(false)}
            >
              취소
            </Button>
          </Stack>
        </Box>
      );
    }

    if (isDeleted) {
      return (
        <Box>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontStyle: 'italic' }}
          >
            삭제된 댓글입니다.
          </Typography>
          {isAdmin && (
            <>
              <Button
                startIcon={showOriginal ? <VisibilityOffIcon /> : <VisibilityIcon />}
                size="small"
                onClick={() => setShowOriginal(!showOriginal)}
                sx={{ mt: 1 }}
              >
                {showOriginal ? '원본 숨기기' : '원본 보기'}
              </Button>
              {showOriginal && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1, pl: 2, borderLeft: '2px solid #ccc' }}
                >
                  {comment.content}
                </Typography>
              )}
            </>
          )}
        </Box>
      );
    }

    return <Typography variant="body2">{comment.content}</Typography>;
  };

  const renderActions = () => {
    if (isDeleted) {
      if (isAdmin) {
        return (
          <Tooltip title="완전 삭제 (관리자 전용)">
            <IconButton
              size="small"
              onClick={handlePermanentDelete}
              color="error"
            >
              <DeleteForeverIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      }
      return null;
    }

    return (
      <Stack direction="row" spacing={1}>
        <Tooltip title="답글 작성">
          <IconButton
            size="small"
            onClick={() => onReply(comment.id)}
            disabled={depth >= 5}
          >
            <ReplyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {canModify && (
          <>
            <Tooltip title="수정">
              <IconButton size="small" onClick={handleEdit}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={isAdmin ? "소프트 삭제" : "삭제"}>
              <IconButton
                size="small"
                onClick={() => onDelete(comment.id, false)}
                color="error"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {isAdmin && (
              <Tooltip title="완전 삭제 (관리자 전용)">
                <IconButton
                  size="small"
                  onClick={handlePermanentDelete}
                  color="error"
                >
                  <DeleteForeverIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </>
        )}
      </Stack>
    );
  };

  return (
    <Box sx={{ ml: depth * 3, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="subtitle2" color="primary">
          {comment.username}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ ml: 1 }}
        >
          {formatDate(comment.createdAt)}
        </Typography>
        {comment.updatedAt && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ ml: 1 }}
          >
            (수정됨)
          </Typography>
        )}
      </Box>

      {renderContent()}

      {!isEditing && renderActions()}

      {replyMode && (
        <Box sx={{ mt: 2 }}>
          <TextField
            fullWidth
            multiline
            rows={2}
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="답글을 입력하세요..."
            variant="outlined"
            size="small"
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              variant="contained"
              size="small"
              onClick={handleReplySubmit}
              disabled={!replyContent.trim()}
            >
              답글 작성
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={onReplyCancel}
            >
              취소
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
};

export default Comment;
