import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
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
  Tooltip,
  FormControl,
  InputLabel,
  Select
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
  Close as CloseIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';

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

const STATUS_OPTIONS = [
  { value: 'NEW', label: 'NEW' },
  { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
  { value: 'RESOLVED', label: 'RESOLVED' },
  { value: 'CLOSED', label: 'CLOSED' }
];

const getStatusColor = (status) => {
  switch (status) {
    case 'NEW':
      return 'default';
    case 'IN_PROGRESS':
      return 'primary';
    case 'RESOLVED':
      return 'success';
    case 'CLOSED':
      return 'error';
    default:
      return 'default';
  }
};

const CVEDetail = ({ open, onClose, cve: initialCve, onSave }) => {
  const [tabValue, setTabValue] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [editingComment, setEditingComment] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cve, setCve] = useState(initialCve); 
  const [pocDialogOpen, setPocDialogOpen] = useState(false);
  const [newPoc, setNewPoc] = useState({
    source: 'Etc',
    url: '',
    description: ''
  });
  const [snortRuleDialogOpen, setSnortRuleDialogOpen] = useState(false);
  const [editingSnortRule, setEditingSnortRule] = useState(null);
  const [editingSnortRuleIndex, setEditingSnortRuleIndex] = useState(null);
  const [newSnortRule, setNewSnortRule] = useState({
    type: 'USER_DEFINED',
    rule: '',
    description: ''
  });
  const [showCopyTooltip, setShowCopyTooltip] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPocId, setEditingPocId] = useState(null);
  const [editingPocData, setEditingPocData] = useState(null);
  const [newReferenceUrl, setNewReferenceUrl] = useState('');

  const POC_SOURCES = {
    Etc: { label: 'Etc', color: 'default' },
    Metasploit: { label: 'Metasploit', color: 'secondary' },
    'Nuclei-Templates': { label: 'Nuclei Templates', color: 'primary' }
  };

  const SNORT_RULE_TYPES = {
    USER_DEFINED: '사용자 정의',
    IPS: 'IPS',
    ONE: 'ONE',
    UTM: 'UTM',
    EMERGING_THREATS: 'Emerging Threats',
    SNORT_OFFICIAL: 'Snort Official'
  };

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
      console.log('Submitting PoC:', newPoc);
      const response = await axios.patch(`http://localhost:8000/api/cves/${cve.cveId}`, {
        pocs: [...(cve.pocs || []), newPoc]
      });
      
      if (response.status === 200) {
        setCve(response.data);
        setPocDialogOpen(false);
        setNewPoc({ source: 'Etc', url: '', description: '' });
      }
    } catch (error) {
      console.error('Failed to add PoC:', error);
    }
  };

  const handlePocDialogClose = () => {
    setPocDialogOpen(false);
    setNewPoc({ source: 'Etc', url: '', description: '' });
  };

  const handleAddSnortRule = () => {
    setSnortRuleDialogOpen(true);
  };

  const handleEditSnortRule = (rule, index) => {
    setEditingSnortRule(rule);
    setEditingSnortRuleIndex(index);
    setSnortRuleDialogOpen(true);
  };

  const handleCopySnortRule = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setShowCopyTooltip(true);
      setTimeout(() => setShowCopyTooltip(false), 1500);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const handleSnortRuleSubmit = async () => {
    try {
      const snortRuleData = editingSnortRule || newSnortRule;
      console.log('Submitting Snort Rule:', snortRuleData);

      const updatedSnortRules = [...(cve.snortRules || [])];
      if (editingSnortRuleIndex !== null) {
        updatedSnortRules[editingSnortRuleIndex] = snortRuleData;
      } else {
        updatedSnortRules.push(snortRuleData);
      }

      const response = await axios.patch(`http://localhost:8000/api/cves/${cve.cveId}`, {
        snortRules: updatedSnortRules
      });
      
      if (response.status === 200) {
        setCve(response.data);
        setSnortRuleDialogOpen(false);
        setNewSnortRule({ type: 'USER_DEFINED', rule: '', description: '' });
        setEditingSnortRule(null);
        setEditingSnortRuleIndex(null);
      }
    } catch (error) {
      console.error('Failed to submit Snort Rule:', error);
    }
  };

  const handleSnortRuleDialogClose = () => {
    setSnortRuleDialogOpen(false);
    setNewSnortRule({ type: 'USER_DEFINED', rule: '', description: '' });
    setEditingSnortRule(null);
    setEditingSnortRuleIndex(null);
  };

  const handleAddReference = async () => {
    try {
      // 새로운 reference 객체에 임시 ID 생성
      const newReference = {
        _id: new Date().getTime().toString(),  // 임시 ID로 타임스탬프 사용
        url: newReferenceUrl
      };
      console.log('Adding new reference:', newReference);  // 디버깅용 로그

      const response = await axios.patch(`http://localhost:8000/api/cves/${cve.cveId}`, {
        references: [...(cve.references || []), newReference]
      });
      
      if (response.status === 200) {
        const updatedCVE = response.data;
        console.log('Updated CVE references:', updatedCVE.references);  // 디버깅용 로그
        setCve(updatedCVE);
        if (onSave) {
          onSave(updatedCVE);
        }
        setNewReferenceUrl('');
      }
    } catch (error) {
      console.error('Error adding reference:', error);
    }
  };

  const handleDeleteReference = async (references) => {
    try {
      const response = await axios.patch(`http://localhost:8000/api/cves/${cve.cveId}`, {
        references
      });
      
      if (response.status === 200) {
        const updatedCVE = response.data;
        console.log('Updated CVE references:', updatedCVE.references);  // 디버깅용 로그
        setCve(updatedCVE);
        if (onSave) {
          onSave(updatedCVE);
        }
      }
    } catch (error) {
      console.error('Error deleting reference:', error);
    }
  };

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(url);
    setShowCopyTooltip(true);
    setTimeout(() => {
      setShowCopyTooltip(false);
    }, 1500);
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

  const handleDeletePoC = async (index) => {
    try {
      console.log('Deleting PoC at index:', index);
      console.log('Current PoCs:', cve.pocs);
      
      const updatedPoCs = [...cve.pocs];
      updatedPoCs.splice(index, 1);
      console.log('Updated PoCs after splice:', updatedPoCs);
      
      const response = await axios.patch(`http://localhost:8000/api/cves/${cve.cveId}`, {
        pocs: updatedPoCs
      });
      
      if (response.status === 200) {
        const updatedCVE = response.data;
        console.log('Updated CVE after PoC deletion:', updatedCVE);
        setCve(updatedCVE);
        if (onSave) {
          onSave(updatedCVE);
        }
      }
    } catch (error) {
      console.error('Error deleting PoC:', error);
    }
  };

  const handleDeleteSnortRule = async (index) => {
    try {
      console.log('Deleting Snort Rule at index:', index);
      console.log('Current Snort Rules:', cve.snortRules);
      
      const updatedSnortRules = [...cve.snortRules];
      updatedSnortRules.splice(index, 1);
      console.log('Updated Snort Rules after splice:', updatedSnortRules);
      
      const response = await axios.patch(`http://localhost:8000/api/cves/${cve.cveId}`, {
        snortRules: updatedSnortRules
      });
      
      if (response.status === 200) {
        const updatedCVE = response.data;
        console.log('Updated CVE after Snort Rule deletion:', updatedCVE);
        setCve(updatedCVE);
        if (onSave) {
          onSave(updatedCVE);
        }
      }
    } catch (error) {
      console.error('Error deleting Snort Rule:', error);
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

  const handleEditClick = () => {
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
  };

  const handleSaveEdit = async () => {
    try {
      const updatedData = {
        title: cve.title,
        description: cve.description,
        status: cve.status,
        notes: cve.notes,
        references: cve.references,
        pocs: cve.pocs,
        snortRules: cve.snortRules
      };
      
      // API 호출
      const response = await axios.put(`http://localhost:8000/api/cves/${cve.cveId}`, updatedData);
      
      setCve(response.data);
      setIsEditMode(false);
      if (onSave) {
        onSave(response.data);
      }
    } catch (error) {
      console.error('Failed to update CVE:', error);
      // 에러 처리
    }
  };

  const handleEditPoc = (poc) => {
    setEditingPocId(poc.id);
    setEditingPocData({ ...poc });
  };

  const handleSavePocEdit = async () => {
    try {
      const response = await axios.put(`http://localhost:8000/api/cves/${cve.cveId}/pocs/${editingPocId}`, editingPocData);
      if (response.status === 200) {
        setCve(response.data);
        setEditingPocId(null);
        setEditingPocData(null);
      }
    } catch (error) {
      console.error('Error updating POC:', error);
    }
  };

  const handleCancelPocEdit = () => {
    setEditingPocId(null);
    setEditingPocData(null);
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
    if (onSave) {
      onSave(cve);  // 현재 상태를 부모 컴포넌트에 전달
    }
  };

  if (!cve) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              {isEditMode ? 'Edit CVE: ' : 'CVE Details: '}{cve.cveId}
            </Typography>
            <Box>
              {!isEditMode ? (
                <IconButton onClick={handleEditClick} sx={{ mr: 1 }}>
                  <EditIcon />
                </IconButton>
              ) : null}
              <IconButton onClick={handleClose}>
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ width: '100%', mb: 3 }}>
            {isEditMode ? (
              <Grid container spacing={2}>
                <Grid item xs={12} md={8}>
                  <TextField
                    fullWidth
                    label="Title"
                    value={cve.title}
                    onChange={(e) => setCve(prev => ({ ...prev, title: e.target.value }))}
                    variant="outlined"
                    size="small"
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    fullWidth
                    label="Description"
                    value={cve.description}
                    onChange={(e) => setCve(prev => ({ ...prev, description: e.target.value }))}
                    multiline
                    rows={3}
                    variant="outlined"
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth variant="outlined" size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={cve.status}
                      onChange={(e) => setCve(prev => ({ ...prev, status: e.target.value }))}
                      label="Status"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            ) : (
              <Box sx={{ 
                display: 'flex', 
                gap: 3,
                p: 2,
                borderRadius: 1,
                bgcolor: 'background.paper',
                boxShadow: 1
              }}>
                <Box sx={{ flex: 2 }}>
                  <Box sx={{ mb: 2 }}>
                    <Typography 
                      variant="subtitle2" 
                      color="text.secondary"
                      sx={{ 
                        mb: 0.5,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        fontSize: '0.75rem'
                      }}
                    >
                      Title
                    </Typography>
                    <Typography 
                      variant="body1"
                      sx={{ 
                        fontWeight: 500,
                        color: 'text.primary'
                      }}
                    >
                      {cve.title}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography 
                      variant="subtitle2" 
                      color="text.secondary"
                      sx={{ 
                        mb: 0.5,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        fontSize: '0.75rem'
                      }}
                    >
                      Description
                    </Typography>
                    <Typography 
                      variant="body2"
                      sx={{ 
                        color: 'text.secondary',
                        lineHeight: 1.6
                      }}
                    >
                      {cve.description}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ 
                  flex: 0.5,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  borderLeft: '1px solid',
                  borderColor: 'divider',
                  pl: 3
                }}>
                  <Typography 
                    variant="subtitle2" 
                    color="text.secondary"
                    sx={{ 
                      mb: 0.5,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontSize: '0.75rem'
                    }}
                  >
                    Status
                  </Typography>
                  <Chip
                    label={cve.status}
                    color={getStatusColor(cve.status)}
                    size="small"
                    sx={{ mr: 1 }}
                  />
                </Box>
              </Box>
            )}
          </Box>
          <Box sx={{ width: '100%' }}>
            <Tabs 
              value={tabValue} 
              onChange={handleTabChange}
              sx={{
                borderBottom: 1,
                borderColor: 'divider'
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
                  background: 'linear-gradient(45deg, #4caf50 30%, #81c784 90%)',
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
                  background: 'linear-gradient(45deg, #ff9800 30%, #ffc107 90%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}
              />
            </Tabs>

            <TabPanel value={tabValue} index={0}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1" color="text.secondary">
                  {cve.pocs?.length || 0} POCs in total
                </Typography>
                <Button
                  variant="contained"
                  onClick={handleAddPoc}
                  startIcon={<AddIcon />}
                  sx={{
                    background: 'linear-gradient(45deg, #2196f3 30%, #21CBF3 90%)',
                    '&:hover': {
                      background: 'linear-gradient(45deg, #1976d2 30%, #21CBF3 90%)'
                    }
                  }}
                >
                  Add POC
                </Button>
              </Box>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Source</TableCell>
                      <TableCell>URL</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(cve.pocs || []).map((poc, index) => (
                      <TableRow key={`poc-${index}`}>
                        <TableCell>
                          <Chip
                            label={POC_SOURCES[poc.source]?.label || poc.source}
                            color={POC_SOURCES[poc.source]?.color || 'default'}
                            size="small"
                          />
                        </TableCell>
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
                        <TableCell sx={{ color: 'text.secondary' }}>
                          {poc.description}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton 
                            onClick={() => handleDeletePoC(index)}
                            color="error"
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </TabPanel>

            {/* Snort Rules Tab */}
            <TabPanel value={tabValue} index={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1" color="text.secondary">
                  {cve.snortRules?.length || 0} items in total
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleAddSnortRule}
                  sx={{
                    background: 'linear-gradient(45deg, #2196f3 30%, #21CBF3 90%)',
                    '&:hover': {
                      background: 'linear-gradient(45deg, #1976d2 30%, #21CBF3 90%)'
                    }
                  }}
                >
                  Add Rule
                </Button>
              </Box>
              <Grid container spacing={2}>
                {(cve.snortRules || []).map((rule, index) => (
                  <Grid item xs={12} key={`rule-${index}`}>
                    <Paper sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Box>
                          <Chip
                            label={SNORT_RULE_TYPES[rule.type] || rule.type}
                            color={rule.type === 'USER_DEFINED' ? 'secondary' : 'primary'}
                            size="small"
                            sx={{ mr: 1 }}
                          />
                          <Typography 
                            component="span" 
                            sx={{ 
                              color: 'text.secondary',
                              fontSize: '0.875rem'
                            }}
                          >
                            {rule.description}
                          </Typography>
                        </Box>
                        <Box>
                          <Tooltip title={showCopyTooltip ? "Copied!" : "Copy Rule"}>
                            <IconButton
                              size="small"
                              onClick={() => handleCopySnortRule(rule.rule)}
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
                          <IconButton
                            size="small"
                            onClick={() => handleEditSnortRule(rule, index)}
                            sx={{ 
                              color: '#2196f3',
                              '&:hover': {
                                backgroundColor: 'rgba(33, 150, 243, 0.1)'
                              }
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton 
                            size="small" 
                            color="error"
                            onClick={() => handleDeleteSnortRule(index)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      </Box>
                      <Box 
                        sx={{ 
                          backgroundColor: 'grey.100',
                          p: 1,
                          borderRadius: 1,
                          overflowX: 'auto',
                          fontFamily: 'monospace',
                          color: 'text.primary'
                        }}
                      >
                        {rule.rule}
                      </Box>
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
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    size="small"
                    placeholder="Enter URL"
                    value={newReferenceUrl}
                    onChange={(e) => setNewReferenceUrl(e.target.value)}
                  />
                  <Button
                    variant="contained"
                    onClick={handleAddReference}
                    disabled={!newReferenceUrl.trim()}
                    sx={{
                      background: 'linear-gradient(45deg, #2196f3 30%, #21CBF3 90%)',
                      '&:hover': {
                        background: 'linear-gradient(45deg, #1976d2 30%, #21CBF3 90%)'
                      }
                    }}
                  >
                    Add
                  </Button>
                </Box>
              </Box>
              <TableContainer component={Paper} sx={{ mt: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>URL</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(cve.references || []).map((reference, index) => (
                      <TableRow key={`ref-${index}`}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Link
                              href={reference.url}
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
                              {reference.url}
                            </Link>
                            <Tooltip 
                              title={showCopyTooltip ? "Copied!" : "Copy URL"} 
                              placement="top"
                            >
                              <IconButton
                                size="small"
                                onClick={() => handleCopyUrl(reference.url)}
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
                        <TableCell align="right">
                          <IconButton 
                            onClick={() => {
                              console.log('Delete reference:', reference);
                              const updatedReferences = [...cve.references];
                              updatedReferences.splice(index, 1);
                              handleDeleteReference(updatedReferences);
                            }} 
                            color="error"
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </TabPanel>
          </Box>
        </DialogContent>
        <DialogActions>
          {isEditMode ? (
            <>
              <Button onClick={handleCancelEdit}>Cancel</Button>
              <Button onClick={handleSaveEdit} variant="contained" color="primary">
                Save Changes
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Add PoC Dialog */}
      <Dialog open={pocDialogOpen} onClose={handlePocDialogClose}>
        <DialogTitle>Add PoC</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Source</InputLabel>
            <Select
              value={newPoc.source}
              onChange={(e) => setNewPoc({ ...newPoc, source: e.target.value })}
            >
              {Object.entries(POC_SOURCES).map(([value, { label }]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
          />
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
        <DialogTitle>
          {editingSnortRule ? 'Edit Snort Rule' : 'Add Snort Rule'}
        </DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={(editingSnortRule || newSnortRule).type}
              onChange={(e) => {
                if (editingSnortRule) {
                  setEditingSnortRule({ ...editingSnortRule, type: e.target.value });
                } else {
                  setNewSnortRule({ ...newSnortRule, type: e.target.value });
                }
              }}
            >
              {Object.entries(SNORT_RULE_TYPES).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Rule"
            value={(editingSnortRule || newSnortRule).rule}
            onChange={(e) => {
              if (editingSnortRule) {
                setEditingSnortRule({ ...editingSnortRule, rule: e.target.value });
              } else {
                setNewSnortRule({ ...newSnortRule, rule: e.target.value });
              }
            }}
            margin="normal"
            multiline
            rows={4}
          />
          <TextField
            fullWidth
            label="Description"
            value={(editingSnortRule || newSnortRule).description}
            onChange={(e) => {
              if (editingSnortRule) {
                setEditingSnortRule({ ...editingSnortRule, description: e.target.value });
              } else {
                setNewSnortRule({ ...newSnortRule, description: e.target.value });
              }
            }}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSnortRuleDialogClose}>Cancel</Button>
          <Button onClick={handleSnortRuleSubmit} variant="contained" color="primary">
            {editingSnortRule ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default CVEDetail;
