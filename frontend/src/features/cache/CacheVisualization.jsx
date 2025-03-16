import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Container, 
  Typography, 
  Paper, 
  Grid, 
  Tabs, 
  Tab, 
  CircularProgress,
  Divider,
  useTheme
} from '@mui/material';
import { 
  useCacheInfoQuery, 
  useCacheStatsQuery, 
  useReactQueryCache 
} from '../../api/hooks/useCacheQuery';
import RedisOverview from './components/RedisOverview';
import RedisKeysList from './components/RedisKeysList';
import RedisValuesViewer from './components/RedisValuesViewer';
import ReactQueryViewer from './components/ReactQueryViewer';
import CacheDashboard from './components/CacheDashboard';

/**
 * 캐시 시각화 페이지 컴포넌트
 */
const CacheVisualization = () => {
  const theme = useTheme();
  const [tabValue, setTabValue] = useState(0);
  const { data: cacheInfo, isLoading: isInfoLoading } = useCacheInfoQuery();
  const { data: cacheStats, isLoading: isStatsLoading } = useCacheStatsQuery();
  const { getQueryCache } = useReactQueryCache();
  const [queryCache, setQueryCache] = useState([]);

  // React Query 캐시 정보 주기적 업데이트
  useEffect(() => {
    const updateQueryCache = () => {
      setQueryCache(getQueryCache());
    };

    // 초기 로드
    updateQueryCache();

    // 1초마다 업데이트
    const interval = setInterval(updateQueryCache, 1000);
    return () => clearInterval(interval);
  }, []); // getQueryCache 의존성 제거

  // 탭 변경 핸들러
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  // 로딩 중 표시
  if (isInfoLoading || isStatsLoading) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '80vh' 
        }}
      >
        <CircularProgress size={60} thickness={4} />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 8 }}>
      <Paper 
        elevation={3} 
        sx={{ 
          p: 3, 
          borderRadius: 2, 
          background: `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}
      >
        <Typography 
          variant="h4" 
          component="h1" 
          gutterBottom 
          sx={{ 
            fontWeight: 700, 
            color: theme.palette.primary.main,
            textShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
            mb: 3
          }}
        >
          캐시 시각화 대시보드
        </Typography>
        
        <Divider sx={{ mb: 4 }} />
        
        {/* 대시보드 요약 정보 */}
        <CacheDashboard 
          cacheInfo={cacheInfo} 
          cacheStats={cacheStats} 
          queryCache={queryCache} 
        />
        
        {/* 탭 네비게이션 */}
        <Box sx={{ mt: 6, mb: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={tabValue} 
            onChange={handleTabChange} 
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              '& .MuiTab-root': {
                fontWeight: 600,
                fontSize: '1rem',
                transition: 'all 0.2s',
                '&:hover': {
                  color: theme.palette.primary.main,
                  opacity: 0.8,
                },
              },
              '& .Mui-selected': {
                color: theme.palette.primary.main,
              },
              '& .MuiTabs-indicator': {
                backgroundColor: theme.palette.primary.main,
                height: 3,
                borderRadius: '3px 3px 0 0',
              },
            }}
          >
            <Tab label="Redis 개요" />
            <Tab label="Redis 키 목록" />
            <Tab label="Redis 값 뷰어" />
            <Tab label="React Query 캐시" />
          </Tabs>
        </Box>
        
        {/* 탭 컨텐츠 */}
        <Box sx={{ py: 2 }}>
          {tabValue === 0 && <RedisOverview cacheInfo={cacheInfo} cacheStats={cacheStats} />}
          {tabValue === 1 && <RedisKeysList />}
          {tabValue === 2 && <RedisValuesViewer />}
          {tabValue === 3 && <ReactQueryViewer queryCache={queryCache} />}
        </Box>
      </Paper>
    </Container>
  );
};

export default CacheVisualization;
