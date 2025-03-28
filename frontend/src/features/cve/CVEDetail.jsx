import PropTypes from 'prop-types';
import React, { 
  useState, 
  useEffect, 
  useRef, 
  useCallback, 
  useMemo,
  memo,
  useLayoutEffect 
} from 'react';
import { useSocketIO } from '../../contexts/SocketIOContext';
import { useSnackbar } from 'notistack';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  DialogContentText,
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
  Visibility as VisibilityIcon,
  AccessTimeIcon,
  UpdateIcon
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
import logger from '../../utils/logging';
import {
  useCVEDetail,
  useCVERefresh,
  useCVESubscription
} from '../../api/hooks/useCVEQuery';
import { useUpdateCVEField } from '../../api/hooks/useCVEMutation';
import { useAuth } from '../../contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '../../api/queryKeys';
import { formatDateTime, timeAgo, TIME_ZONES } from '../../utils/dateUtils';

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

// 상태 카드 스타일
const statusCardStyle = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: '8px 12px',
  minHeight: '60px',
  border: '1px solid',
  borderRadius: 1,
  cursor: 'pointer',
  transition: 'all 0.2s',
  '&:hover': {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
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
  const { socket, connected } = useSocketIO();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // 로컬 상태
  const [activeTab, setActiveTab] = useState(0);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
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

  // 소켓 참조를 useRef로 관리하여 이벤트 핸들러에서 항상 최신 값 참조
  const socketRef = useRef(socket);
  const connectedRef = useRef(connected);

  // 소켓 및 연결 상태 업데이트
  useEffect(() => {
    // 소켓 참조 업데이트
    socketRef.current = socket;
    connectedRef.current = connected;
    
    // 디버깅 정보 업데이트
    setSocketDebugInfo({
      hasSocket: !!socket,
      socketId: socket?.id,
      connected,
      lastUpdated: Date.now()
    });
    
    // 소켓 연결 상태가 변경될 때마다 불필요한 로깅 방지
    if (process.env.NODE_ENV === 'development') {
      logger.info('CVEDetail', '소켓 참조 업데이트됨', {
        socketId: socket?.id,
        connected,
        hasSocket: !!socket
      });
    }
  }, [socket, connected]);

  // 불필요한 타이머 관련 ref 제거
  const snackbarShown = useRef(false);
  const refreshTriggersRef = useRef(refreshTriggers);
  const lastProcessedUpdateIdRef = useRef({});

  // 현재 사용자 참조
  const currentUserRef = useRef();
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // 소켓 디버깅 상태
  const [socketDebugInfo, setSocketDebugInfo] = useState({
    hasSocket: false,
    socketId: undefined,
    connected: false,
    lastUpdated: Date.now()
  });

  // 구독 기능 (Socket.IO)
  const { 
    subscribe, 
    unsubscribe, 
    isSubscribed,
    subscribers = [],
  } = useCVESubscription(propsCveId);

  // 사용자가 로그인 후 처음 데이터를 로드하는지 확인하는 ref
  const isFirstLoadRef = useRef(true);
  
  // 구독 요청 디바운싱을 위한 타이머 ref
  const subscriptionTimerRef = useRef(null);
  
  // 구독 상태 로컬 캐싱
  const isSubscribedRef = useRef(isSubscribed);
  
  // 구독 상태 업데이트
  useEffect(() => {
    isSubscribedRef.current = isSubscribed;
  }, [isSubscribed]);
  
  // 로컬 구독자 상태 업데이트
  useEffect(() => {
    if (Array.isArray(subscribers)) {
      setLocalSubscribers(subscribers);
    }
  }, [subscribers]);

  // 디바운스된 구독 함수
  const debouncedSubscribe = useCallback(() => {
    // 이미 타이머가 있다면 제거
    if (subscriptionTimerRef.current) {
      clearTimeout(subscriptionTimerRef.current);
    }
    
    // 300ms 후에 구독 요청 실행
    subscriptionTimerRef.current = setTimeout(() => {
      // 이미 구독 중이 아니고, 소켓이 연결되어 있을 때만 구독
      if (!isSubscribedRef.current && connectedRef.current && socketRef.current && propsCveId) {
        logger.info('CVEDetail', `디바운스된 구독 요청 실행: ${propsCveId}`, {
          isSubscribed: isSubscribedRef.current,
          connected: connectedRef.current,
          hasSocket: !!socketRef.current
        });
        subscribe();
      }
    }, 300);
  }, [propsCveId, subscribe]);
  
  // 디바운스된 구독 해제 함수
  const debouncedUnsubscribe = useCallback(() => {
    // 이미 타이머가 있다면 제거
    if (subscriptionTimerRef.current) {
      clearTimeout(subscriptionTimerRef.current);
    }
    
    // 300ms 후에 구독 해제 요청 실행
    subscriptionTimerRef.current = setTimeout(() => {
      // 구독 중이고, 소켓이 연결되어 있을 때만 구독 해제
      if (isSubscribedRef.current && connectedRef.current && socketRef.current && propsCveId) {
        logger.info('CVEDetail', `디바운스된 구독 해제 요청 실행: ${propsCveId}`, {
          isSubscribed: isSubscribedRef.current,
          connected: connectedRef.current,
          hasSocket: !!socketRef.current
        });
        unsubscribe();
      }
    }, 300);
  }, [propsCveId, unsubscribe]);

  // React Query를 사용한 CVE 상세 정보 조회
  const {
    data: cveData,
    isLoading: isQueryLoading,
    isFetching,
    dataUpdatedAt,
    refetch: refetchCveDetail,
  } = useCVEDetail(propsCveId, {
    // enabled 옵션 단순화: 모달이 열려있고 propsCveId가 있을 때만 자동으로 쿼리 실행
    enabled: !!propsCveId && open,
    // 캐시 활용 최적화: 이전 데이터가 있으면 로딩 상태 표시하지 않음
    keepPreviousData: true,
    // 소켓 연결 상태 변경 시 자동 리페치 방지
    refetchOnReconnect: false,
    onSuccess: (data) => {
      logger.info('CVEDetail', '데이터 로딩 성공', { dataReceived: !!data });
      
      // 시간 필드 디버깅을 위한 로그 추가
      if (data) {
        console.log('CVE 데이터 시간 필드 디버깅:', {
          createdAt: {
            값: data.createdAt,
            타입: typeof data.createdAt,
            JSON형식: JSON.stringify(data.createdAt),
            toString: String(data.createdAt || ''),
            isDate: data.createdAt instanceof Date,
            isISOString: typeof data.createdAt === 'string' && 
                     /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(data.createdAt)
          },
          lastModifiedAt: {
            값: data.lastModifiedAt,
            타입: typeof data.lastModifiedAt,
            JSON형식: JSON.stringify(data.lastModifiedAt),
            toString: String(data.lastModifiedAt || ''),
            isDate: data.lastModifiedAt instanceof Date,
            isISOString: typeof data.lastModifiedAt === 'string' && 
                     /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(data.lastModifiedAt)
          }
        });
      }
      
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
      setLoading(false); // 로딩 상태 해제
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
      setError(err.message || '데이터 로딩 실패');
      setLoading(false); // 로딩 상태 해제
      setErrorDialogOpen(true);
    }
  });
  
  // 데이터가 캐시에서 왔는지 확인하는 메모이즈된 값
  const isDataFromCache = useMemo(() => {
    if (cveData && dataUpdatedAt) {
      const cacheThreshold = 30 * 1000;
      const now = new Date().getTime();
      return (now - dataUpdatedAt) > cacheThreshold;
    }
    return false;
  }, [cveData, dataUpdatedAt]);

  // 캐시 상태 업데이트
  useEffect(() => {
    setIsCached(isDataFromCache);
  }, [isDataFromCache]);
  
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

  // 필드 업데이트 처리 - 낙관적 업데이트 적용
  const handleFieldUpdate = useCallback(async (field, value) => {
    if (!propsCveId || !field) return;
    
    // 필드 이름 매핑 (프론트엔드 camelCase -> 백엔드 snake_case)
    const fieldMapping = {
      title: 'title',
      description: 'description',
      status: 'status',
      severity: 'severity',
      cvssScore: 'cvss_score',
      cvssVector: 'cvss_vector',
      affectedSystems: 'affected_systems',
      poc: 'pocs',
      snortRules: 'snort_rules',
      references: 'references'
    };
    
    // 백엔드 필드 이름
    const backendField = fieldMapping[field] || field;
    
    // 업데이트할 데이터 준비
    const updateData = { [backendField]: value };
    
    // 현재 캐시된 데이터 가져오기
    const cachedData = queryClient.getQueryData(QUERY_KEYS.CVE.detail(propsCveId));
    
    // 낙관적 업데이트를 위한 새 데이터 생성
    if (cachedData) {
      // 캐시 데이터 복사
      const optimisticData = { ...cachedData };
      
      // 프론트엔드 필드 이름으로 업데이트
      optimisticData[field] = value;
      
      // 캐시 직접 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(propsCveId), optimisticData);
      
      // 리프레시 트리거 업데이트
      const currentTrigger = refreshTriggersRef.current[field] || 0;
      setRefreshTriggers(prev => {
        const newTriggers = { ...prev };
        newTriggers[field] = currentTrigger + 1;
        refreshTriggersRef.current = newTriggers;
        return newTriggers;
      });
      
      // 탭 카운트 업데이트
      if (['poc', 'snortRules', 'references'].includes(field) && Array.isArray(value)) {
        updateTabCounts({ ...cachedData, [field]: value });
      }
    }
    
    setLoading(true);
    
    // 서버에 업데이트 요청
    updateCVEField(
      { cveId: propsCveId, fieldName: backendField, fieldValue: value },
      {
        onSuccess: () => {
          logger.info('CVEDetail', `필드 업데이트 성공: ${field}`);
          
          // 목록 쿼리 무효화 (필요한 경우)
          if (['title', 'status', 'severity', 'cvssScore'].includes(field)) {
            queryClient.invalidateQueries({
              predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === QUERY_KEYS.CVE.list
            });
          }
        },
        onError: (err) => {
          logger.error('CVEDetail', `필드 업데이트 실패: ${field}`, { error: err.message });
          
          // 오류 발생 시 원래 데이터로 롤백
          if (cachedData) {
            queryClient.setQueryData(QUERY_KEYS.CVE.detail(propsCveId), cachedData);
          }
          
          // 오류 알림
          enqueueSnackbar(`업데이트 실패: ${err.message || '알 수 없는 오류'}`, {
            variant: 'error',
            anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
          });
        }
      }
    );
  }, [propsCveId, updateCVEField, queryClient, enqueueSnackbar, setLoading, updateTabCounts]);

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

  // 웹소켓 메시지 핸들러 - 최적화
  const handleWebSocketUpdate = useCallback((data) => {
    logger.info('CVEDetail', '웹소켓 업데이트 수신', data);
    if (!data) return;
    
    const fieldKey = data.field || 'general';
    
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
    
    // 캐시 직접 업데이트 (쿼리 무효화 대신)
    if (fieldKey !== 'comments' && !loading && !isQueryLoading) {
      try {
        // 현재 캐시된 데이터 가져오기
        const cachedData = queryClient.getQueryData(QUERY_KEYS.CVE.detail(propsCveId));
        
        if (cachedData) {
          logger.info('CVEDetail', `${fieldKey} 필드 업데이트를 위한 캐시 직접 업데이트`);
          
          // 데이터에 업데이트된 필드 적용
          let updatedData = { ...cachedData };
          
          // 업데이트할 데이터가 있는 경우
          if (data.updatedData) {
            if (fieldKey === 'all') {
              // 전체 데이터 업데이트
              updatedData = { ...updatedData, ...data.updatedData };
            } else if (fieldKey === 'poc' && data.updatedData.pocs) {
              // PoC 업데이트
              updatedData.pocs = data.updatedData.pocs;
            } else if (fieldKey === 'snortRules' && data.updatedData.snortRules) {
              // Snort Rules 업데이트
              updatedData.snortRules = data.updatedData.snortRules;
            } else if (fieldKey === 'references' && data.updatedData.references) {
              // 참고자료 업데이트
              updatedData.references = data.updatedData.references;
            } else if (fieldKey === 'status' && data.updatedData.status) {
              // 상태 업데이트
              updatedData.status = data.updatedData.status;
            } else if (fieldKey === 'title' && data.updatedData.title) {
              // 제목 업데이트
              updatedData.title = data.updatedData.title;
            }
          }
          
          // 캐시 직접 업데이트
          queryClient.setQueryData(QUERY_KEYS.CVE.detail(propsCveId), updatedData);
        } else {
          // 캐시된 데이터가 없는 경우에만 쿼리 무효화
          logger.info('CVEDetail', `캐시된 데이터 없음, 쿼리 무효화 수행: ${fieldKey}`);
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(propsCveId) });
        }
      } catch (error) {
        logger.error('CVEDetail', '캐시 업데이트 중 오류 발생', { error: error.message });
        // 오류 발생 시 안전하게 쿼리 무효화
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(propsCveId) });
      }
    }
    
    // 리프레시 알림
    if (!snackbarShown.current) {
      snackbarShown.current = true;
      
      // 필드 이름을 사용자 친화적으로 변환
      let fieldName;
      switch(fieldKey) {
        case 'all': fieldName = '전체'; break;
        case 'poc': fieldName = 'PoC'; break;
        case 'snortRules': fieldName = 'Snort Rules'; break;
        case 'references': fieldName = '참고자료'; break;
        case 'comments': fieldName = '댓글'; break;
        case 'status': fieldName = '상태'; break;
        case 'title': fieldName = '제목'; break;
        case 'description': fieldName = '설명'; break;
        default: fieldName = fieldKey;
      }
      
      // 스낵바 메시지 표시
      enqueueSnackbar(`${fieldName} 필드가 성공적으로 업데이트되었습니다`, {
        variant: 'success',
        autoHideDuration: 2000,
        onClose: () => { snackbarShown.current = false; }
      });
    }
    
    setLoading(false);
  }, [enqueueSnackbar, propsCveId, queryClient, loading, isQueryLoading]);

  // 웹소켓 이벤트 핸들러를 useCallback으로 안정화
  const handleCVEUpdated = useCallback((data) => {
    if (!data || !(data.cveId === propsCveId || data.id === propsCveId)) return;
    
    logger.info('CVEDetail', 'CVE 업데이트 이벤트 수신', {
      dataId: data.id || data.cveId,
      propsCveId,
      type: data.field_key || 'general'
    });
    
    // 이미 처리된 업데이트인지 확인
    const fieldKey = data.field_key || 'general';
    const updateId = data.updateId || Date.now();
    
    if (lastProcessedUpdateIdRef.current[fieldKey] === updateId) {
      logger.info('CVEDetail', `중복 업데이트 무시: ${fieldKey}, ID: ${updateId}`);
      return;
    }
    
    // 댓글 필드는 별도로 처리
    if (fieldKey === 'comments') {
      // 댓글은 별도의 쿼리로 처리되므로 여기서는 무시
      return;
    }
    
    // 로딩 중이 아닐 때만 처리
    if (!loading && !isQueryLoading) {
      // 웹소켓 업데이트 처리 - 낙관적 업데이트 적용
      handleWebSocketUpdate(data);
    }
  }, [propsCveId, handleWebSocketUpdate, loading, isQueryLoading]);

  // 이벤트 리스너 등록 및 해제 (분리된 useEffect)
  useEffect(() => {
    if (!propsCveId || !open) return;
    
    // socket과 connected 상태를 모두 확인
    if (!socketRef.current || !connectedRef.current) {
      logger.warn('CVEDetail', '소켓 객체가 초기화되지 않았거나 연결되지 않았습니다', {
        hasSocket: !!socketRef.current,
        socketId: socketRef.current?.id,
        connected: connectedRef.current
      });
      return;
    }
    
    const currentSocket = socketRef.current;
    
    // 소켓 연결 상태 확인 및 로그
    logger.info('CVEDetail', '소켓 이벤트 리스너 등록 중', {
      socketId: currentSocket.id,
      connected: connectedRef.current,
      event: 'cve_updated'
    });

    try {
      // 소켓이 존재하고 연결된 상태일 때만 이벤트 리스너 등록
      currentSocket.on('cve_updated', handleCVEUpdated);
      
      logger.info('CVEDetail', '소켓 이벤트 리스너 등록 성공', {
        event: 'cve_updated',
        socketId: currentSocket.id
      });
    } catch (error) {
      logger.error('CVEDetail', '소켓 이벤트 리스너 등록 실패', {
        error: error.message,
        stack: error.stack
      });
    }
    
    // 컴포넌트 언마운트 또는 의존성 변경 시 이벤트 리스너 제거
    return () => {
      try {
        if (currentSocket && currentSocket.connected) {
          logger.info('CVEDetail', '소켓 이벤트 리스너 제거', {
            socketId: currentSocket.id,
            event: 'cve_updated'
          });
          currentSocket.off('cve_updated', handleCVEUpdated);
        }
      } catch (error) {
        logger.error('CVEDetail', '소켓 이벤트 리스너 제거 중 오류 발생', {
          error: error.message
        });
      }
    };
  }, [propsCveId, open, handleCVEUpdated]);

  // 모달을 열 때 데이터 새로고침 및 구독 처리
  useEffect(() => {
    // open 상태가 변경될 때만 실행
    if (open && propsCveId) {
      // 로딩 상태 설정
      setLoading(true);
      
      // 이미 데이터가 있는 경우 추가 요청 방지 (첫 로딩 시에만 요청)
      if (!cveData) {
        // 데이터 새로고침
        refetchCveDetail()
          .then(() => {
            // 성공적으로 데이터를 가져온 경우 로딩 상태 해제
            setLoading(false);
            
            // 모달이 열렸을 때 구독 요청 (소켓이 연결된 경우에만)
            if (connectedRef.current && socketRef.current && !isSubscribedRef.current) {
              logger.info('CVEDetail', `모달 열림, 구독 요청: ${propsCveId}`);
              debouncedSubscribe();
            }
          })
          .catch(err => {
            logger.error('CVEDetail', '데이터 로딩 실패', { error: err.message });
            setLoading(false);
          });
      } else {
        // 이미 데이터가 있는 경우 로딩 상태만 해제
        setLoading(false);
        
        // 구독 요청 처리
        if (connectedRef.current && socketRef.current && !isSubscribedRef.current) {
          logger.info('CVEDetail', `모달 열림, 구독 요청 (기존 데이터 있음): ${propsCveId}`);
          debouncedSubscribe();
        }
      }
    } else if (!open) {
      // 모달이 닫힐 때 구독 해제 및 로딩 상태 초기화
      if (isSubscribedRef.current && connectedRef.current && socketRef.current && propsCveId) {
        logger.info('CVEDetail', `모달 닫힘, 구독 해제 요청: ${propsCveId}`);
        debouncedUnsubscribe();
      }
      setLoading(false);
    }
    
    // 첫 마운트 시 실행 여부를 추적하기 위한 ref
    const isFirstMount = isFirstLoadRef.current;
    isFirstLoadRef.current = false;
    
    return () => {
      // 컴포넌트 언마운트 시 첫 마운트 플래그 초기화
      if (!open) {
        isFirstLoadRef.current = true;
      }
    };
  }, [open, propsCveId, cveData, refetchCveDetail, debouncedSubscribe, debouncedUnsubscribe]);

  // 소켓 연결 상태 변경 시 구독 처리
  useEffect(() => {
    // 컴포넌트가 마운트되고 모달이 열려있을 때만 구독 요청
    if (open && propsCveId && connectedRef.current && socketRef.current) {
      // 이미 구독 중이 아닐 때만 구독 요청
      if (!isSubscribedRef.current) {
        // 디바운스된 구독 함수 호출
        debouncedSubscribe();
      }
    }
    
    // 컴포넌트 언마운트 시 구독 해제
    return () => {
      if (subscriptionTimerRef.current) {
        clearTimeout(subscriptionTimerRef.current);
      }
      
      // 구독 중이었다면 구독 해제
      if (isSubscribedRef.current && propsCveId) {
        debouncedUnsubscribe();
      }
    };
  }, [propsCveId, open, debouncedSubscribe, debouncedUnsubscribe]);

  // 로딩 상태 계산 - 수정
  const isLoading = useMemo(() => {
    // 명시적으로 로딩 상태를 계산하고 로그 출력
    const loadingState = isQueryLoading || loading || isRefreshing || isFetching;
    
    if (loadingState) {
      logger.debug('CVEDetail', '로딩 상태 확인', { 
        isQueryLoading, 
        loading, 
        isRefreshing, 
        isFetching,
        cveId: propsCveId
      });
    }
    
    return loadingState;
  }, [isQueryLoading, loading, isRefreshing, isFetching, propsCveId]);

  // 로딩 상태가 변경될 때마다 로그 출력
  useEffect(() => {
    logger.info('CVEDetail', `로딩 상태 변경: ${isLoading ? '로딩 중' : '로딩 완료'}`, {
      isQueryLoading,
      loading,
      isRefreshing,
      isFetching,
      cveId: propsCveId,
      dataReceived: !!cveData
    });
  }, [isLoading, isQueryLoading, loading, isRefreshing, isFetching, propsCveId, cveData]);

  // 에러 다이얼로그 닫기 핸들러
  const handleErrorDialogClose = useCallback(() => {
    setErrorDialogOpen(false);
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  // 컴포넌트 마운트 시 로그인 후 첫 로드인 경우 데이터 갱신
  useEffect(() => {
    // 컴포넌트가 마운트되고 CVE ID가 유효하고 isFirstLoadRef가 true인 경우만 실행
    if (propsCveId && open && isFirstLoadRef.current) {
      // 첫 로드 표시 해제
      isFirstLoadRef.current = false;
      
      // 로그인 후 첫 로드 시 데이터 갱신
      const lastVisitTime = localStorage.getItem('lastVisitTime');
      const currentTime = new Date().getTime();
      
      // 마지막 방문 시간이 없거나 24시간 이상 지난 경우 갱신
      if (!lastVisitTime || (currentTime - parseInt(lastVisitTime, 10)) > 24 * 60 * 60 * 1000) {
        logger.info('CVEDetail', '장시간 접속하지 않아 데이터 갱신');
        
        // 백그라운드에서 최신 데이터 가져오기
        setTimeout(() => {
          refetchCveDetail({ staleTime: 0 })
            .then(() => {
              logger.info('CVEDetail', '오랜만의 접속으로 데이터 갱신 완료');
            })
            .catch((error) => {
              logger.error('CVEDetail', '데이터 갱신 실패', error);
            });
        }, 1000); // 초기 UI 로딩 후 1초 후에 갱신
      }
      
      // 현재 시간을 마지막 방문 시간으로 저장
      localStorage.setItem('lastVisitTime', currentTime.toString());
    }
  }, [propsCveId, open, refetchCveDetail]);

  // 편집 권한 확인
  const canEdit = useCallback(() => {
    // 여기에 필요한 권한 체크 로직 추가
    return true; // 현재는 항상 true 반환, 필요시 권한 로직 구현
  }, []);

  // Severity 옵션 정의
  const SEVERITY_OPTIONS = [
    { value: 'Critical', label: 'Critical', color: '#d32f2f' },
    { value: 'High', label: 'High', color: '#f44336' },
    { value: 'Medium', label: 'Medium', color: '#ff9800' },
    { value: 'Low', label: 'Low', color: '#4caf50' }
  ];

  // Severity 색상 가져오기
  const getSeverityColor = (severity) => {
    const option = SEVERITY_OPTIONS.find(opt => opt.value === severity);
    return option ? option.color : '#757575';
  };

  // 심각도 업데이트 핸들러
  const handleSeverityUpdate = useCallback(async (newSeverity) => {
    if (!cveData || !propsCveId || newSeverity === cveData.severity) return;
    handleFieldUpdate('severity', newSeverity);
  }, [cveData, propsCveId, handleFieldUpdate]);

  // 상태 업데이트 핸들러
  const handleStatusUpdate = useCallback(async (newStatus) => {
    if (!cveData || !propsCveId || newStatus === cveData.status) return;
    handleFieldUpdate('status', newStatus);
  }, [cveData, propsCveId, handleFieldUpdate]);

  // 새로고침 핸들러
  const handleRefresh = useCallback(() => {
    if (!propsCveId || loading || isQueryLoading) return;
    
    if (snackbarShown.current) {
      closeSnackbar();
    }
    
    enqueueSnackbar('데이터를 새로고침 중입니다...', { 
      variant: 'info',
      anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
    });
    snackbarShown.current = true;
    setLoading(true);
    
    // 캐시를 완전히 무효화하고 새로운 데이터 가져오기
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(propsCveId) });
    
    // staleTime을 0으로 설정하여 항상 새로운 데이터를 가져오도록 함
    refetchCveDetail({ staleTime: 0 })
      .then((data) => {
        setIsCached(false); // 새로고침된 데이터는 항상 최신 데이터
        setLoading(false);
        updateTabCounts(data);
        closeSnackbar();
        enqueueSnackbar('최신 데이터를 성공적으로 불러왔습니다', { 
          variant: 'success',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
          autoHideDuration: 2000
        });
        snackbarShown.current = false;
      })
      .catch((error) => {
        setLoading(false);
        closeSnackbar();
        enqueueSnackbar(`새로고침 실패: ${error.message || '알 수 없는 오류'}`, { 
          variant: 'error',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
        });
        snackbarShown.current = false;
      });
  }, [propsCveId, refetchCveDetail, enqueueSnackbar, closeSnackbar, updateTabCounts, queryClient, loading, isQueryLoading]);

  // 탭 변경 핸들러
  const handleTabChange = useCallback((event, newValue) => {
    setActiveTab(newValue);
  }, []);
  
  // 자식 컴포넌트에 전달할 메시지 전송 함수
  const sendMessage = useCallback(async (type, data) => {
    // 소켓이 초기화되지 않았거나 연결되어 있지 않은 경우
    if (!socketRef.current || !connectedRef.current) {
      logger.warn('CVEDetail', '소켓 연결이 없어 메시지를 보낼 수 없습니다', {
        socketExists: !!socketRef.current,
        connected: connectedRef.current,
        messageType: type
      });
      
      // 연결이 없는 경우 스낵바 표시
      enqueueSnackbar('서버와의 연결이 없어 변경사항이 실시간으로 공유되지 않습니다. 잠시 후 다시 시도하세요.', { 
        variant: 'warning',
        autoHideDuration: 4000
      });
      
      // 캐시 무효화를 통한 데이터 갱신 시도
      if (!loading && !isQueryLoading) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(propsCveId) });
      }
      
      return null;
    }
    
    try {
      // 이벤트 타입 검증
      if (!type) {
        logger.error('CVEDetail', '이벤트 타입이 지정되지 않았습니다', { data });
        return null;
      }
      
      logger.info('CVEDetail', `메시지 전송: ${type}`, {
        eventName: type,
        cveId: propsCveId,
        data
      });
      
      try {
        // 실제 메시지 전송 (Socket.IO emit)
        socketRef.current.emit(type, {
          cve_id: propsCveId,
          ...data
        });
      } catch (socketError) {
        logger.error('CVEDetail', `소켓 이벤트 전송 오류: ${type}`, {
          error: socketError.message,
          data
        });
        
        // 소켓 오류 발생 시 스낵바 표시
        enqueueSnackbar('메시지 전송 중 오류가 발생했습니다. 페이지를 새로고침하세요.', { 
          variant: 'error'
        });
        
        return null;
      }
      
      // 업데이트가 필요한 필드에 따라 필드 타입 결정
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
      
      // 일정 시간 후에도 웹소켓 이벤트가 오지 않으면 캐시 무효화 (로딩 중이 아닐 때만)
      setTimeout(() => {
        if (!loading && !isQueryLoading) {
          logger.info('CVEDetail', `메시지 전송 후 캐시 무효화 검토: ${fieldToUpdate}`);
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(propsCveId) });
        }
      }, 3000);
      
      return true;
    } catch (error) {
      logger.error('CVEDetail', `메시지 전송 오류: ${type}`, {
        error: error.message,
        stack: error.stack
      });
      enqueueSnackbar('메시지 전송 실패', { variant: 'error' });
      throw error;
    }
  }, [socketRef, connectedRef, propsCveId, enqueueSnackbar, queryClient, loading, isQueryLoading]);

  // 에러 다이얼로그 렌더링
  const renderErrorDialog = () => {
    return (
      <Dialog
        open={errorDialogOpen || !!error}
        onClose={handleErrorDialogClose}
        aria-labelledby="error-dialog-title"
        aria-describedby="error-dialog-description"
      >
        <DialogTitle id="error-dialog-title">
          데이터 로딩 오류
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="error-dialog-description">
            {error || 'CVE 데이터를 불러오는 중 오류가 발생했습니다.'}
          </DialogContentText>
          <Typography variant="body2" color="text.secondary" mt={2}>
            다시 시도하거나 관리자에게 문의하세요.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setErrorDialogOpen(false);
            setError(null);
            refetchCveDetail();
          }} color="primary">
            다시 시도
          </Button>
          <Button onClick={() => {
            handleErrorDialogClose();
            setError(null);
          }} color="secondary">
            닫기
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  if (isLoading) {
    return (
      <Dialog open={open} fullWidth maxWidth="md">
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  if (error) {
    return renderErrorDialog();
  }

  if (errorDialogOpen) {
    return renderErrorDialog();
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
            <SubscriberCount subscribers={localSubscribers} />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="생성 시간">
              <Chip
                size="small"
                icon={<HistoryIcon fontSize="small" />}
                label={`생성: ${formatDateTime(cveData?.createdAt || cveData?.created_at, undefined, TIME_ZONES.KST)}`}
                variant="outlined"
                sx={{ fontSize: '0.7rem', height: 24 }}
              />
            </Tooltip>
            <Tooltip title="마지막 업데이트 시간">
              <Chip
                size="small"
                icon={<HistoryIcon fontSize="small" />}
                label={`수정: ${formatDateTime(cveData?.lastModifiedAt || cveData?.last_modified_at, undefined, TIME_ZONES.KST)}`}
                variant="outlined"
                sx={{ fontSize: '0.7rem', height: 24 }}
              />
            </Tooltip>
            
            {isCached && (
              <Tooltip title="캐시된 데이터입니다. 새로고침을 클릭하여 최신 데이터를 불러올 수 있습니다.">
                <Chip
                  size="small"
                  label="캐시됨"
                  color="warning"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: 24 }}
                />
              </Tooltip>
            )}
            <Tooltip title="새로고침">
              <span>
                <IconButton onClick={handleRefresh} disabled={isLoading}>
                  <RefreshIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="닫기">
              <span>
                <IconButton onClick={onClose} disabled={isLoading}>
                  <CloseIcon />
                </IconButton>
              </span>
            </Tooltip>
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
                        className="description-container"
                        variant="outlined"
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                          overflow: 'hidden',
                          transition: 'max-height 0.3s ease-in-out',
                          height: 'auto',
                          maxHeight: detailExpanded ? '400px' : '60px',
                          display: 'flex',
                          flexDirection: 'column'
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
                          onEditingEnd={() => {
                            // 편집 종료 후 바로 축소하면 레이아웃 문제가 발생할 수 있어 약간의 지연 추가
                            setTimeout(() => setDetailExpanded(false), 100);
                          }}
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
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      Severity
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
                      {SEVERITY_OPTIONS.map((option) => (
                        <Paper
                          key={option.value}
                          elevation={0}
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            minHeight: '40px',
                            border: '1px solid',
                            borderRadius: 1,
                            p: 1,
                            textAlign: 'center',
                            cursor: canEdit() ? 'pointer' : 'default',
                            transition: 'all 0.2s',
                            bgcolor: option.value === cveData.severity ? 'action.selected' : 'background.paper',
                            borderColor: option.value === cveData.severity ? option.color : 'divider',
                            '&:hover': canEdit() ? {
                              backgroundColor: 'rgba(0, 0, 0, 0.04)',
                              borderColor: option.color,
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            } : {}
                          }}
                          onClick={() => canEdit() && handleSeverityUpdate(option.value)}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
                            <CircleIcon sx={{ fontSize: 8, color: option.color, flexShrink: 0 }} />
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontWeight: option.value === cveData.severity ? 600 : 400, 
                                color: option.value === cveData.severity ? option.color : 'text.primary' 
                              }}
                            >
                              {option.label}
                            </Typography>
                          </Box>
                        </Paper>
                      ))}
                    </Box>
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
                    parentSendMessage={sendMessage}
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
                    parentSendMessage={sendMessage}
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
                    parentSendMessage={sendMessage}
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
                    parentSendMessage={sendMessage}
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
            {(isCached || cveData.fromCache) && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2, p: 1 }}>
                <Chip 
                  size="small" 
                  label="캐시된 데이터" 
                  color="info" 
                  variant="outlined"
                  sx={{ fontWeight: 500 }}
                />
                {(cveData._cachedAt || cveData.cachedAt) && (
                  <Typography variant="caption" color="text.secondary">
                    서버와 {timeAgo(cveData._cachedAt || cveData.cachedAt)} 전에 동기화됨
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