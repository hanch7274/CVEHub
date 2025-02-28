// CVEDetail.jsx
import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useWebSocketContext, useWebSocketMessage, useCVEWebSocketUpdate } from '../../contexts/WebSocketContext';
import { WS_EVENT_TYPE } from '../../services/websocket';
import webSocketInstance from '../../services/websocket';
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
  fetchCachedCVEDetail,
  updateCVEDetail,
  selectCVEDetail,
  setCVEDetail
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

// 누락된 expensiveCalculation 함수 추가
const expensiveCalculation = (cve) => {
  if (!cve) return {};
  
  // 처리된 데이터 반환
  return {
    id: cve.cveId,
    title: cve.title,
    description: cve.description,
    status: cve.status,
    hasPoCs: Array.isArray(cve.pocs) && cve.pocs.length > 0,
    hasSnortRules: Array.isArray(cve.snortRules) && cve.snortRules.length > 0,
    hasReferences: Array.isArray(cve.references) && cve.references.length > 0,
    hasComments: Array.isArray(cve.comments) && cve.comments.length > 0,
    totalItems: (Array.isArray(cve.pocs) ? cve.pocs.length : 0) +
               (Array.isArray(cve.snortRules) ? cve.snortRules.length : 0) +
               (Array.isArray(cve.references) ? cve.references.length : 0),
    publishDate: cve.publishedDate,
    modificationHistory: cve.modificationHistory || []
  };
};

