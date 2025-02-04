import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import api from '../../api/config/axios';
import { useWebSocketContext, useWebSocketMessage } from '../../contexts/WebSocketContext';
import { WS_EVENT_TYPE } from '../../services/websocket';
import {
  Dialog,
  DialogContent,
  Card,
  CardHeader,
  CardContent,
  Grid,
  Typography,
  Box,
  Tabs,
  Tab,
  IconButton,
  Snackbar,
  Alert,
  Paper,
  Chip,
  Fade,
  TextField
} from '@mui/material';
import {
  Security as SecurityIcon,
  Close as CloseIcon,
  Circle as CircleIcon,
  Science as ScienceIcon,
  Shield as ShieldIcon,
  Link as LinkIcon,
  Comment as CommentIcon
} from '@mui/icons-material';
import {
  fetchCVEDetail,
  updateCVEDetail,
  selectCVEDetail,
  updateCVEFromWebSocket
} from '../../store/cveSlice';
import TabPanel from './components/TabPanel';
import PoCTab from './components/PoCTab';
import SnortRulesTab from './components/SnortRulesTab';
import ReferencesTab from './components/ReferencesTab';
import CommentsTab from './components/CommentsTab';
import InlineEditText from './components/InlineEditText';

// 활성화된 댓글 수를 계산하는 유틸리티 함수
const countActiveComments = (comments) => {
  if (!Array.isArray(comments)) return 0;
  
  return comments.reduce((count, comment) => {
    if (!comment) return count;
    const currentCount = (comment.is_deleted || comment.isDeleted) ? 0 : 1;
    const childCount = comment.children ? countActiveComments(comment.children) : 0;
    return count + currentCount + childCount;
  }, 0);
};

const STATUS_OPTIONS = {
  '신규등록': { label: '신규등록', description: '새로 등록된 CVE' },
  '분석중': { label: '분석중', description: '보안 전문가가 분석 진행중' },
  '릴리즈 완료': { label: '릴리즈 완료', description: '분석이 완료되어 릴리즈됨' },
  '분석불가': { label: '분석불가', description: '분석이 불가능한 상태' }
};

const getStatusColor = (status) => {
  switch (status) {
    case '분석중':
      return '#2196f3';  // 파란색
    case '신규등록':
      return '#ff9800';  // 주황색
    case '릴리즈 완료':
      return '#4caf50';  // 초록색
    case '분석불가':
      return '#f44336';  // 빨간색
    default:
      return '#757575';  // 회색
  }
};

// 탭 스타일 정의
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

const tabConfig = [
  { 
    label: 'PoC', 
    icon: <ScienceIcon />, 
    color: '#2196f3',
    hoverColor: '#1976d2',
    description: '증명 코드 및 취약점 검증'
  },
  { 
    label: 'Snort Rules', 
    icon: <ShieldIcon />, 
    color: '#4caf50',
    hoverColor: '#388e3c',
    description: '탐지 규칙 및 방어 정책'
  },
  { 
    label: 'References', 
    icon: <LinkIcon />, 
    color: '#ff9800',
    hoverColor: '#f57c00',
    description: '관련 문서 및 참고 자료'
  },
  { 
    label: 'Comments', 
    icon: <CommentIcon />, 
    color: '#9c27b0',
    hoverColor: '#7b1fa2',
    description: '토론 및 의견 공유'
  }
];

