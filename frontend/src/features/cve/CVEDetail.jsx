import PropTypes from 'prop-types';
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useSocketIO } from '../../contexts/SocketIOContext';
import { useSnackbar } from 'notistack';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
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
  Button
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
import GenericDataTab from './components/GenericDataTab';
import {
  pocTabConfig,
  snortRulesTabConfig,
  referencesTabConfig
} from './components/tabConfigs';
import CommentsTab from './components/CommentsTab';
import HistoryTab from './components/HistoryTab';
import InlineEditText from './components/InlineEditText';
import logger from '../../utils/logger';
import {
  useCVEDetail,
  useCVERefresh,
  useCVESubscription
} from '../../api/hooks/useCVEQuery';
import { useUpdateCVEField } from '../../api/hooks/useCVEMutation';
import { useAuth } from '../../contexts/AuthContext';

// 활성 댓글 개수 계산
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

const SubscriberCount = memo(({ subscribers = [] }) => {
  const hasSubscribers = Array.isArray(subscribers) && subscribers.length > 0;
  
  return (
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
          {hasSubscribers ? `${subscribers.length}명이 보는 중` : '보는 중'}
        </Typography>
      </Box>
      {hasSubscribers && (
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
              key={subscriber.id || subscriber.userId || Math.random().toString()}
              title={subscriber.displayName || subscriber.username || '사용자'}
              placement="bottom"
              arrow
              enterDelay={200}
              leaveDelay={0}
            >
              <Avatar
                alt={subscriber.username || '사용자'}
                src={subscriber.profile_image || subscriber.profileImage}
                sx={{
                  bgcolor: !subscriber.profile_image && !subscriber.profileImage ? 
                    `hsl(${(subscriber.username || 'User').length * 30}, 70%, 50%)` : 
                    undefined
                }}
              >
                {(!subscriber.profile_image && !subscriber.profileImage) && 
                  (subscriber.username || 'U').charAt(0).toUpperCase()}
              </Avatar>
            </Tooltip>
          ))}
        </AvatarGroup>
      )}
    </Box>
  );
});

SubscriberCount.propTypes = {
  subscribers: PropTypes.array
};

