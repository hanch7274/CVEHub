// CVEDetail.jsx
import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
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
import { pocTabConfig, snortRulesTabConfig, referencesTabConfig } from './components/tabConfigs';
import CommentsTab from './components/CommentsTab';
import HistoryTab from './components/HistoryTab';
import InlineEditText from './components/InlineEditText';
import PropTypes from 'prop-types';
import { cveService } from '../../api/services/cveService';
import { useCVEDetail, useCVERefresh, useCVEFieldUpdate } from '../../api/hooks/useCVEQuery';
import useCVESubscription from '../../api/hooks/useCVESubscription';

// 웹소켓 임시 비활성화 상수 추가
const DISABLE_WEBSOCKET = true; // 웹소켓 기능 일시적 비활성화

// 고정된 더미 구독자 데이터
const DUMMY_SUBSCRIBERS = [];

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

// 로그 레벨 설정
const LOG_LEVEL = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4
};

// 현재 로그 레벨 설정
const CURRENT_LOG_LEVEL = process.env.NODE_ENV === 'development' ? LOG_LEVEL.INFO : LOG_LEVEL.ERROR;

// 로그 유틸리티
const log = {
  debug: (message, data) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG) {
      console.debug(`[CVEDetail] ${message}`, data);
    }
  },
  info: (message, data) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO) {
      console.log(`[CVEDetail] ${message}`, data);
    }
  },
  warn: (message, data) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN) {
      console.warn(`[CVEDetail] ${message}`, data);
    }
  },
  error: (message, error) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR) {
      console.error(`[CVEDetail] ${message}`, error);
    }
  }
};

