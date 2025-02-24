// CVEDetail.jsx
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useWebSocketContext, useWebSocketMessage } from '../../contexts/WebSocketContext';
import { WS_EVENT_TYPE } from '../../services/websocket';
import { cveService } from '../../api/services/cveService';
import { api } from '../../utils/auth';
import {
  Dialog,
  DialogContent,
  Card,
  CardContent,
  Grid,
  Typography,
  Box,
  Tabs,
  Tab,
  IconButton,
  Paper,
  Tooltip,
  Fade,
  CircularProgress,
  Button,
  AvatarGroup,
  Avatar
} from '@mui/material';
import {
  Close as CloseIcon,
  Circle as CircleIcon,
  Science as ScienceIcon,
  Shield as ShieldIcon,
  Link as LinkIcon,
  Comment as CommentIcon,
  History as HistoryIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import {
  fetchCVEDetail,
  updateCVEDetail,
  selectCVEDetail
} from '../../store/slices/cveSlice';
import TabPanel from './components/TabPanel';
import PoCTab from './components/PoCTab';
import SnortRulesTab from './components/SnortRulesTab';
import ReferencesTab from './components/ReferencesTab';
import CommentsTab from './components/CommentsTab';
import HistoryTab from './components/HistoryTab';
import InlineEditText from './components/InlineEditText';
import { useSnackbar } from 'notistack';
import PropTypes from 'prop-types';
import { useSubscription } from '../../hooks/useSubscription';

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
    case '분석중':      return '#2196f3';
    case '신규등록':    return '#ff9800';
    case '릴리즈 완료': return '#4caf50';
    case '분석불가':    return '#f44336';
    default:           return '#757575';
  }
};

const tabConfig = [
  { 
    label: 'PoC', 
    iconComponent: ScienceIcon,
    color: '#2196f3',
    hoverColor: '#1976d2',
    description: '증명 코드 및 취약점 검증'
  },
  { 
    label: 'Snort Rules', 
    iconComponent: ShieldIcon,
    color: '#4caf50',
    hoverColor: '#388e3c',
    description: '탐지 규칙 및 방어 정책'
  },
  { 
    label: 'References', 
    iconComponent: LinkIcon,
    color: '#ff9800',
    hoverColor: '#f57c00',
    description: '관련 문서 및 참고 자료'
  },
  { 
    label: 'Comments', 
    iconComponent: CommentIcon,
    color: '#9c27b0',
    hoverColor: '#7b1fa2',
    description: '토론 및 의견 공유'
  },
  { 
    label: 'History', 
    iconComponent: HistoryIcon,
    color: '#757575',
    hoverColor: '#757575',
    description: '수정 이력'
  }
];

const statusCardStyle = {
  p: 1.5,
  border: 1,
  borderColor: 'divider',
  borderRadius: 2,
  cursor: 'pointer',
  transition: 'all 0.2s',
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  minHeight: '60px',
  flex: 1,
  '&:hover': {
    bgcolor: 'action.hover',
    transform: 'translateY(-1px)'
  }
};

const SubscriberCount = memo(({ subscribers }) => (
  <Box 
    sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 1,
      bgcolor: 'action.hover',
      borderRadius: 2,
      py: 0.5,
      px: 1.5
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <VisibilityIcon 
        sx={{ 
          fontSize: 16, 
          color: 'text.secondary' 
        }} 
      />
      <Typography
        variant="body2"
        color="text.secondary"
      >
        {subscribers.length}명이 보는 중
      </Typography>
    </Box>
    <AvatarGroup
      max={5}
      sx={{
        '& .MuiAvatar-root': {
          width: 24,
          height: 24,
          fontSize: '0.75rem',
          border: '2px solid #fff',
          cursor: 'pointer',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            transform: 'scale(1.1)',
            zIndex: 1
          }
        }
      }}
    >
      {subscribers.map((subscriber) => (
        <Tooltip
          key={subscriber.id}
          title={subscriber.displayName || subscriber.username}
          placement="bottom"
          arrow
          enterDelay={200}
          leaveDelay={0}
        >
          <Avatar
            alt={subscriber.username}
            src={subscriber.profile_image}
            sx={{
              bgcolor: !subscriber.profile_image ? 
                `hsl(${subscriber.username.length * 30}, 70%, 50%)` : 
                undefined
            }}
          >
            {!subscriber.profile_image && 
              subscriber.username.charAt(0).toUpperCase()}
          </Avatar>
        </Tooltip>
      ))}
    </AvatarGroup>
  </Box>
));

