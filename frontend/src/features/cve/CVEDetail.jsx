import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useWebSocketContext, useWebSocketMessage } from '../../contexts/WebSocketContext';
import { WS_EVENT_TYPE } from '../../services/websocket';
import { toast } from 'react-toastify';
import { cveService } from '../../api/services/cveService';
import { api } from '../../utils/auth';
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
  TextField,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Tooltip,
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent,
  CircularProgress
} from '@mui/material';
import {
  Security as SecurityIcon,
  Close as CloseIcon,
  Circle as CircleIcon,
  Science as ScienceIcon,
  Shield as ShieldIcon,
  Link as LinkIcon,
  Comment as CommentIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  History as HistoryIcon,
  Person as PersonIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import {
  fetchCVEDetail,
  updateCVEDetail,
  selectCVEDetail,
  refreshCVEList,
  makeSelectCVEById,
  updateCVEFromWebSocket
} from '../../store/slices/cveSlice';
import TabPanel from './components/TabPanel';
import PoCTab from './components/PoCTab';
import SnortRulesTab from './components/SnortRulesTab';
import ReferencesTab from './components/ReferencesTab';
import CommentsTab from './components/CommentsTab';
import HistoryTab from './components/HistoryTab';
import InlineEditText from './components/InlineEditText';
import { useParams } from 'react-router-dom';
import { getCVE, updateCVE, acquireLock, releaseLock } from '../../api/services/cveService';
import { useSnackbar } from 'notistack';
import { formatToKST } from '../../utils/dateUtils';
import PropTypes from 'prop-types';

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

// 탭 설정 정의
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

// Status 카드 스타일 수정
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
  minHeight: '60px',  // 높이 약간 증가
  flex: 1,
  '&:hover': {
    bgcolor: 'action.hover',
    transform: 'translateY(-1px)'
  }
};

