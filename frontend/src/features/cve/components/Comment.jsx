import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Stack,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
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
import { StyledListItem } from './CommonStyles';

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
  isAdmin,
  onStartEdit,
  onFinishEdit,
  isEditing
}) => {
  const [editContent, setEditContent] = useState(comment.content);
  const [showOriginal, setShowOriginal] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // 권한 및 상태 체크
  const isDeleted = comment.isDeleted;
  const isAuthor = currentUsername === comment.username;
  const canModify = isAdmin || isAuthor;

  const handleEdit = () => {
    if (isEditing) {
      onEdit(comment.id, editContent);
      onFinishEdit();
    } else {
      setEditContent(comment.content);
      onStartEdit();
    }
  };

  const handleReplySubmit = () => {
    if (replyContent.trim()) {
      onReplySubmit(comment.id, replyContent);
      setReplyContent('');
    }
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = (permanent = false) => {
    onDelete(comment.id, permanent);
    setDeleteDialogOpen(false);
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
            <Button size="small" onClick={handleCancelEdit}>
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

  const handleCancelEdit = () => {
    onFinishEdit();
  };

  return (
    <StyledListItem
      elevation={1}
      sx={{
        ml: depth * 2,
        bgcolor: replyMode ? 'action.hover' : 'background.paper',
        border: replyMode ? '1px solid' : '1px solid',
        borderColor: replyMode ? 'primary.main' : 'divider',
        '& .MuiTypography-root': {
          fontSize: '0.813rem'
        }
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
                    onClick={handleDeleteClick}
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
                  onClick={handleDeleteClick}
                  color="error"
                >
                  <DeleteIcon fontSize="small" />
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

      {/* 삭제 다이얼로그 */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>댓글 삭제</DialogTitle>
        <DialogContent>
          <Typography>
            {isAdmin ? (
              <>
                관리자 권한으로 삭제 방식을 선택할 수 있습니다.
                <Typography color="error" sx={{ mt: 1 }}>
                  * 영구 삭제된 댓글은 복구할 수 없습니다.
                </Typography>
              </>
            ) : (
              '이 댓글을 삭제하시겠습니까?'
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            취소
          </Button>
          {isAdmin ? (
            <>
              <Button
                onClick={() => handleDeleteConfirm(false)}
                color="warning"
              >
                일반 삭제
              </Button>
              <Button
                onClick={() => handleDeleteConfirm(true)}
                color="error"
              >
                영구 삭제
              </Button>
            </>
          ) : (
            <Button
              onClick={() => handleDeleteConfirm(false)}
              color="error"
            >
              삭제
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {children}
    </StyledListItem>
  );
};

export default Comment;