const CVEDetail = ({ open = false, onClose = () => {}, cveId = null }) => {
  const dispatch = useDispatch();
  const cve = useSelector(selectCVEDetail);
  const currentUser = useSelector(state => state.auth.user);
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [activeCommentCount, setActiveCommentCount] = useState(0);
  
  // Description 영역 확장/축소 상태; true이면 전체보기 및 편집 모드 활성화
  const [descExpanded, setDescExpanded] = useState(false);

  const [refreshTriggers, setRefreshTriggers] = useState({
    poc: 0,
    snortRules: 0,
    references: 0,
    comments: 0
  });

  const [tabCounts, setTabCounts] = useState({
    poc: 0,
    snortRules: 0,
    references: 0,
    comments: 0
  });

  const [subscribers, setSubscribers] = useState([]);

  const { isSubscribed } = useSubscription({
    cveId,
    open,
    currentUser,
    onSubscribersChange: setSubscribers
  });

  const currentUserRef = useRef();

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const messageHandler = useCallback((message) => {
    if (!message || !message.type || !message.data) return;

    // 구독 관련 메시지 처리
    if (message.type === 'subscribe_cve' || message.type === 'unsubscribe_cve') {
      const { cveId: msgCveId, subscribers: subscriberDetails, username } = message.data;
      
      if (msgCveId === cveId) {
        // 구독자 정보 유효성 검사 및 업데이트
        if (Array.isArray(subscriberDetails)) {
          const validSubscribers = subscriberDetails.filter(sub => sub?.id && sub?.username);
          setSubscribers(validSubscribers);

          // 현재 사용자의 구독 상태 확인 및 업데이트
          const isCurrentUserSubscribed = validSubscribers.some(
            sub => sub.id === currentUserRef.current?.id
          );
          
          // 구독 상태가 실제로 변경될 때만 업데이트
          if (username && username !== currentUserRef.current?.username) {
            enqueueSnackbar(
              `${username}님이 ${message.type === 'subscribe_cve' ? '참여' : '퇴장'}했습니다.`,
              { variant: 'info' }
            );
          }
        }
      }
    }
  }, [cveId, enqueueSnackbar]);

  const { sendCustomMessage } = useWebSocketMessage(messageHandler);

  const handleFieldUpdate = useCallback(async (field, value, successMessage) => {
    try {
      const payload = { [field]: value };
      const response = await cveService.updateCVE(cveId, payload);
      if (response) {
        // 로컬 상태 업데이트
        dispatch(updateCVEDetail({ cveId, data: response }));
        
        // WebSocket 메시지 전송 (구독자들에게 알림)
        await sendCustomMessage(WS_EVENT_TYPE.CVE_UPDATED, { 
          cveId,
          field,
          value,
          updatedBy: currentUserRef.current?.username
        });

        enqueueSnackbar(successMessage, { variant: 'success' });
        
        // 전체 데이터 새로고침은 마지막에
        await dispatch(fetchCVEDetail(cveId));
      }
    } catch (error) {
      console.error(`Failed to update ${field}:`, error);
      enqueueSnackbar(error.message || `${field} 업데이트 중 오류가 발생했습니다.`, { variant: 'error' });
    }
  }, [cveId, dispatch, enqueueSnackbar, sendCustomMessage]);

  const handleTitleUpdate = useCallback(
    (newTitle) => handleFieldUpdate('title', newTitle, '제목이 업데이트되었습니다.'),
    [handleFieldUpdate]
  );

  const handleDescriptionUpdate = useCallback(
    (newDescription) => handleFieldUpdate('description', newDescription, '설명이 업데이트되었습니다.'),
    [handleFieldUpdate]
  );

  const handleStatusChange = useCallback(async (newStatus) => {
    try {
      setLoading(true);
      const response = await cveService.updateCVE(cveId, { status: newStatus });
      if (response) {
        dispatch(updateCVEDetail(response.data));
        await dispatch(fetchCVEDetail(cveId));
        await sendCustomMessage(WS_EVENT_TYPE.CVE_UPDATED, { cveId, cve: response.data });
        enqueueSnackbar('상태가 업데이트되었습니다.', { variant: 'success' });
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      enqueueSnackbar(error.message || '상태 업데이트 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [cveId, dispatch, enqueueSnackbar, sendCustomMessage]);

  const handleTabChange = useCallback((event, newValue) => {
    setTabValue(newValue);
  }, []);

  useEffect(() => {
    if (cve) {
      const newCounts = {
        poc: cve.pocs?.length || 0,
        snortRules: cve.snort_rules?.length || 0,
        references: cve.references?.length || 0,
        comments: countActiveComments(cve.comments)
      };
      if (JSON.stringify(newCounts) !== JSON.stringify(tabCounts)) {
        setTabCounts(newCounts);
      }
    }
  }, [cve, tabCounts]);

  const canEdit = useCallback(() => true, []);

  const getTabLabel = useCallback((tab, index) => {
    switch (index) {
      case 0: return `${tab.label} (${tabCounts.poc})`;
      case 1: return `${tab.label} (${tabCounts.snortRules})`;
      case 2: return `${tab.label} (${tabCounts.references})`;
      case 3: return `${tab.label} (${tabCounts.comments})`;
      default: return tab.label;
    }
  }, [tabCounts]);

  // CVE 데이터 로딩
  useEffect(() => {
    let isMounted = true;
    
    const fetchCVEDetails = async () => {
      if (!cveId || !open) return;
      
      try {
        setLoading(true);
        const result = await dispatch(fetchCVEDetail(cveId)).unwrap();
        
        if (isMounted && result) {
          setTabCounts({
            poc: result.pocs?.length || 0,
            snortRules: result.snortRules?.length || 0,
            references: result.references?.length || 0,
            comments: countActiveComments(result.comments)
          });
        }
      } catch (error) {
        if (isMounted) {
          console.error('Error fetching CVE details:', error);
          enqueueSnackbar('CVE 상세 정보를 불러오는데 실패했습니다.', { 
            variant: 'error' 
          });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchCVEDetails();

    return () => {
      isMounted = false;
    };
  }, [dispatch, cveId, open, enqueueSnackbar]);

  if (loading) {
    return <CircularProgress />;
  }
  if (!cve) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      TransitionComponent={Fade}
      PaperProps={{ sx: { borderRadius: 3, height: '90vh' } }} 
    >
      <DialogContent sx={{ p: 0, height: '100%' }}>
        <Card elevation={0} sx={{ height: '100%' }}>
          <CardContent sx={{ p: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <Box
              sx={{
                p: 2,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: 1,
                borderColor: 'divider'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="h6">CVE 상세 정보</Typography>
                
                {/* 구독자 정보 표시 */}
                {Array.isArray(subscribers) && subscribers.length > 0 && (
                  <SubscriberCount subscribers={subscribers} />
                )}
              </Box>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="새로고침">
                  <IconButton
                    onClick={() => {
                      dispatch(fetchCVEDetail(cveId)).then(() => {
                        enqueueSnackbar('데이터를 새로고침했습니다.', { variant: 'success' });
                      });
                    }}
                    size="small"
                    color="primary"
                    disabled={loading}
                  >
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="닫기">
                  <IconButton onClick={onClose} size="small">
                    <CloseIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {/* Main content 영역 */}
            <Box sx={{ p: 2, flex: '0 0 auto' }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={7}>
                  {/* Title 영역 */}
                  <Box mb={2}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Title
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 1, borderRadius: 1, mb: 2 }}>
                      <InlineEditText
                        value={cve.title}
                        onSave={handleTitleUpdate}
                        placeholder="제목을 입력하세요"
                        disabled={!canEdit()}
                        fontSize="0.9rem"
                      />
                    </Paper>
                  </Box>

                  {/* Description 영역 */}
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Description
                    </Typography>
                    <Box sx={{ position: 'relative' }}>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                          overflow: 'hidden',
                          transition: 'height 0.3s',
                          height: descExpanded ? '150px' : '60px'
                        }}
                      >
                        <InlineEditText
                          value={cve.description}
                          onSave={handleDescriptionUpdate}
                          placeholder="설명을 입력하세요..."
                          multiline
                          disabled={!canEdit()}
                          fontSize="0.9rem"
                          externalEdit={descExpanded}
                          onEditingStart={() => setDescExpanded(true)}
                          onEditingEnd={() => setDescExpanded(false)}
                        />
                      </Paper>
                      <Box sx={{ position: 'absolute', bottom: 4, right: 4 }}>
                        <IconButton
                          size="small"
                          onClick={() => setDescExpanded((prev) => !prev)}
                        >
                          {descExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </Box>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={12} md={5}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Status
                  </Typography>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: 1.5,
                      height: '150px'
                    }}
                  >
                    {Object.entries(STATUS_OPTIONS).map(([value, { label, description }]) => (
                      <Paper
                        key={value}
                        elevation={0}
                        sx={{
                          ...statusCardStyle,
                          bgcolor: value === cve.status ? 'action.selected' : 'background.paper',
                          borderColor: value === cve.status ? getStatusColor(value) : 'divider'
                        }}
                        onClick={() => canEdit() && handleStatusChange(value)}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, width: '100%' }}>
                          <CircleIcon sx={{ fontSize: 8, color: getStatusColor(value), flexShrink: 0, mt: 0.7 }} />
                          <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: value === cve.status ? 600 : 400, color: value === cve.status ? getStatusColor(value) : 'text.primary', lineHeight: 1.2 }}>
                              {label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem', mt: 0.5, lineHeight: 1.2 }}>
                              {description}
                            </Typography>
                          </Box>
                        </Box>
                      </Paper>
                    ))}
                  </Box>
                </Grid>
              </Grid>
            </Box>

            {/* 탭 영역 */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                          {React.createElement(tab.iconComponent, { sx: { fontSize: 20 } })}
                          <Typography>
                            {index < 4 ? `${tab.label} (${[tabCounts.poc, tabCounts.snortRules, tabCounts.references, tabCounts.comments][index]})` : tab.label}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
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
              <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'background.paper' }}>
                <TabPanel value={tabValue} index={0}>
                  <PoCTab cve={cve} currentUser={currentUser} refreshTrigger={refreshTriggers.poc} />
                </TabPanel>
                <TabPanel value={tabValue} index={1}>
                  <SnortRulesTab cve={cve} currentUser={currentUser} refreshTrigger={refreshTriggers.snortRules} />
                </TabPanel>
                <TabPanel value={tabValue} index={2}>
                  <ReferencesTab cve={cve} refreshTrigger={refreshTriggers.references} />
                </TabPanel>
                <TabPanel value={tabValue} index={3}>
                  <CommentsTab
                    cve={cve}
                    onUpdate={() => dispatch(fetchCVEDetail(cve.cveId))}
                    onCommentCountChange={setActiveCommentCount}
                    currentUser={currentUser}
                    refreshTrigger={refreshTriggers.comments}
                  />
                </TabPanel>
                <TabPanel value={tabValue} index={4}>
                  <HistoryTab 
                    modificationHistory={cve?.modificationHistory || []}
                  />
                </TabPanel>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
};

CVEDetail.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  cveId: PropTypes.string
};

export default CVEDetail;