const CVEDetail = ({ 
  open = false,  // 기본값을 매개변수에 직접 지정
  onClose = () => {},  // 기본값을 매개변수에 직접 지정
  cveId = null  // 기본값을 매개변수에 직접 지정
}) => {
  const dispatch = useDispatch();
  const cve = useSelector(selectCVEDetail);
  const currentUser = useSelector(state => state.auth.user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const { enqueueSnackbar } = useSnackbar();
  const { isConnected, lastMessage } = useWebSocketContext();
  const [activeCommentCount, setActiveCommentCount] = useState(0);
  const [titleEditMode, setTitleEditMode] = useState(false);
  const [descriptionEditMode, setDescriptionEditMode] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedBy, setLockedBy] = useState(null);

  // 초기 로드 상태 추적을 위한 ref 추가
  const initialLoadRef = useRef(false);

  // 탭 카운트 상태 관리
  const [tabCounts, setTabCounts] = useState({
    poc: 0,
    snortRules: 0,
    references: 0,
    comments: 0
  });

  // 각 탭의 새로고침을 위한 트리거 상태
  const [pocRefreshTrigger, setPocRefreshTrigger] = useState(0);
  const [snortRulesRefreshTrigger, setSnortRulesRefreshTrigger] = useState(0);
  const [referencesRefreshTrigger, setReferencesRefreshTrigger] = useState(0);
  const [commentsRefreshTrigger, setCommentsRefreshTrigger] = useState(0);

  // 구독 상태 관리를 위한 ref
  const subscriptionRef = useRef({
    subscribed: false,
    currentCveId: null,
    isProcessing: false,
    lastError: null
  });

  // WebSocket 메시지 처리
  const messageHandler = useCallback((message) => {
    // 구독/구독 해제 응답 처리
    if (message?.data?.type === 'subscribe_cve' || message?.data?.type === 'unsubscribe_cve') {
        const { cveId, subscribers } = message.data.data;
        const isSubscribe = message.data.type === 'subscribe_cve';

        if (!subscribers) return;

        // 구독 상태 업데이트
        subscriptionRef.current = {
            subscribed: isSubscribe,
            currentCveId: isSubscribe ? cveId : null,
            isProcessing: false,
            lastError: null
        };
    }
  }, []);  // 의존성 제거

  const { sendCustomMessage } = useWebSocketMessage(messageHandler);

  // 구독 관리 함수
  const handleSubscription = useCallback(async (cveId, shouldSubscribe) => {
    if (!cveId || subscriptionRef.current.isProcessing) {
        console.log('[CVEDetail] Skipping subscription - invalid state:', {
            cveId,
            isProcessing: subscriptionRef.current.isProcessing
        });
        return;
    }

    // 현재 상태와 동일한 작업은 스킵
    if (shouldSubscribe && subscriptionRef.current.subscribed && 
        subscriptionRef.current.currentCveId === cveId) {
        console.log('[CVEDetail] Already subscribed:', {
            cveId,
            subscriptionState: subscriptionRef.current
        });
        return;
    }

    console.log(`[CVEDetail] ${shouldSubscribe ? 'Subscribing to' : 'Unsubscribing from'} CVE:`, {
        cveId,
        currentUser: currentUser?.username,
        subscriptionState: { ...subscriptionRef.current }
    });

    try {
        // 메시지 전송 전에 상태 업데이트
        subscriptionRef.current = {
            subscribed: shouldSubscribe,
            currentCveId: shouldSubscribe ? cveId : null,
            isProcessing: true,
            lastError: null
        };

        console.log('[CVEDetail] Updated subscription state before sending:', {
            ...subscriptionRef.current
        });

        // WebSocket 메시지 전송 - type과 data를 분리하여 전달
        await sendCustomMessage(
            shouldSubscribe ? 'subscribe_cve' : 'unsubscribe_cve',
            { cveId }
        );

        console.log('[CVEDetail] Subscription request sent:', {
            cveId,
            shouldSubscribe,
            currentState: { ...subscriptionRef.current }
        });
    } catch (error) {
        console.error('[CVEDetail] Subscription error:', error);
        // 에러 발생 시 이전 상태로 복원
        subscriptionRef.current = {
            subscribed: false,
            currentCveId: null,
            isProcessing: false,
            lastError: error.message
        };
    }
  }, [sendCustomMessage, currentUser]);

  // 컴포넌트 마운트/언마운트 시 구독 상태 초기화를 위한 useEffect 추가
  useEffect(() => {
    // 컴포넌트 마운트 시 초기화
    subscriptionRef.current = {
      subscribed: false,
      currentCveId: null,
      isProcessing: false,
      lastError: null
    };

    console.log('[CVEDetail] Subscription state initialized:', subscriptionRef.current);

    return () => {
      // 언마운트 시 cleanup
      const currentSub = subscriptionRef.current;
      if (currentSub.subscribed && currentSub.currentCveId) {
        console.log('[CVEDetail] Cleaning up subscription on unmount:', currentSub);
        handleSubscription(currentSub.currentCveId, false);
      }
    };
  }, []); // 컴포넌트 마운트/언마운트 시에만 실행

  // CVE 구독 관리 - 다이얼로그 상태와 CVE ID 변경 시에만 실행
  useEffect(() => {
    if (!open || !cveId) {
      console.log('[CVEDetail] Skipping subscription - dialog not open or no cveId:', { open, cveId });
      return;
    }

    const currentSub = subscriptionRef.current;
    console.log('[CVEDetail] Checking subscription state:', {
      open,
      cveId,
      currentSub: { ...currentSub }
    });

    // 이미 처리 중인 경우 스킵
    if (currentSub.isProcessing) {
      console.log('[CVEDetail] Subscription is already processing');
      return;
    }

    // 다른 CVE를 구독 중이었다면 먼저 구독 해제
    if (currentSub.subscribed && currentSub.currentCveId !== cveId) {
      console.log('[CVEDetail] Unsubscribing from previous CVE:', currentSub.currentCveId);
      handleSubscription(currentSub.currentCveId, false);
    }

    // 새로운 CVE 구독
    if (!currentSub.subscribed || currentSub.currentCveId !== cveId) {
      console.log('[CVEDetail] Subscribing to new CVE:', cveId);
      handleSubscription(cveId, true);
    }

    // cleanup
    return () => {
      if (!open && currentSub.subscribed) {
        console.log('[CVEDetail] Cleaning up subscription on dialog close:', currentSub);
        handleSubscription(currentSub.currentCveId, false);
      }
    };
  }, [cveId, open, handleSubscription]);

  // 초기 데이터 로딩 최적화
  useEffect(() => {
    let isMounted = true;

    const fetchCVEDetails = async () => {
      if (!cveId || !open) return;
      
      try {
        setLoading(true);
        setError(null);
        const result = await dispatch(fetchCVEDetail(cveId)).unwrap();
        
        if (isMounted) {
          // 초기 탭 카운트 설정
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
          setError('CVE 상세 정보를 불러오는데 실패했습니다.');
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
  }, [dispatch, cveId, open]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleTitleChange = (value) => {
    setEditedTitle(value);
  };

  const handleDescriptionChange = (value) => {
    setEditedDescription(value);
  };

  const handleTitleUpdate = async () => {
    try {
        setIsEditing(true);
        const response = await cveService.updateCVE(cveId, {
            title: editedTitle
        });

        if (response) {
            await sendCustomMessage(
                WS_EVENT_TYPE.CVE_UPDATED,
                {
                    cveId,
                    cve: response.data
                }
            );
            enqueueSnackbar('제목이 업데이트되었습니다.', { variant: 'success' });
        }
    } catch (error) {
        console.error('Failed to update title:', error);
        enqueueSnackbar(error.message || '제목 업데이트 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
        setIsEditing(false);
        setTitleEditMode(false);
    }
  };

  const handleDescriptionUpdate = async () => {
    try {
        setIsEditing(true);
        const response = await cveService.updateCVE(cveId, {
            description: editedDescription
        });

        if (response) {
            await sendCustomMessage(
                WS_EVENT_TYPE.CVE_UPDATED,
                {
                    cveId,
                    cve: response.data
                }
            );
            enqueueSnackbar('설명이 업데이트되었습니다.', { variant: 'success' });
        }
    } catch (error) {
        console.error('Failed to update description:', error);
        enqueueSnackbar(error.message || '설명 업데이트 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
        setIsEditing(false);
        setDescriptionEditMode(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      setLoading(true);
      const response = await cveService.updateCVE(cveId, {
        status: newStatus
      });

      if (response) {
        await sendCustomMessage(
          WS_EVENT_TYPE.CVE_UPDATED,  // POC_ADDED 대신 CVE_UPDATED 사용
          {
            cveId,
            cve: response.data
          }
        );
        enqueueSnackbar('상태가 업데이트되었습니다.', { variant: 'success' });
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      enqueueSnackbar(error.message || '상태 업데이트 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = async () => {
    try {
      await cveService.acquireLock(cveId);
      setIsEditing(true);
    } catch (error) {
      if (error.response?.status === 423) {
        enqueueSnackbar(error.response.data.detail, { variant: 'error' });
      } else {
        enqueueSnackbar('편집 모드 진입에 실패했습니다.', { variant: 'error' });
      }
    }
  };

  const handleSave = async () => {
    try {
      const response = await cveService.updateCVE(cveId, {
        title: editedTitle,
        description: editedDescription
      });

      if (response) {
        await sendCustomMessage(
          WS_EVENT_TYPE.CVE_UPDATED,
          {
            cveId,
            cve: response.data
          }
        );
        enqueueSnackbar('변경사항이 저장되었습니다.', { variant: 'success' });
      }
      
      await cveService.releaseLock(cveId);
      setIsEditing(false);
    } catch (error) {
      enqueueSnackbar(error.message || '저장에 실패했습니다.', { variant: 'error' });
    }
  };

  const handleCancel = async () => {
    try {
      await cveService.releaseLock(cveId);
      setIsEditing(false);
      setEditedTitle(cve.title);
      setEditedDescription(cve.description);
    } catch (error) {
      enqueueSnackbar('편집 취소에 실패했습니다.', { variant: 'error' });
    }
  };

  // 컴포넌트 마운트 시 Lock 상태 확인
  useEffect(() => {
    if (!cve) return;
    
    if (cve.is_locked && cve.locked_by !== currentUser?.username) {
      setIsLocked(true);
      setLockedBy(cve.locked_by);
    }
  }, [cve]);

  // CVE 데이터가 로드될 때 초기 카운트 설정
  useEffect(() => {
    if (cve) {
      const newCounts = {
        poc: cve.pocs?.length || 0,
        snortRules: cve.snortRules?.length || 0,
        references: cve.references?.length || 0,
        comments: countActiveComments(cve.comments)
      };
      
      // 이전 카운트와 비교하여 변경된 경우에만 업데이트
      if (JSON.stringify(newCounts) !== JSON.stringify(tabCounts)) {
        setTabCounts(newCounts);
        console.log('Tab counts updated:', newCounts);
      }
    }
  }, [cve]);

  // WebSocket 메시지 처리
  useEffect(() => {
    if (lastMessage?.data?.cveId === cveId) {
      const { type, data } = lastMessage;
      switch (type) {
        case WS_EVENT_TYPE.POC_ADDED:
        case WS_EVENT_TYPE.POC_DELETED:
        case WS_EVENT_TYPE.POC_UPDATED:
          setTabCounts(prev => ({ ...prev, poc: data.count }));
          console.log(`Tab poc count updated to:`, data.count);
          break;
        case WS_EVENT_TYPE.SNORT_RULE_ADDED:
        case WS_EVENT_TYPE.SNORT_RULE_DELETED:
        case WS_EVENT_TYPE.SNORT_RULE_UPDATED:
          setTabCounts(prev => ({ ...prev, snortRules: data.count }));
          console.log(`Tab snortRules count updated to:`, data.count);
          break;
        case WS_EVENT_TYPE.REFERENCE_ADDED:
        case WS_EVENT_TYPE.REFERENCE_DELETED:
        case WS_EVENT_TYPE.REFERENCE_UPDATED:
          setTabCounts(prev => ({ ...prev, references: data.count }));
          console.log(`Tab references count updated to:`, data.count);
          break;
        case WS_EVENT_TYPE.COMMENT_ADDED:
        case WS_EVENT_TYPE.COMMENT_DELETED:
        case WS_EVENT_TYPE.COMMENT_UPDATED:
          setTabCounts(prev => ({ ...prev, comments: data.count }));
          console.log(`Tab comments count updated to:`, data.count);
          break;
        default:
          break;
      }
    }
  }, [lastMessage, cveId]);

  // 탭 라벨 생성
  const getTabLabel = useCallback((tab, index) => {
    switch(index) {
      case 0: return `${tab.label} (${tabCounts.poc})`;
      case 1: return `${tab.label} (${tabCounts.snortRules})`;
      case 2: return `${tab.label} (${tabCounts.references})`;
      case 3: return `${tab.label} (${tabCounts.comments})`;
      default: return tab.label;
    }
  }, [tabCounts]);  // tabCounts를 의존성으로 추가

  // 사용자 권한 체크 함수 추가
  const canEdit = useCallback(() => {
    return true; // 또는 필요한 권한 체크 로직 구현
  }, []);

  // cveDetail이 로드되었는지 확인하는 useEffect 수정
  useEffect(() => {
    console.log('=== CVE Detail Debug ===');
    console.log('CVE Detail:', cve);
    console.log('Loading:', loading);
    console.log('Error:', error);
  }, [cve, loading, error]);  // 의존성 배열에서 불필요한 항목 제거

  const handlePoCUpdate = async (newPocs) => {
    try {
      setLoading(true);
      setError(null);

      // API 요청 데이터에 현재 사용자 정보는 필요 없음 (백엔드에서 토큰으로 처리)
      const response = await api.patch(`/cves/${cveId}`, {
        pocs: newPocs
      });

      if (response.data) {
        // 업데이트 성공
        console.log('PoC update successful:', response.data);
      }
    } catch (err) {
      console.error('Error updating PoCs:', err);
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (updatedData) => {
    try {
        // API 호출
        const response = await cveService.updateCVE(cveId, updatedData);
        
        // WebSocket을 통해 업데이트 알림
        await sendCustomMessage(
            WS_EVENT_TYPE.CVE_UPDATED,  // 단순화된 이벤트 타입 사용
            {
                cveId,
                cve: response.data  // 전체 CVE 데이터 전송
            }
        );

        enqueueSnackbar('CVE가 성공적으로 업데이트되었습니다.', {
            variant: 'success'
        });
        
        return response;
    } catch (error) {
        console.error('Failed to update CVE:', error);
        enqueueSnackbar(error.message || 'CVE 업데이트 중 오류가 발생했습니다.', {
            variant: 'error'
        });
        throw error;
    }
  };

  // 로딩 중이거나 에러 상태일 때 처리
  if (loading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

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
        TransitionComponent={Fade}
        PaperProps={{
          sx: { borderRadius: 3 }
        }}
      >
        <DialogContent sx={{ p: 0 }}>
          <Card elevation={0}>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ 
                p: 2, 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: 1,
                borderColor: 'divider'
              }}>
                <Typography variant="h6">
                  CVE 상세 정보
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="새로고침">
                    <IconButton 
                      onClick={() => {
                        dispatch(fetchCVEDetail(cveId)).then(() => {
                          // 하위 컴포넌트들의 데이터도 새로고침
                          setPocRefreshTrigger(prev => prev + 1);
                          setSnortRulesRefreshTrigger(prev => prev + 1);
                          setReferencesRefreshTrigger(prev => prev + 1);
                          setCommentsRefreshTrigger(prev => prev + 1);
                          enqueueSnackbar('데이터를 새로고침했습니다.', {
                            variant: 'success'
                          });
                        });
                      }}
                      size="small"
                      color="primary"
                    >
                      <RefreshIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="닫기">
                    <IconButton 
                      onClick={onClose}
                      size="small"
                    >
                      <CloseIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

              <Box sx={{ 
                height: '80vh',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <Grid container spacing={2} sx={{ mb: 2, px: 3, pt: 3 }}>
                  <Grid item xs={12} md={7}>  {/* 너비 조정 */}
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
                          onSave={handleTitleUpdate}
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
                          onSave={handleDescriptionUpdate}
                          multiline
                          placeholder="설명을 입력하세요"
                          disabled={!canEdit()}
                        />
                      </Paper>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={5}>  {/* Status 영역 */}
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      Status
                    </Typography>
                    <Box sx={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: 1.5,  // 간격 약간 증가
                      maxHeight: '180px'  // 높이 약간 증가
                    }}>
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
                          <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'flex-start',  // 상단 정렬로 변경
                            gap: 1,
                            width: '100%'
                          }}>
                            <CircleIcon sx={{ 
                              fontSize: 8,
                              color: getStatusColor(value),
                              flexShrink: 0,
                              mt: 0.7  // 아이콘 위치 조정
                            }} />
                            <Box sx={{ 
                              display: 'flex', 
                              flexDirection: 'column',
                              width: '100%',
                              minWidth: 0
                            }}>
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontWeight: value === cve.status ? 600 : 400,
                                  color: value === cve.status ? getStatusColor(value) : 'text.primary',
                                  lineHeight: 1.2
                                }}
                              >
                                {label}
                              </Typography>
                              <Typography 
                                variant="caption" 
                                color="text.secondary"
                                sx={{ 
                                  display: 'block', 
                                  fontSize: '0.7rem',
                                  mt: 0.5,
                                  lineHeight: 1.2
                                }}
                              >
                                {description}
                              </Typography>
                            </Box>
                          </Box>
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
                              {React.createElement(tab.iconComponent, { 
                                sx: { fontSize: 20 } 
                              })}
                              <Typography>
                                {index < 4 ? getTabLabel(tab, index) : tab.label}
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
                        currentUser={currentUser}
                        refreshTrigger={pocRefreshTrigger}
                      />
                    </TabPanel>

                    <TabPanel value={tabValue} index={1}>
                      <SnortRulesTab 
                        cve={cve}
                        currentUser={currentUser}
                        refreshTrigger={snortRulesRefreshTrigger}
                      />
                    </TabPanel>

                    <TabPanel value={tabValue} index={2}>
                      <ReferencesTab 
                        cve={cve}
                        refreshTrigger={referencesRefreshTrigger}
                      />
                    </TabPanel>

                    <TabPanel value={tabValue} index={3}>
                      <CommentsTab 
                        cve={cve}
                        onUpdate={() => fetchCVEDetail(cve.cveId)}
                        onCommentCountChange={setActiveCommentCount}
                        currentUser={currentUser}
                        refreshTrigger={commentsRefreshTrigger}
                      />
                    </TabPanel>

                    <TabPanel value={tabValue} index={4}>
                      <HistoryTab modificationHistory={cve.modificationHistory} />
                    </TabPanel>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>
    </>
  );
};

CVEDetail.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  cveId: PropTypes.string
};

export default CVEDetail;