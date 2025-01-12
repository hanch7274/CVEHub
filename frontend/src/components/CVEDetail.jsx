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
  Grid,
  Link
} from '@mui/material';
import {
  ContentCopy as ContentCopyIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Send as SendIcon,
  MoreVert as MoreVertIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  Launch as LaunchIcon
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
  const [expandedPoc, setExpandedPoc] = useState(null);

  const loadComments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`http://localhost:8000/api/cves/${cve.cveId}/comments`);
      setComments(response.data || []);
    } catch (error) {
      console.error('Failed to load comments:', error);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [cve]);

  useEffect(() => {
    if (open && cve) {
      loadComments();
    }
  }, [open, cve, loadComments]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleCopySnortRule = (rule) => {
    axios.post('/api/copy-rule', { rule })
      .then(() => {
        navigator.clipboard.writeText(rule);
      })
      .catch((error) => {
        console.error('Failed to copy rule:', error);
      });
    // TODO: Add notification
  };

  const handleCommentSubmit = async () => {
    if (!newComment.trim()) return;

    try {
      const response = await axios.post(`http://localhost:8000/api/cves/${cve.cveId}/comments`, {
        content: newComment.trim()
      });
      setComments([...comments, response.data]);
      setNewComment('');
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  const handleCommentEdit = async (index, content) => {
    try {
      const response = await axios.put(`http://localhost:8000/api/cves/${cve.cveId}/comments/${index}`, {
        content: content.trim()
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
      await axios.delete(`http://localhost:8000/api/cves/${cve.cveId}/comments/${index}`);
      setComments(comments.filter((_, i) => i !== index));
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  const findRelatedItems = (pocIndex) => {
    const poc = cve.pocs[pocIndex];
    const relatedRules = cve.snortRules.filter(rule => 
      rule.description && poc.description && 
      (rule.description.includes(poc.url) || poc.description.includes(rule.description))
    );
    const relatedRefs = cve.references.filter(ref => 
      ref.url === poc.url || (ref.description && poc.description && 
      (ref.description.includes(poc.url) || poc.description.includes(ref.url)))
    );
    return { rules: relatedRules, refs: relatedRefs };
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h5" gutterBottom>
              {cve.cveId}
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              {cve.title}
            </Typography>
          </Box>
          <Box>
            <Chip 
              label={cve.status} 
              color={
                cve.status === "미할당" ? "error" :
                cve.status === "분석중" ? "warning" :
                cve.status === "분석완료" ? "info" : "success"
              }
              sx={{ mr: 2 }}
            />
            <Button
              variant="contained"
              color="primary"
              startIcon={<EditIcon />}
            >
              Edit
            </Button>
          </Box>
        </Box>
        <Typography variant="body1" sx={{ mt: 2 }}>
          {cve.description}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab label={`PoCs (${(cve.pocs || []).length})`} />
            <Tab label={`Snort Rules (${(cve.snortRules || []).length})`} />
            <Tab label={`References (${(cve.references || []).length})`} />
            <Tab label={`Comments (${comments.length})`} />
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
          {(cve.pocs || []).map((poc, index) => {
            const { rules, refs } = findRelatedItems(index);
            return (
              <Paper 
                key={index} 
                sx={{ 
                  p: 2, 
                  mb: 2,
                  border: expandedPoc === index ? 2 : 1,
                  borderColor: expandedPoc === index ? 'primary.main' : 'divider'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={500}>
                      {poc.source}
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      {rules.length > 0 && (
                        <Chip
                          size="small"
                          label={`${rules.length} Snort Rules`}
                          color="info"
                          sx={{ mr: 1 }}
                        />
                      )}
                      {refs.length > 0 && (
                        <Chip
                          size="small"
                          label={`${refs.length} References`}
                          color="secondary"
                        />
                      )}
                    </Box>
                  </Box>
                  <Box>
                    <IconButton 
                      size="small"
                      onClick={() => setExpandedPoc(expandedPoc === index ? null : index)}
                    >
                      {expandedPoc === index ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
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
                  startIcon={<LaunchIcon />}
                >
                  View Source
                </Button>
                
                {/* Related Items */}
                {expandedPoc === index && (
                  <Box sx={{ mt: 2, pl: 2, borderLeft: 2, borderColor: 'primary.main' }}>
                    {rules.length > 0 && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" color="primary" gutterBottom>
                          Related Snort Rules
                        </Typography>
                        {rules.map((rule, ruleIndex) => (
                          <Paper key={ruleIndex} sx={{ p: 1, mb: 1, bgcolor: 'grey.50' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                              <Chip
                                label={rule.type}
                                size="small"
                                sx={{ mr: 1 }}
                              />
                              <IconButton
                                size="small"
                                onClick={() => handleCopySnortRule(rule.rule)}
                              >
                                <ContentCopyIcon fontSize="small" />
                              </IconButton>
                            </Box>
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                backgroundColor: 'grey.100',
                                p: 1,
                                borderRadius: 1,
                                fontSize: '0.8rem'
                              }}
                            >
                              {rule.rule}
                            </Typography>
                          </Paper>
                        ))}
                      </Box>
                    )}
                    
                    {refs.length > 0 && (
                      <Box>
                        <Typography variant="subtitle2" color="primary" gutterBottom>
                          Related References
                        </Typography>
                        {refs.map((ref, refIndex) => (
                          <Link
                            key={refIndex}
                            href={ref.url}
                            target="_blank"
                            rel="noopener"
                            sx={{
                              display: 'block',
                              mb: 0.5,
                              color: 'text.primary',
                              '&:hover': {
                                color: 'primary.main'
                              }
                            }}
                          >
                            <Typography variant="body2">
                              {ref.description || ref.url}
                            </Typography>
                          </Link>
                        ))}
                      </Box>
                    )}
                  </Box>
                )}
              </Paper>
            );
          })}
        </TabPanel>

        {/* Snort Rules Tab */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle1" color="text.secondary">
              {cve.snortRules?.length || 0} rules in total
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              color="primary"
            >
              Add Rule
            </Button>
          </Box>
          <Grid container spacing={2}>
            {(cve.snortRules || []).map((rule, index) => (
              <Grid item xs={12} key={index}>
                <Paper sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Box>
                      <Chip
                        label={rule.type}
                        color={rule.type === 'custom' ? 'secondary' : 'primary'}
                        size="small"
                        sx={{ mr: 1 }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        Added by {rule.addedBy} on {formatDate(rule.dateAdded)}
                      </Typography>
                    </Box>
                    <Box>
                      <IconButton
                        size="small"
                        onClick={() => handleCopySnortRule(rule.rule)}
                        sx={{ mr: 1 }}
                      >
                        <ContentCopyIcon />
                      </IconButton>
                      <IconButton size="small" sx={{ mr: 1 }}>
                        <EditIcon />
                      </IconButton>
                      <IconButton size="small" color="error">
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  </Box>
                  {rule.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {rule.description}
                    </Typography>
                  )}
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
              </Grid>
            ))}
          </Grid>
        </TabPanel>

        {/* References Tab */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle1" color="text.secondary">
              {cve.references?.length || 0} references in total
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              color="primary"
            >
              Add Reference
            </Button>
          </Box>
          <Grid container spacing={2}>
            {(cve.references || []).map((ref, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Paper sx={{ p: 2, height: '100%' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Added by {ref.addedBy} on {formatDate(ref.dateAdded)}
                    </Typography>
                    <Box>
                      <IconButton size="small" sx={{ mr: 1 }}>
                        <EditIcon />
                      </IconButton>
                      <IconButton size="small" color="error">
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  </Box>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {ref.description}
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    href={ref.url}
                    target="_blank"
                    startIcon={<LaunchIcon />}
                  >
                    Visit Reference
                  </Button>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </TabPanel>

        {/* Comments Tab */}
        <TabPanel value={tabValue} index={3}>
          <Box mt={2}>
            <Typography variant="h6">Comments</Typography>
            <List>
              {comments.map((comment, index) => (
                <ListItem key={index}>
                  <ListItemText primary={comment.content} />
                  <CommentActions
                    comment={comment}
                    onEdit={() => setEditingComment(index)}
                    onDelete={() => handleCommentDelete(index)}
                  />
                </ListItem>
              ))}
            </List>
            {editingComment !== null && (
              <Box mt={2}>
                <TextField
                  fullWidth
                  value={comments[editingComment]?.content || ''}
                  onChange={(e) => {
                    const newComments = [...comments];
                    newComments[editingComment] = { ...newComments[editingComment], content: e.target.value };
                    setComments(newComments);
                  }}
                />
                <Button onClick={() => handleCommentEdit(editingComment, comments[editingComment].content)}>
                  Save
                </Button>
                <Button onClick={() => setEditingComment(null)}>
                  Cancel
                </Button>
              </Box>
            )}
            <Box mt={2}>
              <TextField
                fullWidth
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
              />
              <Button onClick={handleCommentSubmit}>
                Add Comment
              </Button>
            </Box>
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
