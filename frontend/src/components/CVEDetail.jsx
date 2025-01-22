import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { api } from '../utils/auth';
import useWebSocket from '../hooks/useWebSocket';
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
  Comment as CommentIcon,
  Circle as CircleIcon
} from '@mui/icons-material';
import CommentsTab from './CVEDetail/CommentsTab';

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
  { value: '신규등록', label: '신규등록' },
  { value: '분석중', label: '분석중' },
  { value: '릴리즈 완료', label: '릴리즈 완료' },
  { value: '분석불가', label: '분석불가' }
];

const getStatusColor = (status) => {
  switch (status) {
    case '분석중':
      return 'info';
    case '신규등록':
      return 'primary';
    case '릴리즈 완료':
      return 'success';
    case '분석불가':
      return 'error';
    default:
      return 'default';
  }
};

const CVEDetail = ({ open, onClose, cveId }) => {
  const [cve, setCve] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [pocDialogOpen, setPocDialogOpen] = useState(false);
  const [snortRuleDialogOpen, setSnortRuleDialogOpen] = useState(false);
  const [showCopyTooltip, setShowCopyTooltip] = useState(false);
  const [newReferenceUrl, setNewReferenceUrl] = useState('');
  const [newPoc, setNewPoc] = useState({
    source: 'Etc',
    url: '',
    description: ''
  });
  const [newSnortRule, setNewSnortRule] = useState({
    type: 'USER_DEFINED',
    rule: '',
    description: ''
  });
  const [editingSnortRule, setEditingSnortRule] = useState(null);
  const [editingSnortRuleIndex, setEditingSnortRuleIndex] = useState(null);
  const [activeComments, setActiveComments] = useState([]);
  const [editingPocId, setEditingPocId] = useState(null);
  const [editingPocData, setEditingPocData] = useState(null);
  const [loading, setLoading] = useState(false);
  const commentListRef = useRef(null);
  const [activeCommentCount, setActiveCommentCount] = useState(0);
  const dispatch = useDispatch();

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
    console.log('CVE 상세 데이터:', cve);
    if (Array.isArray(cve?.comments)) {
      console.log('전체 댓글 수:', cve.comments.length);
      console.log('활성화된 댓글 수:', countActiveComments(cve.comments));
    }
  }, [cve]);

  useEffect(() => {
    const loadInitialComments = async () => {
      if (!cve?.cveId) return;
      
      try {
        const response = await api.get(`/cves/${cve.cveId}/comments`);
        const comments = response.data;
        
        if (comments && Array.isArray(comments)) {
          const activeComments = comments.filter(comment => !comment.is_deleted);
          setActiveComments(activeComments);
        }
      } catch (err) {
        console.error('Failed to load initial comments:', err);
      }
    };

    loadInitialComments();
  }, [cve?.cveId]);

  useEffect(() => {
    if (!open) {
      setTabValue(0);
    }
  }, [open]);

  useEffect(() => {
    const loadCVEData = async () => {
      if (!cveId) {
        console.log('CVE ID가 없음');
        return;
      }
      
      console.log('CVE 데이터 로드 시작:', cveId);
      
      try {
        setLoading(true);
        const response = await api.get(`/cves/${cveId}`);
        console.log('CVE 데이터 로드 완료:', response.data);
        setCve(response.data);
      } catch (error) {
        console.error('CVE 데이터 로드 중 오류:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCVEData();
  }, [cveId]);

  useEffect(() => {
    if (cveId) {
      setCve(null);
    }
  }, [cveId]);

  const updateCVEState = (updatedCVE) => {
    setCve(updatedCVE);
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleAddPoc = async () => {
    setPocDialogOpen(true);
  };

  const handlePocSubmit = async () => {
    try {
      const response = await api.patch(`/cves/${cve.cveId}`, {
        pocs: [...(cve.pocs || []), newPoc]
      });
      
      updateCVEState(response.data);
      setPocDialogOpen(false);
      setNewPoc({ source: 'Etc', url: '', description: '' });
    } catch (error) {
      console.error('Failed to add PoC:', error);
      alert(error.response?.data?.detail || 'PoC 추가 중 오류가 발생했습니다.');
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

      const response = await api.patch(`/cves/${cve.cveId}`, {
        snortRules: updatedSnortRules
      });
      
      updateCVEState(response.data);
      setSnortRuleDialogOpen(false);
      setNewSnortRule({ type: 'USER_DEFINED', rule: '', description: '' });
      setEditingSnortRule(null);
      setEditingSnortRuleIndex(null);
    } catch (error) {
      console.error('Failed to submit Snort Rule:', error);
      alert(error.response?.data?.detail || 'Snort 규칙 추가 중 오류가 발생했습니다.');
    }
  };

  const handleSnortRuleDialogClose = () => {
    setSnortRuleDialogOpen(false);
    setNewSnortRule({ type: 'USER_DEFINED', rule: '', description: '' });
    setEditingSnortRule(null);
    setEditingSnortRuleIndex(null);
  };

  const handleAddReference = async () => {
    if (!newReferenceUrl.trim()) return;

    try {
      const response = await api.patch(`/cves/${cve.cveId}`, {
        references: [...(cve.references || []), { url: newReferenceUrl }]
      });

      updateCVEState(response.data);
      setNewReferenceUrl('');
    } catch (error) {
      console.error('Failed to add reference:', error);
      alert(error.response?.data?.detail || '참조 URL 추가 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteReference = async (index) => {
    try {
      const updatedReferences = cve.references.filter((_, i) => i !== index);
      setCve(prevCve => ({
        ...prevCve,
        references: updatedReferences
      }));

      const response = await api.patch(`/cves/${cve.cveId}`, {
        references: updatedReferences
      });
      
      if (response.status === 200) {
        const updatedCVE = response.data;
        console.log('Updated CVE references:', updatedCVE.references);
        updateCVEState(updatedCVE);
      }
    } catch (error) {
      console.error('Error deleting reference:', error);
      setCve(prevCve => ({
        ...prevCve,
        references: [...prevCve.references]
      }));
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
    // TODO: 댓글 추가 로직 구현
  };

  const handleCommentEdit = async (index, content) => {
    // TODO: 댓글 수정 로직 구현
  };

  const handleCommentDelete = async (index) => {
    // TODO: 댓글 삭제 로직 구현
  };

  const handleDeletePoC = async (index) => {
    try {
      const updatedPoCs = cve.pocs.filter((_, i) => i !== index);
      setCve(prevCve => ({
        ...prevCve,
        pocs: updatedPoCs
      }));
      
      const response = await api.patch(`/cves/${cve.cveId}`, {
        pocs: updatedPoCs
      });
      
      if (response.status === 200) {
        const updatedCVE = response.data;
        updateCVEState(updatedCVE);
      }
    } catch (error) {
      console.error('Error deleting PoC:', error);
      setCve(prevCve => ({
        ...prevCve,
        pocs: [...prevCve.pocs]
      }));
    }
  };

  const handleDeleteSnortRule = async (index) => {
    try {
      const updatedSnortRules = cve.snortRules.filter((_, i) => i !== index);
      setCve(prevCve => ({
        ...prevCve,
        snortRules: updatedSnortRules
      }));

      const response = await api.patch(`/cves/${cve.cveId}`, {
        snortRules: updatedSnortRules
      });
      
      if (response.status === 200) {
        const updatedCVE = response.data;
        console.log('Updated CVE after Snort Rule deletion:', updatedCVE);
        updateCVEState(updatedCVE);
      }
    } catch (error) {
      console.error('Error deleting Snort Rule:', error);
      setCve(prevCve => ({
        ...prevCve,
        snortRules: [...prevCve.snortRules]
      }));
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
        snort_rules: cve.snortRules
      };
      
      const response = await api.patch(`/cves/${cve.cveId}`, updatedData);
      
      setCve(response.data);
      setIsEditMode(false);
    } catch (error) {
      console.error('Failed to update CVE:', error);
      alert(error.response?.data?.detail || 'CVE 정보 수정 중 오류가 발생했습니다.');
    }
  };

  const handleEditPoc = (poc) => {
    setEditingPocId(poc.id);
    setEditingPocData({ ...poc });
  };

  const handleSavePocEdit = async () => {
    try {
      const response = await api.put(`/cves/${cve.cveId}/pocs/${editingPocId}`, editingPocData);
      if (response.status === 200) {
        setCve(response.data);
        setEditingPocId(null);
        setEditingPocData(null);
      }
    } catch (error) {
      console.error('Error updating POC:', error);
      alert(error.response?.data?.detail || 'POC 수정 중 오류가 발생했습니다.');
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
  };

  const handleCommentsUpdate = (comments) => {
    setActiveComments(comments);
  };

  const countActiveComments = (comments) => {
    if (!Array.isArray(comments)) return 0;
    
    return comments.reduce((count, comment) => {
      if (!comment) return count;
      // 삭제되지 않은 댓글만 카운트 (is_deleted 또는 isDeleted 체크)
      const currentCount = (comment.is_deleted || comment.isDeleted) ? 0 : 1;
      // 대댓글이 있다면 재귀적으로 카운트
      const childCount = comment.children ? countActiveComments(comment.children) : 0;
      return count + currentCount + childCount;
    }, 0);
  };

  // WebSocket 메시지 핸들러
  const handleWebSocketMessage = useCallback((data) => {
    if (data.type === 'comment_update' && data.data.cveId === cveId) {
      setActiveCommentCount(data.data.activeCommentCount);
    }
  }, [cveId]);

  // WebSocket 연결 설정
  useWebSocket(handleWebSocketMessage);

  // 초기 댓글 수 설정
  useEffect(() => {
    const fetchCommentCount = async () => {
      try {
        const response = await api.get(`/cves/${cveId}/comments/count`);
        setActiveCommentCount(response.data.count);
      } catch (error) {
        console.error('Failed to fetch comment count:', error);
      }
    };

    if (cveId) {
      fetchCommentCount();
    }
  }, [cveId]);

  if (!cve) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ 
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'primary.main',
          color: 'white',
          mb: 2
        }}>
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center'
          }}>
            <Typography variant="h5" sx={{ 
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}>
              <SecurityIcon />
              {isEditMode ? 'Edit CVE: ' : 'CVE Details: '}{cve.cveId}
            </Typography>
            <Box>
              {!isEditMode ? (
                <IconButton 
                  onClick={handleEditClick} 
                  sx={{ 
                    mr: 1,
                    color: 'white',
                    '&:hover': { bgcolor: 'primary.dark' }
                  }}
                >
                  <EditIcon />
                </IconButton>
              ) : null}
              <IconButton 
                onClick={handleClose}
                sx={{ 
                  color: 'white',
                  '&:hover': { bgcolor: 'primary.dark' }
                }}
              >
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent>
          <Box sx={{ width: '100%', mb: 3 }}>
            {isEditMode ? (
              <Grid container spacing={3}>
                <Grid item xs={12} md={8}>
                  <Paper elevation={0} variant="outlined" sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2, color: 'primary.main', fontWeight: 600 }}>
                      기본 정보
                    </Typography>
                    <TextField
                      fullWidth
                      label="Title"
                      value={cve.title}
                      onChange={(e) => setCve(prev => ({ ...prev, title: e.target.value }))}
                      variant="outlined"
                      size="medium"
                      sx={{ mb: 3 }}
                    />
                    <TextField
                      fullWidth
                      label="Description"
                      value={cve.description}
                      onChange={(e) => setCve(prev => ({ ...prev, description: e.target.value }))}
                      multiline
                      rows={6}
                      variant="outlined"
                      size="medium"
                    />
                  </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2, color: 'primary.main', fontWeight: 600 }}>
                      상태
                    </Typography>
                    <FormControl fullWidth variant="outlined" size="medium">
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
                  </Paper>
                </Grid>
              </Grid>
            ) : (
              <Paper elevation={0} variant="outlined" sx={{ p: 3, mb: 3 }}>
                <Box sx={{ 
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3
                }}>
                  <Box>
                    <Typography variant="h6" sx={{ mb: 2, color: 'primary.main', fontWeight: 600 }}>
                      기본 정보
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={8}>
                        <Box sx={{ mb: 3 }}>
                          <Typography 
                            variant="subtitle2" 
                            color="text.secondary"
                            sx={{ 
                              mb: 1,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              fontSize: '0.875rem'
                            }}
                          >
                            Title
                          </Typography>
                          <Typography 
                            variant="h6"
                            sx={{ 
                              fontWeight: 500,
                              color: 'text.primary',
                              lineHeight: 1.4,
                              p: 1.5,
                              bgcolor: 'grey.50',
                              borderRadius: 1
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
                              mb: 1,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              fontSize: '0.875rem'
                            }}
                          >
                            Description
                          </Typography>
                          <Typography 
                            variant="body1"
                            sx={{ 
                              color: 'text.secondary',
                              lineHeight: 1.8,
                              whiteSpace: 'pre-wrap',
                              p: 1.5,
                              bgcolor: 'grey.50',
                              borderRadius: 1
                            }}
                          >
                            {cve.description}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <Typography 
                          variant="subtitle2" 
                          color="text.secondary"
                          sx={{ 
                            mb: 1,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            fontSize: '0.875rem'
                          }}
                        >
                          Status
                        </Typography>
                        <Box sx={{ 
                          p: 1.5, 
                          bgcolor: 'grey.50',
                          borderRadius: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1
                        }}>
                          <CircleIcon sx={{ 
                            fontSize: 12, 
                            color: getStatusColor(cve.status)
                          }} />
                          <Typography variant="body1" sx={{ color: 'text.primary' }}>
                            {cve.status}
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </Box>
                </Box>
              </Paper>
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
              <Tab 
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CommentIcon sx={{ fontSize: 20 }} />
                    <span>Comments ({activeCommentCount})</span>
                  </Box>
                }
                sx={{ 
                  ...tabStyle,
                  background: 'linear-gradient(45deg, #9C27B0 30%, #CE93D8 90%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}
              />
            </Tabs>

            <TabPanel value={tabValue} index={0}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ fontSize: '1.4rem' }}>
                  {cve.pocs?.length || 0} POCs in total
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setPocDialogOpen(true)}
                >
                  Add PoC
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
                          <Typography variant="body1" sx={{ fontSize: '1.1rem' }}>
                            {poc.description}
                          </Typography>
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

            <TabPanel value={tabValue} index={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ fontSize: '1.4rem' }}>
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
                              fontSize: '1.1rem'
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

            <TabPanel value={tabValue} index={2}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ fontSize: '1.4rem' }}>
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
                            onClick={() => handleDeleteReference(index)} 
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

            <TabPanel value={tabValue} index={3}>
              <CommentsTab cve={cve} onCommentsUpdate={handleCommentsUpdate} />
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
