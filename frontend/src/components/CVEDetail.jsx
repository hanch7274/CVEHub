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
  TableCell,
  Tooltip
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
  Launch as LaunchIcon,
  BugReport as BugReportIcon,
  Security as SecurityIcon,
  Link as LinkIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import axios from 'axios';

const TabPanel = (props) => {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
      style={{ 
        backgroundColor: '#fff',
        borderRadius: '0 0 8px 8px',
        padding: '24px',
        minHeight: '300px'
      }}
    >
      {value === index && <Box>{children}</Box>}
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

const CVEDetail = ({ open, onClose, cve: initialCve }) => {
  const [tabValue, setTabValue] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [editingComment, setEditingComment] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cve, setCve] = useState(initialCve); 
  const [pocDialogOpen, setPocDialogOpen] = useState(false);
  const [newPoc, setNewPoc] = useState({
    source: 'ETC',  
    url: '',
    description: ''
  });
  const [snortRuleDialogOpen, setSnortRuleDialogOpen] = useState(false);
  const [newSnortRule, setNewSnortRule] = useState({
    type: 'USER_DEFINED',  
    rule: '',
    description: ''
  });
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
  const [newReference, setNewReference] = useState({
    source: '',
    url: ''
  });
  const [showCopyTooltip, setShowCopyTooltip] = useState(false);

  const POC_SOURCE_OPTIONS = [
    { value: 'ETC', label: 'ETC' },
    { value: 'Metasploit', label: 'Metasploit' },
    { value: 'Nuclei-Templates', label: 'Nuclei-Templates' }
  ];

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

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(url);
    setShowCopyTooltip(true);
    setTimeout(() => {
      setShowCopyTooltip(false);
    }, 1500);
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

  const tabStyle = {
    fontWeight: 'bold',
    fontSize: '0.95rem',
    minWidth: '120px',
    textTransform: 'none',
    '&.Mui-selected': {
      backgroundColor: '#fff',
      borderRadius: '8px 8px 0 0',
    }
  };

  if (!cve) {
    return null;
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { 
            borderRadius: '12px',
            bgcolor: '#f5f5f5'  
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">CVE Details: {cve.cveId}</Typography>
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ width: '100%' }}>
            <Tabs 
              value={tabValue} 
              onChange={handleTabChange}
              sx={{
                bgcolor: 'transparent',
                '& .MuiTabs-indicator': {
                  height: '3px',
                  borderRadius: '3px',
                  background: 'linear-gradient(45deg, #2196f3 30%, #21CBF3 90%)',
                },
                '& .MuiTab-root': {
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    opacity: 0.8
                  }
                }
              }}
            >
              <Tab 
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BugReportIcon sx={{ fontSize: 20 }} />
                    <span>POCs ({(cve.pocs || []).length})</span>
                  </Box>
                } 
                sx={{ 
                  ...tabStyle, 
                  background: 'linear-gradient(45deg, #2196f3 30%, #21CBF3 90%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}
              />
              <Tab 
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SecurityIcon sx={{ fontSize: 20 }} />
                    <span>Snort Rules ({(cve.snortRules || []).length})</span>
                  </Box>
                }
                sx={{ 
                  ...tabStyle, 
                  background: 'linear-gradient(45deg, #4caf50 30%, #8BC34A 90%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}
              />
              <Tab 
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LinkIcon sx={{ fontSize: 20 }} />
                    <span>References ({(cve.references || []).length})</span>
                  </Box>
                }
                sx={{ 
                  ...tabStyle, 
                  background: 'linear-gradient(45deg, #ff9800 30%, #FFC107 90%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}
              />
            </Tabs>

            <TabPanel value={tabValue} index={0}>
              <Box sx={{ mb: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleAddPoc}
                  startIcon={<AddIcon />}
                  sx={{
                    bgcolor: '#2196f3',
                    '&:hover': {
                      bgcolor: '#1976d2'
                    }
                  }}
                >
                  Add POC
                </Button>
              </Box>
              <TableContainer component={Paper} sx={{ boxShadow: 2, borderRadius: 2 }}>
                <Table aria-label="POCs table">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell style={{ width: '150px', fontWeight: 'bold' }}>Source</TableCell>
                      <TableCell style={{ width: '300px', fontWeight: 'bold' }}>URL</TableCell>
                      <TableCell style={{ fontWeight: 'bold' }}>Description</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cve.pocs && cve.pocs.length > 0 ? (
                      cve.pocs.map((poc, index) => (
                        <TableRow key={index} hover>
                          <TableCell>{poc.source}</TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Link
                                href={poc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{
                                  color: '#2196f3',
                                  textDecoration: 'none',
                                  '&:hover': {
                                    textDecoration: 'underline'
                                  }
                                }}
                              >
                                {poc.url}
                              </Link>
                              <Tooltip 
                                title={showCopyTooltip ? "Copied!" : "Copy URL"} 
                                placement="top"
                              >
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopyUrl(poc.url)}
                                  sx={{ 
                                    color: '#2196f3',
                                    '&:hover': {
                                      backgroundColor: 'rgba(33, 150, 243, 0.1)'
                                    }
                                  }}
                                >
                                  <ContentCopyIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {poc.description}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} align="center">
                          <Typography color="textSecondary">No POCs available</Typography>
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Add POC Dialog */}
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

      {/* Add Snort Rule Dialog */}
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

      {/* Add Reference Dialog */}
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
