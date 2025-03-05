// CVEDetail.jsx
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useWebSocketContext } from '../../contexts/WebSocketContext';
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
  AvatarGroup,
  Avatar,
  Chip,
  DialogTitle
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
  selectCVEDetail,
  setCVEDetail
} from '../../store/slices/cveSlice';
import TabPanel from './components/TabPanel';
import GenericDataTab from './components/GenericDataTab';
import { pocTabConfig, snortRulesTabConfig, referencesTabConfig } from './components/tabConfigs';
import CommentsTab from './components/CommentsTab';
import HistoryTab from './components/HistoryTab';
import InlineEditText from './components/InlineEditText';
import { useSnackbar } from 'notistack';
import PropTypes from 'prop-types';
import { useSubscription } from '../../hooks/useSubscription';
import { useCVEWebSocketUpdate } from '../../contexts/WebSocketContext';

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
      <Typography variant="body2" color="text.secondary">
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
            {!subscriber.profile_image && subscriber.username.charAt(0).toUpperCase()}
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
  
  // WebSocket context는 최상위에서 호출
  const { isConnected, isReady, invalidateCVECache: wsInvalidateCache } = useWebSocketContext();
  
  // invalidateCVECache를 useCallback으로 래핑하여 고정된 참조를 유지
  const invalidateCVECache = useCallback(
    (id) => {
      if (wsInvalidateCache) {
        console.log(`[CVEDetail] 캐시 무효화 요청: ${id}`);
        wsInvalidateCache(id);
      } else {
        console.warn('[CVEDetail] WebSocket 캐시 무효화 함수를 사용할 수 없습니다');
      }
    },
    [wsInvalidateCache]
  );
  
  // 모달이 처음 열릴 때에만 true로 설정해서 로딩 인디케이터가 나타나게 함
  const [loading, setLoading] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  
  // open이 변경될 때마다 로딩 상태를 초기화
  useEffect(() => {
    if (open) {
      console.log(`[CVEDetail] 모달 열림, cveId: ${cveId}, WebSocket 상태: 연결=${isConnected}, 준비=${isReady}`);
      setLoading(true);
      
      // WebSocket 연결 상태 확인
      if (!isConnected || !isReady) {
        console.warn('[CVEDetail] WebSocket이 연결되지 않았거나 준비되지 않았습니다.');
        enqueueSnackbar('서버 연결 상태를 확인해주세요.', { 
          variant: 'warning',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
        });
      }
      
      // 캐시 확인 및 데이터 로드
      if (cve && cve._cachedAt) {
        console.log(`[CVEDetail] 캐시된 데이터 사용: ${cveId}`);
        setLoading(false);
      } else {
        console.log(`[CVEDetail] 데이터 로드 시작: ${cveId}`);
        dispatch(fetchCVEDetail(cveId))
          .unwrap()
          .then(() => {
            setLoading(false);
          })
          .catch((error) => {
            setLoading(false);
            console.error('CVEDetail: Error loading data:', error);
            enqueueSnackbar('데이터 로딩 실패', { variant: 'error' });
          });
      }
    }
  }, [open, cveId, isConnected, isReady]);
  
  // Cache 상태 관리
  const [isCached, setIsCached] = useState(false);
  const cacheState = useSelector(state => state.cve.cveCache[cveId]);
  
  const timeAgo = useCallback((timestamp) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}초`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간`;
    return `${Math.floor(seconds / 86400)}일`;
  }, []);
  
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
  
  const currentUserRef = useRef();
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  
  const handleRefreshTrigger = useCallback((field) => {
    if (!field) {
      setRefreshTriggers(prev => ({
        poc: prev.poc + 1,
        snortRules: prev.snortRules + 1,
        references: prev.references + 1,
        comments: prev.comments + 1
      }));
      return;
    }
    setRefreshTriggers(prev => {
      const updates = {};
      if (field === 'poc' || field === 'poc_list' || field === 'poc_files') {
        updates.poc = prev.poc + 1;
      } else if (field === 'snort_rules') {
        updates.snortRules = prev.snortRules + 1;
      } else if (field === 'references' || field === 'reference_list') {
        updates.references = prev.references + 1;
      } else if (field === 'comments' || field === 'comment_list') {
        updates.comments = prev.comments + 1;
      } else {
        return {
          poc: prev.poc + 1,
          snortRules: prev.snortRules + 1,
          references: prev.references + 1,
          comments: prev.comments + 1
        };
      }
      return { ...prev, ...updates };
    });
  }, []);
  
  const handleSubscribersChange = useCallback((newSubscribers) => {
    if (Array.isArray(newSubscribers)) {
      setSubscribers(newSubscribers);
    }
  }, []);
  
  const handleUpdateReceived = useCallback((data) => {
    if (data.field) {
      handleRefreshTrigger(data.field);
    }
  }, [handleRefreshTrigger]);
  
  // useSubscription에서 반환된 unsubscribe는 사용하지 않더라도 반환만 받아둠
  const { unsubscribe } = useSubscription(
    cveId,
    handleUpdateReceived,
    handleSubscribersChange
  );

  // 웹소켓을 통해 메시지를 보낼 수 있는 함수를 가져옵니다.
  // 이 함수는 자식 컴포넌트에 props로 전달하여 중앙에서 관리되는 구독을 통해 메시지를 보낼 수 있게 합니다.
  const { sendCustomMessage } = useCVEWebSocketUpdate(
    cveId,
    handleUpdateReceived,
    handleRefreshTrigger,
    handleSubscribersChange
  );

  // 이 함수를 각 탭 컴포넌트에 전달하여 중복 구독을 방지합니다
  const sendMessage = useCallback(async (type, data) => {
    try {
      console.log(`[CVEDetail] 자식 컴포넌트로부터 메시지 전송 요청: ${type}`);
      return await sendCustomMessage(type, data);
    } catch (error) {
      console.error(`[CVEDetail] 메시지 전송 오류: ${type}`, error);
      enqueueSnackbar('메시지 전송 실패', { variant: 'error' });
      throw error;
    }
  }, [sendCustomMessage, enqueueSnackbar]);
  
  // cveId가 변경될 때마다 상태를 초기화하는 로직
  useEffect(() => {
    if (cveId) {
      setIsCached(false);
    }
  }, [cveId]);
  
  // 데이터 로딩 로직
  const fetchData = useCallback(async () => {
    if (!cveId || !open) {
      console.log(`[CVEDetail] 데이터 로드 건너뜀: cveId=${cveId}, open=${open}`);
      return;
    }

    if (!isReady) {
      console.log(`[CVEDetail] WebSocket 준비되지 않음, 데이터 로드 대기: isReady=${isReady}`);
      return;
    }

    try {
      console.log(`[CVEDetail] 데이터 로드 시작: cveId=${cveId}, cached=${!!cacheState}`);
      setLoading(true);
      
      // 빈 문자열이면 무시
      if (cveId === '') {
        console.log('CVEDetail: Empty cveId, skipping data load');
        return;
      }
      
      console.log('CVEDetail: Loading data for CVE:', cveId, 'open:', open, 'bypassCheck:', window.bypassWebSocketCheck);
      
      // bypassWebSocketCheck가 활성화된 경우 로딩 검사를 건너뛰기
      if (window.bypassWebSocketCheck) {
        console.log('CVEDetail: Bypassing WebSocket check for data loading');
        if (loading) setLoading(false);
      } else {
        setLoading(true);
      }
      
      dispatch(fetchCVEDetail(cveId))
        .unwrap()
        .then(() => {
          setLoading(false);
          if (cacheState && cacheState._cachedAt) {
            setIsCached(true);
          } else {
            setIsCached(false);
          }
          console.log('CVEDetail: Data loaded successfully for CVE:', cveId);
        })
        .catch((error) => {
          setLoading(false);
          console.error('CVEDetail: Error loading data:', error);
          enqueueSnackbar('데이터 로딩 실패', { variant: 'error' });
        });
    } catch (error) {
      setLoading(false);
      console.error('CVEDetail: Error loading data:', error);
      enqueueSnackbar('데이터 로딩 실패', { variant: 'error' });
    }
  }, [dispatch, cveId, open, enqueueSnackbar]);
  
  // cacheState 변경 감지용 별도 effect
  useEffect(() => {
    if (cacheState && cacheState._cachedAt) {
      setIsCached(true);
    }
  }, [cacheState]);
  
  const handleTabChange = useCallback((event, newValue) => {
    setTabValue(newValue);
  }, []);
  
  useEffect(() => {
    if (cve) {
      const newCounts = {
        poc: cve.pocs?.length || 0,
        snortRules: cve.snortRules?.length || 0,
        references: cve.references?.length || 0,
        comments: countActiveComments(cve.comments)
      };
      if (JSON.stringify(newCounts) !== JSON.stringify(tabCounts)) {
        setTabCounts(newCounts);
      }
    }
  }, [cve, tabCounts]);
  
  const canEdit = useCallback(() => true, []);
  
  const handleRefresh = useCallback(() => {
    if (cveId) {
      setLoading(true);
      invalidateCVECache(cveId);
      dispatch(fetchCVEDetail(cveId))
        .unwrap()
        .then(() => {
          setLoading(false);
          setIsCached(false);
          setRefreshTriggers(prev => ({
            poc: prev.poc + 1,
            snortRules: prev.snortRules + 1,
            references: prev.references + 1,
            comments: prev.comments + 1
          }));
          enqueueSnackbar('최신 데이터로 업데이트되었습니다', { variant: 'success' });
        })
        .catch((error) => {
          setLoading(false);
          enqueueSnackbar('데이터 새로고침 실패', { variant: 'error' });
        });
    }
  }, [cveId, dispatch, enqueueSnackbar, invalidateCVECache]);
  
  // InlineEditText를 이용한 제목 및 설명 업데이트
  const handleTitleUpdate = useCallback(async (newTitle) => {
    if (!cve || !cve.cveId || newTitle === cve.title) return;
    try {
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { title: newTitle }
      })).unwrap();
      dispatch(setCVEDetail({
        ...cve,
        title: newTitle,
        lastModifiedDate: new Date().toISOString()
      }));
      enqueueSnackbar('제목이 업데이트되었습니다', { variant: 'success' });
      return response;
    } catch (error) {
      enqueueSnackbar('제목 업데이트에 실패했습니다', { variant: 'error' });
      throw error;
    }
  }, [cve, dispatch, enqueueSnackbar]);
  
  const handleDescriptionUpdate = useCallback(async (newDescription) => {
    if (!cve || !cve.cveId || newDescription === cve.description) return;
    try {
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { description: newDescription }
      })).unwrap();
      dispatch(setCVEDetail({
        ...cve,
        description: newDescription,
        lastModifiedDate: new Date().toISOString()
      }));
      enqueueSnackbar('설명이 업데이트되었습니다', { variant: 'success' });
      return response;
    } catch (error) {
      enqueueSnackbar('설명 업데이트에 실패했습니다', { variant: 'error' });
      throw error;
    }
  }, [cve, dispatch, enqueueSnackbar]);
  
  const handleStatusUpdate = useCallback(async (newStatus) => {
    if (!cve || !cve.cveId || newStatus === cve.status) return;
    try {
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { status: newStatus }
      })).unwrap();
      invalidateCVECache(cve.cveId);
      dispatch(setCVEDetail({
        ...cve,
        status: newStatus,
        lastModifiedDate: new Date().toISOString()
      }));
      enqueueSnackbar('상태가 업데이트되었습니다', { variant: 'success' });
      return response;
    } catch (error) {
      enqueueSnackbar('상태 업데이트에 실패했습니다', { variant: 'error' });
      throw error;
    }
  }, [cve, dispatch, enqueueSnackbar, invalidateCVECache]);
  
  useEffect(() => {
    console.log(`[CVEDetail] WebSocket 상태 변경: isReady=${isReady}`);
  }, [isReady]);
  
  // 데이터 로딩 로직
  useEffect(() => {
    if (open && cveId) {
      console.log(`[CVEDetail] 데이터 로딩 useEffect 실행: cveId=${cveId}, isReady=${isReady}`);
      fetchData();
    }
  }, [open, cveId, isReady, fetchData]);
  
  if (loading) {
    return <CircularProgress />;
  }
  if (!cve) return null;
  
  console.log('CVEDetail: Rendering dialog with props:', { open, cveId });
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      TransitionComponent={Fade}
      PaperProps={{ 
        sx: { 
          borderRadius: 3, 
          height: '90vh',
          zIndex: 1500 
        } 
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h6">{cve.cveId} 상세 정보</Typography>
            {Array.isArray(subscribers) && subscribers.length > 0 && (
              <SubscriberCount subscribers={subscribers} />
            )}
          </Box>
          <Box>
            <Tooltip title="새로고침">
              <IconButton onClick={handleRefresh} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <IconButton onClick={onClose} disabled={loading}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 0, height: '100%' }}>
        <Card elevation={0} sx={{ height: '100%' }}>
          <CardContent sx={{ p: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
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
              {/* 헤더 영역 */}
            </Box>
            <Box sx={{ p: 2, flex: '0 0 auto' }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={7}>
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
                        <IconButton size="small" onClick={() => setDescExpanded((prev) => !prev)}>
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
                        onClick={() => canEdit() && handleStatusUpdate(value)}
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
                {/* 모든 탭 컴포넌트를 미리 렌더링하고 display 속성으로 표시 여부만 제어 */}
                <Box 
                  sx={{ 
                    display: tabValue === 0 ? 'block' : 'none', 
                    height: '100%', 
                    p: 3,
                    overflowY: 'auto',
                    '&::-webkit-scrollbar': {
                      width: '8px',
                      backgroundColor: 'transparent'
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: 'rgba(0, 0, 0, 0.1)',
                      borderRadius: '4px',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.2)'
                      }
                    }
                  }}
                  role="tabpanel"
                  id={`tabpanel-0`}
                  aria-labelledby={`tab-0`}
                >
                  <GenericDataTab 
                    cve={cve} 
                    currentUser={currentUser} 
                    refreshTrigger={refreshTriggers.poc} 
                    tabConfig={pocTabConfig}
                    sendMessage={sendMessage}
                  />
                </Box>
                <Box 
                  sx={{ 
                    display: tabValue === 1 ? 'block' : 'none', 
                    height: '100%', 
                    p: 3,
                    overflowY: 'auto',
                    '&::-webkit-scrollbar': {
                      width: '8px',
                      backgroundColor: 'transparent'
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: 'rgba(0, 0, 0, 0.1)',
                      borderRadius: '4px',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.2)'
                      }
                    }
                  }}
                  role="tabpanel"
                  id={`tabpanel-1`}
                  aria-labelledby={`tab-1`}
                >
                  <GenericDataTab
                    cve={cve}
                    currentUser={currentUser}
                    refreshTrigger={refreshTriggers.snortRules}
                    tabConfig={snortRulesTabConfig}
                    onCountChange={(count) => setTabCounts(prev => ({ ...prev, snortRules: count }))}
                    sendMessage={sendMessage}
                  />
                </Box>
                <Box 
                  sx={{ 
                    display: tabValue === 2 ? 'block' : 'none', 
                    height: '100%', 
                    p: 3,
                    overflowY: 'auto',
                    '&::-webkit-scrollbar': {
                      width: '8px',
                      backgroundColor: 'transparent'
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: 'rgba(0, 0, 0, 0.1)',
                      borderRadius: '4px',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.2)'
                      }
                    }
                  }}
                  role="tabpanel"
                  id={`tabpanel-2`}
                  aria-labelledby={`tab-2`}
                >
                  <GenericDataTab
                    cve={cve}
                    currentUser={currentUser}
                    refreshTrigger={refreshTriggers.references}
                    tabConfig={referencesTabConfig}
                    onCountChange={(count) => setTabCounts(prev => ({ ...prev, references: count }))}
                    sendMessage={sendMessage}
                  />
                </Box>
                <Box 
                  sx={{ 
                    display: tabValue === 3 ? 'block' : 'none', 
                    height: '100%', 
                    p: 3,
                    overflowY: 'auto',
                    '&::-webkit-scrollbar': {
                      width: '8px',
                      backgroundColor: 'transparent'
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: 'rgba(0, 0, 0, 0.1)',
                      borderRadius: '4px',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.2)'
                      }
                    }
                  }}
                  role="tabpanel"
                  id={`tabpanel-3`}
                  aria-labelledby={`tab-3`}
                >
                  <CommentsTab
                    cve={cve}
                    currentUser={currentUser}
                    refreshTrigger={refreshTriggers.comments}
                    onCountChange={(count) => setTabCounts(prev => ({ ...prev, comments: count }))}
                    sendMessage={sendMessage}
                  />
                </Box>
                <Box 
                  sx={{ 
                    display: tabValue === 4 ? 'block' : 'none', 
                    height: '100%', 
                    p: 3,
                    overflowY: 'auto',
                    '&::-webkit-scrollbar': {
                      width: '8px',
                      backgroundColor: 'transparent'
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: 'rgba(0, 0, 0, 0.1)',
                      borderRadius: '4px',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.2)'
                      }
                    }
                  }}
                  role="tabpanel"
                  id={`tabpanel-4`}
                  aria-labelledby={`tab-4`}
                >
                  <HistoryTab modificationHistory={cve?.modificationHistory || []} />
                </Box>
              </Box>
            </Box>
            {isCached && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2 }}>
                <Chip 
                  size="small" 
                  label="캐시된 데이터" 
                  color="info" 
                  variant="outlined"
                  sx={{ fontWeight: 500 }}
                />
                {cacheState && cacheState._lastCheckedWithServer && (
                  <Typography variant="caption" color="text.secondary">
                    서버와 {timeAgo(cacheState._lastCheckedWithServer)} 전에 동기화됨
                  </Typography>
                )}
              </Box>
            )}
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

export default React.memo(CVEDetail);