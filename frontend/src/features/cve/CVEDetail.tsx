import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useSocket } from 'core/socket/hooks/useSocket';
import { useAuth } from 'features/auth/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  DialogContentText,
  Card,
  CardContent,
  Box,
  Fade,
  CircularProgress,
  Button,
  Typography,
  Chip,
} from '@mui/material';
import logger from 'shared/utils/logging';
import { useUpdateCVEField } from 'features/cve/hooks/useCVEMutation';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import { timeAgo } from 'shared/utils/dateUtils';
import { useCVEDetail, useCVERefresh, useCVESubscription } from './hooks';
import {
  ApiResponse,
  Comment,
  CVEDetail as CVEDetailType,
  CVEDetailData,
  CVEDetailHeaderProps,
  CVEDetailInfoPanelProps,
  CVEDetailProps,
  CVEDetailTabsProps,
  RefreshTriggers,
  Subscriber,
  TabCounts,
  WebSocketUpdateData,
  countActiveComments
} from './types/cve';

import CVEDetailHeader from './CVEDetailHeader';
import CVEDetailInfoPanel from './CVEDetailInfoPanel';
import CVEDetailTabs from './CVEDetailTabs';

// --- 메인 컴포넌트 ---
const CVEDetail: React.FC<CVEDetailProps> = ({ cveId: propsCveId, open = false, onClose, highlightCommentId = null }) => {
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const { socket, connected } = useSocket();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // 프론트엔드와 백엔드 필드명 매핑 (웹소켓 업데이트 처리용)
  const fieldMapping = useRef<Record<string, string>>({
    status: 'status',
    title: 'title',
    description: 'description',
    severity: 'severity',
    cveId: 'cve_id',
    poc: 'poc',
    snortRule: 'snort_rule',
    reference: 'reference',
    comments: 'comments',
    createdAt: 'created_at',
    lastModifiedAt: 'last_modified_at',
    lastModifiedBy: 'last_modified_by',
    modificationHistory: 'modification_history',
    tags: 'tags',
  }).current;

  // 개발 환경에서만 로그 레벨을 DEBUG로 설정 (디버깅 목적)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // @ts-ignore - logger.setLogLevel 타입 에러 무시
      logger.setLogLevel(0); // DEBUG 레벨 설정
      logger.debug('CVEDetail: 로그 레벨을 DEBUG로 설정했습니다.');
    }
  }, []);

  // --- 상태 관리 ---
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState<boolean>(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState<boolean>(false);
  const [refreshTriggers, setRefreshTriggers] = useState<RefreshTriggers>({
    general: 0,
    poc: 0,
    snortRule: 0,
    reference: 0,
    comments: 0,
    history: 0,
  });
  const [tabCounts, setTabCounts] = useState<TabCounts>({
    poc: 0,
    snortRule: 0,
    reference: 0,
    comments: 0,
  });

  // --- Refs ---
  const socketRef = useRef(socket);
  const connectedRef = useRef(connected);
  const snackbarShown = useRef<boolean>(false);
  const refreshTriggersRef = useRef<RefreshTriggers>(refreshTriggers);
  const lastProcessedUpdateIdRef = useRef<Record<string, number | string>>({});
  const currentUserRef = useRef<typeof currentUser | null>(null);
  const isFirstLoadRef = useRef<boolean>(true);
  const isSubscribedRef = useRef<boolean>(false);
  // 구독 관련 추가 Refs
  const hasAttemptedSubscriptionRef = useRef<boolean>(false);
  const isModalOpenRef = useRef<boolean>(false);

  // Socket.IO 서비스 참조
  const socketServiceRef = useRef(socket?.socketService).current;

  // 구독 관련 상태와 기능
  const { isSubscribed, isLoading: isSubscriptionLoading, subscribe, unsubscribe, getSubscribers } = useCVESubscription(propsCveId);
  
  // 기존 구독 상태 참조 유지 (최신 상태 접근용)
  isSubscribedRef.current = isSubscribed;
  
  // 구독 상태가 변경될 때마다 참조 업데이트
  useEffect(() => {
    isSubscribedRef.current = isSubscribed;
  }, [isSubscribed]);

  // --- Hooks ---
  // 현재 사용자 참조 유지
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // 소켓 참조 유지
  useEffect(() => {
    socketRef.current = socket;
    connectedRef.current = connected;
    
    if (process.env.NODE_ENV === 'development') {
      logger.info('CVEDetail', '소켓 참조 업데이트됨 (메인 컴포넌트)', {
        socketId: socket?.id,
        connected,
        hasSocket: !!socket,
      });
    }
  }, [socket, connected]);

  // 모달 상태 참조 유지
  useEffect(() => {
    isModalOpenRef.current = open;
  }, [open]);

  // 구독자 정보 (중앙 관리 시스템에서 가져옴)
  const subscribers = useMemo(() => {
    return getSubscribers();
  }, [getSubscribers, propsCveId, isSubscribed]);

  // 구독 상태 변경 핸들러
  const handleSubscription = useCallback(() => {
    if (isSubscribed) {
      unsubscribe();
    } else {
      subscribe();
    }
  }, [isSubscribed, subscribe, unsubscribe]);

  // React Query: CVE 상세 정보 조회
  const {
    data: cveData,
    isLoading: isQueryLoading,
    isFetching,
    dataUpdatedAt,
    error: queryError,
    refetch: refetchCveDetail,
  } = useCVEDetail(propsCveId || '', {
    enabled: !!propsCveId && open,
    refetchOnReconnect: false,
    // @ts-ignore - 타입 정의와 실제 라이브러리 구현 간의 불일치 무시
    onSuccess: (data: CVEDetailData) => {
      logger.info('CVEDetail', '데이터 로딩 성공', { dataReceived: !!data });
      if (snackbarShown.current) {
        closeSnackbar();
      }
      updateTabCounts(data);
      setIsCached(false);
      setLoading(false);
      setError(null);
      setErrorDialogOpen(false);
    },
    onError: (err: Error) => {
      logger.error('CVEDetail', '데이터 로딩 실패', { error: err.message });
      if (snackbarShown.current) {
        closeSnackbar();
      }
      enqueueSnackbar(`데이터 로딩 실패: ${err.message || '알 수 없는 오류'}`, {
        variant: 'error',
      });
      setError(err.message || '데이터 로딩 실패');
      setLoading(false);
      setErrorDialogOpen(true);
    },
  });

  // 캐시 상태 확인
  const isDataFromCache = useMemo(() => {
    if (cveData && dataUpdatedAt) {
      const cacheThreshold = 30 * 1000;
      return Date.now() - dataUpdatedAt > cacheThreshold;
    }
    return false;
  }, [cveData, dataUpdatedAt]);

  // 캐시 상태 업데이트
  useEffect(() => {
    setIsCached(isDataFromCache);
  }, [isDataFromCache]);

  // 탭 카운트 업데이트 함수
  const updateTabCounts = useCallback((data: CVEDetailData) => {
    if (!data) {
      logger.warn('updateTabCounts: 데이터가 없어 카운트를 업데이트할 수 없습니다.');
      setTabCounts({ poc: 0, snortRule: 0, reference: 0, comments: 0 });
      return;
    }
    
    const newCounts: TabCounts = {
      poc:
        data.poc?.length ??
        data.PoC?.length ??
        data.pocList?.length ??
        0,
      snortRule: data.snortRule?.length ?? data.snort_rule?.length ?? 0,
      reference: data.reference?.length ?? data.ref?.length ?? 0,
      comments: countActiveComments(data.comments),
    };
    setTabCounts(newCounts);
  }, []);

  // CVE 새로고침 훅
  const { mutate: refreshCVE, isLoading: isRefreshing } = useCVERefresh(
    propsCveId || ''
  );
  
  // CVE 필드 업데이트 훅
  const { mutate: updateCVEField } = useUpdateCVEField();

  // 필드 업데이트 핸들러
  const handleFieldUpdate = useCallback((field: string, value: unknown) => {
    if (!propsCveId || !field) {
      logger.warn('handleFieldUpdate: cveId 또는 field가 없습니다.');
      return;
    }
    
    if (!cveData || cveData[field] === value) {
      logger.info('handleFieldUpdate: 변경 사항 없음', { field, value });
      return;
    }
    
    logger.info('handleFieldUpdate 시작', { field, value });
    const fieldMappingLocal: Record<string, string> = {
      title: 'title',
      description: 'description',
      status: 'status',
      severity: 'severity',
    };
    
    const backendField = fieldMappingLocal[field] || field;
    const cachedData = queryClient.getQueryData<CVEDetailData>(
      QUERY_KEYS.CVE.detail(propsCveId)
    );
    
    if (cachedData) {
      // 낙관적 업데이트
      const optimisticData = { ...cachedData, [field]: value };
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(propsCveId), optimisticData);
      logger.info('handleFieldUpdate: 캐시 낙관적 업데이트 완료', { field, value });
    }
    
    setLoading(true);
    updateCVEField(
      { cveId: propsCveId, fieldName: backendField, fieldValue: value },
      {
        // @ts-ignore - ApiResponse와 CVEDetailData 타입 불일치 무시
        onSuccess: (updatedData: any) => {
          logger.info('CVEDetail', `필드 업데이트 성공: ${field}`, {
            response: updatedData,
          });
          enqueueSnackbar(`${field} 업데이트 성공`, {
            variant: 'success',
            autoHideDuration: 1500,
          });
          
          // 주요 필드 변경 시 목록 쿼리 무효화
          if (['title', 'status', 'severity'].includes(field)) {
            logger.info('CVEDetail: 목록 쿼리 무효화 중...');
            queryClient.invalidateQueries({
              predicate: (query) =>
                Array.isArray(query.queryKey) &&
                query.queryKey[0] === QUERY_KEYS.CVE.list()[0],
            });
          }
        },
        onError: (err: Error) => {
          logger.error('CVEDetail', `필드 업데이트 실패: ${field}`, {
            error: err.message,
          });
          enqueueSnackbar(
            `업데이트 실패 (${field}): ${err.message || '알 수 없는 오류'}`,
            { variant: 'error' }
          );
          
          // 오류 시 캐시 롤백
          if (cachedData) {
            queryClient.setQueryData(
              QUERY_KEYS.CVE.detail(propsCveId),
              cachedData
            );
            logger.info('handleFieldUpdate: 캐시 롤백 완료', { field });
          }
        },
        onSettled: () => {
          setLoading(false);
          logger.info('handleFieldUpdate: 완료 (성공/실패 무관)', { field });
        },
      }
    );
  }, [propsCveId, cveData, updateCVEField, queryClient, enqueueSnackbar]);

  // 제목 업데이트 핸들러
  const handleTitleUpdate = useCallback((newTitle: string) => {
    if (!cveData || !propsCveId || newTitle === cveData.title) return;
    handleFieldUpdate('title', newTitle);
  }, [cveData, propsCveId, handleFieldUpdate]);

  // 설명 업데이트 핸들러
  const handleDescriptionUpdate = useCallback((newDescription: string) => {
    if (!cveData || !propsCveId || newDescription === cveData.description) return;
    handleFieldUpdate('description', newDescription);
  }, [cveData, propsCveId, handleFieldUpdate]);

  // 웹소켓 업데이트 처리 핸들러
  const handleWebSocketUpdate = useCallback((data: WebSocketUpdateData) => {
    logger.info('CVEDetail', '웹소켓 업데이트 수신', data);
    if (!data) return;
    
    const fieldKey = data.field_key || data.field || 'general';
    const updateId = data.updateId || Date.now();
    
    // 중복 업데이트 필터링
    if (lastProcessedUpdateIdRef.current[fieldKey] === updateId) {
      logger.info('CVEDetail', `중복 웹소켓 업데이트 무시: ${fieldKey}, ID: ${updateId}`);
      return;
    }
    
    // 업데이트 ID 기록
    lastProcessedUpdateIdRef.current[fieldKey] = updateId;
    
    // 리프레시 트리거 업데이트
    const newTriggers = {
      ...refreshTriggersRef.current,
      [fieldKey]: (refreshTriggersRef.current[fieldKey as keyof RefreshTriggers] || 0) + 1
    };
    
    refreshTriggersRef.current = newTriggers;
    setRefreshTriggers(newTriggers);
    
    logger.info('CVEDetail: Refresh trigger 업데이트', {
      fieldKey,
      newTrigger: newTriggers[fieldKey as keyof RefreshTriggers],
    });
    
    // 댓글 업데이트는 CommentsTab에서 별도 처리
    if (fieldKey === 'comments') {
      logger.info('CVEDetail: 댓글 업데이트는 CommentsTab에서 처리');
      return;
    }
    
    // 로딩 중이 아닐 때만 캐시 업데이트
    if (!loading) {
      try {
        const cachedData = queryClient.getQueryData<CVEDetailData>(
          QUERY_KEYS.CVE.detail(propsCveId)
        );
        
        if (cachedData && data.updatedData) {
          logger.info('CVEDetail', `${fieldKey} 필드 웹소켓 업데이트 - 캐시 직접 업데이트`);
          let updatedCacheData = { ...cachedData };
          
          // 전체 데이터 업데이트
          if (fieldKey === 'all') {
            updatedCacheData = { ...updatedCacheData, ...(data.updatedData as Record<string, any>) };
          } 
          // 특정 필드 업데이트
          else if (data.updatedData.hasOwnProperty(fieldKey)) {
            (updatedCacheData as any)[fieldKey] = data.updatedData[fieldKey];
            
            // 프론트엔드 필드명 매핑 처리
            const frontendField = Object.keys(fieldMapping).find(
              (key) => fieldMapping[key] === fieldKey
            );
            if (frontendField) {
              (updatedCacheData as any)[frontendField] = data.updatedData[fieldKey];
            }
          } 
          // 특수 필드 처리
          else {
            if (fieldKey === 'poc' && data.updatedData.poc)
              updatedCacheData.poc = data.updatedData.poc;
            else if (fieldKey === 'snort_rule' && data.updatedData.snort_rule)
              updatedCacheData.snortRule = data.updatedData.snort_rule;
            else if (fieldKey === 'reference' && data.updatedData.reference)
              updatedCacheData.reference = data.updatedData.reference;
            else {
              logger.warn('CVEDetail: 처리되지 않은 웹소켓 필드 업데이트', {
                fieldKey,
                updatedData: data.updatedData,
              });
              updatedCacheData = { ...updatedCacheData, ...(data.updatedData as Record<string, any>) };
            }
          }
          
          // 캐시 업데이트
          queryClient.setQueryData(
            QUERY_KEYS.CVE.detail(propsCveId),
            updatedCacheData
          );
          updateTabCounts(updatedCacheData);
        } 
        // 캐시가 없는 경우 쿼리 무효화
        else if (!cachedData) {
          logger.info('CVEDetail', `웹소켓 업데이트 - 캐시 없음, 쿼리 무효화: ${fieldKey}`);
          queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.CVE.detail(propsCveId),
          });
        }
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        logger.error('CVEDetail', '웹소켓 업데이트 처리 중 캐시 업데이트 오류', {
          error: err.message,
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CVE.detail(propsCveId),
        });
      }
    } else {
      logger.info('CVEDetail: 로딩 중이므로 웹소켓 업데이트 건너뜀', { fieldKey });
    }
    
    // 스낵바 표시
    if (!snackbarShown.current) {
      snackbarShown.current = true;
      let fieldName = fieldKey;
      enqueueSnackbar(`${fieldName} 정보가 업데이트되었습니다.`, {
        variant: 'info',
        autoHideDuration: 2500,
        anchorOrigin: { vertical: 'bottom', horizontal: 'right' },
        onClose: () => {
          snackbarShown.current = false;
        },
      });
    }
  }, [enqueueSnackbar, propsCveId, queryClient, loading, updateTabCounts]);

  // CVE 업데이트 이벤트 핸들러
  const handleCVEUpdated = useCallback((data: WebSocketUpdateData) => {
    if (!data || !(data.cveId === propsCveId || data.id === propsCveId)) return;
    
    logger.info('CVEDetail', '`cve_updated` 이벤트 수신', {
      dataId: data.id || data.cveId,
      propsCveId,
      type: data.field_key || data.field || 'general',
    });
    
    handleWebSocketUpdate(data);
  }, [propsCveId, handleWebSocketUpdate]);

  // 새로고침 핸들러
  const handleRefresh = useCallback(() => {
    if (!propsCveId || loading) {
      logger.warn('handleRefresh: 이미 로딩 중이거나 ID가 없습니다.');
      return;
    }
    
    logger.info('handleRefresh: 데이터 새로고침 시작', { cveId: propsCveId });
    
    if (snackbarShown.current) closeSnackbar();
    enqueueSnackbar('데이터를 새로고침 중입니다...', { variant: 'info' });
    snackbarShown.current = true;
    
    setLoading(true);
    setIsCached(false);
    
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.CVE.detail(propsCveId),
    });
    
    refetchCveDetail()
      .then(() => {
        logger.info('handleRefresh: 데이터 새로고침 성공', { cveId: propsCveId });
        closeSnackbar();
        enqueueSnackbar('최신 데이터를 성공적으로 불러왔습니다', {
          variant: 'success',
          autoHideDuration: 2000,
        });
        snackbarShown.current = false;
      })
      .catch((error: Error) => {
        logger.error('handleRefresh: 데이터 새로고침 실패', {
          cveId: propsCveId,
          error: error.message,
        });
        closeSnackbar();
        enqueueSnackbar(`새로고침 실패: ${error.message || '알 수 없는 오류'}`, {
          variant: 'error',
        });
        snackbarShown.current = false;
        setError(error.message || '새로고침 실패');
        setErrorDialogOpen(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [propsCveId, loading, refetchCveDetail, queryClient, enqueueSnackbar, closeSnackbar]);

  // 메시지 전송 핸들러
  const sendMessage = useCallback(async (type: string, data: Record<string, unknown>): Promise<boolean | null> => {
    if (!socketRef.current || !connectedRef.current) {
      logger.warn('sendMessage: 소켓 연결 없음', { type });
      enqueueSnackbar('서버 연결이 없어 메시지를 보낼 수 없습니다.', {
        variant: 'warning',
      });
      return null;
    }
    
    if (!type) {
      logger.error('sendMessage: 이벤트 타입 누락', { data });
      enqueueSnackbar('메시지 전송 오류: 타입 누락', { variant: 'error' });
      return null;
    }
    
    logger.info('sendMessage: 메시지 전송 시도', {
      type,
      cveId: propsCveId,
      data,
    });
    
    try {
      socketRef.current.emit(type, {
        cve_id: propsCveId,
        ...data,
      });
      
      logger.info('sendMessage: 메시지 전송 성공', { type });
      
      // 잠시 후 쿼리 무효화
      if (!loading && !isQueryLoading) {
        setTimeout(() => {
          queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.CVE.detail(propsCveId),
          });
        }, 1000);
      }
      
      return true;
    } catch (socketError: unknown) {
      const err = socketError instanceof Error ? socketError : new Error('Unknown error');
      logger.error('sendMessage: 소켓 emit 오류', { type, error: err.message });
      enqueueSnackbar('메시지 전송 중 오류 발생', { variant: 'error' });
      return null;
    }
  }, [propsCveId, enqueueSnackbar, queryClient, loading, isQueryLoading]);

  // 오류 다이얼로그 닫기 핸들러
  const handleErrorDialogClose = useCallback(() => {
    setErrorDialogOpen(false);
    setError(null);
  }, []);

  // 탭 카운트 변경 핸들러
  const handleTabCountChange = useCallback((tabKey: keyof TabCounts, count: number) => {
    setTabCounts(prev => {
      if (prev[tabKey] === count) return prev;
      return { ...prev, [tabKey]: count };
    });
  }, []);

  // 편집 권한 확인
  const canEdit = useCallback((): boolean => {
    // 실제 권한 확인 로직 구현 가능
    return true;
  }, []);

  // 오류 다이얼로그 렌더링
  const renderErrorDialog = useCallback((): React.ReactElement => (
    <Dialog
      open={errorDialogOpen}
      onClose={handleErrorDialogClose}
      aria-labelledby="error-dialog-title"
      aria-describedby="error-dialog-description"
    >
      <DialogTitle id="error-dialog-title">오류 발생</DialogTitle>
      <DialogContent>
        <DialogContentText id="error-dialog-description">
          {error || '데이터 처리 중 오류가 발생했습니다.'}
        </DialogContentText>
        <Typography variant="body2" color="text.secondary" mt={2}>
          문제가 지속되면 관리자에게 문의하세요.
        </Typography>
      </DialogContent>
      <DialogActions>
        {queryError && (
          <Button
            onClick={() => {
              handleErrorDialogClose();
              handleRefresh();
            }}
            color="primary"
          >
            다시 시도
          </Button>
        )}
        <Button onClick={handleErrorDialogClose} color="secondary">
          닫기
        </Button>
      </DialogActions>
    </Dialog>
  ), [errorDialogOpen, handleErrorDialogClose, error, queryError, handleRefresh]);

  // 대화상자 닫기 핸들러
  const handleClose = useCallback(() => {
    snackbarShown.current = false;
    
    // 컴포넌트 닫힐 때 구독 정보 즉시 저장
    try {
      if (socketServiceRef && typeof socketServiceRef.updateSubscription === 'function') {
        // 현재 구독 상태를 중앙 저장소에 반영
        socketServiceRef.updateSubscription(propsCveId, isSubscribedRef.current);
        logger.info('CVEDetail', '컴포넌트 닫힘 - 구독 정보 저장 완료', { 
          cveId: propsCveId, 
          isSubscribed: isSubscribedRef.current 
        });
      } else {
        // 소켓 서비스를 찾을 수 없는 경우 로컬에 직접 저장
        const key = 'cvehub_subscribed_cves';
        const savedCVEs = localStorage.getItem(key);
        let cveList: string[] = [];
        
        if (savedCVEs) {
          try {
            cveList = JSON.parse(savedCVEs);
          } catch (e) {
            logger.error('CVEDetail', '저장된 구독 정보 파싱 실패', e);
            cveList = [];
          }
        }
        
        // 구독 여부에 따라 리스트 업데이트
        if (isSubscribedRef.current) {
          // 이미 리스트에 없는 경우에만 추가
          if (!cveList.includes(propsCveId)) {
            cveList.push(propsCveId);
          }
        } else {
          // 리스트에서 제거
          cveList = cveList.filter(id => id !== propsCveId);
        }
        
        // 업데이트된 리스트 저장
        localStorage.setItem(key, JSON.stringify(cveList));
        logger.info('CVEDetail', '로컬 구독 정보 직접 업데이트', { 
          cveId: propsCveId, 
          isSubscribed: isSubscribedRef.current 
        });
      }
    } catch (error) {
      logger.error('CVEDetail', '구독 정보 저장 중 오류 발생', error);
    }
    
    // 원래 onClose 콜백 호출
    if (typeof onClose === 'function') {
      onClose();
    }
  }, [propsCveId, onClose, socketServiceRef, isSubscribedRef]);

  // --- useEffects ---
  // CVE 업데이트 이벤트 구독
  useEffect(() => {
    if (!propsCveId || !open || !socketRef.current) return;
    
    const eventName = `cve_updated_${propsCveId}`;
    
    // 이벤트 리스너 등록
    socketRef.current.on(eventName, handleCVEUpdated);
    
    logger.debug('CVEDetail: 소켓 이벤트 리스너 등록', { event: eventName });
    
    return () => {
      if (socketRef.current) {
        socketRef.current.off(eventName, handleCVEUpdated);
        logger.debug('CVEDetail: 소켓 이벤트 리스너 제거', { event: eventName });
      }
    };
  }, [propsCveId, open, handleCVEUpdated]);

  // CVEDetail.tsx에서 구독 관리 로직 수정
  useEffect(() => {
    // 모달이 열려 있고, CVE ID가 있을 때만 실행
    if (!propsCveId || !open) {
      return;
    }
    
    // 이미 구독 상태면 중복 요청 방지
    if (isSubscribedRef.current) {
      logger.debug('CVEDetail: 이미 구독 중, 중복 요청 방지', { cveId: propsCveId });
      return;
    }
    
    // 아직 구독 시도를 하지 않았고 연결된 상태에서만 구독
    if (!hasAttemptedSubscriptionRef.current && connected && socketRef.current) {
      logger.info('CVEDetail: 구독 시작', { cveId: propsCveId });
      hasAttemptedSubscriptionRef.current = true;
      
      // 확실한 타이밍을 위해 약간 지연 (선택적)
      setTimeout(() => {
        subscribe();
      }, 100);
    }
    
    // 모달 또는 컴포넌트가 닫힐 때만 구독 해제 (중요)
    return () => {
      // 모달이 닫히거나 컴포넌트가 언마운트될 때만 구독 해제
      if (isSubscribedRef.current) {
        logger.info('CVEDetail: 모달 닫힘 또는 언마운트, 구독 해제', { cveId: propsCveId });
        // unsubscribe() 호출 대신 socket.off() 메서드를 직접 사용하는 방식으로 변경
        if (socketRef.current && socketRef.current.off) {
          socketRef.current.off('subscription_status');
          logger.info(`[직접 구독] socket.off 메서드로 구독 해제 완료`);
        }
        // 플래그 초기화는 실제 구독 해제 응답 후에 처리되도록 수정
      }
    };
  }, [propsCveId, open, connected, subscribe]);

  // 연결 상태 변경 처리 (분리된 useEffect)
  useEffect(() => {
    // 연결 상태가 변경되고 모달이 열려있는 상태에서만 처리
    if (!propsCveId || !open) return;
    
    if (connected) {
      // 연결됐지만 아직 구독되지 않은 경우에만 구독 시도
      if (hasAttemptedSubscriptionRef.current && !isSubscribedRef.current) {
        logger.info('CVEDetail: 연결 복구, 구독 재시도', { cveId: propsCveId });
        subscribe();
      }
    }
  }, [connected, propsCveId, open, subscribe]);

  // 렌더링 로직
  if (!open) return null;
  
  if (isQueryLoading && !cveData) {
    return (
      <Dialog open={open} fullWidth maxWidth="md" onClose={handleClose}>
        <DialogContent
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            p: 5,
            height: '200px',
          }}
        >
          <CircularProgress />
        </DialogContent>
      </Dialog>
    );
  }
  
  if (queryError && !cveData) {
    return (
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>오류</DialogTitle>
        <DialogContent>
          <Typography color="error" gutterBottom>
            데이터를 불러오는 데 실패했습니다.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {queryError.message || '알 수 없는 오류'}
          </Typography>
        </DialogContent>
        <DialogActions>
          {queryError && (
            <Button
              onClick={() => {
                handleErrorDialogClose();
                handleRefresh();
              }}
              color="primary"
            >
              다시 시도
            </Button>
          )}
          <Button onClick={handleClose}>닫기</Button>
        </DialogActions>
      </Dialog>
    );
  }
  
  if (!cveData) {
    logger.warn('CVEDetail: cveData가 없습니다 (로딩/에러 아님). 렌더링 중단.');
    return (
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>정보 없음</DialogTitle>
        <DialogContent>
          <Typography>해당 CVE 정보를 찾을 수 없습니다.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>닫기</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      TransitionComponent={Fade}
      PaperProps={{
        sx: {
          borderRadius: 3,
          height: '90vh',
          maxHeight: '90vh',
          overflow: 'hidden',
          zIndex: 1500,
        },
      }}
      aria-labelledby="cve-detail-dialog-title"
    >
      <DialogTitle sx={{ p: 2, flexShrink: 0 }} id="cve-detail-dialog-title">
        <CVEDetailHeader
          cveId={cveData.cveId}
          subscribers={subscribers}
          createdAt={(cveData.createdAt || cveData.created_at) as string | Date}
          lastModifiedAt={(cveData.lastModifiedAt || cveData.last_modified_at) as string | Date}
          isCached={isCached}
          isLoading={loading}
          onRefresh={handleRefresh}
          onClose={handleClose}
        />
      </DialogTitle>
      <DialogContent
        sx={{
          p: 0,
          flexGrow: 1,
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        <Card
          elevation={0}
          sx={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <CardContent
            sx={{
              p: 0,
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                p: 2,
                flexShrink: 0,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <CVEDetailInfoPanel
                cveData={cveData}
                onUpdateField={handleFieldUpdate}
                canEdit={canEdit()}
              />
            </Box>
            <CVEDetailTabs
              cveData={cveData}
              currentUser={currentUser}
              refreshTriggers={refreshTriggers}
              tabCounts={tabCounts}
              onCountChange={handleTabCountChange}
              parentSendMessage={sendMessage}
              highlightCommentId={highlightCommentId}
            />
            {(isCached || cveData.fromCache) && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                  borderTop: 1,
                  borderColor: 'divider',
                  flexShrink: 0,
                  bgcolor: 'action.hover',
                }}
              >
                <Chip
                  size="small"
                  label="캐시된 데이터"
                  color="info"
                  variant="outlined"
                  sx={{ fontWeight: 500 }}
                />
                {(cveData._cachedAt || cveData.cachedAt) && (
                  <Typography variant="caption" color="text.secondary">
                    서버와 {timeAgo((cveData._cachedAt || cveData.cachedAt) as string | number)} 전에 동기화됨
                  </Typography>
                )}
              </Box>
            )}
          </CardContent>
        </Card>
      </DialogContent>
      {renderErrorDialog()}
    </Dialog>
  );
};

export default CVEDetail;