const CVEDetail = ({ open, onClose, cveId }) => {
  const dispatch = useDispatch();
  const cve = useSelector(state => selectCVEDetail(cveId)(state));
  const currentUser = useSelector(state => state.auth.user);
  const [tabValue, setTabValue] = useState(0);
  const [successMessage, setSuccessMessage] = useState(null);
  const { isConnected, lastMessage } = useWebSocketContext();
  const [activeCommentCount, setActiveCommentCount] = useState(0);
  const [titleEditMode, setTitleEditMode] = useState(false);
  const [descriptionEditMode, setDescriptionEditMode] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  const { sendCustomMessage } = useWebSocketMessage();

  // 사용자 권한 체크 함수 수정
  const canEdit = useCallback(() => {
    // Comment 탭이 아닌 경우 모든 사용자에게 편집 권한 부여
    return true;
  }, []);

  useEffect(() => {
    if (!cveId) return;
    dispatch(fetchCVEDetail(cveId));
  }, [dispatch, cveId]);

  useEffect(() => {
    if (cve) {
      setEditedTitle(cve.title || '');
      setEditedDescription(cve.description || '');
    }
  }, [cve]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleTitleChange = (value) => {
    setEditedTitle(value);
  };

  const handleDescriptionChange = (value) => {
    setEditedDescription(value);
  };

  const handleTitleSave = async (newTitle) => {
    try {
      await dispatch(updateCVEDetail({
        cveId,
        data: {
          title: newTitle || editedTitle
        }
      })).unwrap();
      setSuccessMessage('제목이 업데이트되었습니다.');
    } catch (error) {
      console.error('Failed to update title:', error);
      setSuccessMessage(null);
    }
  };

  const handleDescriptionSave = async (newDescription) => {
    try {
      await dispatch(updateCVEDetail({
        cveId,
        data: {
          description: newDescription || editedDescription
        }
      })).unwrap();
      setSuccessMessage('설명이 업데이트되었습니다.');
    } catch (error) {
      console.error('Failed to update description:', error);
      setSuccessMessage(null);
    }
  };

  const handleStatusChange = async (event) => {
    const newStatus = event.target.value;
    try {
      await dispatch(updateCVEDetail({
        cveId,
        data: {
          status: newStatus
        }
      })).unwrap();
      setSuccessMessage('상태가 업데이트되었습니다.');
    } catch (error) {
      console.error('Failed to update status:', error);
      setSuccessMessage(null);
    }
  };

  // CVE 구독 설정
  useEffect(() => {
    if (!cveId || !open) return;

    // CVE 상세 정보 구독
    sendCustomMessage(WS_EVENT_TYPE.CVE_SUBSCRIBE, { cveId });

    return () => {
      // 컴포넌트 언마운트 또는 cveId 변경 시 구독 해제
      sendCustomMessage(WS_EVENT_TYPE.CVE_UNSUBSCRIBE, { cveId });
    };
  }, [cveId, open, sendCustomMessage]);

  // WebSocket 메시지 핸들러
  const handleWebSocketMessage = useCallback((data) => {
    if (!cveId || !data.data) return;

    const { type, data: eventData } = data;
    
    switch (type) {
      case WS_EVENT_TYPE.CVE_UPDATED:
        if (eventData.cve && eventData.cve.cveId === cveId) {
          dispatch(updateCVEFromWebSocket(eventData.cve));
        }
        break;

      case WS_EVENT_TYPE.CVE_COMMENT_ADDED:
      case WS_EVENT_TYPE.CVE_COMMENT_UPDATED:
      case WS_EVENT_TYPE.CVE_COMMENT_DELETED:
        if (eventData.cveId === cveId) {
          // 댓글 수 업데이트
          setActiveCommentCount(eventData.activeCommentCount);
          // CVE 상세 정보 새로고침
          dispatch(fetchCVEDetail(cveId));
        }
        break;

      case WS_EVENT_TYPE.CVE_POC_ADDED:
      case WS_EVENT_TYPE.CVE_POC_UPDATED:
      case WS_EVENT_TYPE.CVE_POC_DELETED:
      case WS_EVENT_TYPE.CVE_SNORT_RULE_ADDED:
      case WS_EVENT_TYPE.CVE_SNORT_RULE_UPDATED:
      case WS_EVENT_TYPE.CVE_SNORT_RULE_DELETED:
      case WS_EVENT_TYPE.CVE_REFERENCE_ADDED:
      case WS_EVENT_TYPE.CVE_REFERENCE_DELETED:
        if (eventData.cveId === cveId) {
          // CVE 상세 정보 새로고침
          dispatch(fetchCVEDetail(cveId));
          // 성공 메시지 표시
          if (eventData.message) {
            setSuccessMessage(eventData.message);
          }
        }
        break;

      default:
        break;
    }
  }, [cveId, dispatch, setSuccessMessage]);

  // WebSocket 메시지 구독
  useEffect(() => {
    if (!lastMessage || !cveId || !open) return;
    handleWebSocketMessage(lastMessage);
  }, [lastMessage, cveId, open, handleWebSocketMessage]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  if (!cve) {
    return null;
  }

  return (
    <>
      <Dialog 
        open={open} 
        onClose={handleClose}
        maxWidth="lg" 
        fullWidth
        TransitionComponent={Fade}
        transitionDuration={300}
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            bgcolor: 'background.default',
            height: '90vh',
            display: 'flex',
            flexDirection: 'column'
          }
        }}
      >
        <Card 
          elevation={0} 
          sx={{ 
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden'
          }}
        >
          <CardHeader
            avatar={
              <SecurityIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            }
            title={
              <Typography variant="h5" fontWeight="600">
                {cveId}
              </Typography>
            }
            action={
              <IconButton onClick={handleClose} sx={{ color: 'text.secondary' }}>
                <CloseIcon />
              </IconButton>
            }
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'divider',
              flexShrink: 0
            }}
          />
          <CardContent 
            sx={{ 
              p: 0,
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <Grid 
              container 
              spacing={3} 
              sx={{ 
                p: 3, 
                flexShrink: 0
              }}
            >
              <Grid item xs={12} md={8}>
                <Box mb={3}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Title
                  </Typography>
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      p: 2, 
                      bgcolor: 'background.paper',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider'
                    }}
                  >
                    <InlineEditText
                      value={cve.title}
                      onSave={handleTitleSave}
                      placeholder="제목을 입력하세요"
                      disabled={!canEdit()}
                    />
                  </Paper>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Description
                  </Typography>
                  <Paper 
                    elevation={0}
                    sx={{ 
                      p: 2, 
                      bgcolor: 'background.paper',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider'
                    }}
                  >
                    <InlineEditText
                      value={cve.description}
                      onSave={handleDescriptionSave}
                      multiline
                      placeholder="설명을 입력하세요"
                      disabled={!canEdit()}
                    />
                  </Paper>
                </Box>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Status
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {Object.entries(STATUS_OPTIONS).map(([value, { label, description }]) => (
                    <Paper
                      key={value}
                      onClick={() => canEdit() && handleStatusChange({ target: { value } })}
                      sx={{
                        cursor: canEdit() ? 'pointer' : 'default',
                        p: 2,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: value === cve.status ? getStatusColor(value) : 'divider',
                        bgcolor: value === cve.status ? `${getStatusColor(value)}08` : 'background.paper',
                        transition: 'all 0.2s ease-in-out',
                        '&:hover': canEdit() ? {
                          bgcolor: `${getStatusColor(value)}12`,
                          transform: 'translateY(-2px)',
                          boxShadow: 1
                        } : {}
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <CircleIcon sx={{ fontSize: 12, color: getStatusColor(value) }} />
                        <Typography variant="subtitle1" sx={{ 
                          fontWeight: value === cve.status ? 600 : 400,
                          color: value === cve.status ? getStatusColor(value) : 'text.primary'
                        }}>
                          {label}
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {description}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              </Grid>
            </Grid>

            <Box 
              sx={{ 
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              <Tabs 
                value={tabValue} 
                onChange={handleTabChange}
                variant="fullWidth"
                sx={{
                  borderBottom: 1,
                  borderColor: 'divider',
                  bgcolor: 'background.paper'
                }}
              >
                {tabConfig.map((tab, index) => (
                  <Tab
                    key={tab.label}
                    label={
                      <Box sx={{ textAlign: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          {React.cloneElement(tab.icon, { 
                            sx: { 
                              fontSize: 20,
                              color: tabValue === index ? tab.color : 'inherit',
                              transition: 'color 0.3s'
                            } 
                          })}
                          <Typography>
                            {index === 3 ? `${tab.label} (${activeCommentCount})` : tab.label}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {tab.description}
                        </Typography>
                      </Box>
                    }
                    sx={{
                      minHeight: 72,
                      textTransform: 'none',
                      fontSize: '1rem',
                      fontWeight: 500,
                      color: tabValue === index ? tab.color : 'text.primary',
                      '&:hover': {
                        color: tab.hoverColor,
                        bgcolor: 'action.hover'
                      },
                      '&.Mui-selected': {
                        color: tab.color
                      }
                    }}
                  />
                ))}
              </Tabs>

              <Box 
                sx={{ 
                  flex: 1,
                  overflow: 'hidden',
                  bgcolor: 'background.paper'
                }}
              >
                <TabPanel value={tabValue} index={0}>
                  <PoCTab 
                    cve={cve}
                    setSuccessMessage={setSuccessMessage}
                    currentUser={currentUser}
                  />
                </TabPanel>

                <TabPanel value={tabValue} index={1}>
                  <SnortRulesTab 
                    cve={cve}
                    setSuccessMessage={setSuccessMessage}
                    currentUser={currentUser}
                  />
                </TabPanel>

                <TabPanel value={tabValue} index={2}>
                  <ReferencesTab 
                    cve={cve}
                    setSuccessMessage={setSuccessMessage}
                    currentUser={currentUser}
                  />
                </TabPanel>

                <TabPanel value={tabValue} index={3}>
                  <CommentsTab 
                    cve={cve}
                    onCommentCountChange={setActiveCommentCount}
                    currentUser={currentUser}
                  />
                </TabPanel>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Dialog>

      <Snackbar
        open={successMessage !== null}
        autoHideDuration={2000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        TransitionComponent={Fade}
      >
        <Alert
          onClose={() => setSuccessMessage(null)}
          severity="success"
          variant="filled"
          sx={{ borderRadius: 2 }}
        >
          {successMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default CVEDetail;