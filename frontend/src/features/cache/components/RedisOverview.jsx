import React from 'react';
import { 
  Box, 
  Grid, 
  Paper, 
  Typography, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Divider,
  useTheme,
  Chip,
  LinearProgress,
  Tooltip
} from '@mui/material';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

/**
 * Redis 서버 개요 컴포넌트
 * @param {Object} props 컴포넌트 속성
 * @param {Object} props.cacheInfo Redis 서버 정보
 * @param {Object} props.cacheStats Redis 캐시 통계
 */
const RedisOverview = ({ cacheInfo, cacheStats }) => {
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
  
  // 명령어 통계 데이터
  const commandStatsData = Object.entries(cacheStats.commandstats || {})
    .map(([cmd, stats]) => ({
      name: cmd.replace('cmdstat_', ''),
      calls: stats.calls,
      usec: stats.usec,
      usec_per_call: stats.usec_per_call,
    }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 10);
  
  // 메모리 사용량 데이터
  const memoryData = [
    { name: '사용 메모리', value: cacheInfo.used_memory },
    { name: '피크 메모리', value: cacheInfo.used_memory_peak },
    { name: 'RSS 메모리', value: cacheInfo.used_memory_rss },
    { name: 'Lua 메모리', value: cacheInfo.used_memory_lua },
  ];
  
  // 메모리 사용량 차트 데이터
  const memoryChartData = [
    { name: '현재', 사용: parseFloat((cacheInfo.used_memory / (1024 * 1024)).toFixed(2)) },
    { name: '피크', 사용: parseFloat((cacheInfo.used_memory_peak / (1024 * 1024)).toFixed(2)) },
    { name: 'RSS', 사용: parseFloat((cacheInfo.used_memory_rss / (1024 * 1024)).toFixed(2)) },
    { name: 'Lua', 사용: parseFloat((cacheInfo.used_memory_lua / (1024 * 1024)).toFixed(2)) },
  ];
  
  // 키 타입 데이터
  const keyTypesData = Object.entries(cacheStats.key_types || {})
    .map(([type, count], index) => ({
      name: type,
      value: count,
      color: colors[index % colors.length]
    }));
  
  // 키 만료 데이터
  const keyExpiryData = [
    { name: '만료 설정됨', value: cacheStats.expires || 0 },
    { name: '만료 없음', value: (cacheStats.keys || 0) - (cacheStats.expires || 0) },
  ];
  
  // 메모리 사용률
  const memoryUsagePercent = cacheInfo.used_memory_peak > 0 
    ? (cacheInfo.used_memory / cacheInfo.used_memory_peak) * 100 
    : 0;
  
  // 서버 정보 항목
  const serverInfoItems = [
    { label: 'Redis 버전', value: cacheInfo.redis_version },
    { label: '운영 모드', value: cacheInfo.redis_mode },
    { label: '프로세스 ID', value: cacheInfo.process_id },
    { label: 'TCP 포트', value: cacheInfo.tcp_port },
    { label: '업타임', value: `${Math.floor(cacheInfo.uptime_in_seconds / 86400)}일 ${Math.floor((cacheInfo.uptime_in_seconds % 86400) / 3600)}시간` },
    { label: '연결 클라이언트', value: cacheInfo.connected_clients },
    { label: '거부된 연결', value: cacheInfo.rejected_connections },
    { label: '실행 명령어', value: cacheInfo.total_commands_processed?.toLocaleString() },
    { label: '키스페이스 히트', value: cacheStats.keyspace_hits?.toLocaleString() },
    { label: '키스페이스 미스', value: cacheStats.keyspace_misses?.toLocaleString() },
  ];
  
  // 메모리 정보 항목
  const memoryInfoItems = [
    { label: '사용 메모리', value: `${(cacheInfo.used_memory / (1024 * 1024)).toFixed(2)} MB` },
    { label: '피크 메모리', value: `${(cacheInfo.used_memory_peak / (1024 * 1024)).toFixed(2)} MB` },
    { label: 'RSS 메모리', value: `${(cacheInfo.used_memory_rss / (1024 * 1024)).toFixed(2)} MB` },
    { label: 'Lua 메모리', value: `${(cacheInfo.used_memory_lua / (1024 * 1024)).toFixed(2)} MB` },
    { label: '메모리 단편화 비율', value: cacheInfo.mem_fragmentation_ratio?.toFixed(2) || 'N/A' },
    { label: '메모리 할당자', value: cacheInfo.mem_allocator || 'N/A' },
  ];
  
  // 통계 정보 항목
  const statsInfoItems = [
    { label: '총 키 개수', value: cacheStats.keys?.toLocaleString() || 0 },
    { label: '만료 설정된 키', value: cacheStats.expires?.toLocaleString() || 0 },
    { label: '만료된 키', value: cacheStats.expired_keys?.toLocaleString() || 0 },
    { label: '제거된 키', value: cacheStats.evicted_keys?.toLocaleString() || 0 },
    { label: '히트율', value: `${((cacheStats.keyspace_hits / (cacheStats.keyspace_hits + cacheStats.keyspace_misses || 1)) * 100).toFixed(2)}%` },
    { label: '초당 명령어 처리', value: (cacheInfo.instantaneous_ops_per_sec || 0).toLocaleString() },
  ];

  return (
    <Box>
      <Grid container spacing={4}>
        {/* 서버 정보 및 키 타입 분포 */}
        <Grid item xs={12} lg={6}>
          <Paper 
            elevation={0} 
            sx={{ 
              p: 3, 
              borderRadius: 2, 
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
              height: '100%'
            }}
          >
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
              서버 정보
            </Typography>
            
            <Grid container spacing={2}>
              {serverInfoItems.map((item, index) => (
                <Grid item xs={6} key={index}>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      {item.label}
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {item.value}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
            
            <Divider sx={{ my: 3 }} />
            
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
              키 타입 분포
            </Typography>
            
            <Box sx={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={keyTypesData}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {keyTypesData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value, name) => [value, name]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>
        
        {/* 메모리 사용량 및 키 만료 */}
        <Grid item xs={12} lg={6}>
          <Paper 
            elevation={0} 
            sx={{ 
              p: 3, 
              borderRadius: 2, 
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
              height: '100%'
            }}
          >
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
              메모리 사용량
            </Typography>
            
            <Box sx={{ mb: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">
                  사용 메모리 / 피크 메모리
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {memoryUsagePercent.toFixed(2)}%
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={memoryUsagePercent} 
                sx={{ 
                  height: 10, 
                  borderRadius: 5,
                  bgcolor: 'rgba(0, 0, 0, 0.05)',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 5,
                    background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                  }
                }}
              />
            </Box>
            
            <Box sx={{ height: 200, mb: 4 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={memoryChartData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                  <XAxis dataKey="name" />
                  <YAxis unit=" MB" />
                  <RechartsTooltip formatter={(value) => [`${value} MB`, '메모리']} />
                  <Area 
                    type="monotone" 
                    dataKey="사용" 
                    stroke={theme.palette.primary.main} 
                    fill={`${theme.palette.primary.main}40`} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
            
            <Divider sx={{ my: 3 }} />
            
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
              키 만료 상태
            </Typography>
            
            <Box sx={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={keyExpiryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill={theme.palette.warning.main} />
                    <Cell fill={theme.palette.info.main} />
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value, name) => [value, name]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>
        
        {/* 명령어 통계 */}
        <Grid item xs={12}>
          <Paper 
            elevation={0} 
            sx={{ 
              p: 3, 
              borderRadius: 2, 
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
            }}
          >
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
              상위 명령어 통계
            </Typography>
            
            <TableContainer>
              <Table sx={{ minWidth: 650 }} size="medium">
                <TableHead>
                  <TableRow>
                    <TableCell>명령어</TableCell>
                    <TableCell align="right">호출 횟수</TableCell>
                    <TableCell align="right">총 소요 시간 (μs)</TableCell>
                    <TableCell align="right">호출당 평균 시간 (μs)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {commandStatsData.map((row, index) => (
                    <TableRow
                      key={row.name}
                      sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                    >
                      <TableCell component="th" scope="row">
                        <Chip 
                          label={row.name} 
                          size="small" 
                          sx={{ 
                            bgcolor: `${colors[index % colors.length]}20`,
                            color: colors[index % colors.length],
                            fontWeight: 500
                          }} 
                        />
                      </TableCell>
                      <TableCell align="right">{row.calls.toLocaleString()}</TableCell>
                      <TableCell align="right">{row.usec.toLocaleString()}</TableCell>
                      <TableCell align="right">{row.usec_per_call.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default RedisOverview;
