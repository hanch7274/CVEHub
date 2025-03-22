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
import logger from '../../utils/logging';
import {
  useCVEDetail,
  useCVERefresh,
  useCVESubscription
} from '../../api/hooks/useCVEQuery';
import { useUpdateCVEField } from '../../api/hooks/useCVEMutation';
import { useAuth } from '../../contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '../../api/queryKeys';
import { formatDate, DATE_FORMATS, isValid } from '../../utils/dateUtils';

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

  // 불필요한 타이머 관련 ref 제거
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
  } = useCVESubscription(propsCveId);

  // 사용자가 로그인 후 처음 데이터를 로드하는지 확인하는 ref
  const isFirstLoadRef = useRef(true);

  useLayoutEffect(() => {
    // detailExpanded 상태가 바뀌면 지연 시간을 둔 후 높이 조정 (리사이징 무한 루프 방지)
    let resizeTimer;
    if (detailExpanded) {
      resizeTimer = setTimeout(() => {
        const descriptionContainer = document.querySelector('.description-container');
        if (descriptionContainer) {
          // expanded 상태에서는 내용에 맞게 높이 조정
          descriptionContainer.style.height = 'auto';
          descriptionContainer.style.maxHeight = '400px';
        }
      }, 50);
    } else {
      resizeTimer = setTimeout(() => {
        const descriptionContainer = document.querySelector('.description-container');
        if (descriptionContainer) {
          // 축소 상태에서는 고정 높이
          descriptionContainer.style.height = '60px';
          descriptionContainer.style.maxHeight = '60px';
        }
      }, 50);
    }
    
    return () => clearTimeout(resizeTimer);
  }, [detailExpanded]);

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
  
  // CVEDetail 컴포넌트에 추가
