import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Container, 
  Typography, 
  Box, 
  Paper,
  Divider,
  Fade,
  Alert,
  Backdrop,
  CircularProgress,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { Helmet } from 'react-helmet-async';
import { useAuth } from 'features/auth/contexts/AuthContext';
import { useActivityQuery } from '../hooks/useActivityQuery';
import ActivityList from '../components/ActivityList';
import ActivitiesFilter from '../components/ActivitiesFilter';
import useSocket from 'core/socket/hooks/useSocket';
import { useQueryClient } from '@tanstack/react-query';

/**
 * 개선된 사용자 활동 이력 페이지 컴포넌트
 * - 응답형 디자인 개선
 * - 로딩 상태 개선
 * - 성능 최적화
 * 
 * @returns {JSX.Element} 렌더링된 컴포넌트
 */
const ActivitiesPage = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  /** @type {Object} 현재 인증된 사용자 정보 */
  const { user } = useAuth();
  
  /** @type {string} 현재 사용자의 사용자명 */
  const username = user?.username || '';
  
  /**
   * 필터 상태 관리
   * @type {[Object, function]} 필터 상태와 상태 변경 함수
   */
  const [filters, setFilters] = useState({
    username: username, // 기본값으로 현재 사용자 설정
    page: 1,
    limit: 10,
    action: '',
    target_type: '',
    target_id: '',
    start_date: null,
    end_date: null
  });

  // 상태 변경 감지용 초기 마운트 플래그
  const [initialLoad, setInitialLoad] = useState(true);

  /**
   * 필터 상태 변경 시 페이지 리셋
   * 사용자가 필터를 변경할 때마다 페이지를 1로 리셋하여
   * 필터링된 결과의 첫 페이지를 보여줍니다.
   */
  useEffect(() => {
    if (initialLoad) {
      setInitialLoad(false);
      return;
    }
    
    // 페이지 변경이 아닌 다른 필터 변경 시에만 페이지 번호 초기화
    if (
      filters.action !== filters.action ||
      filters.target_type !== filters.target_type ||
      filters.target_id !== filters.target_id ||
      filters.username !== filters.username ||
      filters.start_date !== filters.start_date ||
      filters.end_date !== filters.end_date
    ) {
      setFilters(prev => ({ ...prev, page: 1 }));
    }
  }, [filters.action, filters.target_type, filters.target_id, filters.username, filters.start_date, filters.end_date, initialLoad]);

  /**
   * 사용자 변경 시 필터 업데이트
   * 로그인 상태가 변경되면 필터의 사용자명을 업데이트합니다.
   */
  useEffect(() => {
    if (username && initialLoad) {
      setFilters(prev => ({ ...prev, username }));
    }
  }, [username, initialLoad]);

  /**
   * 활동 데이터 가져오기
   * useActivityQuery 훅을 사용하여 선택된 필터에 따라 활동 데이터를 조회합니다.
   */
  const { 
    data, 
    isLoading, 
    isRefetching,
    error, 
    refetch 
  } = useActivityQuery(filters);

  // 로딩 중 상태 - 첫 로딩과 리페칭 구분
  const isFullPageLoading = isLoading && !isRefetching;
  const isRefreshLoading = !isLoading && isRefetching;

  /**
   * 소켓 이벤트 구독
   * useSocket 훅을 사용하여 활동 관련 실시간 이벤트를 구독합니다.
   */
  const queryClient = useQueryClient();
  
  // 활동 관련 이벤트를 처리하는 콜백 함수
  const handleActivityEvent = useCallback((eventData) => {
    // 글로벌 활동 알림인 경우 모든 활동 쿼리 무효화
    queryClient.invalidateQueries(['activities'], { refetchActive: true });

    // 현재 사용자 관련 활동인 경우 해당 사용자 활동 쿼리 무효화
    if (eventData.username === username) {
      queryClient.invalidateQueries(['userActivities', username], { refetchActive: true });
    }

    // 특정 대상 관련 활동인 경우 해당 대상 활동 쿼리 무효화
    if (eventData.target_type && eventData.target_id) {
      queryClient.invalidateQueries(
        ['targetActivities', eventData.target_type, eventData.target_id],
        { refetchActive: true }
      );
    }
  }, [queryClient, username]);

  // 활동 이벤트 구독
  const { on } = useSocket(null, null, [], {
    subscribeImmediately: true
  });

  // 컴포넌트 마운트 시 이벤트 리스너 등록
  useEffect(() => {
    // 글로벌 활동 업데이트 이벤트 구독
    const unsubscribeGlobal = on('GLOBAL_ACTIVITY_UPDATED', handleActivityEvent);
    // 사용자별 활동 업데이트 이벤트 구독
    const unsubscribeUser = on('USER_ACTIVITY_UPDATED', handleActivityEvent);
    // 대상별 활동 업데이트 이벤트 구독
    const unsubscribeTarget = on('TARGET_ACTIVITY_UPDATED', handleActivityEvent);

    // 컴포넌트 언마운트 시 이벤트 리스너 제거
    return () => {
      unsubscribeGlobal();
      unsubscribeUser();
      unsubscribeTarget();
    };
  }, [on, handleActivityEvent]);

  /**
   * 필터 변경 핸들러
   * 
   * @param {Object} newFilters - 새로운 필터 값
   */
  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  /**
   * 필터 적용 핸들러
   */
  const handleFilterApply = () => {
    refetch();
  };

  /**
   * 필터 초기화 핸들러
   */
  const handleFilterReset = () => {
    setFilters({
      username: username, // 현재 로그인한 사용자로 설정
      page: 1,
      limit: 10,
      action: '',
      target_type: '',
      target_id: '',
      start_date: null,
      end_date: null
    });
    
    // 초기화 후 바로 데이터 다시 불러오기
    setTimeout(() => refetch(), 0);
  };

  /**
   * 페이지 변경 핸들러
   * 
   * @param {number} newPage - 새로운 페이지 번호
   */
  const handlePageChange = (newPage) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  /**
   * 페이지당 항목 수 변경 핸들러
   * 
   * @param {number} newLimit - 새로운 페이지당 항목 수
   */
  const handleLimitChange = (newLimit) => {
    setFilters(prev => ({ ...prev, limit: newLimit, page: 1 }));
  };
  
  // 현재 적용된 활동 타입에 따른 제목 텍스트
  const titleText = useMemo(() => {
    if (filters.username === username) {
      return '내 활동';
    } else if (filters.username) {
      const selectedUser = data?.users?.find(u => u.username === filters.username);
      const displayName = selectedUser ? (selectedUser.display_name || selectedUser.username) : filters.username;
      return `${displayName}님의 활동`;
    } else {
      return '모든 활동';
    }
  }, [filters.username, username, data?.users]);

  return (
    <>
      <Helmet>
        <title>활동 이력 | CVEHub</title>
      </Helmet>
      
      {/* 전체 페이지 로딩 인디케이터 */}
      <Backdrop
        sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
        open={isFullPageLoading}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
      
      <Container maxWidth="lg" sx={{ mt: { xs: 2, sm: 4 }, mb: 4 }}>
        {/* 페이지 타이틀 */}
        <Box sx={{ mb: { xs: 2, sm: 3 } }}>
          <Typography variant="h4" component="h1" gutterBottom>
            활동 이력
          </Typography>
          <Typography variant="body1" color="text.secondary">
            CVEHub에서의 사용자 활동 내역을 확인하세요. 필터를 사용하여 특정 사용자, 기간, 활동 유형 등으로 검색할 수 있습니다.
          </Typography>
        </Box>

        {/* 필터 영역 */}
        <Box sx={{ mb: { xs: 2, sm: 3 } }}>
          <ActivitiesFilter 
            filters={filters}
            onFilterChange={handleFilterChange}
            onFilterApply={handleFilterApply}
            onFilterReset={handleFilterReset}
          />
        </Box>

        {/* 리프레시 중 알림 */}
        {isRefreshLoading && (
          <Fade in={isRefreshLoading}>
            <Alert 
              severity="info" 
              sx={{ mb: 2 }}
              icon={<CircularProgress size={20} />}
            >
              데이터를 갱신 중입니다...
            </Alert>
          </Fade>
        )}

        {/* 활동 목록 영역 */}
        <Paper sx={{ p: { xs: 2, sm: 3 } }}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" component="h2">
              {titleText}
            </Typography>
            <Divider sx={{ my: 1 }} />
          </Box>
          
          <ActivityList 
            activities={data?.items || []}
            total={data?.total || 0}
            page={filters.page}
            limit={filters.limit}
            isLoading={isLoading || isRefetching}
            error={error}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
          />
        </Paper>
      </Container>
    </>
  );
};

export default React.memo(ActivitiesPage);