const CVEDetail = ({ open = false, onClose = () => {}, cveId = null }) => {
  const dispatch = useDispatch();
  const cve = useSelector(selectCVEDetail);
  const currentUser = useSelector(state => state.auth.user);
  const { enqueueSnackbar } = useSnackbar();
  
  // useWebSocketContext Hook은 항상 최상위 레벨에서 호출되어야 함
  const wsContext = useWebSocketContext();
  let invalidateCVECache = () => {
    console.warn('WebSocket context not available');
  };
  
  // Hook의 결과를 사용하는 부분만 try-catch 블록으로 감싸기
  try {
    if (wsContext && wsContext.invalidateCVECache) {
      invalidateCVECache = wsContext.invalidateCVECache;
    }
  } catch (error) {
    console.error('Error accessing WebSocket context properties:', error);
  }
  
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [activeCommentCount, setActiveCommentCount] = useState(0);
  
  // Cache State를 컴포넌트 최상위 레벨로 이동
  const [isCached, setIsCached] = useState(false);
  const cacheState = useSelector(state => state.cve.cveCache[cveId]);
  
  // 시간 표시 헬퍼 함수
  const timeAgo = useCallback((timestamp) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return `${seconds}초`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간`;
    return `${Math.floor(seconds / 86400)}일`;
  }, []);
  
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

  const currentUserRef = useRef();

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // handleRefreshTrigger 함수를 먼저 정의
  const handleRefreshTrigger = useCallback((field) => {
    if (!field) {
      // 필드가 특정되지 않은 경우 모든 탭 refreshTrigger 증가
      console.log('CVEDetail: 전체 탭 업데이트 트리거');
      setRefreshTriggers(prev => ({
        poc: prev.poc + 1,
        snortRules: prev.snortRules + 1,
        references: prev.references + 1,
        comments: prev.comments + 1
      }));
      return;
    }
    
    console.log(`CVEDetail: [${field}] 필드 업데이트 트리거`);
    setRefreshTriggers(prev => {
      const updates = {};
      
      // 필드에 따라 관련 탭의 refreshTrigger 증가
      if (field === 'poc' || field === 'poc_list' || field === 'poc_files') {
        updates.poc = prev.poc + 1;
      } else if (field === 'snort_rules') {
        updates.snortRules = prev.snortRules + 1;
      } else if (field === 'references' || field === 'reference_list') {
        updates.references = prev.references + 1;
      } else if (field === 'comments' || field === 'comment_list') {
        updates.comments = prev.comments + 1;
      } else {
        // 알려지지 않은 필드는 모든 탭 업데이트
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

  // 구독자 정보 업데이트 핸들러
  const handleSubscribersChange = useCallback((newSubscribers) => {
    if (Array.isArray(newSubscribers)) {
      console.log('[CVEDetail] 구독자 정보 업데이트:', newSubscribers.length);
      setSubscribers(newSubscribers);
    }
  }, []);
  
  // WebSocket 업데이트 수신 핸들러
  const handleUpdateReceived = useCallback((data) => {
    console.log(`[CVEDetail] WebSocket 업데이트 수신:`, data);
    if (data.field) {
      handleRefreshTrigger(data.field);
    }
  }, [handleRefreshTrigger]);
  
  // 개선된 구독 관리 훅 사용
  const { unsubscribe } = useSubscription(
    cveId,
    handleUpdateReceived,
    handleSubscribersChange
  );
  
  // 메시지 전송 함수 정의
  const sendCustomMessage = useCallback(async (type, data) => {
    try {
      // 웹소켓 연결 상태 확인
      if (!webSocketInstance || !webSocketInstance.isReady) {
        console.warn('[CVEDetail] 웹소켓이 준비되지 않았습니다. 메시지 전송을 건너뜁니다.');
        return false;
      }
      
      // 웹소켓 서비스를 직접 사용
      const result = await webSocketInstance.send(type, {
        ...data,
        cveId: cveId,
        updatedBy: currentUserRef.current?.username
      });
      
      console.log(`[CVEDetail] ${type} 메시지 전송 성공:`, data);
      return result;
    } catch (error) {
      console.error('[CVEDetail] 메시지 전송 오류:', error);
      // 오류 발생 시 실패로 처리하되 상위로 전파하지 않음
      return false;
    }
  }, [cveId]);

  // 2. 데이터 로딩 로직 개선 - 오류 처리 강화
  useEffect(() => {
    if (open && cveId) {
      console.log('CVEDetail: Loading data for', cveId);
      setLoading(true);
      
      // 기본 데이터 로딩으로 변경 (캐시 로직 문제 해결을 위해)
      dispatch(fetchCVEDetail(cveId))
        .unwrap()
        .then((data) => {
          console.log('CVEDetail: Data loaded successfully');
          setLoading(false);
          // 캐시 상태 확인은 유지
          if (cacheState && cacheState._cachedAt) {
            setIsCached(true);
          } else {
            setIsCached(false);
          }
        })
        .catch((error) => {
          console.error('CVEDetail: Error loading data', error);
          setLoading(false);
          enqueueSnackbar('데이터 로딩 실패', { variant: 'error' });
        });
    }
  }, [dispatch, cveId, open, enqueueSnackbar]);
  
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

  const getTabLabel = useCallback((tab, index) => {
    switch (index) {
      case 0: return `${tab.label} (${tabCounts.poc})`;
      case 1: return `${tab.label} (${tabCounts.snortRules})`;
      case 2: return `${tab.label} (${tabCounts.references})`;
      case 3: return `${tab.label} (${tabCounts.comments})`;
      default: return tab.label;
    }
  }, [tabCounts]);

  // 수동 새로고침 기능 추가
  const handleRefresh = useCallback(() => {
    if (cveId) {
      setLoading(true);
      
      // 웹소켓 컨텍스트의 캐시 무효화 함수 재사용
      invalidateCVECache(cveId);
      
      // 강제 새로고침으로 데이터 가져오기
      dispatch(fetchCVEDetail(cveId))
        .unwrap()
        .then(() => {
          setLoading(false);
          setIsCached(false);
          // refreshTriggers 증가로 모든 탭 갱신 트리거
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

  // 무거운 계산 결과 캐싱
  const processedData = useMemo(() => {
    return expensiveCalculation(cve);
  }, [cve]);
  
  // 핸들러 함수 메모이제이션
  const handleAction = useCallback(() => {
    // 작업 수행
  }, [/* 의존성 */]);

  const handleFieldUpdate = useCallback(async (field, value, successMessage) => {
    try {
      const payload = { [field]: value };
      const response = await cveService.updateCVE(cveId, payload);
      if (response) {
        // 로컬 상태 업데이트
        dispatch(updateCVEDetail({ cveId, data: response }));
        
        // WebSocket 메시지 전송 시도 (구독자들에게 알림)
        // 실패해도 다음 단계 진행
        try {
          const sent = await sendCustomMessage(WS_EVENT_TYPE.CVE_UPDATED, { 
            cveId,
            field,
            value,
            updatedBy: currentUserRef.current?.username
          });
          
          if (!sent) {
            console.warn(`[CVEDetail] WebSocket 메시지 전송 실패: ${field} 업데이트`);
          }
        } catch (wsError) {
          console.error(`[CVEDetail] WebSocket 메시지 전송 오류:`, wsError);
          // WebSocket 오류는 무시하고 계속 진행
        }

        enqueueSnackbar(successMessage, { variant: 'success' });
        
        // 전체 데이터 새로고침은 마지막에
        await dispatch(fetchCVEDetail(cveId));
      }
    } catch (error) {
      console.error(`[CVEDetail] ${field} 업데이트 실패:`, error);
      enqueueSnackbar(error.message || `${field} 업데이트 중 오류가 발생했습니다.`, { variant: 'error' });
    }
  }, [cveId, dispatch, enqueueSnackbar, sendCustomMessage]);

  const handleTitleUpdate = useCallback(async (newTitle) => {
    if (!cve || !cve.cveId || newTitle === cve.title) return;
    
    try {
      setUpdating(true);
      
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { title: newTitle }
      })).unwrap();
      
      // 로컬 상태 즉시 업데이트
      dispatch(setCVEDetail({
        ...cve,
        title: newTitle,
        lastModifiedDate: new Date().toISOString()
      }));
      
      enqueueSnackbar('제목이 업데이트되었습니다', { variant: 'success' });
      return response;
    } catch (error) {
      console.error('제목 업데이트 실패:', error);
      enqueueSnackbar('제목 업데이트에 실패했습니다', { variant: 'error' });
      throw error;
    } finally {
      setUpdating(false);
    }
  }, [cve, dispatch, enqueueSnackbar]);

  const handleDescriptionUpdate = useCallback(async (newDescription) => {
    if (!cve || !cve.cveId || newDescription === cve.description) return;
    
    try {
      setUpdating(true);
      
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { description: newDescription }
      })).unwrap();
      
      // 로컬 상태 즉시 업데이트
      dispatch(setCVEDetail({
        ...cve,
        description: newDescription,
        lastModifiedDate: new Date().toISOString()
      }));
      
      enqueueSnackbar('설명이 업데이트되었습니다', { variant: 'success' });
      return response;
    } catch (error) {
      console.error('설명 업데이트 실패:', error);
      enqueueSnackbar('설명 업데이트에 실패했습니다', { variant: 'error' });
      throw error;
    } finally {
      setUpdating(false);
    }
  }, [cve, dispatch, enqueueSnackbar]);

  const handleStatusUpdate = useCallback(async (newStatus) => {
    if (!cve || !cve.cveId || newStatus === cve.status) return;
    
    try {
      setUpdating(true);
      
      // 상태 업데이트 API 호출
      const response = await dispatch(updateCVEDetail({
        cveId: cve.cveId,
        data: { status: newStatus }
      })).unwrap();
      
      // 1. 캐시 무효화
      invalidateCVECache(cve.cveId);
      
      // 2. 로컬 상태 즉시 업데이트 (UI 반영)
      dispatch(setCVEDetail({
        ...cve,
        status: newStatus,
        lastModifiedDate: new Date().toISOString()
      }));
      
      // 3. 성공 메시지 표시
      enqueueSnackbar('상태가 업데이트되었습니다', { variant: 'success' });
      
      return response;
    } catch (error) {
      console.error('상태 업데이트 실패:', error);
      enqueueSnackbar('상태 업데이트에 실패했습니다', { variant: 'error' });
      throw error;
    } finally {
      setUpdating(false);
    }
  }, [cve, dispatch, enqueueSnackbar, invalidateCVECache]);

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
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h6">{cve.cveId} 상세 정보</Typography>
            {/* 구독자 정보 표시 */}
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
            {/* Header - 중복된 CVE 정보와 구독자 정보 제거 */}
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
              {/* 이 영역은 유지하되, 내부 콘텐츠는 제거 */}
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
                    currentUser={currentUser}
                    refreshTrigger={refreshTriggers.comments}
                    open={open}
                  />
                </TabPanel>
                <TabPanel value={tabValue} index={4}>
                  <HistoryTab 
                    modificationHistory={cve?.modificationHistory || []}
                  />
                </TabPanel>
              </Box>
            </Box>

            {/* 캐시 상태 표시 - return 문 안으로 이동 */}
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

// 컴포넌트 자체를 메모이제이션하여 불필요한 리렌더링 방지
export default React.memo(CVEDetail);
