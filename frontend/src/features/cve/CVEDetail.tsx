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
    const fieldMapping: Record<string, string> = {
      status: 'status',
      title: 'title',
      description: 'description',
      severity: 'severity',
      cveId: 'cve_id',
      pocs: 'pocs',
      snortRules: 'snort_rules',
      references: 'references',
      comments: 'comments',
      createdAt: 'created_at',
      lastModifiedAt: 'last_modified_at',
      lastModifiedBy: 'last_modified_by',
      modificationHistory: 'modification_history',
      tags: 'tags',
    };

    // --- 상태 관리 ---
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isCached, setIsCached] = useState<boolean>(false);
    const [localSubscribers, setLocalSubscribers] = useState<Subscriber[]>([]);
    const [errorDialogOpen, setErrorDialogOpen] = useState<boolean>(false);
    const [refreshTriggers, setRefreshTriggers] = useState<RefreshTriggers>({
      general: 0,
      poc: 0,
      snortRules: 0,
      references: 0,
      comments: 0,
      history: 0,
    });
    const [tabCounts, setTabCounts] = useState<TabCounts>({
      poc: 0,
      snortRules: 0,
      references: 0,
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
    const subscriptionTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isSubscribedRef = useRef<boolean>(false);

    // --- Hooks ---
    useEffect(() => {
      currentUserRef.current = currentUser;
    }, [currentUser]);

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

    // CVE 구독 관련 로직 (useCVESubscription 훅 사용)
    const { subscribe, unsubscribe, isSubscribed, subscribers = [] } =
      useCVESubscription(propsCveId || '');
    useEffect(() => {
      isSubscribedRef.current = isSubscribed;
    }, [isSubscribed]);

    useEffect(() => {
      setLocalSubscribers(Array.isArray(subscribers) ? subscribers : []);
    }, [subscribers]);

    // 디바운스된 구독 요청 함수
    const debouncedSubscribe = useCallback(() => {
      // 이미 실행 중인 타이머가 있으면 정리
      if (subscriptionTimerRef.current) {
        clearTimeout(subscriptionTimerRef.current);
        subscriptionTimerRef.current = null;
      }
      
      // 새 타이머 생성
      subscriptionTimerRef.current = setTimeout(() => {
        // 타이머 실행 후 타이머 ID 초기화
        subscriptionTimerRef.current = null;
        
        if (
          !isSubscribedRef.current &&
          connectedRef.current &&
          socketRef.current &&
          propsCveId
        ) {
          if (process.env.NODE_ENV === 'development') {
            logger.info('CVEDetail', `디바운스된 구독 요청 실행: ${propsCveId}`, {
              isSubscribed: isSubscribedRef.current,
              connected: connectedRef.current,
              hasSocket: !!socketRef.current,
            });
          }
          subscribe();
        }
      }, 300);
    }, [propsCveId, subscribe]);

    // 디바운스된 구독 해제 요청 함수
    const debouncedUnsubscribe = useCallback(() => {
      // 이미 실행 중인 타이머가 있으면 정리
      if (subscriptionTimerRef.current) {
        clearTimeout(subscriptionTimerRef.current);
        subscriptionTimerRef.current = null;
      }
      
      // 새 타이머 생성
      subscriptionTimerRef.current = setTimeout(() => {
        // 타이머 실행 후 타이머 ID 초기화
        subscriptionTimerRef.current = null;
        
        if (
          isSubscribedRef.current &&
          connectedRef.current &&
          socketRef.current &&
          propsCveId
        ) {
          if (process.env.NODE_ENV === 'development') {
            logger.info('CVEDetail', `디바운스된 구독 해제 요청 실행: ${propsCveId}`, {
              isSubscribed: isSubscribedRef.current,
              connected: connectedRef.current,
              hasSocket: !!socketRef.current,
            });
          }
          unsubscribe();
        }
      }, 300);
    }, [propsCveId, unsubscribe]);

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
      // keepPreviousData 옵션 제거 (타입에 없음)
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

    const isDataFromCache = useMemo(() => {
      if (cveData && dataUpdatedAt) {
        const cacheThreshold = 30 * 1000;
        return Date.now() - dataUpdatedAt > cacheThreshold;
      }
      return false;
    }, [cveData, dataUpdatedAt]);

    useEffect(() => {
      setIsCached(isDataFromCache);
    }, [isDataFromCache]);

    const updateTabCounts = useCallback((data: CVEDetailData) => {
      if (!data) {
        logger.warn('updateTabCounts: 데이터가 없어 카운트를 업데이트할 수 없습니다.');
        setTabCounts({ poc: 0, snortRules: 0, references: 0, comments: 0 });
        return;
      }
      

      
      const newCounts: TabCounts = {
        poc:
          data.pocs?.length ??
          data.poc?.length ??
          data.PoCs?.length ??
          data.pocList?.length ??
          0,
        snortRules: data.snortRules?.length ?? data.snort_rules?.length ?? 0,
        references: data.references?.length ?? data.refs?.length ?? 0,
        comments: countActiveComments(data.comments),
      };
      setTabCounts(newCounts);
    }, []);

    const { mutate: refreshCVE, isLoading: isRefreshing } = useCVERefresh(
      propsCveId || ''
    );
    const { mutate: updateCVEField } = useUpdateCVEField();

    const handleFieldUpdate = useCallback(
      async (field: string, value: unknown) => {
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
          const optimisticData = { ...cachedData, [field]: value };
          queryClient.setQueryData(QUERY_KEYS.CVE.detail(propsCveId), optimisticData);
          logger.info('handleFieldUpdate: 캐시 낙관적 업데이트 완료', { field, value });
        }
        setLoading(true);
        updateCVEField(
          { cveId: propsCveId, fieldName: backendField, fieldValue: value },
          {
            // @ts-ignore - ApiResponse와 CVEDetailData 타입 불일치 무시
            onSuccess: (updatedData: any, _variables, _context) => {
              logger.info('CVEDetail', `필드 업데이트 성공: ${field}`, {
                response: updatedData,
              });
              enqueueSnackbar(`${field} 업데이트 성공`, {
                variant: 'success',
                autoHideDuration: 1500,
              });
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
      },
      [propsCveId, cveData, updateCVEField, queryClient, enqueueSnackbar]
    );

    const handleTitleUpdate = useCallback(
      async (newTitle: string) => {
        if (!cveData || !propsCveId || newTitle === cveData.title) return;
        handleFieldUpdate('title', newTitle);
      },
      [cveData, propsCveId, handleFieldUpdate]
    );

    const handleDescriptionUpdate = useCallback(
      async (newDescription: string) => {
        if (!cveData || !propsCveId || newDescription === cveData.description)
          return;
        handleFieldUpdate('description', newDescription);
      },
      [cveData, propsCveId, handleFieldUpdate]
    );

    const handleWebSocketUpdate = useCallback(
      (data: WebSocketUpdateData) => {
        logger.info('CVEDetail', '웹소켓 업데이트 수신', data);
        if (!data) return;
        const fieldKey = data.field_key || data.field || 'general';
        const updateId = data.updateId || Date.now();
        if (lastProcessedUpdateIdRef.current[fieldKey] === updateId) {
          logger.info('CVEDetail', `중복 웹소켓 업데이트 무시: ${fieldKey}, ID: ${updateId}`);
          return;
        }
        lastProcessedUpdateIdRef.current[fieldKey] = updateId;
        setRefreshTriggers((prev) => {
          const currentTrigger = prev[fieldKey as keyof RefreshTriggers] || 0;
          const newTriggers: RefreshTriggers = {
            ...prev,
            [fieldKey]: currentTrigger + 1,
          };
          refreshTriggersRef.current = newTriggers;
          logger.info('CVEDetail: Refresh trigger 업데이트', {
            fieldKey,
            newTrigger: newTriggers[fieldKey as keyof RefreshTriggers],
          });
          return newTriggers;
        });
        if (fieldKey === 'comments') {
          logger.info('CVEDetail: 댓글 업데이트는 CommentsTab에서 처리');
          return;
        }
        if (!loading) {
          try {
            const cachedData = queryClient.getQueryData<CVEDetailData>(
              QUERY_KEYS.CVE.detail(propsCveId)
            );
            if (cachedData && data.updatedData) {
              logger.info('CVEDetail', `${fieldKey} 필드 웹소켓 업데이트 - 캐시 직접 업데이트`);
              let updatedCacheData = { ...cachedData };
              if (fieldKey === 'all') {
                updatedCacheData = { ...updatedCacheData, ...(data.updatedData as Record<string, any>) };
              } else if (data.updatedData.hasOwnProperty(fieldKey)) {
                (updatedCacheData as any)[fieldKey] = data.updatedData[fieldKey];
                const frontendField = Object.keys(fieldMapping).find(
                  (key) => fieldMapping[key] === fieldKey
                );
                if (frontendField) {
                  (updatedCacheData as any)[frontendField] = data.updatedData[fieldKey];
                }
              } else {
                if (fieldKey === 'pocs' && data.updatedData.pocs)
                  updatedCacheData.pocs = data.updatedData.pocs;
                else if (fieldKey === 'snort_rules' && data.updatedData.snort_rules)
                  updatedCacheData.snortRules = data.updatedData.snort_rules;
                else if (fieldKey === 'references' && data.updatedData.references)
                  updatedCacheData.references = data.updatedData.references;
                else {
                  logger.warn('CVEDetail: 처리되지 않은 웹소켓 필드 업데이트', {
                    fieldKey,
                    updatedData: data.updatedData,
                  });
                  updatedCacheData = { ...updatedCacheData, ...(data.updatedData as Record<string, any>) };
                }
              }
              queryClient.setQueryData(
                QUERY_KEYS.CVE.detail(propsCveId),
                updatedCacheData
              );
              updateTabCounts(updatedCacheData);
            } else if (!cachedData) {
              logger.info('CVEDetail', `웹소켓 업데이트 - 캐시 없음, 쿼리 무효화: ${fieldKey}`);
              queryClient.invalidateQueries({
                queryKey: QUERY_KEYS.CVE.detail(propsCveId),
              });
            }
          } catch (error: unknown) {
            const err =
              error instanceof Error ? error : new Error('Unknown error');
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
      },
      [enqueueSnackbar, propsCveId, queryClient, loading, updateTabCounts]
    );

    const handleCVEUpdated = useCallback(
      (data: WebSocketUpdateData) => {
        if (!data || !(data.cveId === propsCveId || data.id === propsCveId)) return;
        logger.info('CVEDetail', '`cve_updated` 이벤트 수신', {
          dataId: data.id || data.cveId,
          propsCveId,
          type: data.field_key || data.field || 'general',
        });
        handleWebSocketUpdate(data);
      },
      [propsCveId, handleWebSocketUpdate]
    );

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
    }, [
      propsCveId,
      loading,
      refetchCveDetail,
      queryClient,
      enqueueSnackbar,
      closeSnackbar,
    ]);

    const sendMessage = useCallback(
      async (type: string, data: Record<string, unknown>): Promise<boolean | null> => {
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
          setTimeout(() => {
            if (!loading && !isQueryLoading) {
              queryClient.invalidateQueries({
                queryKey: QUERY_KEYS.CVE.detail(propsCveId),
              });
            }
          }, 3000);
          return true;
        } catch (socketError: unknown) {
          const err =
            socketError instanceof Error ? socketError : new Error('Unknown error');
          logger.error('sendMessage: 소켓 emit 오류', { type, error: err.message });
          enqueueSnackbar('메시지 전송 중 오류 발생', { variant: 'error' });
          return null;
        }
      },
      [propsCveId, enqueueSnackbar, queryClient, loading, isQueryLoading]
    );

    const handleErrorDialogClose = useCallback(() => {
      setErrorDialogOpen(false);
      setError(null);
    }, []);

    const handleTabCountChange = useCallback(
      (tabKey: keyof TabCounts, count: number) => {
        setTabCounts((prev) => ({ ...prev, [tabKey]: count }));
      },
      []
    );

    const canEdit = useCallback((): boolean => {
      // 실제 권한 확인 로직 구현 가능
      return true;
    }, []);

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

    // --- useEffects ---
    // 소켓 이벤트 리스너 등록/제거
    useEffect(() => {
      if (propsCveId && open && socketRef.current && connectedRef.current) {
        if (process.env.NODE_ENV === 'development') {
          logger.info('CVEDetail: 소켓 이벤트 리스너 등록 시도', { event: 'cve_updated' });
        }
        socketRef.current.on('cve_updated', handleCVEUpdated);
        if (process.env.NODE_ENV === 'development') {
          logger.info('CVEDetail: 소켓 이벤트 리스너 등록 완료', { event: 'cve_updated' });
        }
        return () => {
          if (socketRef.current) {
            if (process.env.NODE_ENV === 'development') {
              logger.info('CVEDetail: 소켓 이벤트 리스너 제거 시도', { event: 'cve_updated' });
            }
            socketRef.current.off('cve_updated', handleCVEUpdated);
            if (process.env.NODE_ENV === 'development') {
              logger.info('CVEDetail: 소켓 이벤트 리스너 제거 완료', { event: 'cve_updated' });
            }
          }
        };
      } else {
        if (process.env.NODE_ENV === 'development') {
          logger.info('CVEDetail: 소켓 이벤트 리스너 등록 조건 미충족', {
            hasId: !!propsCveId,
            open,
            hasSocket: !!socketRef.current,
            connected: connectedRef.current,
          });
        }
      }
    }, [propsCveId, open, handleCVEUpdated]);

    // 데이터 자동 갱신 로직
    useEffect(() => {
      // 중복 실행 방지를 위한 플래그
      let isEffectActive = true;
      
      // 이미 isFirstLoadRef가 false로 설정된 경우에는 실행하지 않음
      if (propsCveId && open && isFirstLoadRef.current) {
        const lastVisitTime = localStorage.getItem(`lastVisitTime_${propsCveId}`);
        const currentTime = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        
        if (!lastVisitTime || currentTime - parseInt(lastVisitTime, 10) > oneDay) {
          if (process.env.NODE_ENV === 'development') {
            logger.info('CVEDetail: 장시간 미방문, 데이터 자동 갱신 시도', { cveId: propsCveId });
          }
          
          // 로딩 중이 아닐 때만 데이터 갱신 실행
          const refreshTimer = setTimeout(() => {
            if (isEffectActive && !loading) {
              if (process.env.NODE_ENV === 'development') {
                logger.info('CVEDetail: 데이터 자동 갱신 실행');
              }
              refetchCveDetail()
                .then(() => {
                  if (process.env.NODE_ENV === 'development') {
                    logger.info('CVEDetail: 데이터 자동 갱신 완료');
                  }
                })
                .catch((error) => logger.error('CVEDetail: 데이터 자동 갱신 실패', error));
            }
          }, 1000);
          
          return () => {
            clearTimeout(refreshTimer);
            isEffectActive = false;
          };
        }
        
        // 방문 시간 업데이트
        localStorage.setItem(`lastVisitTime_${propsCveId}`, currentTime.toString());
        isFirstLoadRef.current = false;
      }
      
      return () => {
        isEffectActive = false;
      };
    }, [propsCveId, open, loading, refetchCveDetail]);

    useEffect(() => {
      // 중복 실행 방지를 위한 플래그
      let isEffectActive = true;
      
      // 모달이 열릴 때
      if (open && propsCveId) {
        // 초기 방문 시에만 로그 출력
        if (!isFirstLoadRef.current && process.env.NODE_ENV === 'development') {
          logger.info('CVEDetail: 모달 열림 감지', { cveId: propsCveId });
        }
        
        // 데이터 로드 로직 - 최초 1회만 실행
        if (!cveData && isFirstLoadRef.current) {
          setLoading(true);
          if (process.env.NODE_ENV === 'development') {
            logger.info('CVEDetail: 초기 데이터 로드 시작');
          }
          refetchCveDetail();
          isFirstLoadRef.current = false;
        } else if (cveData && isFirstLoadRef.current) {
          // 개발 환경에서만 로깅
          if (process.env.NODE_ENV === 'development') {
            logger.info('CVEDetail: 기존 데이터 존재, 필요시 백그라운드 업데이트');
          }
          isFirstLoadRef.current = false;
        }
      } 
      // 모달이 닫힐 때
      else if (!open) {
        setLoading(false);
        setError(null);
        setErrorDialogOpen(false);
        
        // 모달 닫힐 때만 구독 해제 처리
        if (isSubscribedRef.current) {
          if (process.env.NODE_ENV === 'development') {
            logger.info('CVEDetail: 모달 닫힘 - 구독 해제 요청');
          }
          debouncedUnsubscribe();
        }
        
        // 모달 닫힐 때 isFirstLoadRef 초기화 및 타이머 정리
        isFirstLoadRef.current = true;
        
        // 모달이 닫힐 때 항상 타이머 정리
        if (subscriptionTimerRef.current) {
          clearTimeout(subscriptionTimerRef.current);
          subscriptionTimerRef.current = null;
        }
      }
      
      // 클린업 함수
      return () => {
        isEffectActive = false;
      };
    }, [open, propsCveId, cveData, refetchCveDetail, debouncedUnsubscribe]);

    // 소켓 연결 상태에 따른 구독 관리 - 수정된 부분
    useEffect(() => {
      // 중복 실행 방지를 위한 플래그
      let isEffectActive = true;
      
      // 모달이 열려있고, 소켓이 연결됐으며, 아직 구독되지 않은 상태일 때만 구독 시도
      if (connected && open && propsCveId && !isSubscribedRef.current) {
        // 지연 실행으로 불필요한 중복 구독 방지
        const delayedSubscribeCheck = setTimeout(() => {
          // effect가 여전히 활성 상태이고 아직 구독되지 않았으며 타이머가 설정되지 않은 경우에만 구독
          if (isEffectActive && !isSubscribedRef.current && !subscriptionTimerRef.current) {
            if (process.env.NODE_ENV === 'development') {
              logger.info('CVEDetail: 소켓 연결됨 - 구독 시도');
            }
            debouncedSubscribe();
          }
        }, 500); // 약간의 지연으로 타이밍 문제 방지
        
        return () => {
          clearTimeout(delayedSubscribeCheck);
          isEffectActive = false;
        };
      }
      
      return () => {
        isEffectActive = false;
      };
    }, [connected, open, propsCveId, debouncedSubscribe]);

    // 컴포넌트 언마운트 시 정리 작업
    useEffect(() => {
      return () => {
        // 컴포넌트 언마운트 시 모든 타이머 정리
        if (subscriptionTimerRef.current) {
          clearTimeout(subscriptionTimerRef.current);
          subscriptionTimerRef.current = null;
        }
        
        // 구독 상태 정리
        if (isSubscribedRef.current && propsCveId && socketRef.current && connectedRef.current) {
          unsubscribe();
        }
        
        // isFirstLoadRef 초기화
        isFirstLoadRef.current = true;
      };
    }, [propsCveId, unsubscribe]);

    if (!open) return null;
    if (isQueryLoading && !cveData) {
      return (
        <Dialog open={open} fullWidth maxWidth="md" onClose={onClose}>
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
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
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
            <Button onClick={onClose}>닫기</Button>
          </DialogActions>
        </Dialog>
      );
    }
    if (!cveData) {
      logger.warn(
        'CVEDetail: cveData가 없습니다 (로딩/에러 아님). 렌더링 중단.'
      );
      return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
          <DialogTitle>정보 없음</DialogTitle>
          <DialogContent>
            <Typography>해당 CVE 정보를 찾을 수 없습니다.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>닫기</Button>
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
            subscribers={localSubscribers}
            createdAt={(cveData.createdAt || cveData.created_at) as string | Date}
            lastModifiedAt={(cveData.lastModifiedAt || cveData.last_modified_at) as string | Date}
            isCached={isCached}
            isLoading={loading}
            onRefresh={handleRefresh}
            onClose={onClose}
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
