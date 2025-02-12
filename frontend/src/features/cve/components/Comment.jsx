import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
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
import { api } from '../../../utils/auth';
import MentionInput from './MentionInput';
import { highlightMentions } from '../../../utils/mentionUtils';

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
  cveId,
  children,
  isAdmin
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [showOriginal, setShowOriginal] = useState(false);
  const [replyContent, setReplyContent] = useState('');


  // 권한 및 상태 체크
  const isDeleted = comment.isDeleted;
  const isAuthor = currentUsername === comment.username;
  const canModify = isAdmin || isAuthor;

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

  const handleDelete = () => {
    onDelete(comment.id, isAdmin);
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
          <MentionInput
            fullWidth
            multiline
            rows={2}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            variant="outlined"
            size="small"
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button size="small" onClick={handleEdit} variant="contained">
              저장
            </Button>
            <Button size="small" onClick={() => setIsEditing(false)}>
              취소
            </Button>
          </Stack>
        </Box>
      );
    }

    if (isDeleted && !showOriginal) {
      return (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontStyle: 'italic' }}
        >
          삭제된 댓글입니다.
        </Typography>
      );
    }

    return (
      <Typography
        variant="body2"
        component="div"
        dangerouslySetInnerHTML={{
          __html: highlightMentions(comment.content)
        }}
        sx={{
          '& .mention': {
            color: 'primary.main',
            fontWeight: 'medium',
            '&:hover': {
              textDecoration: 'underline',
              cursor: 'pointer'
            }
          },
          wordBreak: 'break-word'
        }}
      />
    );
  };

  // 답글 아이콘 클릭 핸들러
  const handleReplyClick = () => {
    if (replyMode) {
      onReplyCancel();
    } else {
      onReply(comment);
    }
  };

  return (
    <Box
      sx={{
        ml: depth * 4,
        mb: 2,
        p: 2,
        borderRadius: 1,
        bgcolor: replyMode ? 'action.hover' : 'background.paper',
        border: replyMode ? '1px solid' : 'none',
        borderColor: 'primary.main',
        transition: 'all 0.3s ease',
        position: 'relative',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="subtitle2" component="span">
              {comment.username}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatDate(comment.createdAt)}
            </Typography>
          </Box>
          {renderContent()}
        </Box>
        <Box>
          {!comment.isDeleted && (
            <Stack direction="row" spacing={1}>
              {canModify && (
                <>
                  <IconButton size="small" onClick={handleEdit}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton 
                    size="small" 
                    onClick={handleDelete}
                    color="error"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </>
              )}
              <IconButton size="small" onClick={handleReplyClick}>
                <ReplyIcon fontSize="small" />
              </IconButton>
            </Stack>
          )}
          {comment.isDeleted && isAdmin && (
            <Stack direction="row" spacing={1}>
              <Tooltip title="영구 삭제">
                <IconButton 
                  size="small" 
                  onClick={handleDelete}
                  color="error"
                >
                  <DeleteForeverIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={showOriginal ? "삭제된 댓글 숨기기" : "삭제된 댓글 보기"}>
                <IconButton size="small" onClick={() => setShowOriginal(!showOriginal)}>
                  {showOriginal ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Box>
      </Box>

      {replyMode && (
        <Box sx={{ mt: 2 }}>
          <MentionInput
            fullWidth
            multiline
            rows={2}
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            variant="outlined"
            size="small"
            placeholder="답글을 입력하세요..."
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button 
              size="small" 
              onClick={handleReplySubmit} 
              variant="contained"
              disabled={!replyContent.trim()}
            >
              답글 달기
            </Button>
            <Button size="small" onClick={onReplyCancel}>
              취소
            </Button>
          </Stack>
        </Box>
      )}

      {children}
    </Box>
  );
};

export default Comment;