const CVEDetail = ({ cveId: propsCveId, open = false, onClose }) => {
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const { socket, connected: isConnected } = useSocketIO();
  const { user: currentUser } = useAuth();

  // 로컬 상태
  const [activeTab, setActiveTab] = useState(0);
  const [detailExpanded, setDetailExpanded] = useState(true);
  const [loading, setLoading] = useState(false); // 초기값을 false로 변경
  const [errorMessage, setErrorMessage] = useState(null);
  const [isCached, setIsCached] = useState(false);
  const [localSubscribers, setLocalSubscribers] = useState([]);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);

  // 리프레시 트리거 및 탭 카운트
  const [refreshTriggers, setRefreshTriggers] = useState({
    general: 0,
    poc: 0,
    snortRules: 0,
    references: 0,
    comments: 0,
    history: 0
  });
  
  const [tabCounts, setTabCounts] = useState({
    poc: 0,
    snortRules: 0,
    references: 0,
    comments: 0
  });

  // 폴백 타이머 및 이전 상태 참조
  const fallbackTimers = useRef({});
  // 미사용 변수이지만 향후 사용 가능성이 있으므로 주석 처리
  // const previousSubscribersRef = useRef([]);
  const snackbarShown = useRef(false);
  const refreshTriggersRef = useRef(refreshTriggers);
  const lastProcessedUpdateIdRef = useRef({});

  // 현재 사용자 참조
  const currentUserRef = useRef();
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // 구독 기능 (Socket.IO)
  const { 
    subscribe, 
    unsubscribe, 
    isSubscribed,
    subscribers = [],
    // 미사용 변수들이지만 향후 사용 가능성이 있으므로 주석 처리
    // isLoading: isSubscriptionLoading,
    // error: subscriptionError
  } = useCVESubscription(propsCveId);

  // React Query를 사용한 CVE 상세 정보 조회
  const {
    data: cveData,
    isLoading: isQueryLoading,
    // 미사용 변수들이지만 향후 사용 가능성이 있으므로 주석 처리
    // isError: isQueryError,
    // error: queryError,
    refetch: refetchCveDetail,
    // isFetching
  } = useCVEDetail(propsCveId, {
    enabled: !!propsCveId && open,
    retry: 1, // 재시도 횟수 제한
    retryDelay: 1000, // 재시도 간격
    staleTime: 60000, // 1분 동안 데이터를 fresh하게 유지
    onSuccess: (data) => {
      logger.info('CVEDetail', '데이터 로딩 성공', { dataReceived: !!data });
      
      if (snackbarShown.current) {
        closeSnackbar();
        enqueueSnackbar('데이터를 성공적으로 불러왔습니다', { 
          variant: 'success',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
          autoHideDuration: 2000
        });
        snackbarShown.current = false;
      }
      
      // 탭 카운트 업데이트
      updateTabCounts(data);
      setIsCached(false);
      setLoading(false); // 로딩 상태 명시적 해제
    },
    onError: (err) => {
      logger.error('CVEDetail', '데이터 로딩 실패', { error: err.message });
      
      if (snackbarShown.current) {
        closeSnackbar();
        enqueueSnackbar(`데이터 로딩 실패: ${err.message || '알 수 없는 오류'}`, { 
          variant: 'error',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
        });
        snackbarShown.current = false;
      }
      setErrorMessage(err.message || '데이터 로딩 실패');
      setLoading(false); // 로딩 상태 명시적 해제
      setErrorDialogOpen(true); // 에러 발생 시 에러 다이얼로그 표시
    }
  });
  
  // 탭 카운트 업데이트 함수
  const updateTabCounts = useCallback((data) => {
    if (!data) return;
    
    const newCounts = {
      poc: data.pocs?.length || 0,
      snortRules: data.snortRules?.length || 0,
      references: data.references?.length || 0,
      comments: countActiveComments(data.comments)
    };
    
    setTabCounts(newCounts);
  }, []);
  
  // CVE 새로고침 뮤테이션
  const { mutate: refreshCVE, isLoading: isRefreshing } = useCVERefresh(propsCveId);
  
  // 필드 업데이트 뮤테이션
  const { mutate: updateCVEField } = useUpdateCVEField();
  // 미사용 변수이지만 향후 사용 가능성이 있으므로 주석 처리
  // const { mutate: updateCVEField, isLoading: isUpdating } = useUpdateCVEField();

  // 웹소켓 메시지 핸들러
  const handleWebSocketUpdate = useCallback((data) => {
    logger.info('CVEDetail', '웹소켓 업데이트 수신', data);
    if (!data) return;
    
    const fieldKey = data.field || 'general';
    
    // 폴백 타이머가 있으면 취소
    if (fallbackTimers.current[fieldKey]) {
      logger.info('CVEDetail', `폴백 타이머 취소: ${fieldKey}`);
      clearTimeout(fallbackTimers.current[fieldKey]);
      fallbackTimers.current[fieldKey] = null;
    }
    
    // 이미 처리된 업데이트인지 확인 (중복 방지)
    const currentTrigger = refreshTriggersRef.current[fieldKey] || 0;
    const updateId = data.updateId || Date.now();
    
    // 이미 처리된 업데이트라면 무시
    if (lastProcessedUpdateIdRef.current[fieldKey] === updateId) {
      logger.info('CVEDetail', `중복 업데이트 무시: ${fieldKey}, ID: ${updateId}`);
      return;
    }
    
    // 현재 업데이트 ID 저장
    lastProcessedUpdateIdRef.current[fieldKey] = updateId;
    
    // refreshTriggers 업데이트
    setRefreshTriggers(prev => {
      const newTriggers = { ...prev };
      newTriggers[fieldKey] = currentTrigger + 1;
      refreshTriggersRef.current = newTriggers;
      return newTriggers;
    });
    
    // 데이터 새로고침
    if (fieldKey !== 'comments') {
      // 코멘트가 아닌 다른 필드가 업데이트되면 데이터 전체 새로고침
      refetchCveDetail();
    }
    
    // 리프레시 알림
    if (!snackbarShown.current) {
      snackbarShown.current = true;
      const fieldName = fieldKey === 'all' ? '전체' : 
        fieldKey === 'poc' ? 'PoC' :
        fieldKey === 'snortRules' ? 'Snort Rules' :
        fieldKey === 'references' ? '참고자료' :
        fieldKey === 'comments' ? '댓글' : fieldKey;
      
      enqueueSnackbar(`${fieldName} 데이터가 업데이트되었습니다`, {
        variant: 'info',
        autoHideDuration: 2000,
        onClose: () => { snackbarShown.current = false; }
      });
    }
    
    setLoading(false);
  }, [enqueueSnackbar, refetchCveDetail]);

  // Socket.IO 업데이트 리스너
  useEffect(() => {
    if (!propsCveId || !isConnected || !socket) return;
    
    logger.info('CVEDetail', `${propsCveId} 업데이트 이벤트 리스닝 시작`);
    
    const handleCVEUpdated = (data) => {
      if (data && (data.cveId === propsCveId || data.id === propsCveId)) {
        logger.info('CVEDetail', 'CVE 업데이트 이벤트 수신', data);
        handleWebSocketUpdate(data);
      }
    };
    
    // Socket.IO 이벤트 등록
    socket.on('cve_updated', handleCVEUpdated);
    
    return () => {
      socket.off('cve_updated', handleCVEUpdated);
    };
  }, [propsCveId, isConnected, socket, handleWebSocketUpdate]);

  // CVE 구독 처리
  useEffect(() => {
    if (!propsCveId || !open || !isConnected) return;

    logger.info('CVEDetail', `CVE ${propsCveId} 업데이트 이벤트 리스닝 시작`);
    logger.info('CVEDetail', `CVE 구독 시도: ${propsCveId}`);
    
    // 구독 요청 전송
    const subscriptionResult = subscribe();
    
    if (!subscriptionResult) {
      logger.warn('CVEDetail', `CVE ${propsCveId} 구독 요청 실패`);
    }
    
    // 브라우저 종료/새로고침 시 구독 해제 처리
    const handleBeforeUnload = () => {
      logger.info('CVEDetail', `브라우저 종료/새로고침 - CVE 구독 해제: ${propsCveId}`);
      unsubscribe();
    };
    
    // 브라우저 종료/새로고침 이벤트 리스너 등록
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // 클린업 함수
    return () => {
      // 컴포넌트가 언마운트되거나 propsCveId, open, isConnected가 변경될 때만 실행
      if (propsCveId && isConnected) {
        logger.info('CVEDetail', `CVE 구독 해제: ${propsCveId}`);
        unsubscribe();
      }
      
      // 브라우저 이벤트 리스너 제거
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [propsCveId, open, isConnected]); // subscribe와 unsubscribe 의존성 제거

  // 구독자 정보 업데이트
  useEffect(() => {
    if (subscribers && subscribers.length > 0) {
      logger.info('CVEDetail', '구독자 정보 업데이트', { count: subscribers.length });
      setLocalSubscribers(subscribers);
    } else if (currentUser && localSubscribers.length === 0) {
      // 구독자 목록이 비어있지만 현재 사용자 정보로 채움
      const userInfo = {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName || currentUser.username,
        profileImage: currentUser.profileImage
      };
      logger.info('CVEDetail', '사용자 정보로 구독자 초기화', userInfo);
      setLocalSubscribers([userInfo]);
    }
  }, [subscribers, currentUser, localSubscribers.length]);

  // 편집 권한 확인
  const canEdit = useCallback(() => {
    // 여기에 필요한 권한 체크 로직 추가
    return true; // 현재는 항상 true 반환, 필요시 권한 로직 구현
  }, []);

  // 필드 업데이트 처리
  const handleFieldUpdate = useCallback((field, value) => {
    if (!propsCveId || !field) return;
    
    // 업데이트 중 상태 표시
    setLoading(true);
    
    // 폴백 타이머 설정 (웹소켓 이벤트가 오지 않을 경우를 대비)
    const fallbackTimerID = setTimeout(() => {
      logger.info('CVEDetail', `웹소켓 이벤트 타임아웃 - 수동 업데이트 실행: ${field}`);
      refetchCveDetail();
      setLoading(false);
    }, 5000);
    
    // 폴백 타이머 저장
    fallbackTimers.current[field] = fallbackTimerID;
    
    // 필드 업데이트 실행
    updateCVEField(
      { cveId: propsCveId, field, value },
      {
        onSuccess: () => {
          enqueueSnackbar('필드가 성공적으로 업데이트되었습니다', {
            variant: 'success',
            anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
          });
          
          // 웹소켓 이벤트를 기다리지 않고 즉시 UI 업데이트
          if (!isConnected) {
            refetchCveDetail();
            setLoading(false);
          }
        },
        onError: (err) => {
          enqueueSnackbar(`업데이트 실패: ${err.message || '알 수 없는 오류'}`, {
            variant: 'error',
            anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
          });
          setLoading(false);
          
          // 폴백 타이머 취소
          if (fallbackTimers.current[field]) {
            clearTimeout(fallbackTimers.current[field]);
            fallbackTimers.current[field] = null;
          }
        }
      }
    );
  }, [propsCveId, updateCVEField, enqueueSnackbar, isConnected, refetchCveDetail]);

  // 타이틀 업데이트 핸들러
  const handleTitleUpdate = useCallback(async (newTitle) => {
    if (!cveData || !propsCveId || newTitle === cveData.title) return;
    handleFieldUpdate('title', newTitle);
  }, [cveData, propsCveId, handleFieldUpdate]);

  // 설명 업데이트 핸들러
  const handleDescriptionUpdate = useCallback(async (newDescription) => {
    if (!cveData || !propsCveId || newDescription === cveData.description) return;
    handleFieldUpdate('description', newDescription);
  }, [cveData, propsCveId, handleFieldUpdate]);

  // 상태 업데이트 핸들러
  const handleStatusUpdate = useCallback(async (newStatus) => {
    if (!cveData || !propsCveId || newStatus === cveData.status) return;
    handleFieldUpdate('status', newStatus);
  }, [cveData, propsCveId, handleFieldUpdate]);

  // 새로고침 핸들러
  const handleRefresh = useCallback(() => {
    if (!propsCveId) return;
    
    if (snackbarShown.current) {
      closeSnackbar();
    }
    
    enqueueSnackbar('데이터를 새로고침 중입니다...', { 
      variant: 'info',
      anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
    });
    snackbarShown.current = true;
    setLoading(true);
    
    refreshCVE(null, {
      onSuccess: () => {
        if (snackbarShown.current) {
          closeSnackbar();
          enqueueSnackbar('데이터가 성공적으로 새로고침 되었습니다', { 
            variant: 'success',
            anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
            autoHideDuration: 2000
          });
          snackbarShown.current = false;
        }
        
        // 모든 탭의 트리거 업데이트
        setRefreshTriggers(prev => ({
          general: prev.general + 1,
          poc: prev.poc + 1,
          snortRules: prev.snortRules + 1,
          references: prev.references + 1,
          comments: prev.comments + 1,
          history: prev.history + 1
        }));
        
        setLoading(false);
      },
      onError: (err) => {
        if (snackbarShown.current) {
          closeSnackbar();
          enqueueSnackbar(`새로고침 실패: ${err.message || '알 수 없는 오류'}`, { 
            variant: 'error',
            anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
          });
          snackbarShown.current = false;
        }
        setLoading(false);
      }
    });
  }, [propsCveId, refreshCVE, enqueueSnackbar, closeSnackbar]);

  // 탭 변경 핸들러
  const handleTabChange = useCallback((event, newValue) => {
    setActiveTab(newValue);
  }, []);
  
  // 시간 경과 표시 유틸리티
  const timeAgo = useCallback((timestamp) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}초`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간`;
    return `${Math.floor(seconds / 86400)}일`;
  }, []);
  
  // 자식 컴포넌트에 전달할 메시지 전송 함수
  const sendMessage = useCallback(async (type, data) => {
    if (!socket || !isConnected) {
      logger.warn('CVEDetail', '소켓 연결이 없어 메시지를 보낼 수 없습니다');
      return null;
    }
    
    try {
      logger.info('CVEDetail', `메시지 전송: ${type}`, data);
      
      // 실제 메시지 전송 (Socket.IO emit)
      socket.emit(type, {
        cve_id: propsCveId,
        ...data
      });
      
      // 업데이트가 필요한 필드에 따라 폴백 타이머 설정
      let fieldToUpdate = 'general';
      
      if (type.includes('comment')) {
        fieldToUpdate = 'comments';
      } else if (type.includes('poc')) {
        fieldToUpdate = 'poc';
      } else if (type.includes('snort')) {
        fieldToUpdate = 'snortRules';
      } else if (type.includes('reference')) {
        fieldToUpdate = 'references';
      }
      
      // 폴백 타이머 설정
      const fallbackTimerID = setTimeout(() => {
        logger.info('CVEDetail', `웹소켓 이벤트 타임아웃 - 수동 업데이트 실행: ${fieldToUpdate}`);
        refetchCveDetail();
        handleWebSocketUpdate({ field: fieldToUpdate });
      }, 3000);
      
      fallbackTimers.current[fieldToUpdate] = fallbackTimerID;
      
      return true;
    } catch (error) {
      logger.error('CVEDetail', `메시지 전송 오류: ${type}`, error);
      enqueueSnackbar('메시지 전송 실패', { variant: 'error' });
      throw error;
    }
  }, [socket, isConnected, propsCveId, enqueueSnackbar, refetchCveDetail, handleWebSocketUpdate]);

  // 로딩 상태 계산 - isFetching 조건 제거
  const isLoading = isQueryLoading || loading || isRefreshing;

  // 에러 다이얼로그 닫기 핸들러
  const handleErrorDialogClose = useCallback(() => {
    setErrorDialogOpen(false);
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  // 모달을 열 때마다 데이터 새로고침
  useEffect(() => {
    if (open && propsCveId) {
      logger.info('CVEDetail', `모달 열림, CVE ID: ${propsCveId}`);
      setLoading(true); // 로딩 시작
      refetchCveDetail().then(() => {
        // 데이터 로딩 완료 후 로딩 상태 해제
        logger.info('CVEDetail', '데이터 로딩 완료');
        setLoading(false);
      }).catch(err => {
        logger.error('CVEDetail', '데이터 로딩 실패', { error: err.message });
        setLoading(false);
      });
    }
  }, [open, propsCveId, refetchCveDetail]);

  // 연결 상태 변경 시 알림
  useEffect(() => {
    if (open) {
      if (!isConnected) {
        logger.warn('CVEDetail', 'WebSocket 연결이 없습니다. 실시간 업데이트가 제한됩니다.');
        enqueueSnackbar('서버 연결 상태를 확인해주세요. 실시간 업데이트가 제한됩니다.', { 
          variant: 'warning',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
          autoHideDuration: 3000
        });
      }
    }
  }, [open, isConnected, enqueueSnackbar]);

  // 로딩 중 표시
  if (isLoading) {
    return (
      <Dialog 
        open={open} 
        maxWidth="lg" 
        fullWidth
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <CircularProgress />
        </Box>
      </Dialog>
    );
  }

  // 데이터가 없는 경우 처리
  if (!cveData && !isLoading) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm">
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">데이터 없음</Typography>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography>요청한 CVE 데이터를 찾을 수 없습니다.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="primary">닫기</Button>
        </DialogActions>
      </Dialog>
    );
  }

  // 에러 다이얼로그
  if (errorDialogOpen) {
    return (
      <Dialog open={errorDialogOpen} onClose={handleErrorDialogClose} maxWidth="sm">
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" color="error">오류 발생</Typography>
            <IconButton onClick={handleErrorDialogClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography>{errorMessage || '데이터를 불러오는 중 오류가 발생했습니다.'}</Typography>
          <Typography variant="body2" color="textSecondary" mt={2}>
            다시 시도하거나 관리자에게 문의하세요.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setErrorDialogOpen(false);
            refetchCveDetail();
          }} color="primary">
            다시 시도
          </Button>
          <Button onClick={handleErrorDialogClose} color="secondary">
            닫기
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

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
            <Typography variant="h6">{cveData.cveId} 상세 정보</Typography>
            {/* 구독자 정보 표시 조건 수정: isSubscribed 체크 제거 */}
            <SubscriberCount subscribers={localSubscribers} />
          </Box>
          <Box>
            <Tooltip title="새로고침">
              <IconButton onClick={handleRefresh} disabled={isLoading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <IconButton onClick={onClose} disabled={isLoading}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 0, height: '100%' }}>
        <Card elevation={0} sx={{ height: '100%' }}>
          <CardContent sx={{ p: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, flex: '0 0 auto' }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={7}>
                  <Box mb={2}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Title
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 1, borderRadius: 1, mb: 2 }}>
                      <InlineEditText
                        value={cveData.title}
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
                          height: detailExpanded ? '150px' : '60px'
                        }}
                      >
                        <InlineEditText
                          value={cveData.description}
                          onSave={handleDescriptionUpdate}
                          placeholder="설명을 입력하세요..."
                          multiline
                          disabled={!canEdit()}
                          fontSize="0.9rem"
                          externalEdit={detailExpanded}
                          onEditingStart={() => setDetailExpanded(true)}
                          onEditingEnd={() => setDetailExpanded(false)}
                        />
                      </Paper>
                      <Box sx={{ position: 'absolute', bottom: 4, right: 4 }}>
                        <IconButton size="small" onClick={() => setDetailExpanded((prev) => !prev)}>
                          {detailExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
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
                          bgcolor: value === cveData.status ? 'action.selected' : 'background.paper',
                          borderColor: value === cveData.status ? getStatusColor(value) : 'divider'
                        }}
                        onClick={() => canEdit() && handleStatusUpdate(value)}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, width: '100%' }}>
                          <CircleIcon sx={{ fontSize: 8, color: getStatusColor(value), flexShrink: 0, mt: 0.7 }} />
                          <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: value === cveData.status ? 600 : 400, color: value === cveData.status ? getStatusColor(value) : 'text.primary', lineHeight: 1.2 }}>
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
                value={activeTab}
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
                      color: activeTab === index ? tab.color : 'text.primary',
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
                <Box 
                  sx={{ 
                    display: activeTab === 0 ? 'block' : 'none', 
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
                    cve={cveData} 
                    currentUser={currentUser} 
                    refreshTrigger={refreshTriggers.poc} 
                    tabConfig={pocTabConfig}
                    sendMessage={sendMessage}
                  />
                </Box>
                <Box 
                  sx={{ 
                    display: activeTab === 1 ? 'block' : 'none', 
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
                    cve={cveData}
                    currentUser={currentUser}
                    refreshTrigger={refreshTriggers.snortRules}
                    tabConfig={snortRulesTabConfig}
                    onCountChange={(count) => setTabCounts(prev => ({ ...prev, snortRules: count }))}
                    sendMessage={sendMessage}
                  />
                </Box>
                <Box 
                  sx={{ 
                    display: activeTab === 2 ? 'block' : 'none', 
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
                    cve={cveData}
                    currentUser={currentUser}
                    refreshTrigger={refreshTriggers.references}
                    tabConfig={referencesTabConfig}
                    onCountChange={(count) => setTabCounts(prev => ({ ...prev, references: count }))}
                    sendMessage={sendMessage}
                  />
                </Box>
                <Box 
                  sx={{ 
                    display: activeTab === 3 ? 'block' : 'none', 
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
                    cve={cveData}
                    currentUser={currentUser}
                    refreshTrigger={refreshTriggers.comments}
                    onCountChange={(count) => setTabCounts(prev => ({ ...prev, comments: count }))}
                    sendMessage={sendMessage}
                  />
                </Box>
                <Box 
                  sx={{ 
                    display: activeTab === 4 ? 'block' : 'none', 
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
                  <HistoryTab modificationHistory={cveData?.modificationHistory || []} />
                </Box>
              </Box>
            </Box>
            {/* 캐시 정보 표시 */}
            {isCached && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2, p: 1 }}>
                <Chip 
                  size="small" 
                  label="캐시된 데이터" 
                  color="info" 
                  variant="outlined"
                  sx={{ fontWeight: 500 }}
                />
                {cveData._cachedAt && (
                  <Typography variant="caption" color="text.secondary">
                    서버와 {timeAgo(cveData._cachedAt)} 전에 동기화됨
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
  cveId: PropTypes.string,
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired
};

export default React.memo(CVEDetail);