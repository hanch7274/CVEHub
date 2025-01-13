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
  Link,
  Collapse,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell
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

const PocRow = ({ poc }) => {
  const [open, setOpen] = useState(false);
  
  // URL 미리보기 텍스트 생성
  const previewUrl = poc.url.length > 50 ? `${poc.url.substring(0, 50)}...` : poc.url;
  const previewDescription = poc.description.length > 100 ? `${poc.description.substring(0, 100)}...` : poc.description;

  return (
    <>
      <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell>
          <IconButton
            aria-label="expand row"
            size="small"
            onClick={() => setOpen(!open)}
          >
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell component="th" scope="row">
          {poc.source}
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {previewUrl}
            {poc.url && (
              <IconButton size="small" href={poc.url} target="_blank">
                <LaunchIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        </TableCell>
        <TableCell>{previewDescription}</TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={4}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 1 }}>
              <Typography variant="h6" gutterBottom component="div">
                상세 정보
              </Typography>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                      URL
                    </TableCell>
                    <TableCell>{poc.url}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                      설명
                    </TableCell>
                    <TableCell>{poc.description}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const CVEDetail = ({ open, onClose, cve: initialCve }) => {
  const [tabValue, setTabValue] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [editingComment, setEditingComment] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedPoc, setExpandedPoc] = useState(null);
  const [cve, setCve] = useState(initialCve); // cve와 setCve 정의
  const [pocDialogOpen, setPocDialogOpen] = useState(false);
  const [newPoc, setNewPoc] = useState({
    source: 'ETC',  // 기본값 설정
    url: '',
    description: ''
  });
  const [snortRuleDialogOpen, setSnortRuleDialogOpen] = useState(false);
  const [newSnortRule, setNewSnortRule] = useState({
    type: 'USER_DEFINED',  // 기본값을 사용자 정의로 설정
    rule: '',
    description: ''
  });
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
  const [newReference, setNewReference] = useState({
    source: '',
    url: ''
  });

  // POC Source 옵션 추가
  const POC_SOURCE_OPTIONS = [
    { value: 'ETC', label: 'ETC' },
    { value: 'Metasploit', label: 'Metasploit' },
    { value: 'Nuclei-Templates', label: 'Nuclei-Templates' }
  ];

  // Snort Rule Type 옵션 추가
  const SNORT_RULE_TYPE_OPTIONS = [
    { value: 'IPS', label: 'IPS' },
    { value: 'ONE', label: 'ONE' },
    { value: 'UTM', label: 'UTM' },
    { value: 'USER_DEFINED', label: '사용자 정의' },
    { value: 'EMERGING_THREATS', label: 'Emerging-Threats' },
    { value: 'SNORT_OFFICIAL', label: 'Snort Official' }
  ];

  useEffect(() => {
    if (initialCve) {
      setCve(initialCve);
    }
  }, [initialCve]);

  useEffect(() => {
    if (!open) {
      setTabValue(0);
    }
  }, [open]);

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

  const handleAddPoc = async () => {
    setPocDialogOpen(true);
  };

  const handlePocSubmit = async () => {
    try {
      const response = await axios.post(`http://localhost:8000/api/cves/${cve.cveId}/poc`, newPoc);
      setCve(prevCve => ({
        ...prevCve,
        pocs: [...(prevCve.pocs || []), response.data]
      }));
      setPocDialogOpen(false);
      setNewPoc({ source: 'ETC', url: '', description: '' });
    } catch (error) {
      console.error('Failed to add PoC:', error);
    }
  };

  const handlePocDialogClose = () => {
    setPocDialogOpen(false);
    setNewPoc({ source: 'ETC', url: '', description: '' });
  };

  const handleAddSnortRule = () => {
    setSnortRuleDialogOpen(true);
  };

  const handleSnortRuleSubmit = async () => {
    try {
      const response = await axios.post(`http://localhost:8000/api/cves/${cve.cveId}/snort-rule`, newSnortRule);
      setCve(prevCve => ({
        ...prevCve,
        snortRules: [...(prevCve.snortRules || []), response.data]
      }));
      setSnortRuleDialogOpen(false);
      setNewSnortRule({ type: 'USER_DEFINED', rule: '', description: '' });
    } catch (error) {
      console.error('Failed to add Snort Rule:', error);
    }
  };

  const handleSnortRuleDialogClose = () => {
    setSnortRuleDialogOpen(false);
    setNewSnortRule({ type: 'USER_DEFINED', rule: '', description: '' });
  };

  const handleAddReference = () => {
    setReferenceDialogOpen(true);
  };

  const handleReferenceSubmit = async () => {
    try {
      const response = await axios.post(`http://localhost:8000/api/cves/${cve.cveId}/reference`, newReference);
      setCve(prevCve => ({
        ...prevCve,
        references: [...(prevCve.references || []), response.data]
      }));
      setReferenceDialogOpen(false);
      setNewReference({ source: '', url: '' });
    } catch (error) {
      console.error('Failed to add Reference:', error);
    }
  };

  const handleReferenceDialogClose = () => {
    setReferenceDialogOpen(false);
    setNewReference({ source: '', url: '' });
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
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
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
            <Box sx={{ mb: 2 }}>
              <Button
                variant="contained"
                onClick={handleAddPoc}
                startIcon={<AddIcon />}
              >
                Add POC
              </Button>
            </Box>
            <TableContainer component={Paper}>
              <Table aria-label="POCs table">
                <TableHead>
                  <TableRow>
                    <TableCell style={{ width: '50px' }} />
                    <TableCell style={{ width: '150px' }}>Source</TableCell>
                    <TableCell style={{ width: '300px' }}>URL</TableCell>
                    <TableCell>Description</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cve.pocs && cve.pocs.length > 0 ? (
                    cve.pocs.map((poc, index) => (
                      <PocRow key={index} poc={poc} />
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        No POCs available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
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
                onClick={handleAddSnortRule}
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
                onClick={handleAddReference}
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

      <Dialog open={pocDialogOpen} onClose={handlePocDialogClose}>
        <DialogTitle>Add New PoC</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              select
              fullWidth
              label="Source"
              value={newPoc.source}
              onChange={(e) => setNewPoc({ ...newPoc, source: e.target.value })}
              margin="normal"
            >
              {POC_SOURCE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              label="URL"
              value={newPoc.url}
              onChange={(e) => setNewPoc({ ...newPoc, url: e.target.value })}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Description"
              value={newPoc.description}
              onChange={(e) => setNewPoc({ ...newPoc, description: e.target.value })}
              margin="normal"
              multiline
              rows={4}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handlePocDialogClose}>Cancel</Button>
          <Button onClick={handlePocSubmit} variant="contained" color="primary">
            Add
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={snortRuleDialogOpen} onClose={handleSnortRuleDialogClose}>
        <DialogTitle>Add New Snort Rule</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              select
              fullWidth
              label="Type"
              value={newSnortRule.type}
              onChange={(e) => setNewSnortRule({ ...newSnortRule, type: e.target.value })}
              margin="normal"
            >
              {SNORT_RULE_TYPE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              label="Rule"
              value={newSnortRule.rule}
              onChange={(e) => setNewSnortRule({ ...newSnortRule, rule: e.target.value })}
              margin="normal"
              multiline
              rows={4}
            />
            <TextField
              fullWidth
              label="Description"
              value={newSnortRule.description}
              onChange={(e) => setNewSnortRule({ ...newSnortRule, description: e.target.value })}
              margin="normal"
              multiline
              rows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSnortRuleDialogClose}>Cancel</Button>
          <Button onClick={handleSnortRuleSubmit} variant="contained" color="primary">
            Add
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={referenceDialogOpen} onClose={handleReferenceDialogClose}>
        <DialogTitle>Add New Reference</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Source"
              value={newReference.source}
              onChange={(e) => setNewReference({ ...newReference, source: e.target.value })}
              margin="normal"
            />
            <TextField
              fullWidth
              label="URL"
              value={newReference.url}
              onChange={(e) => setNewReference({ ...newReference, url: e.target.value })}
              margin="normal"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleReferenceDialogClose}>Cancel</Button>
          <Button onClick={handleReferenceSubmit} variant="contained" color="primary">
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default CVEDetail;
