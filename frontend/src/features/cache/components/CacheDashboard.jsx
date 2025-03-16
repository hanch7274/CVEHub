import React from 'react';
import { 
  Box, 
  Grid, 
  Paper, 
  Typography, 
  useTheme,
  Tooltip,
  Chip
} from '@mui/material';
import { 
  Storage as StorageIcon, 
  Memory as MemoryIcon, 
  Speed as SpeedIcon, 
  QueryStats as QueryStatsIcon 
} from '@mui/icons-material';
import { 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend
} from 'recharts';

/**
 * 캐시 대시보드 컴포넌트
 * @param {Object} props 컴포넌트 속성
 * @param {Object} props.cacheInfo Redis 서버 정보
 * @param {Object} props.cacheStats Redis 캐시 통계
 * @param {Array} props.queryCache React Query 캐시 정보
 */
const CacheDashboard = ({ cacheInfo, cacheStats, queryCache }) => {
  const theme = useTheme();
  
  // 색상 팔레트
  const colors = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.error.main,
    theme.palette.info.main,
  ];
  
  // 메모리 사용량 데이터 (MB 단위)
  const memoryData = [
    { name: '사용 메모리', value: parseFloat((cacheInfo.used_memory / (1024 * 1024)).toFixed(2)) },
    { name: '피크 메모리', value: parseFloat((cacheInfo.used_memory_peak / (1024 * 1024)).toFixed(2)) },
  ];
  
  // 키 타입 데이터
  const keyTypesData = Object.entries(cacheStats.key_types || {}).map(([type, count], index) => ({
    name: type,
    value: count,
    color: colors[index % colors.length]
  }));
  
  // 히트/미스 데이터
  const hitMissData = [
    { name: '히트', value: cacheStats.keyspace_hits || 0 },
    { name: '미스', value: cacheStats.keyspace_misses || 0 },
  ];
  
  // 히트율 계산
  const hitRate = hitMissData[0].value + hitMissData[1].value > 0
    ? ((hitMissData[0].value / (hitMissData[0].value + hitMissData[1].value)) * 100).toFixed(2)
    : 0;
  
  // React Query 캐시 상태 데이터
  const queryStatusData = [
    { name: '활성', value: queryCache.filter(q => q.isActive).length },
    { name: '오래됨', value: queryCache.filter(q => q.isStale).length },
    { name: '비활성', value: queryCache.filter(q => !q.isActive).length },
  ];

  // 통계 카드 스타일
  const statCardStyle = {
    p: 3,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 2,
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
    transition: 'transform 0.3s, box-shadow 0.3s',
    '&:hover': {
      transform: 'translateY(-5px)',
      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
    }
  };

  // 아이콘 스타일
  const iconStyle = {
    fontSize: 40,
    mb: 2,
    p: 1,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
  };

  return (
    <Box sx={{ mb: 6 }}>
      <Grid container spacing={3}>
        {/* Redis 서버 정보 */}
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={statCardStyle}>
            <Box sx={{ 
              ...iconStyle, 
              bgcolor: 'rgba(25, 118, 210, 0.1)', 
              color: 'primary.main' 
            }}>
              <StorageIcon fontSize="large" />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Redis 서버
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              버전: {cacheInfo.redis_version}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              업타임: {Math.floor(cacheInfo.uptime_in_seconds / 86400)}일 {Math.floor((cacheInfo.uptime_in_seconds % 86400) / 3600)}시간
            </Typography>
            <Typography variant="body2" color="text.secondary">
              연결 클라이언트: {cacheInfo.connected_clients}
            </Typography>
            <Box sx={{ mt: 'auto', pt: 2 }}>
              <Chip 
                label={cacheInfo.redis_mode === 'standalone' ? '단독 모드' : cacheInfo.redis_mode} 
                size="small" 
                color="primary" 
                variant="outlined" 
              />
            </Box>
          </Paper>
        </Grid>

        {/* 메모리 사용량 */}
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={statCardStyle}>
            <Box sx={{ 
              ...iconStyle, 
              bgcolor: 'rgba(156, 39, 176, 0.1)', 
              color: 'secondary.main' 
            }}>
              <MemoryIcon fontSize="large" />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              메모리 사용량
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              사용 메모리: {(cacheInfo.used_memory / (1024 * 1024)).toFixed(2)} MB
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              피크 메모리: {(cacheInfo.used_memory_peak / (1024 * 1024)).toFixed(2)} MB
            </Typography>
            <Typography variant="body2" color="text.secondary">
              메모리 단편화: {cacheInfo.mem_fragmentation_ratio?.toFixed(2) || 'N/A'}
            </Typography>
            
            <Box sx={{ mt: 2, height: 100 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memoryData} layout="vertical">
                  <RechartsTooltip 
                    formatter={(value) => [`${value} MB`, '메모리']}
                    labelFormatter={() => ''}
                  />
                  <Bar 
                    dataKey="value" 
                    fill={theme.palette.secondary.main}
                    radius={[0, 4, 4, 0]}
                  >
                    {memoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        {/* 캐시 성능 */}
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={statCardStyle}>
            <Box sx={{ 
              ...iconStyle, 
              bgcolor: 'rgba(76, 175, 80, 0.1)', 
              color: 'success.main' 
            }}>
              <SpeedIcon fontSize="large" />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              캐시 성능
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              키스페이스 히트: {cacheStats.keyspace_hits?.toLocaleString() || 0}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              키스페이스 미스: {cacheStats.keyspace_misses?.toLocaleString() || 0}
            </Typography>
            <Typography variant="h5" color="success.main" sx={{ mt: 1, fontWeight: 700 }}>
              히트율: {hitRate}%
            </Typography>
            
            <Box sx={{ mt: 2, height: 100 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={hitMissData}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={40}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill={theme.palette.success.main} />
                    <Cell fill={theme.palette.error.main} />
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value, name) => [value.toLocaleString(), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        {/* React Query 캐시 */}
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={statCardStyle}>
            <Box sx={{ 
              ...iconStyle, 
              bgcolor: 'rgba(0, 150, 136, 0.1)', 
              color: 'info.main' 
            }}>
              <QueryStatsIcon fontSize="large" />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              React Query 캐시
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              총 쿼리 수: {queryCache.length}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              활성 쿼리: {queryCache.filter(q => q.isActive).length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              오래된 쿼리: {queryCache.filter(q => q.isStale).length}
            </Typography>
            
            <Box sx={{ mt: 2, height: 100 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={queryStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={40}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {queryStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value, name) => [value, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CacheDashboard;
