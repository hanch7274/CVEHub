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
import { formatDistanceToNow, parseISO } from 'date-fns';
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
            top: 0,
            left: -1,
            width: '2px',
            height: '100%',
            backgroundColor: depthColors[Math.min(comment.depth - 1, 4)]
          } : {}
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle2" color="textPrimary">
            {comment.author}
          </Typography>
          <Typography variant="caption" color="textSecondary" sx={{ ml: 1 }}>
            {formatDate(comment.created_at)}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {currentUser && (
            <>
              <IconButton size="small" onClick={handleReplyClick}>
                <ReplyIcon fontSize="small" />
              </IconButton>
              {isAuthor && (
                <IconButton size="small" onClick={handleMenuOpen}>
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              )}
            </>
          )}
        </Box>

        {isEditing ? (
          <Box sx={{ mt: 1 }}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              variant="outlined"
              size="small"
            />
            <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button size="small" onClick={handleEditCancel}>
                취소
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleEditSubmit}
                disabled={!editContent.trim()}
              >
                수정
              </Button>
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {comment.content}
          </Typography>
        )}

        {isReplyMode && (
          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="답글을 입력하세요..."
              variant="outlined"
              size="small"
            />
            <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button size="small" onClick={() => onReplyModeChange(null)}>
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
          </Box>
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
          <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" sx={{ color: 'error.main' }} />
            </ListItemIcon>
            <ListItemText>삭제</ListItemText>
          </MenuItem>
        </Menu>
      </Paper>
    </Box>
  );
});

export default Comment;
