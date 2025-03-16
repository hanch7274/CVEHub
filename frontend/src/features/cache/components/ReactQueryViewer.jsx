import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  TextField, 
  InputAdornment,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  useTheme,
  Tooltip,
  IconButton,
  Button,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  Tabs,
  Tab,
  Alert
} from '@mui/material';
import { 
  Search as SearchIcon, 
  ExpandMore as ExpandMoreIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  DeleteOutline as DeleteIcon,
  DataUsage as DataUsageIcon,
  QueryStats as QueryStatsIcon,
  Cached as CachedIcon,
  AccessTime as AccessTimeIcon
} from '@mui/icons-material';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useReactQueryCache } from '../../../api/hooks/useCacheQuery';

/**
 * React Query 캐시 뷰어 컴포넌트
 * @param {Object} props 컴포넌트 속성
 * @param {Array} props.queryCache React Query 캐시 정보
 */
const ReactQueryViewer = ({ queryCache }) => {
  const theme = useTheme();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const { queryClient } = useReactQueryCache();
  
  // 필터링된 쿼리 캐시
  const filteredQueries = queryCache.filter(query => {
    const matchesSearch = searchTerm === '' || 
      query.queryKey.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTab = activeTab === 'all' || 
      (activeTab === 'active' && query.isActive) ||
      (activeTab === 'stale' && query.isStale) ||
      (activeTab === 'inactive' && !query.isActive);
    
    return matchesSearch && matchesTab;
  });
  
  // 검색어 변경 핸들러
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };
  
  // 탭 변경 핸들러
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };
  
  // 쿼리 무효화 핸들러
  const handleInvalidateQuery = (queryKey) => {
    try {
      const parsedKey = JSON.parse(queryKey);
      queryClient.invalidateQueries({ queryKey: parsedKey });
    } catch (error) {
      console.error('쿼리 무효화 실패:', error);
    }
  };
  
  // 쿼리 삭제 핸들러
  const handleRemoveQuery = (queryKey) => {
    try {
      const parsedKey = JSON.parse(queryKey);
      queryClient.removeQueries({ queryKey: parsedKey });
    } catch (error) {
      console.error('쿼리 삭제 실패:', error);
    }
  };
  
  // 모든 쿼리 무효화 핸들러
  const handleInvalidateAll = () => {
    queryClient.invalidateQueries();
  };
  
  // 모든 쿼리 삭제 핸들러
  const handleClearAll = () => {
    queryClient.clear();
  };
  
  // 쿼리 상태에 따른 색상
  const getStatusColor = (query) => {
    if (!query.isActive) return theme.palette.grey[500];
    if (query.isStale) return theme.palette.warning.main;
    return theme.palette.success.main;
  };
  
  // 쿼리 상태 레이블
  const getStatusLabel = (query) => {
    if (!query.isActive) return '비활성';
    if (query.isStale) return '오래됨';
    return '활성';
  };
  
  // 쿼리 키 포맷팅
  const formatQueryKey = (queryKey) => {
    try {
      const parsedKey = JSON.parse(queryKey);
      if (Array.isArray(parsedKey)) {
        return parsedKey.map(item => 
          typeof item === 'object' ? JSON.stringify(item) : String(item)
        ).join(' / ');
      } 
      return typeof parsedKey === 'object' ? JSON.stringify(parsedKey) : String(parsedKey);
    } catch (error) {
      return queryKey;
    }
  };
  
  // 통계 데이터
  const stats = {
    total: queryCache.length,
    active: queryCache.filter(q => q.isActive).length,
    stale: queryCache.filter(q => q.isStale).length,
    inactive: queryCache.filter(q => !q.isActive).length,
  };

  return (
    <Box>
      {/* 통계 카드 */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            elevation={0}
            sx={{ 
              borderRadius: 2, 
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
              height: '100%',
              transition: 'transform 0.3s',
              '&:hover': {
                transform: 'translateY(-5px)',
              }
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box 
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  mb: 2 
                }}
              >
                <Box 
                  sx={{ 
                    bgcolor: `${theme.palette.primary.main}20`, 
                    color: theme.palette.primary.main,
                    borderRadius: '50%',
                    p: 1,
                    mr: 2,
                    display: 'flex'
                  }}
                >
                  <QueryStatsIcon />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  총 쿼리
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                {stats.total}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                React Query 캐시에 저장된 총 쿼리 수
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            elevation={0}
            sx={{ 
              borderRadius: 2, 
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
              height: '100%',
              transition: 'transform 0.3s',
              '&:hover': {
                transform: 'translateY(-5px)',
              }
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box 
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  mb: 2 
                }}
              >
                <Box 
                  sx={{ 
                    bgcolor: `${theme.palette.success.main}20`, 
                    color: theme.palette.success.main,
                    borderRadius: '50%',
                    p: 1,
                    mr: 2,
                    display: 'flex'
                  }}
                >
                  <CachedIcon />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  활성 쿼리
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                {stats.active}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                현재 활성 상태인 쿼리 수
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            elevation={0}
            sx={{ 
              borderRadius: 2, 
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
              height: '100%',
              transition: 'transform 0.3s',
              '&:hover': {
                transform: 'translateY(-5px)',
              }
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box 
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  mb: 2 
                }}
              >
                <Box 
                  sx={{ 
                    bgcolor: `${theme.palette.warning.main}20`, 
                    color: theme.palette.warning.main,
                    borderRadius: '50%',
                    p: 1,
                    mr: 2,
                    display: 'flex'
                  }}
                >
                  <DataUsageIcon />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  오래된 쿼리
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                {stats.stale}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                오래된(stale) 상태인 쿼리 수
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            elevation={0}
            sx={{ 
              borderRadius: 2, 
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
              height: '100%',
              transition: 'transform 0.3s',
              '&:hover': {
                transform: 'translateY(-5px)',
              }
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box 
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  mb: 2 
                }}
              >
                <Box 
                  sx={{ 
                    bgcolor: `${theme.palette.grey[500]}20`, 
                    color: theme.palette.grey[500],
                    borderRadius: '50%',
                    p: 1,
                    mr: 2,
                    display: 'flex'
                  }}
                >
                  <AccessTimeIcon />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  비활성 쿼리
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                {stats.inactive}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                비활성 상태인 쿼리 수
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* 검색 및 필터 */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 3, 
          borderRadius: 2, 
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          mb: 4
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            React Query 캐시 관리
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button 
              variant="outlined" 
              color="warning" 
              startIcon={<RefreshIcon />}
              onClick={handleInvalidateAll}
              size="small"
            >
              모두 무효화
            </Button>
            <Button 
              variant="outlined" 
              color="error" 
              startIcon={<DeleteIcon />}
              onClick={handleClearAll}
              size="small"
            >
              모두 삭제
            </Button>
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <TextField
            fullWidth
            placeholder="쿼리 키 검색..."
            value={searchTerm}
            onChange={handleSearchChange}
            variant="outlined"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </Box>
        
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange}
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            mb: 2,
            '& .MuiTab-root': {
              minWidth: 100,
              fontWeight: 600,
            },
          }}
        >
          <Tab 
            value="all" 
            label={`전체 (${stats.total})`} 
          />
          <Tab 
            value="active" 
            label={`활성 (${stats.active})`} 
            sx={{ color: theme.palette.success.main }}
          />
          <Tab 
            value="stale" 
            label={`오래됨 (${stats.stale})`} 
            sx={{ color: theme.palette.warning.main }}
          />
          <Tab 
            value="inactive" 
            label={`비활성 (${stats.inactive})`} 
            sx={{ color: theme.palette.grey[500] }}
          />
        </Tabs>
      </Paper>
      
      {/* 쿼리 목록 */}
      {filteredQueries.length === 0 ? (
        <Alert severity="info">
          검색 조건에 맞는 쿼리가 없습니다.
        </Alert>
      ) : (
        filteredQueries.map((query) => (
          <Accordion 
            key={query.queryHash} 
            sx={{ 
              mb: 2, 
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
              borderRadius: '8px !important',
              '&:before': {
                display: 'none',
              },
              overflow: 'hidden'
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls={`panel-${query.queryHash}-content`}
              id={`panel-${query.queryHash}-header`}
              sx={{ 
                bgcolor: 'background.default',
                borderBottom: '1px solid',
                borderColor: 'divider'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <Box 
                  sx={{ 
                    width: 12, 
                    height: 12, 
                    borderRadius: '50%', 
                    bgcolor: getStatusColor(query),
                    mr: 2
                  }} 
                />
                
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {formatQueryKey(query.queryKey)}
                  </Typography>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                    <Chip 
                      label={getStatusLabel(query)} 
                      size="small" 
                      sx={{ 
                        mr: 1,
                        bgcolor: `${getStatusColor(query)}20`,
                        color: getStatusColor(query),
                        fontWeight: 500,
                        fontSize: '0.7rem'
                      }} 
                    />
                    
                    <Typography variant="caption" color="text.secondary">
                      마지막 업데이트: {query.lastUpdated}
                    </Typography>
                  </Box>
                </Box>
                
                <Box sx={{ display: 'flex' }}>
                  <Tooltip title="쿼리 무효화">
                    <IconButton 
                      size="small" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInvalidateQuery(query.queryKey);
                      }}
                      sx={{ color: theme.palette.warning.main }}
                    >
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  
                  <Tooltip title="쿼리 삭제">
                    <IconButton 
                      size="small" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveQuery(query.queryKey);
                      }}
                      sx={{ color: theme.palette.error.main }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <Box sx={{ p: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                      쿼리 키
                    </Typography>
                    <Paper 
                      variant="outlined" 
                      sx={{ 
                        p: 2, 
                        borderRadius: 1, 
                        bgcolor: 'background.default',
                        maxHeight: 200,
                        overflow: 'auto'
                      }}
                    >
                      <SyntaxHighlighter
                        language="json"
                        style={vscDarkPlus}
                        customStyle={{ 
                          borderRadius: 8,
                          fontSize: '0.85rem',
                          background: 'transparent',
                          margin: 0
                        }}
                      >
                        {query.queryKey}
                      </SyntaxHighlighter>
                    </Paper>
                  </Grid>
                  
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                      상태 정보
                    </Typography>
                    <Paper 
                      variant="outlined" 
                      sx={{ 
                        p: 2, 
                        borderRadius: 1, 
                        bgcolor: 'background.default',
                        height: '100%'
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">
                            상태:
                          </Typography>
                          <Chip 
                            label={getStatusLabel(query)} 
                            size="small" 
                            sx={{ 
                              bgcolor: `${getStatusColor(query)}20`,
                              color: getStatusColor(query),
                              fontWeight: 500,
                              fontSize: '0.7rem'
                            }} 
                          />
                        </Box>
                        
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">
                            활성 여부:
                          </Typography>
                          <Typography variant="body2">
                            {query.isActive ? '활성' : '비활성'}
                          </Typography>
                        </Box>
                        
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">
                            오래됨 여부:
                          </Typography>
                          <Typography variant="body2">
                            {query.isStale ? '오래됨' : '최신'}
                          </Typography>
                        </Box>
                        
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">
                            마지막 업데이트:
                          </Typography>
                          <Typography variant="body2">
                            {query.lastUpdated}
                          </Typography>
                        </Box>
                        
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">
                            쿼리 해시:
                          </Typography>
                          <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {query.queryHash}
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  </Grid>
                  
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                      데이터
                    </Typography>
                    <Paper 
                      variant="outlined" 
                      sx={{ 
                        p: 2, 
                        borderRadius: 1, 
                        bgcolor: 'background.default',
                        maxHeight: 300,
                        overflow: 'auto'
                      }}
                    >
                      <SyntaxHighlighter
                        language="json"
                        style={vscDarkPlus}
                        customStyle={{ 
                          borderRadius: 8,
                          fontSize: '0.85rem',
                          background: 'transparent',
                          margin: 0
                        }}
                      >
                        {JSON.stringify(query.state.data || {}, null, 2)}
                      </SyntaxHighlighter>
                    </Paper>
                  </Grid>
                </Grid>
              </Box>
            </AccordionDetails>
          </Accordion>
        ))
      )}
    </Box>
  );
};

export default ReactQueryViewer;
