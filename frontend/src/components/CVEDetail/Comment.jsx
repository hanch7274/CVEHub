import React, { useState, memo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Paper,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Reply as ReplyIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Send as SendIcon,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

const Comment = memo(({
  comment,
  currentUser,
  onReply,
  onEdit,
  onDelete,
  isReplyMode,
  onReplyModeChange,
  depthColors
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  
  const isAuthor = comment.author === currentUser?.username;
  const isReply = comment.parent_id !== null;

  const handleMenuOpen = (event) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
  };

  const handleEditClick = () => {
    handleMenuClose();
    setIsEditing(true);
    setEditContent(comment.content);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditContent(comment.content);
  };

  const handleEditSubmit = () => {
    if (!editContent.trim()) return;
    onEdit(comment._id, editContent.trim());
    setIsEditing(false);
  };

  const handleDeleteClick = () => {
    handleMenuClose();
    onDelete(comment);
  };

  const handleReplyClick = () => {
    if (isReplyMode) {
      onReplyModeChange(null);
      setReplyContent('');
    } else {
      onReplyModeChange(comment._id);
    }
  };

  const handleReplySubmit = () => {
    if (!replyContent.trim()) return;
    onReply(comment._id, replyContent.trim());
    setReplyContent('');
    onReplyModeChange(null);
  };

  return (
    <Box sx={{ width: '100%', pl: isReply ? 4 : 0 }}>
      <Paper
        elevation={0}
        variant="outlined"
        sx={{
          p: 2,
          position: 'relative',
          borderLeft: isReply ? `3px solid ${depthColors[Math.min(comment.depth - 1, 4)]}` : 'none',
          bgcolor: 'background.paper',
          '&::before': isReply ? {
            content: '""',
            position: 'absolute',
            left: -20,
            top: 0,
            bottom: 0,
            width: 16,
            borderLeft: `2px solid ${depthColors[Math.min(comment.depth - 1, 4)]}`,
            borderBottom: `2px solid ${depthColors[Math.min(comment.depth - 1, 4)]}`,
            borderBottomLeftRadius: 8,
          } : undefined,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="subtitle2">
            {comment.author}
          </Typography>
          {isReply && comment.parent_author && (
            <>
              <Typography variant="caption" color="text.secondary">
                →
              </Typography>
              <Typography variant="caption" color="text.secondary">
                @{comment.parent_author}
              </Typography>
            </>
          )}
          <Typography variant="caption" color="text.secondary">
            {formatDistanceToNow(new Date(comment.created_at), {
              addSuffix: true,
              locale: ko
            })}
            {comment.updated_at && ' (수정됨)'}
          </Typography>
        </Box>

        {isEditing ? (
          <Box sx={{ mt: 1 }}>
            <TextField
              fullWidth
              multiline
              size="small"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              sx={{ mb: 1 }}
              autoFocus
            />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button
                size="small"
                onClick={handleEditCancel}
              >
                취소
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleEditSubmit}
                disabled={!editContent.trim()}
              >
                저장
              </Button>
            </Box>
          </Box>
        ) : (
          <>
            <Typography
              variant="body2"
              sx={{
                whiteSpace: 'pre-wrap',
                color: 'text.primary'
              }}
            >
              {comment.content}
            </Typography>
            
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, gap: 1 }}>
              {currentUser && (
                <Button
                  size="small"
                  startIcon={<ReplyIcon fontSize="small" />}
                  onClick={handleReplyClick}
                  color={isReplyMode ? "primary" : "inherit"}
                >
                  답글 {isReplyMode ? "취소" : "작성"}
                </Button>
              )}

              {isAuthor && (
                <IconButton
                  size="small"
                  edge="end"
                  onClick={handleMenuOpen}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          </>
        )}

        <Menu
          anchorEl={menuAnchorEl}
          open={Boolean(menuAnchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={handleEditClick}>
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>수정</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleDeleteClick}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>삭제</ListItemText>
          </MenuItem>
        </Menu>
      </Paper>

      {isReplyMode && (
        <Box sx={{ mt: 1, ml: 4 }}>
          <Paper 
            elevation={0} 
            variant="outlined" 
            sx={{ 
              p: 2,
              borderLeft: `3px solid ${depthColors[Math.min(comment.depth, 4)]}`,
              bgcolor: 'action.hover'
            }}
          >
            <TextField
              fullWidth
              multiline
              rows={2}
              placeholder={`@${comment.author}님에게 답글 작성...`}
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              sx={{ mb: 1 }}
              autoFocus
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button
                size="small"
                onClick={() => {
                  setReplyContent('');
                  onReplyModeChange(null);
                }}
              >
                취소
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleReplySubmit}
                disabled={!replyContent.trim()}
                endIcon={<SendIcon />}
              >
                답글
              </Button>
            </Box>
          </Paper>
        </Box>
      )}
    </Box>
  );
});

Comment.displayName = 'Comment';

export default Comment;
