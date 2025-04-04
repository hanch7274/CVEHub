import React, {
    useState,
    useEffect,
    useRef,
    useCallback,
    useMemo,
    memo,
    // useLayoutEffect // 사용되지 않으므로 제거 가능
  } from 'react';
  import PropTypes from 'prop-types';
  import { useSocket } from 'core/socket/hooks/useSocket'; // 경로 확인
  import { useAuth } from 'features/auth/contexts/AuthContext'; // 경로 확인
  import { useQueryClient } from '@tanstack/react-query';
  import { useSnackbar } from 'notistack';
  import {
    Dialog,
    DialogContent,
    DialogTitle, // Header 컴포넌트로 내용 이동했지만, DialogTitle 자체는 유지
    DialogActions,
    DialogContentText,
    Card,
    CardContent,
    Box,
    Fade,
    CircularProgress,
    Button,
    Typography, // 에러 메시지 표시용
    Chip // 캐시 정보 표시용
  } from '@mui/material';
  import logger from 'shared/utils/logging'; // 경로 확인
  
  import { useUpdateCVEField } from 'features/cve/hooks/useCVEMutation'; // 경로 확인
  import { QUERY_KEYS } from 'shared/api/queryKeys'; // 경로 확인
  import { timeAgo } from 'shared/utils/dateUtils'; // 경로 확인
  import { useCVEDetail, useCVERefresh, useCVESubscription } from './hooks'; // 경로 확인
  
  // 분리된 컴포넌트 import
  import CVEDetailHeader from './CVEDetailHeader';
  import CVEDetailInfoPanel from './CVEDetailInfoPanel.js';
  import CVEDetailTabs from './CVEDetailTabs';
  
  // 활성 댓글 개수 계산 (유틸리티로 분리하거나 CVEDetailTabs에서만 필요하다면 그쪽으로 이동)
  // 여기서는 CVEDetail 스코프에 둡니다. 필요시 utils/cveUtils.js 등으로 분리하세요.
  const countActiveComments = (comments) => {
    if (!Array.isArray(comments)) return 0;
    return comments.reduce((count, comment) => {
      if (!comment) return count;
      // is_deleted 또는 isDeleted 속성 모두 확인
      const currentCount = (comment.is_deleted || comment.isDeleted) ? 0 : 1;
      const childCount = comment.children ? countActiveComments(comment.children) : 0;
      return count + currentCount + childCount;
    }, 0);
  };
  
  const CVEDetail = memo(({ cveId: propsCveId, open = false, onClose, highlightCommentId = null }) => {
    const { enqueueSnackbar, closeSnackbar } = useSnackbar();
    const { socket, connected } = useSocket();
    const { user: currentUser } = useAuth();
    const queryClient = useQueryClient();
  
    // 프론트엔드와 백엔드 필드명 매핑 (웹소켓 업데이트 처리용)
    const fieldMapping = {
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
      tags: 'tags'
    };

    // --- 상태 관리 ---
    const [loading, setLoading] = useState(false); // 직접 관리하는 로딩 상태 (필드 업데이트 시 사용)
    const [error, setError] = useState(null); // 데이터 로딩 또는 업데이트 에러
    const [isCached, setIsCached] = useState(false); // 데이터가 캐시에서 왔는지 여부
    const [localSubscribers, setLocalSubscribers] = useState([]); // 구독자 목록
    const [errorDialogOpen, setErrorDialogOpen] = useState(false); // 에러 발생 시 표시할 다이얼로그 상태
    // 리프레시 트리거 상태 (각 탭 컴포넌트에 전달하여 데이터 갱신 유도)
    const [refreshTriggers, setRefreshTriggers] = useState({
      general: 0, // 일반 정보 (사용 안 할 수도 있음)
      poc: 0,
      snortRules: 0,
      references: 0,
      comments: 0,
      history: 0 // History 탭은 보통 cveData 변경 시 자동 갱신되므로 별도 트리거 불필요할 수 있음
    });
    // 각 탭의 아이템 개수 상태 (탭 UI에 표시)
    const [tabCounts, setTabCounts] = useState({
      poc: 0,
      snortRules: 0,
      references: 0,
      comments: 0
    });
  
    // --- Refs ---
    const socketRef = useRef(socket); // 최신 소켓 객체 참조
    const connectedRef = useRef(connected); // 최신 소켓 연결 상태 참조
    const snackbarShown = useRef(false); // 스낵바 중복 표시 방지
    const refreshTriggersRef = useRef(refreshTriggers); // 콜백에서 최신 트리거 값 참조
    const lastProcessedUpdateIdRef = useRef({}); // 웹소켓 중복 업데이트 처리용
    const currentUserRef = useRef(); // 콜백에서 최신 사용자 정보 참조
    const isFirstLoadRef = useRef(true); // 컴포넌트 첫 로드 여부 확인용
    const subscriptionTimerRef = useRef(null); // 구독/해제 디바운싱 타이머
    const isSubscribedRef = useRef(false); // 현재 구독 상태 참조
  
    // --- Hooks ---
  
    // 현재 사용자 정보 업데이트
    useEffect(() => {
      currentUserRef.current = currentUser;
    }, [currentUser]);
  
    // 소켓 및 연결 상태 업데이트
    useEffect(() => {
      socketRef.current = socket;
      connectedRef.current = connected;
      // 디버깅 로그 (개발 시 유용)
      if (process.env.NODE_ENV === 'development') {
          logger.info('CVEDetail', '소켓 참조 업데이트됨 (메인 컴포넌트)', {
              socketId: socket?.id,
              connected,
              hasSocket: !!socket
          });
      }
    }, [socket, connected]);
  
    // CVE 구독 관련 로직 (useCVESubscription 훅 사용)
    const { subscribe, unsubscribe, isSubscribed, subscribers = [] } = useCVESubscription(propsCveId);
  
    // 구독 상태 로컬 ref 업데이트
    useEffect(() => {
      isSubscribedRef.current = isSubscribed;
    }, [isSubscribed]);
  
    // 구독자 목록 로컬 상태 업데이트
    useEffect(() => {
      // subscribers가 배열인지 확인 후 업데이트
      setLocalSubscribers(Array.isArray(subscribers) ? subscribers : []);
    }, [subscribers]);
  
    // 디바운스된 구독 요청 함수
    const debouncedSubscribe = useCallback(() => {
      if (subscriptionTimerRef.current) {
        clearTimeout(subscriptionTimerRef.current);
      }
      subscriptionTimerRef.current = setTimeout(() => {
        // 구독 조건 확인: 아직 구독 안 함, 소켓 연결됨, 소켓 존재, CVE ID 존재
        if (!isSubscribedRef.current && connectedRef.current && socketRef.current && propsCveId) {
          logger.info('CVEDetail', `디바운스된 구독 요청 실행: ${propsCveId}`, {
            isSubscribed: isSubscribedRef.current,
            connected: connectedRef.current,
            hasSocket: !!socketRef.current
          });
          subscribe(); // 구독 실행
        }
      }, 300); // 300ms 지연
    }, [propsCveId, subscribe]); // subscribe 함수는 보통 안정적이므로 의존성 포함
  
    // 디바운스된 구독 해제 요청 함수
    const debouncedUnsubscribe = useCallback(() => {
      if (subscriptionTimerRef.current) {
        clearTimeout(subscriptionTimerRef.current);
      }
      subscriptionTimerRef.current = setTimeout(() => {
         // 구독 해제 조건 확인: 구독 중, 소켓 연결됨, 소켓 존재, CVE ID 존재
        if (isSubscribedRef.current && connectedRef.current && socketRef.current && propsCveId) {
          logger.info('CVEDetail', `디바운스된 구독 해제 요청 실행: ${propsCveId}`, {
            isSubscribed: isSubscribedRef.current,
            connected: connectedRef.current,
            hasSocket: !!socketRef.current
          });
          unsubscribe(); // 구독 해제 실행
        }
      }, 300); // 300ms 지연
    }, [propsCveId, unsubscribe]); // unsubscribe 함수는 보통 안정적이므로 의존성 포함
  
    // React Query: CVE 상세 정보 조회
    const {
      data: cveData,
      isLoading: isQueryLoading, // React Query 자체 로딩 상태
      isFetching, // 백그라운드 업데이트 포함 로딩 상태
      dataUpdatedAt, // 데이터 마지막 업데이트 시간 (캐시 확인용)
      error: queryError, // React Query 에러 객체
      refetch: refetchCveDetail, // 데이터 수동 리페치 함수
    } = useCVEDetail(propsCveId, {
      enabled: !!propsCveId && open, // 모달이 열려 있고 CVE ID가 있을 때만 쿼리 활성화
      keepPreviousData: true, // 데이터 로딩 중 이전 데이터 유지 (UI 깜빡임 방지)
      refetchOnReconnect: false, // 네트워크 재연결 시 자동 리페치 비활성화 (소켓으로 처리)
      onSuccess: (data) => {
        logger.info('CVEDetail', '데이터 로딩 성공', { dataReceived: !!data });
        // 성공 스낵바 (기존 표시 중이면 닫고 새로 표시)
        if (snackbarShown.current) {
           closeSnackbar();
        }
        // enqueueSnackbar('데이터를 성공적으로 불러왔습니다', { variant: 'success', autoHideDuration: 1500 });
        // snackbarShown.current = false; // 스낵바 관련 상태 관리는 필요에 따라 조정
  
        updateTabCounts(data); // 탭 카운트 업데이트
        setIsCached(false); // 새로 가져온 데이터는 캐시 아님
        setLoading(false); // 직접 관리 로딩 상태 해제
        setError(null); // 성공 시 에러 상태 초기화
        setErrorDialogOpen(false); // 에러 다이얼로그 닫기
      },
      onError: (err) => {
        logger.error('CVEDetail', '데이터 로딩 실패', { error: err.message });
        // 실패 스낵바
        if (snackbarShown.current) {
           closeSnackbar();
        }
        enqueueSnackbar(`데이터 로딩 실패: ${err.message || '알 수 없는 오류'}`, { variant: 'error' });
        // snackbarShown.current = false;
  
        setError(err.message || '데이터 로딩 실패'); // 에러 상태 설정
        setLoading(false); // 직접 관리 로딩 상태 해제
        setErrorDialogOpen(true); // 에러 다이얼로그 표시
      }
    });
  
     // React Query: CVE 정보 새로고침 (강제 업데이트)
    const { mutate: refreshCVE, isLoading: isRefreshing } = useCVERefresh(propsCveId);
    // React Query: CVE 필드 업데이트
    const { mutate: updateCVEField } = useUpdateCVEField();
  
    // --- 메모 및 상태 계산 ---
  
    // 데이터가 캐시에서 왔는지 확인
    const isDataFromCache = useMemo(() => {
      if (cveData && dataUpdatedAt) {
        const cacheThreshold = 30 * 1000; // 30초 기준
        const now = Date.now();
        return (now - dataUpdatedAt) > cacheThreshold;
      }
      return false;
    }, [cveData, dataUpdatedAt]);
  
    // 캐시 상태 업데이트
    useEffect(() => {
      setIsCached(isDataFromCache);
    }, [isDataFromCache]);
  
    // 전체 로딩 상태 계산 (Query 로딩 + 직접 관리 로딩 + 새로고침 로딩)
    const isLoading = useMemo(() => {
        const loadingState = isQueryLoading || loading || isRefreshing || isFetching;
        // 디버깅 로그
        if (loadingState && process.env.NODE_ENV === 'development') {
            logger.debug('CVEDetail', '로딩 상태 확인 (메인)', {
                isQueryLoading, // 쿼리 자체 로딩 (초기 로드)
                isFetching, // 쿼리 백그라운드 로딩 포함
                isRefreshing, // 수동 새로고침 로딩 (useCVERefresh)
                localLoading: loading, // 필드 업데이트 등 로컬 로딩
                cveId: propsCveId
            });
        }
        return loadingState;
    }, [isQueryLoading, loading, isRefreshing, isFetching, propsCveId]); // propsCveId 추가 (디버깅 위해)
  
    // --- 콜백 함수 ---
  
    // 탭 카운트 업데이트 함수 (데이터 기반)
    const updateTabCounts = useCallback((data) => {
      if (!data) {
          // 데이터 없으면 0으로 초기화 또는 로그만 남김
          logger.warn('updateTabCounts: 데이터가 없어 카운트를 업데이트할 수 없습니다.');
          setTabCounts({ poc: 0, snortRules: 0, references: 0, comments: 0 });
          return;
      }
      // 디버깅 로그
      if (process.env.NODE_ENV === 'development') {
          console.log('updateTabCounts - 입력 데이터:', Object.keys(data));
      }
  
      // 각 탭의 아이템 개수 계산
      const newCounts = {
        // 다양한 필드명 가능성 고려 (pocs, poc, PoCs, pocList 등)
        poc: data.pocs?.length ?? data.poc?.length ?? data.PoCs?.length ?? data.pocList?.length ?? 0,
        snortRules: data.snortRules?.length ?? data.snort_rules?.length ?? 0,
        references: data.references?.length ?? data.refs?.length ?? 0,
        comments: countActiveComments(data.comments) // 활성 댓글 수 계산 함수 사용
      };
  
      // 디버깅 로그
      if (process.env.NODE_ENV === 'development') {
          console.log('CVEDetail - 탭 카운트 업데이트됨:', newCounts);
      }
  
      setTabCounts(newCounts); // 상태 업데이트
    }, []); // countActiveComments는 외부 함수이므로 의존성 없음
  
    // 필드 업데이트 핸들러 (InfoPanel에서 호출됨)
    const handleFieldUpdate = useCallback(async (field, value) => {
      // 필수 값 체크
      if (!propsCveId || !field) {
          logger.warn('handleFieldUpdate: cveId 또는 field가 없습니다.');
          return;
      }
      // 기존 데이터와 비교하여 변경 여부 확인 (불필요한 업데이트 방지)
      // cveData가 로드되지 않았거나, 필드 값이 동일하면 업데이트 중단
      if (!cveData || cveData[field] === value) {
          logger.info('handleFieldUpdate: 변경 사항 없음', { field, value });
          return;
      }
  
      logger.info('handleFieldUpdate 시작', { field, value });
  
      // 필드 이름 매핑 (프론트엔드 camelCase -> 백엔드 snake_case 등)
      const fieldMapping = {
        title: 'title',
        description: 'description',
        status: 'status',
        severity: 'severity',
        // 다른 필드 매핑 필요시 추가
        // poc: 'pocs', // 배열 업데이트는 다른 방식으로 처리될 수 있음
        // snortRules: 'snort_rules',
        // references: 'references',
      };
      const backendField = fieldMapping[field] || field; // 매핑 없으면 필드명 그대로 사용
  
      // React Query 캐시 데이터 가져오기 (낙관적 업데이트 위해)
      const cachedData = queryClient.getQueryData(QUERY_KEYS.CVE.detail(propsCveId));
  
      // --- 낙관적 업데이트 ---
      if (cachedData) {
        // 1. 새 데이터 객체 생성 (원본 불변성 유지)
        const optimisticData = { ...cachedData, [field]: value };
  
        // 2. 캐시 직접 업데이트
        queryClient.setQueryData(QUERY_KEYS.CVE.detail(propsCveId), optimisticData);
        logger.info('handleFieldUpdate: 캐시 낙관적 업데이트 완료', { field, value });
  
        // 3. 리프레시 트리거 업데이트 (필요시 관련 탭 갱신 유도)
        // const currentTrigger = refreshTriggersRef.current[field] || 0;
        // setRefreshTriggers(prev => {
        //   const newTriggers = { ...prev, [field]: currentTrigger + 1 };
        //   refreshTriggersRef.current = newTriggers; // ref도 업데이트
        //   return newTriggers;
        // });
  
        // 4. 탭 카운트 업데이트 (필요시)
        // 배열 필드 업데이트 시 카운트 변경 로직은 별도 처리 필요
        // 예: if (['poc', 'snortRules', 'references'].includes(field) && Array.isArray(value)) { updateTabCounts(optimisticData); }
        // status, severity 등은 카운트에 영향 없으므로 불필요
      }
      // --- 낙관적 업데이트 끝 ---
  
      setLoading(true); // 로컬 로딩 상태 시작
  
      // 서버에 업데이트 요청 (useUpdateCVEField 뮤테이션 사용)
      updateCVEField(
        { cveId: propsCveId, fieldName: backendField, fieldValue: value },
        {
          onSuccess: (updatedData) => { // 성공 시 서버에서 반환된 데이터 (있다면)
            logger.info('CVEDetail', `필드 업데이트 성공: ${field}`, { response: updatedData });
            // 성공 스낵바
            enqueueSnackbar(`${field} 업데이트 성공`, { variant: 'success', autoHideDuration: 1500 });
  
            // 목록 쿼리 무효화 (status, severity 등 목록에 표시되는 필드 변경 시)
            if (['title', 'status', 'severity'].includes(field)) {
               logger.info('CVEDetail: 목록 쿼리 무효화 중...');
               // queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.list() }); // list 쿼리 키 구조에 맞게 수정
               queryClient.invalidateQueries({
                   predicate: (query) =>
                       Array.isArray(query.queryKey) && query.queryKey[0] === QUERY_KEYS.CVE.list()[0] // list 키의 첫 부분 비교
               });
            }
            // 성공 시 캐시 데이터는 이미 최신 상태이므로 추가 setQueryData는 불필요할 수 있음
            // 필요하다면 서버 응답(updatedData)으로 캐시를 다시 업데이트
            // queryClient.setQueryData(QUERY_KEYS.CVE.detail(propsCveId), (oldData) => ({ ...oldData, ...updatedData }));
          },
          onError: (err) => {
            logger.error('CVEDetail', `필드 업데이트 실패: ${field}`, { error: err.message });
            // 실패 스낵바
            enqueueSnackbar(`업데이트 실패 (${field}): ${err.message || '알 수 없는 오류'}`, { variant: 'error' });
  
            // --- 롤백: 낙관적 업데이트 되돌리기 ---
            if (cachedData) {
              queryClient.setQueryData(QUERY_KEYS.CVE.detail(propsCveId), cachedData);
              logger.info('handleFieldUpdate: 캐시 롤백 완료', { field });
              // 롤백 시 탭 카운트도 원복 필요 (만약 변경했다면)
              // if (['poc', 'snortRules', 'references'].includes(field) && Array.isArray(cachedData[field])) { updateTabCounts(cachedData); }
            }
            // --- 롤백 끝 ---
  
            // 에러 상태 설정 (선택적)
            // setError(`필드 업데이트 실패: ${err.message}`);
            // setErrorDialogOpen(true);
          },
          onSettled: () => {
              // 성공/실패 여부와 관계없이 로딩 상태 해제
              setLoading(false);
              logger.info('handleFieldUpdate: 완료 (성공/실패 무관)', { field });
          }
        }
      );
    }, [propsCveId, cveData, updateCVEField, queryClient, enqueueSnackbar, updateTabCounts]); // cveData 의존성 추가
  
    // 웹소켓 메시지 핸들러 (실시간 업데이트 수신)
    const handleWebSocketUpdate = useCallback((data) => {
      logger.info('CVEDetail', '웹소켓 업데이트 수신', data);
      if (!data) return;
  
      const fieldKey = data.field_key || data.field || 'general'; // 백엔드 필드 키 확인
      const updateId = data.updateId || Date.now(); // 업데이트 고유 ID (중복 처리용)
  
      // 중복 업데이트 방지
      if (lastProcessedUpdateIdRef.current[fieldKey] === updateId) {
        logger.info('CVEDetail', `중복 웹소켓 업데이트 무시: ${fieldKey}, ID: ${updateId}`);
        return;
      }
      lastProcessedUpdateIdRef.current[fieldKey] = updateId; // 처리된 ID 기록
  
      // refreshTriggers 상태 업데이트 (해당 탭 리렌더링 유도)
      setRefreshTriggers(prev => {
        const currentTrigger = prev[fieldKey] || 0;
        const newTriggers = { ...prev, [fieldKey]: currentTrigger + 1 };
        refreshTriggersRef.current = newTriggers; // ref도 동기화
        logger.info('CVEDetail: Refresh trigger 업데이트', { fieldKey, newTrigger: newTriggers[fieldKey] });
        return newTriggers;
      });
  
      // 댓글 업데이트는 CommentsTab에서 자체 처리하므로 여기서는 무시
      if (fieldKey === 'comments') {
          logger.info('CVEDetail: 댓글 업데이트는 CommentsTab에서 처리');
          return;
      }
  
      // 캐시 직접 업데이트 (데이터 로딩 중이 아닐 때만)
      if (!isLoading) { // isLoading 사용 (isQueryLoading 대신)
        try {
          // 현재 캐시 데이터 가져오기
          const cachedData = queryClient.getQueryData(QUERY_KEYS.CVE.detail(propsCveId));
  
          if (cachedData && data.updatedData) { // 캐시와 업데이트 데이터가 모두 있을 때
            logger.info('CVEDetail', `${fieldKey} 필드 웹소켓 업데이트 - 캐시 직접 업데이트`);
  
            // 새 데이터 객체 생성 (원본 불변성 유지)
            let updatedCacheData = { ...cachedData };
  
            // 업데이트된 데이터 적용 (필드별 또는 전체)
            if (fieldKey === 'all') {
              updatedCacheData = { ...updatedCacheData, ...data.updatedData };
            } else if (data.updatedData.hasOwnProperty(fieldKey)) { // 백엔드 필드명 기준
               updatedCacheData[fieldKey] = data.updatedData[fieldKey];
               // 프론트엔드 필드명도 업데이트 (매핑 필요시)
               const frontendField = Object.keys(fieldMapping).find(key => fieldMapping[key] === fieldKey);
               if (frontendField) {
                  updatedCacheData[frontendField] = data.updatedData[fieldKey];
               }
            } else {
               // 특정 필드 데이터 구조에 맞게 업데이트 (예: pocs 배열)
               if (fieldKey === 'pocs' && data.updatedData.pocs) updatedCacheData.pocs = data.updatedData.pocs;
               else if (fieldKey === 'snort_rules' && data.updatedData.snort_rules) updatedCacheData.snortRules = data.updatedData.snort_rules; // 필드명 확인
               else if (fieldKey === 'references' && data.updatedData.references) updatedCacheData.references = data.updatedData.references;
               // 기타 필드...
               else {
                   // 예상치 못한 필드 키 또는 데이터 구조
                   logger.warn('CVEDetail: 처리되지 않은 웹소켓 필드 업데이트', { fieldKey, updatedData: data.updatedData });
                   // 안전하게 전체 데이터 업데이트 시도 (백엔드 응답 구조에 따라 조정)
                   updatedCacheData = { ...updatedCacheData, ...data.updatedData };
               }
            }
  
  
            // 캐시 업데이트
            queryClient.setQueryData(QUERY_KEYS.CVE.detail(propsCveId), updatedCacheData);
  
            // 탭 카운트 업데이트 (변경된 데이터 기반)
            updateTabCounts(updatedCacheData);
  
          } else if (!cachedData) {
            // 캐시가 없는 경우: 쿼리 무효화하여 새로 가져오도록 함
            logger.info('CVEDetail', `웹소켓 업데이트 - 캐시 없음, 쿼리 무효화: ${fieldKey}`);
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(propsCveId) });
          }
        } catch (error) {
          logger.error('CVEDetail', '웹소켓 업데이트 처리 중 캐시 업데이트 오류', { error: error.message });
          // 오류 발생 시 안전하게 쿼리 무효화
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(propsCveId) });
        }
      } else {
          logger.info('CVEDetail: 로딩 중이므로 웹소켓 업데이트 건너뜀', { fieldKey });
      }
  
      // 업데이트 알림 스낵바
      if (!snackbarShown.current) {
        snackbarShown.current = true;
        // 필드 이름 변환 (사용자 친화적)
        let fieldName = fieldKey;
        // 필요시 fieldKey -> 사용자 표시 이름 매핑 추가
        // ...
        enqueueSnackbar(`${fieldName} 정보가 업데이트되었습니다.`, {
          variant: 'info', // 정보성 알림
          autoHideDuration: 2500,
          anchorOrigin: { vertical: 'bottom', horizontal: 'right' },
          onClose: () => { snackbarShown.current = false; }
        });
      }
  
      // setLoading(false); // 웹소켓 업데이트는 백그라운드 작업이므로 로컬 로딩 상태 변경 불필요
  
    }, [enqueueSnackbar, propsCveId, queryClient, isLoading, updateTabCounts]); // isLoading, updateTabCounts 의존성 추가
  
    // 웹소켓 'cve_updated' 이벤트 핸들러
    const handleCVEUpdated = useCallback((data) => {
      // 해당 CVE ID 업데이트인지 확인
      if (!data || !(data.cveId === propsCveId || data.id === propsCveId)) return;
  
      logger.info('CVEDetail', '`cve_updated` 이벤트 수신', {
        dataId: data.id || data.cveId,
        propsCveId,
        type: data.field_key || data.field || 'general'
      });
  
      // 실제 업데이트 처리 함수 호출
      handleWebSocketUpdate(data);
  
    }, [propsCveId, handleWebSocketUpdate]); // handleWebSocketUpdate 의존성 추가
  
    // 새로고침 핸들러 (수동)
    const handleRefresh = useCallback(() => {
      // 로딩 중이거나 ID 없으면 중단
      if (!propsCveId || isLoading) {
          logger.warn('handleRefresh: 이미 로딩 중이거나 ID가 없습니다.');
          return;
      }
  
      logger.info('handleRefresh: 데이터 새로고침 시작', { cveId: propsCveId });
  
      // 스낵바 처리
      if (snackbarShown.current) closeSnackbar();
      enqueueSnackbar('데이터를 새로고침 중입니다...', { variant: 'info' });
      snackbarShown.current = true; // 스낵바 표시 상태
  
      setLoading(true); // 로컬 로딩 상태 활성화 (피드백용)
      setIsCached(false); // 새로고침 시 캐시 상태 해제
  
      // 1. 캐시 무효화 (가장 확실하게 최신 데이터 가져옴)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(propsCveId) });
  
      // 2. 리페치 실행 (staleTime: 0과 유사 효과)
      refetchCveDetail()
        .then((result) => { // result 객체 확인 (v5 기준)
          logger.info('handleRefresh: 데이터 새로고침 성공', { cveId: propsCveId });
          // updateTabCounts는 onSuccess 콜백에서 이미 처리됨
          // 성공 스낵바
          closeSnackbar(); // 이전 스낵바 닫기
          enqueueSnackbar('최신 데이터를 성공적으로 불러왔습니다', { variant: 'success', autoHideDuration: 2000 });
          snackbarShown.current = false;
        })
        .catch((error) => {
          logger.error('handleRefresh: 데이터 새로고침 실패', { cveId: propsCveId, error: error.message });
          // 실패 스낵바
          closeSnackbar();
          enqueueSnackbar(`새로고침 실패: ${error.message || '알 수 없는 오류'}`, { variant: 'error' });
          snackbarShown.current = false;
          // 에러 상태 설정 및 다이얼로그 표시
          setError(error.message || '새로고침 실패');
          setErrorDialogOpen(true);
        })
        .finally(() => {
          // 로컬 로딩 상태 해제
          setLoading(false);
          // 스낵바 상태 초기화 (필요시)
          // snackbarShown.current = false;
        });
    }, [propsCveId, isLoading, refetchCveDetail, queryClient, enqueueSnackbar, closeSnackbar, updateTabCounts]); // isLoading 의존성 추가
  
    // 메시지 전송 함수 (탭 컴포넌트에서 사용, 소켓 emit)
    const sendMessage = useCallback(async (type, data) => {
      // 소켓 연결 상태 확인
      if (!socketRef.current || !connectedRef.current) {
        logger.warn('sendMessage: 소켓 연결 없음', { type });
        enqueueSnackbar('서버 연결이 없어 메시지를 보낼 수 없습니다.', { variant: 'warning' });
        // 연결 없을 때 캐시 무효화 시도 (선택적)
        // if (!isLoading) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(propsCveId) });
        return null; // 실패 의미
      }
  
      // 이벤트 타입 확인
      if (!type) {
        logger.error('sendMessage: 이벤트 타입 누락', { data });
        enqueueSnackbar('메시지 전송 오류: 타입 누락', { variant: 'error' });
        return null;
      }
  
      logger.info('sendMessage: 메시지 전송 시도', { type, cveId: propsCveId, data });
  
      try {
        // 소켓 이벤트 전송
        socketRef.current.emit(type, {
          cve_id: propsCveId, // 백엔드 요구사항에 맞게 cveId 포함
          ...data
        });
        logger.info('sendMessage: 메시지 전송 성공', { type });
  
        // 전송 후 일정 시간 뒤 캐시 무효화 (웹소켓 응답 없을 경우 대비)
        // const fieldToUpdate = type.includes('comment') ? 'comments' : (type.includes('poc') ? 'poc' : 'general'); // 관련 필드 추정
        // setTimeout(() => {
        //   if (!isLoading) { // 로딩 중 아닐 때만
        //     logger.info(`sendMessage: ${type} 전송 후 캐시 무효화 타이머 실행`);
        //     queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.detail(propsCveId) });
        //   }
        // }, 3000); // 3초 후
  
        return true; // 성공 의미
  
      } catch (socketError) {
        logger.error('sendMessage: 소켓 emit 오류', { type, error: socketError.message });
        enqueueSnackbar('메시지 전송 중 오류 발생', { variant: 'error' });
        return null; // 실패 의미
      }
    }, [socketRef, connectedRef, propsCveId, enqueueSnackbar, queryClient, isLoading]); // isLoading 의존성 추가
  
    // 에러 다이얼로그 닫기 핸들러
    const handleErrorDialogClose = useCallback(() => {
      setErrorDialogOpen(false);
      setError(null); // 에러 상태 초기화
      // 에러 발생 시 모달을 닫을지 여부 결정
      // if (onClose) onClose();
    }, [/* onClose */]); // onClose 의존성 필요시 추가
  
     // 탭 카운트 변경 콜백 (Tabs 컴포넌트에서 호출됨)
     const handleTabCountChange = useCallback((tabKey, count) => {
         // tabKey 유효성 검사 (선택적)
         if (tabCounts.hasOwnProperty(tabKey)) {
             setTabCounts(prev => ({ ...prev, [tabKey]: count }));
         } else {
             logger.warn('handleTabCountChange: 유효하지 않은 탭 키', { tabKey, count });
         }
     }, [tabCounts]); // tabCounts 의존성 추가 (hasOwnProperty 사용 위해)
  
    // 편집 권한 확인 함수
    const canEdit = useCallback(() => {
      // 실제 권한 확인 로직 구현 (예: currentUser의 role 확인)
      // return currentUser?.roles?.includes('editor') || false;
      return true; // 임시로 항상 true 반환
    }, [/* currentUser */]); // currentUser 의존성 필요시 추가
  
    // --- useEffects ---
  
    // 소켓 이벤트 리스너 등록/해제
    useEffect(() => {
      // 조건: ID 있고, 모달 열려있고, 소켓 있고, 연결됨
      if (propsCveId && open && socketRef.current && connectedRef.current) {
        logger.info('CVEDetail: 소켓 이벤트 리스너 등록 시도', { event: 'cve_updated' });
        socketRef.current.on('cve_updated', handleCVEUpdated);
        logger.info('CVEDetail: 소켓 이벤트 리스너 등록 완료', { event: 'cve_updated' });
  
        // 클린업 함수: 컴포넌트 언마운트 또는 의존성 변경 시 리스너 제거
        return () => {
          if (socketRef.current) {
             logger.info('CVEDetail: 소켓 이벤트 리스너 제거 시도', { event: 'cve_updated' });
             socketRef.current.off('cve_updated', handleCVEUpdated);
             logger.info('CVEDetail: 소켓 이벤트 리스너 제거 완료', { event: 'cve_updated' });
          }
        };
      } else {
          logger.info('CVEDetail: 소켓 이벤트 리스너 등록 조건 미충족', { hasId: !!propsCveId, open, hasSocket: !!socketRef.current, connected: connectedRef.current });
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propsCveId, open, handleCVEUpdated]); // handleCVEUpdated가 useCallback으로 감싸져 안정적이므로 의존성 포함 OK
  
    // 모달 열릴 때 데이터 로드 및 구독 처리
    useEffect(() => {
      if (open && propsCveId) {
        logger.info('CVEDetail: 모달 열림 감지', { cveId: propsCveId });
        // 로딩 상태 설정
        // cveData가 아직 없으면 초기 로딩으로 간주, 있으면 백그라운드 로딩 가능성
        if (!cveData) {
            setLoading(true); // 초기 로딩 시 로컬 로딩 상태 활성화
            logger.info('CVEDetail: 초기 데이터 로드 시작');
            refetchCveDetail(); // 데이터 가져오기
        } else {
            // 이미 데이터가 있으면 명시적 로딩 상태 변경은 불필요할 수 있음 (isFetching으로 확인 가능)
            // 필요하다면 stale 상태일 때 refetch 등 로직 추가
            logger.info('CVEDetail: 기존 데이터 존재, 필요시 백그라운드 업데이트');
        }
  
        // 소켓 연결 시 구독 요청
        if (connectedRef.current && socketRef.current && !isSubscribedRef.current) {
          logger.info('CVEDetail: 모달 열림 - 구독 요청');
          debouncedSubscribe();
        }
      } else if (!open) {
          // 모달 닫힐 때 로딩/에러 상태 초기화 (선택적)
          setLoading(false);
          setError(null);
          setErrorDialogOpen(false);
          // 구독 해제
          if(isSubscribedRef.current) {
              logger.info('CVEDetail: 모달 닫힘 - 구독 해제 요청');
              debouncedUnsubscribe();
          }
      }
  
      // 컴포넌트 언마운트 시 (open이 false가 될 때) 첫 로드 플래그 리셋
      if (!open) {
          isFirstLoadRef.current = true;
      }
  
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, propsCveId, cveData /* refetchCveDetail, debouncedSubscribe, debouncedUnsubscribe는 useCallback */]); // cveData는 조건부 로딩 위해 필요
  
    // 소켓 연결 상태 변경 시 구독/해제 처리
    useEffect(() => {
      // 연결되었을 때: 모달 열려있고, ID 있고, 아직 구독 안 했으면 구독 시도
      if (connected && open && propsCveId && !isSubscribedRef.current) {
        logger.info('CVEDetail: 소켓 연결됨 - 구독 시도');
        debouncedSubscribe();
      }
      // 연결 끊겼을 때: 구독 중이었다면 구독 해제 (자동 해제될 수도 있지만 명시적 처리)
      // else if (!connected && isSubscribedRef.current) {
      //   logger.info('CVEDetail: 소켓 연결 끊김 - 구독 해제');
      //   unsubscribe(); // 즉시 해제 또는 debounced 사용
      // }
  
      // 클린업 함수: 타이머 제거
      return () => {
        if (subscriptionTimerRef.current) {
          clearTimeout(subscriptionTimerRef.current);
        }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected, open, propsCveId /* debouncedSubscribe, unsubscribe는 useCallback */]); // connected 상태 변경 감지
  
    // 첫 로드 & 장시간 미방문 시 데이터 자동 갱신
    useEffect(() => {
      if (propsCveId && open && isFirstLoadRef.current) {
        isFirstLoadRef.current = false; // 첫 로드 플래그 해제
  
        const lastVisitTime = localStorage.getItem(`lastVisitTime_${propsCveId}`); // ID별로 관리
        const currentTime = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
  
        if (!lastVisitTime || (currentTime - parseInt(lastVisitTime, 10)) > oneDay) {
          logger.info('CVEDetail: 장시간 미방문, 데이터 자동 갱신 시도', { cveId: propsCveId });
          // 약간의 딜레이 후 백그라운드에서 갱신 시도 (UI 블락 방지)
          setTimeout(() => {
            // 로딩 중이 아닐 때만 실행
            if (!isLoading) {
                logger.info('CVEDetail: 데이터 자동 갱신 실행');
                refetchCveDetail({ staleTime: 0 }) // staleTime 0으로 즉시 갱신
                    .then(() => logger.info('CVEDetail: 데이터 자동 갱신 완료'))
                    .catch((error) => logger.error('CVEDetail: 데이터 자동 갱신 실패', error));
            } else {
                logger.info('CVEDetail: 로딩 중이므로 자동 갱신 건너뜀');
            }
          }, 1500); // 1.5초 후
        }
        // 현재 방문 시간 기록
        localStorage.setItem(`lastVisitTime_${propsCveId}`, currentTime.toString());
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propsCveId, open /* refetchCveDetail, isLoading은 useCallback/useMemo */]); // open 상태 변경 시에도 체크
  
    // --- 렌더링 ---
  
    // 에러 다이얼로그 렌더링 함수
    const renderErrorDialog = () => (
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
          {/* 재시도 버튼 (데이터 로딩 에러 시 유용) */}
          {queryError && ( // React Query 에러가 있을 때만 표시 (선택적)
              <Button onClick={() => { handleErrorDialogClose(); handleRefresh(); }} color="primary">
                  다시 시도
              </Button>
          )}
          <Button onClick={handleErrorDialogClose} color="secondary">
            닫기
          </Button>
        </DialogActions>
      </Dialog>
    );
  
    // --- 조건부 렌더링 ---
  
    // 1. 모달이 닫혀있으면 아무것도 렌더링 안 함
    if (!open) return null;
  
    // 2. 초기 로딩 상태 (데이터 아직 없음)
    // isLoading은 백그라운드 fetch 포함하므로, isQueryLoading 사용 또는 !cveData 조건 추가
    if (isQueryLoading && !cveData) {
        return (
            <Dialog open={open} fullWidth maxWidth="md" onClose={onClose} /* 닫기 버튼 없으면 onClose 불필요 */ >
                <DialogContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 5, height: '200px' }}>
                    <CircularProgress />
                </DialogContent>
            </Dialog>
        );
    }
  
    // 3. 초기 로딩 에러 상태 (데이터 없음)
    // queryError 사용
    if (queryError && !cveData) {
         return (
             <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
                 <DialogTitle>오류</DialogTitle>
                 <DialogContent>
                     <Typography color="error" gutterBottom>데이터를 불러오는 데 실패했습니다.</Typography>
                     <Typography variant="body2" sx={{ mt: 1 }}>{queryError.message || '알 수 없는 오류'}</Typography>
                 </DialogContent>
                 <DialogActions>
                     <Button onClick={handleRefresh}>다시 시도</Button>
                     <Button onClick={onClose}>닫기</Button>
                 </DialogActions>
             </Dialog>
         );
    }
  
    // 4. 데이터가 없는 예외적인 경우 (로딩/에러 아닌데 데이터 없음)
    if (!cveData) {
         logger.warn('CVEDetail: cveData가 없습니다 (로딩/에러 아님). 렌더링 중단.');
        // 빈 Dialog 또는 메시지 표시
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
  
    // --- 정상 렌더링 ---
    return (
      <Dialog
        open={open}
        onClose={onClose} // Dialog 바깥 클릭 시 닫기 허용
        maxWidth="lg"
        fullWidth
        TransitionComponent={Fade} // 부드러운 등장 효과
        PaperProps={{
          sx: {
            borderRadius: 3, // 모서리 둥글게
            height: '90vh', // 높이 제한
            maxHeight: '90vh', // 최대 높이 (스크롤 위해)
            overflow: 'hidden', // Paper 자체 스크롤 방지 (내부에서 처리)
            zIndex: 1500 // 다른 요소 위에 표시 (필요시 조정)
          }
        }}
        aria-labelledby="cve-detail-dialog-title" // 접근성
      >
        {/* DialogTitle은 레이아웃 역할, 내용은 Header 컴포넌트가 담당 */}
        <DialogTitle sx={{ p: 2, flexShrink: 0 /* 높이 고정 */ }} id="cve-detail-dialog-title">
           <CVEDetailHeader
              cveId={cveData.cveId}
              subscribers={localSubscribers}
              // 백엔드 필드명 불일치 가능성 고려 (옵셔널 체이닝과 || 사용)
              createdAt={cveData.createdAt || cveData.created_at}
              lastModifiedAt={cveData.lastModifiedAt || cveData.last_modified_at}
              isCached={isCached}
              isLoading={isLoading} // 전체 로딩 상태 전달 (버튼 비활성화 등)
              onRefresh={handleRefresh}
              onClose={onClose}
           />
        </DialogTitle>
  
        {/* DialogContent는 남은 공간을 채우고, 내부 스크롤은 Tabs 컴포넌트에서 관리 */}
        <DialogContent sx={{ p: 0, flexGrow: 1, overflow: 'hidden', display: 'flex' }}>
           <Card elevation={0} sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
               {/* CardContent가 실제 내용을 감싸고 flex 레이아웃 적용 */}
               <CardContent sx={{ p: 0, flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                   {/* 정보 패널 (높이 고정) */}
                   <Box sx={{ p: 2, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
                       <CVEDetailInfoPanel
                           cveData={cveData} // 필요한 데이터만 넘기도록 최적화 가능
                           onUpdateField={handleFieldUpdate}
                           canEdit={canEdit()}
                       />
                   </Box>
  
                   {/* 탭 영역 (남은 공간 차지, 내부 스크롤) */}
                   <CVEDetailTabs
                       cveData={cveData}
                       currentUser={currentUser}
                       refreshTriggers={refreshTriggers} // 탭별 리프레시 트리거
                       tabCounts={tabCounts} // 탭 카운트 표시용
                       onCountChange={handleTabCountChange} // 탭 카운트 업데이트 콜백
                       parentSendMessage={sendMessage} // 메시지 전송 함수
                       highlightCommentId={highlightCommentId} // 특정 댓글 하이라이트
                   />
  
                   {/* 캐시 정보 푸터 (선택적, 높이 고정) */}
                   {(isCached || cveData.fromCache) && ( // cveData.fromCache 속성도 확인 (백엔드에서 명시)
                     <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderTop: 1, borderColor: 'divider', flexShrink: 0, bgcolor: 'action.hover' }}>
                       <Chip size="small" label="캐시된 데이터" color="info" variant="outlined" sx={{ fontWeight: 500 }} />
                       {/* 캐시 시간 정보 (백엔드 필드명 확인: _cachedAt 또는 cachedAt) */}
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
  
         {/* 에러 다이얼로그 렌더링 */}
         {renderErrorDialog()}
      </Dialog>
    );
  });
  
  CVEDetail.propTypes = {
    cveId: PropTypes.string, // 필수 아님 (null일 수 있음)
    open: PropTypes.bool, // 기본값 false
    onClose: PropTypes.func.isRequired, // 모달 닫기 함수 (필수)
    highlightCommentId: PropTypes.string // 특정 댓글 ID (선택적)
  };
  
  export default CVEDetail; // memo 적용됨