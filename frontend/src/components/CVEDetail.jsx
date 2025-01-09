import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Tabs,
  Tab,
  Chip,
  Paper,
  IconButton,
  TextField,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondary,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  ContentCopy as ContentCopyIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Send as SendIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';
import axios from 'axios';

const TabPanel = (props) => {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
};

const CommentActions = ({ comment, onEdit, onDelete }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleEdit = () => {
    handleClose();
    onEdit();
  };

  const handleDelete = () => {
    handleClose();
    onDelete();
  };

  // TODO: 현재 사용자와 댓글 작성자 비교
  const isAuthor = true;

  if (!isAuthor) return null;

  return (
    <>
      <IconButton
        size="small"
        onClick={handleClick}
      >
        <MoreVertIcon />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
      >
        <MenuItem onClick={handleEdit}>Edit</MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>Delete</MenuItem>
      </Menu>
    </>
  );
};

const CVEDetail = ({ open, onClose, cve }) => {
  const [tabValue, setTabValue] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [editingComment, setEditingComment] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && cve) {
      loadComments();
    }
  }, [open, cve]);

  const loadComments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/cve/${cve.cveId}/comments`);
      setComments(response.data);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setLoading(false);
    }
  }, [cve]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleCopySnortRule = (rule) => {
    navigator.clipboard.writeText(rule);
    // TODO: Add notification
  };

  const handleCommentSubmit = async () => {
    if (!newComment.trim()) return;

    try {
      const response = await axios.post(`/api/cve/${cve.cveId}/comments`, {
        content: newComment
      });
      setComments([...comments, response.data]);
      setNewComment('');
    } catch (error) {
      console.error('Failed to submit comment:', error);
    }
  };

  const handleCommentEdit = async (index, content) => {
    try {
      const response = await axios.put(`/api/cve/${cve.cveId}/comments/${index}`, {
        content
      });
      const newComments = [...comments];
      newComments[index] = response.data;
      setComments(newComments);
      setEditingComment(null);
    } catch (error) {
      console.error('Failed to edit comment:', error);
    }
  };

  const handleCommentDelete = async (index) => {
    try {
      await axios.delete(`/api/cve/${cve.cveId}/comments/${index}`);
      const newComments = comments.filter((_, i) => i !== index);
      setComments(newComments);
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  if (!cve) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            {cve.cveId}
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<EditIcon />}
          >
            Edit
          </Button>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab label="PoCs" />
            <Tab label="Snort Rules" />
            <Tab label="References" />
            <Tab label="Comments" />
          </Tabs>
        </Box>

        {/* PoCs Tab */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              color="primary"
            >
              Add PoC
            </Button>
          </Box>
          {(cve.pocs || []).map((poc, index) => (
            <Paper key={index} sx={{ p: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={500}>
                  {poc.source}
                </Typography>
                <Box>
                  <IconButton size="small">
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small" color="error">
                    <DeleteIcon />
                  </IconButton>
                </Box>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {poc.description}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                href={poc.url}
                target="_blank"
              >
                View Source
              </Button>
            </Paper>
          ))}
        </TabPanel>

        {/* Snort Rules Tab */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              color="primary"
            >
              Add Rule
            </Button>
          </Box>
          {(cve.snortRules || []).map((rule, index) => (
            <Paper key={index} sx={{ p: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Chip
                  label={rule.type}
                  color={rule.type === 'custom' ? 'secondary' : 'primary'}
                  size="small"
                />
                <Box>
                  <IconButton
                    size="small"
                    onClick={() => handleCopySnortRule(rule.rule)}
                  >
                    <ContentCopyIcon />
                  </IconButton>
                  <IconButton size="small">
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small" color="error">
                    <DeleteIcon />
                  </IconButton>
                </Box>
              </Box>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'monospace',
                  backgroundColor: 'grey.100',
                  p: 1,
                  borderRadius: 1,
                  overflowX: 'auto'
                }}
              >
                {rule.rule}
              </Typography>
            </Paper>
          ))}
        </TabPanel>

        {/* References Tab */}
        <TabPanel value={tabValue} index={2}>
          {(cve.references || []).map((ref, index) => (
            <Box key={index} sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {ref.source}
              </Typography>
              <Button
                variant="text"
                href={ref.url}
                target="_blank"
                sx={{ textTransform: 'none' }}
              >
                {ref.url}
              </Button>
            </Box>
          ))}
        </TabPanel>

        {/* Comments Tab */}
        <TabPanel value={tabValue} index={3}>
          <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
            {comments.map((comment, index) => (
              <ListItem
                key={index}
                alignItems="flex-start"
                sx={{
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:last-child': {
                    borderBottom: 'none'
                  }
                }}
              >
                <ListItemAvatar>
                  <Avatar>{comment.author[0].toUpperCase()}</Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle2">
                        {comment.author}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(comment.createdAt)}
                          {comment.isEdited && ' (edited)'}
                        </Typography>
                        <CommentActions
                          comment={comment}
                          onEdit={() => setEditingComment(index)}
                          onDelete={() => handleCommentDelete(index)}
                        />
                      </Box>
                    </Box>
                  }
                  secondary={
                    editingComment === index ? (
                      <Box sx={{ mt: 1 }}>
                        <TextField
                          fullWidth
                          multiline
                          rows={2}
                          defaultValue={comment.content}
                          variant="outlined"
                          size="small"
                        />
                        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                          <Button
                            size="small"
                            onClick={() => setEditingComment(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={(e) => handleCommentEdit(index, e.target.value)}
                          >
                            Save
                          </Button>
                        </Box>
                      </Box>
                    ) : (
                      <Typography
                        variant="body2"
                        color="text.primary"
                        sx={{ mt: 1, whiteSpace: 'pre-wrap' }}
                      >
                        {comment.content}
                      </Typography>
                    )
                  }
                />
              </ListItem>
            ))}
          </List>
          
          {/* 댓글 입력 영역 */}
          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              multiline
              rows={2}
              placeholder="Write a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              sx={{ flexGrow: 1 }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleCommentSubmit}
              disabled={!newComment.trim()}
              sx={{ alignSelf: 'flex-end' }}
            >
              <SendIcon />
            </Button>
          </Box>
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CVEDetail;