const CVEDetail = ({ cveId: propsCveId, open = false, onClose }) => {
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const { socket, connected: isConnected } = useSocketIO();

  // 로컬 상태
  const [activeTab, setActiveTab] = useState(0);
  const [detailExpanded, setDetailExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCached, setIsCached] = useState(false);
  const [localSubscribers, setLocalSubscribers] = useState(DUMMY_SUBSCRIBERS);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);

  // 리프레시 트리거 (각 탭의 데이터 새로고침 관리)
  const [refreshTriggers, setRefreshTriggers] = useState({
    general: 0,
    poc: 0,
    snortRules: 0,
    references: 0,
    comments: 0,
    history: 0
  });

  // 폴백 타이머 및 이전 상태 참조
  const fallbackTimers = useRef({});
  const previousSubscribersRef = useRef('');
  const snackbarShown = useRef(false);

  // 지연 로딩 상태 관리 (UI 최적화)
  const [loadingStates, setLoadingStates] = useState({});

  // 구독 기능 (Socket.IO)
  const { 
    subscribe, 
    unsubscribe, 
    isSubscribed, 
    subscribers = DUMMY_SUBSCRIBERS,
    isLoading: isSubscriptionLoading,
    error: subscriptionError
  } = useCVESubscription(propsCveId);

  // 웹소켓 메시지 핸들러
  const handleWebSocketUpdate = useCallback((data) => {
    if (!data || !data.field) return;
    
    const fieldKey = data.field || 'general';
    if (fallbackTimers.current[fieldKey]) {
      console.log(`[CVEDetail] 웹소켓 이벤트 수신 - 폴백 타이머 취소: ${fieldKey}`);
      clearTimeout(fallbackTimers.current[fieldKey]);
      fallbackTimers.current[fieldKey] = null;
    }
    
    // refreshTriggers 업데이트 (handleRefreshTrigger 함수 대신 직접 로직 구현)
    refreshTriggers.current = {
      ...refreshTriggers.current,
      [fieldKey]: (refreshTriggers.current[fieldKey] || 0) + 1
    };
    
    // 리프레시 알림
    if (!snackbarShown.current) {
      snackbarShown.current = true;
      enqueueSnackbar(`${fieldKey === 'all' ? '전체' : fieldKey} 데이터가 업데이트되었습니다`, {
        variant: 'info',
        autoHideDuration: 2000,
        onClose: () => { snackbarShown.current = false; }
      });
    }
    
    setLoading(false);
  }, [enqueueSnackbar]);

  // Socket.IO 업데이트 리스너
  useEffect(() => {
    if (!propsCveId || !isConnected || !socket || DISABLE_WEBSOCKET) return;
    
    console.log(`[CVEDetail] ${propsCveId} 업데이트 이벤트 리스닝 시작`);
    
    // Socket.IO를 통한 업데이트 구독
    socket.on('cve:updated', (data) => {
      if (data && data.id === propsCveId) {
        console.log(`[CVEDetail] CVE 업데이트 이벤트 수신: ${propsCveId}`, data);
        handleWebSocketUpdate(data);
      }
    });
    
    return () => {
      socket.off('cve:updated');
    };
  }, [propsCveId, isConnected, socket, handleWebSocketUpdate]);

  // React Query를 사용한 CVE 상세 정보 조회
  const {
    data: cveData,
    isLoading: isQueryLoading,
    isError: isQueryError,
    error: queryError,
    refetch: refetchCveDetail,
  } = useCVEDetail(propsCveId, {
    enabled: !!propsCveId && open,
    onSuccess: (data) => {
      if (snackbarShown.current) {
        closeSnackbar();
        enqueueSnackbar('데이터를 성공적으로 불러왔습니다', { 
          variant: 'success',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
          autoHideDuration: 2000
        });
        snackbarShown.current = false;
      }
      setIsCached(false);
    },
    onError: (err) => {
      if (snackbarShown.current) {
        closeSnackbar();
        enqueueSnackbar(`데이터 로딩 실패: ${err.message || '알 수 없는 오류'}`, { 
          variant: 'error',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
        });
        snackbarShown.current = false;
      }
      setError(err.message || '데이터 로딩 실패');
    }
  });
  
  // CVE 새로고침 뮤테이션
  const { mutate: refreshCVE, isLoading: isRefreshing } = useCVERefresh(propsCveId);
  
  // 필드 업데이트 뮤테이션
  const { mutate: updateCVEField, isLoading: isUpdating } = useCVEFieldUpdate();

  // 편집 권한 확인
  const canEdit = useCallback(() => {
    return true; // 현재는 항상 true 반환, 필요시 권한 로직 구현
  }, []);

  // 필드 업데이트 처리
  const handleFieldUpdate = useCallback((field, value) => {
    updateCVEField(
      { cveId: propsCveId, field, value },
      {
        onSuccess: () => {
          enqueueSnackbar('필드가 성공적으로 업데이트되었습니다', {
            variant: 'success',
            anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
          });
        },
        onError: (err) => {
          enqueueSnackbar(`업데이트 실패: ${err.message || '알 수 없는 오류'}`, {
            variant: 'error',
            anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
          });
        }
      }
    );
  }, [propsCveId, updateCVEField, enqueueSnackbar]);

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
      }
    });
  }, [propsCveId, refreshCVE, enqueueSnackbar, closeSnackbar]);

  // 나머지 코드는 그대로 유지
  // ...

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      scroll="paper"
      TransitionComponent={Fade}
      TransitionProps={{ timeout: 300 }}
    >
      {/* 다이얼로그 내용은 기존대로 유지 */}
      {/* ... */}
      
      {/* 에러 다이얼로그 */}
      <Dialog open={errorDialogOpen} onClose={() => setErrorDialogOpen(false)}>
        <DialogTitle>에러 발생</DialogTitle>
        <DialogContent>
          <Typography>{error || '알 수 없는 오류가 발생했습니다'}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setErrorDialogOpen(false)}>
            닫기
          </Button>
          <Button 
            onClick={() => {
              setErrorDialogOpen(false);
              refetchCveDetail();
            }} 
            variant="contained" 
            color="primary"
            startIcon={<RefreshIcon />}
          >
            다시 시도
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

CVEDetail.propTypes = {
  cveId: PropTypes.string,
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired
};

export default CVEDetail;