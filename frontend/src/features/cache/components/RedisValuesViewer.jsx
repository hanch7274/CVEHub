import React, { useState } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  TextField, 
  Button, 
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Divider,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  useTheme,
  Tooltip,
  Tabs,
  Tab
} from '@mui/material';
import { 
  Search as SearchIcon, 
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ContentCopy as CopyIcon,
  Code as CodeIcon,
  DataObject as DataObjectIcon,
  FormatListBulleted as ListIcon,
  TextFields as TextIcon
} from '@mui/icons-material';
import { useCacheValuesQuery } from '../hooks/useCacheQuery';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * Redis 값 뷰어 컴포넌트
 */
const RedisValuesViewer = () => {
  const theme = useTheme();
  const [searchParams, setSearchParams] = useState({
    prefix: '',
    pattern: '*',
    limit: 20
  });
  const [viewMode, setViewMode] = useState('formatted');
  
  // 캐시 값 조회
  const { 
    data: valuesData, 
    isLoading, 
    isError, 
    error, 
    refetch 
  } = useCacheValuesQuery(searchParams);
  
  // 검색 파라미터 변경 핸들러
  const handleSearchParamChange = (e) => {
    const { name, value } = e.target;
    setSearchParams(prev => ({ ...prev, [name]: value }));
  };
  
  // 검색 핸들러
  const handleSearch = () => {
    refetch();
  };
  
  // 값 복사 핸들러
  const handleCopyValue = (value) => {
    navigator.clipboard.writeText(typeof value === 'object' ? JSON.stringify(value, null, 2) : value.toString());
  };
  
  // 문자열 또는 객체를 안전하게 표시하는 함수
  const safeStringify = (value) => {
    if (value === null || value === undefined) {
      return String(value);
    }
    
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch (e) {
        return String(value);
      }
    }
    
    return String(value);
  };
  
  // 뷰 모드 변경 핸들러
  const handleViewModeChange = (event, newValue) => {
    setViewMode(newValue);
  };
  
  // 값 렌더링 함수
  const renderValue = (key, value, type) => {
    // 문자열인 경우 JSON 파싱 시도
    let parsedValue = value;
    let valueType = type;
    
    if (type === 'string' && typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object') {
          parsedValue = parsed;
          valueType = 'json';
        }
      } catch (e) {
        // JSON 파싱 실패 시 원래 값 사용
      }
    }
    
    // 뷰 모드에 따라 렌더링
    if (viewMode === 'raw') {
      return (
        <SyntaxHighlighter
          language="json"
          style={vscDarkPlus}
          customStyle={{ 
            borderRadius: 8,
            fontSize: '0.85rem',
            maxHeight: 300
          }}
        >
          {typeof parsedValue === 'object' ? JSON.stringify(parsedValue, null, 2) : String(parsedValue)}
        </SyntaxHighlighter>
      );
    }
    
    // 포맷팅된 뷰
    switch (valueType) {
      case 'json':
        return (
          <Box sx={{ 
            maxHeight: 300, 
            overflow: 'auto', 
            bgcolor: 'background.default', 
            borderRadius: 2,
            p: 2
          }}>
            <SyntaxHighlighter
              language="json"
              style={vscDarkPlus}
              customStyle={{ 
                borderRadius: 8,
                fontSize: '0.85rem',
                background: 'transparent'
              }}
            >
              {JSON.stringify(parsedValue, null, 2)}
            </SyntaxHighlighter>
          </Box>
        );
        
      case 'list':
        return (
          <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
            {Array.isArray(parsedValue) && parsedValue.map((item, idx) => (
              <Box 
                key={idx} 
                sx={{ 
                  p: 1, 
                  borderBottom: '1px solid', 
                  borderColor: 'divider',
                  '&:last-child': { borderBottom: 'none' }
                }}
              >
                <Typography variant="body2">
                  {safeStringify(item)}
                </Typography>
              </Box>
            ))}
          </Box>
        );
        
      case 'hash':
        return (
          <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
            {Object.entries(parsedValue).map(([field, val], idx) => (
              <Box 
                key={idx} 
                sx={{ 
                  p: 1, 
                  borderBottom: '1px solid', 
                  borderColor: 'divider',
                  '&:last-child': { borderBottom: 'none' },
                  display: 'flex'
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 120 }}>
                  {field}:
                </Typography>
                <Typography variant="body2">
                  {safeStringify(val)}
                </Typography>
              </Box>
            ))}
          </Box>
        );
        
      default:
        return (
          <Typography 
            variant="body2" 
            sx={{ 
              p: 2, 
              bgcolor: 'background.default', 
              borderRadius: 2,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 300,
              overflow: 'auto'
            }}
          >
            {safeStringify(parsedValue)}
          </Typography>
        );
    }
  };
  
  // 값 타입에 따른 아이콘 및 색상
  const getTypeIconAndColor = (type) => {
    switch (type) {
      case 'string':
        return { icon: <TextIcon />, color: theme.palette.primary.main };
      case 'list':
        return { icon: <ListIcon />, color: theme.palette.success.main };
      case 'hash':
        return { icon: <DataObjectIcon />, color: theme.palette.warning.main };
      case 'json':
        return { icon: <CodeIcon />, color: theme.palette.info.main };
      default:
        return { icon: <TextIcon />, color: theme.palette.grey[500] };
    }
  };

  return (
    <Box>
      <Paper 
        elevation={0} 
        sx={{ 
          p: 3, 
          borderRadius: 2, 
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          mb: 4
        }}
      >
        <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
          Redis 값 조회
        </Typography>
        
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mb: 3 }}>
          <TextField
            name="prefix"
            label="접두사"
            variant="outlined"
            value={searchParams.prefix}
            onChange={handleSearchParamChange}
            placeholder="예: user"
            sx={{ width: { xs: '100%', md: 200 } }}
          />
          
          <TextField
            name="pattern"
            label="검색 패턴"
            variant="outlined"
            value={searchParams.pattern}
            onChange={handleSearchParamChange}
            placeholder="예: *"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          
          <TextField
            name="limit"
            label="최대 결과 수"
            variant="outlined"
            type="number"
            value={searchParams.limit}
            onChange={handleSearchParamChange}
            sx={{ width: { xs: '100%', md: 150 } }}
          />
          
          <Button 
            variant="contained" 
            onClick={handleSearch}
            startIcon={<SearchIcon />}
            sx={{ 
              height: 56,
              px: 4,
              background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
              '&:hover': {
                boxShadow: '0 6px 15px rgba(0, 0, 0, 0.2)',
              }
            }}
          >
            조회
          </Button>
          
          <IconButton 
            color="primary" 
            onClick={refetch}
            sx={{ height: 56, width: 56 }}
          >
            <RefreshIcon />
          </IconButton>
        </Box>
        
        <Divider sx={{ my: 3 }} />
        
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={viewMode} 
            onChange={handleViewModeChange}
            sx={{
              '& .MuiTab-root': {
                minWidth: 100,
                fontWeight: 600,
              },
            }}
          >
            <Tab 
              value="formatted" 
              label="포맷팅" 
              icon={<DataObjectIcon />} 
              iconPosition="start"
            />
            <Tab 
              value="raw" 
              label="원시 데이터" 
              icon={<CodeIcon />} 
              iconPosition="start"
            />
          </Tabs>
        </Box>
      </Paper>
      
      {isLoading ? (
        <Box 
          sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: 200 
          }}
        >
          <CircularProgress size={40} thickness={4} />
          <Typography variant="body2" sx={{ ml: 2, color: 'text.secondary' }}>
            데이터를 불러오는 중...
          </Typography>
        </Box>
      ) : isError ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          값 조회 중 오류가 발생했습니다: {error?.message || '알 수 없는 오류'}
        </Alert>
      ) : valuesData?.keys?.length === 0 ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          검색 조건에 맞는 데이터가 없습니다.
        </Alert>
      ) : (
        <Box>
          {valuesData?.keys.map((key, index) => {
            const value = valuesData.values[index];
            const type = valuesData.types[index];
            const { icon, color } = getTypeIconAndColor(type);
            
            // 키 접두사 분리
            const keyParts = key.split(':');
            const keyPrefix = keyParts.length > 1 ? keyParts[0] : '';
            const keyDisplay = keyPrefix ? key.substring(keyPrefix.length + 1) : key;
            
            return (
              <Accordion 
                key={key} 
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
                  aria-controls={`panel-${key}-content`}
                  id={`panel-${key}-header`}
                  sx={{ 
                    bgcolor: 'background.default',
                    borderBottom: '1px solid',
                    borderColor: 'divider'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Box 
                      sx={{ 
                        mr: 2, 
                        color, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                      }}
                    >
                      {icon}
                    </Box>
                    
                    <Box sx={{ flexGrow: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {keyPrefix && (
                          <Chip 
                            label={keyPrefix} 
                            size="small" 
                            color="primary" 
                            variant="outlined"
                            sx={{ mr: 1, fontSize: '0.7rem' }}
                          />
                        )}
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {keyDisplay}
                        </Typography>
                      </Box>
                      
                      <Typography variant="caption" color="text.secondary">
                        {type === 'string' && typeof value === 'string' && value.startsWith('{') ? 'json' : type}
                        {valuesData.ttls[index] !== -1 && ` • TTL: ${valuesData.ttls[index]}초`}
                      </Typography>
                    </Box>
                    
                    <Tooltip title="값 복사">
                      <IconButton 
                        size="small" 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyValue(value);
                        }}
                        sx={{ color: theme.palette.info.main }}
                      >
                        <CopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                  <Box sx={{ p: 2 }}>
                    {renderValue(key, value, type)}
                  </Box>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default RedisValuesViewer;