useEffect(() => {
  if (cveData) {
    console.log('CVE 데이터 날짜 필드 확인:', {
      createdAt: cveData.createdAt,
      createdAt_type: typeof cveData.createdAt,
      createdAt_instanceof_Date: cveData.createdAt instanceof Date,
      lastModifiedAt: cveData.lastModifiedAt,
      lastModifiedAt_type: typeof cveData.lastModifiedAt,
      lastModifiedAt_instanceof_Date: cveData.lastModifiedAt instanceof Date,
      formatDateDisplay_result: formatDateDisplay(cveData.createdAt)
    });
  }
}, [cveData]);
  
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

  // 웹소켓 메시지 핸들러 - React Query 캐시 무효화 활용
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
    
    // React Query 캐시 무효화를 통한 데이터 갱신 - 로딩 중이 아닐 때만 실행
    if (fieldKey !== 'comments' && !loading && !isQueryLoading) {
      logger.info('CVEDetail', `${fieldKey} 필드 업데이트로 인한 캐시 무효화`);
      // 캐시 무효화만 수행하고 React Query가 자동으로 refetch하도록 함
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(propsCveId) });
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

  // Socket.IO 업데이트 리스너 - 간소화
  useEffect(() => {
    if (!propsCveId || !open) return;
    
    logger.info('CVEDetail', `${propsCveId} 업데이트 이벤트 리스닝 시작`);
    
    // 소켓 객체가 없거나 연결되지 않은 경우
    if (!socket) {
      logger.warn('CVEDetail', '소켓 객체가 초기화되지 않았습니다. 실시간 업데이트가 제한됩니다.');
      return;
    }
    
    const handleCVEUpdated = (data) => {
      if (data && (data.cveId === propsCveId || data.id === propsCveId)) {
        logger.info('CVEDetail', 'CVE 업데이트 이벤트 수신', data);
        handleWebSocketUpdate(data);
      }
    };
    
    try {
      // Socket.IO 이벤트 등록
      socket.on('cve_updated', handleCVEUpdated);
      
      return () => {
        // 이벤트 리스너 제거 시도 (소켓이 여전히 존재하는 경우만)
        if (socket) {
          socket.off('cve_updated', handleCVEUpdated);
        }
      };
    } catch (error) {
      logger.error('CVEDetail', '소켓 이벤트 리스너 설정 중 오류 발생', {
        error: error.message,
        stack: error.stack
      });
      return () => {}; // 오류 발생 시 빈 클린업 함수 반환
    }
  }, [propsCveId, open, socket, handleWebSocketUpdate]);

  // 필드 업데이트 처리 - React Query 활용
  const handleFieldUpdate = useCallback((field, value) => {
    if (!propsCveId || !field) return;
    setLoading(true);
    updateCVEField(
      { cveId: propsCveId, fieldName: field, fieldValue: value },
      {
        onSuccess: () => {
          logger.info('CVEDetail', `필드 업데이트 성공: ${field}`);
          queryClient.invalidateQueries({
            predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === QUERY_KEYS.CVE.list
          });
          setLoading(false);
        },
        onError: (err) => {
          enqueueSnackbar(`업데이트 실패: ${err.message || '알 수 없는 오류'}`, {
            variant: 'error',
            anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
          });
          setLoading(false);
        }
      }
    );
  }, [propsCveId, updateCVEField, enqueueSnackbar, queryClient]);

  // 모달을 열 때 데이터 새로고침 - 수정
  useEffect(() => {
    // open 상태가 변경될 때만 실행
    if (open && propsCveId) {
      // 로딩 상태 설정
      setLoading(true);
      
      // 데이터 새로고침
      refetchCveDetail()
        .then(() => {
          // 성공적으로 데이터를 가져온 경우 로딩 상태 해제
          setLoading(false);
        })
        .catch(err => {
          logger.error('CVEDetail', '데이터 로딩 실패', { error: err.message });
          setLoading(false);
        });
    } else if (!open) {
      // 모달이 닫힐 때 로딩 상태 초기화
      setLoading(false);
    }
  }, [open, propsCveId, refetchCveDetail]);

  // WebSocket 연결 상태가 변경될 때 캐시 무효화 - 간소화
  useEffect(() => {
    // Socket.IO가 연결되었을 때만 실행
    if (connected && propsCveId && !loading && !isQueryLoading) {
      logger.info('CVEDetail', 'Socket 연결됨, 데이터 갱신 검토');
      
      // 마지막 데이터 업데이트 시간 확인
      const now = new Date().getTime();
      
      // 마지막 업데이트로부터 1분 이상 지났다면 캐시 무효화
      if (dataUpdatedAt && (now - dataUpdatedAt) > 60000) {
        logger.info('CVEDetail', '소켓 연결 후 오래된 데이터 감지됨, 캐시 무효화');
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(propsCveId) });
      }
    }
  }, [connected, propsCveId, dataUpdatedAt, queryClient, loading, isQueryLoading]);

  // CVE 구독 처리
  useEffect(() => {
    if (!propsCveId || !open) return;

    // 소켓 연결이 없는 경우 구독 시도하지 않음
    if (!connected || !socket) {
      logger.warn('CVEDetail', '소켓 연결이 없어 구독을 시도하지 않습니다.');
      return;
    }

    logger.info('CVEDetail', `CVE ${propsCveId} 업데이트 이벤트 리스닝 시작`);
    logger.info('CVEDetail', `CVE 구독 시도: ${propsCveId}`);
    
    // 구독 요청 전송
    const subscriptionResult = subscribe ? subscribe() : false;
    
    if (!subscriptionResult) {
      logger.warn('CVEDetail', `CVE ${propsCveId} 구독 요청 실패`);
    }
    
    // 브라우저 종료/새로고침 시 구독 해제 처리
    const handleBeforeUnload = () => {
      logger.info('CVEDetail', `브라우저 종료/새로고침 - CVE 구독 해제: ${propsCveId}`);
      if (unsubscribe) unsubscribe();
    };
    
    // 브라우저 종료/새로고침 이벤트 리스너 등록
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // 클린업 함수
    return () => {
      // 컴포넌트가 언마운트되거나 propsCveId, open, connected가 변경될 때만 실행
      if (propsCveId && connected && socket && unsubscribe) {
        logger.info('CVEDetail', `CVE 구독 해제: ${propsCveId}`);
        unsubscribe();
      }
      
      // 브라우저 이벤트 리스너 제거
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [propsCveId, open, connected, socket, subscribe, unsubscribe]);

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

  // 연결 상태 변경 시 알림
  useEffect(() => {
    if (open) {
      if (!connected) {
        logger.warn('CVEDetail', 'WebSocket 연결이 없습니다. 실시간 업데이트가 제한됩니다.');
        enqueueSnackbar('서버 연결 상태를 확인해주세요. 실시간 업데이트가 제한됩니다.', { 
          variant: 'warning',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
          autoHideDuration: 3000
        });
      }
    }
  }, [open, connected, enqueueSnackbar]);

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

  // 날짜 포맷팅 함수
  const formatDateDisplay = (dateValue) => {
    // 디버깅 로그 추가
    console.log('CVE 데이터 날짜 필드 확인:', {
      값: dateValue,
      타입: typeof dateValue,
      instanceof_Date: dateValue instanceof Date,
      isISOString: typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateValue),
      toString: dateValue ? String(dateValue) : null
    });
    
    // 문자열이고 ISO 형식이면 그대로 사용
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateValue)) {
      return formatDate(dateValue, DATE_FORMATS.DISPLAY.DEFAULT);
    }
    
    // Date 객체면 그대로 사용
    if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
      return formatDate(dateValue, DATE_FORMATS.DISPLAY.DEFAULT);
    }
    
    // 그외 마지막 시도
    try {
      const parsedDate = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        return formatDate(parsedDate, DATE_FORMATS.DISPLAY.DEFAULT);
      }
    } catch (error) {
      console.error('날짜 파싱 오류:', error);
    }
    
    return '-';
  };

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
    // 소켓이 초기화되지 않았거나 연결되어 있지 않은 경우
    if (!socket || !connected) {
      logger.warn('CVEDetail', '소켓 연결이 없어 메시지를 보낼 수 없습니다', {
        socketExists: !!socket,
        connected,
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
        socket.emit(type, {
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
  }, [socket, connected, propsCveId, enqueueSnackbar, queryClient, loading, isQueryLoading]);

  // 날짜 필드 검증을 위한 useEffect
  useEffect(() => {
    if (cveData) {
      // cveData 전체 구조 로깅
      console.log('CVEDetail - cveData 전체 구조:', {
        ...cveData,
        _id: cveData._id,
        cveId: cveData.cveId,
        createdAt: cveData.createdAt,
        lastModifiedAt: cveData.lastModifiedAt,
        createdAtType: typeof cveData.createdAt,
        lastModifiedAtType: typeof cveData.lastModifiedAt
      });
      
      // 날짜 필드 로깅 및 검증
      const dateFields = ['createdAt', 'lastModifiedAt'];
      dateFields.forEach(field => {
        if (field in cveData) {
          console.log(`CVEDetail: ${field} 필드 값:`, cveData[field], typeof cveData[field]);
          
          // 빈 객체 또는 빈 문자열 검사
          if (!cveData[field] || 
              cveData[field] === null || 
              (typeof cveData[field] === 'object' && Object.keys(cveData[field]).length === 0)) {
            console.log(`CVEDetail: ${field} 필드가 비어있습니다.`);
          } else {
            // 시간 변환 테스트
            try {
              const formattedDate = formatDateDisplay(cveData[field]);
              console.log(`CVEDetail: ${field} 필드 변환 결과:`, {
                원본: cveData[field],
                변환결과: formattedDate,
                타입: typeof cveData[field]
              });
            } catch (error) {
              console.error(`CVEDetail: ${field} 필드 변환 오류:`, error);
            }
          }
        } else {
          console.warn(`CVEDetail: ${field} 필드가 없습니다.`);
        }
      });
    }
  }, [cveData]);

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
                label={`생성: ${formatDateDisplay(cveData.createdAt)}`}
                variant="outlined"
                sx={{ fontSize: '0.7rem', height: 24 }}
              />
            </Tooltip>
            <Tooltip title="마지막 업데이트 시간">
              <Chip
                size="small"
                icon={<HistoryIcon fontSize="small" />}
                label={`수정: ${formatDateDisplay(cveData.lastModifiedAt)}`}
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