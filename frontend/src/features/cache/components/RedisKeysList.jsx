import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  TextField, 
  Button, 
  IconButton,
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  TablePagination,
  InputAdornment,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  Divider,
  useTheme,
  Alert,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { 
  Search as SearchIcon, 
  Delete as DeleteIcon, 
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  Visibility as ViewIcon,
  FilterList as FilterIcon
} from '@mui/icons-material';
import { useCacheKeysQuery, useClearCacheMutation } from '../hooks/useCacheQuery';

/**
 * Redis 키 목록 컴포넌트
 */
const RedisKeysList = () => {
  const theme = useTheme();
  const [searchParams, setSearchParams] = useState({
    prefix: '',
    pattern: '*',
    limit: 100
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [prefixOptions, setPrefixOptions] = useState([]);
  
  // 캐시 키 목록 조회
  const { 
    data: keysData, 
    isLoading, 
    isError, 
    error, 
    refetch 
  } = useCacheKeysQuery(searchParams);
  
  // 캐시 삭제 뮤테이션
  const clearCacheMutation = useClearCacheMutation();
  
  // 키 목록 데이터 추출 및 가공
  const keys = keysData?.keys || [];
  const processedKeys = keys.map(keyObj => {
    // 키 객체에서 필요한 정보 추출
    const keyValue = typeof keyObj === 'object' && keyObj.key ? keyObj.key : String(keyObj);
    return {
      key: keyValue,
      type: typeof keyObj === 'object' && keyObj.type ? keyObj.type : 'unknown',
      ttl: typeof keyObj === 'object' && keyObj.ttl !== undefined ? keyObj.ttl : -1,
      size: typeof keyObj === 'object' && keyObj.size !== undefined ? keyObj.size : 0
    };
  });
  
  // 접두사 옵션 추출
  useEffect(() => {
    if (processedKeys.length > 0) {
      const prefixes = new Set();
      processedKeys.forEach(keyObj => {
        const keyParts = keyObj.key.split(':');
        if (keyParts.length > 1) {
          prefixes.add(keyParts[0]);
        }
      });
      setPrefixOptions(Array.from(prefixes));
    }
  }, [processedKeys]);
  
  // 페이지 변경 핸들러
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };
  
  // 페이지당 행 수 변경 핸들러
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  
  // 검색 핸들러
  const handleSearch = () => {
    refetch();
  };
  
  // 검색 파라미터 변경 핸들러
  const handleSearchParamChange = (e) => {
    const { name, value } = e.target;
    setSearchParams(prev => ({ ...prev, [name]: value }));
  };
  
  // 키 삭제 다이얼로그 열기
  const handleOpenDeleteDialog = (key) => {
    setSelectedKey(key);
    setOpenDialog(true);
  };
  
  // 키 삭제 다이얼로그 닫기
  const handleCloseDialog = () => {
    setOpenDialog(false);
  };
  
  // 키 삭제 실행
  const handleDeleteKey = async () => {
    try {
      await clearCacheMutation.mutateAsync({ pattern: selectedKey });
      setSnackbar({
        open: true,
        message: `키 '${selectedKey}'가 성공적으로 삭제되었습니다.`,
        severity: 'success'
      });
      handleCloseDialog();
    } catch (err) {
      setSnackbar({
        open: true,
        message: `키 삭제 실패: ${err.message}`,
        severity: 'error'
      });
    }
  };
  
  // 키 복사 핸들러
  const handleCopyKey = (key) => {
    navigator.clipboard.writeText(key);
    setSnackbar({
      open: true,
      message: '키가 클립보드에 복사되었습니다.',
      severity: 'success'
    });
  };
  
  // 스낵바 닫기 핸들러
  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };
  
  // 접두사 선택 핸들러
  const handlePrefixSelect = (prefix) => {
    setSearchParams(prev => ({ ...prev, prefix }));
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
          Redis 키 검색
        </Typography>
        
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mb: 3 }}>
          <FormControl variant="outlined" sx={{ minWidth: 200 }}>
            <InputLabel id="prefix-select-label">접두사</InputLabel>
            <Select
              labelId="prefix-select-label"
              id="prefix-select"
              name="prefix"
              value={searchParams.prefix}
              onChange={handleSearchParamChange}
              label="접두사"
            >
              <MenuItem value="">
                <em>없음</em>
              </MenuItem>
              {prefixOptions.map((prefix) => (
                <MenuItem key={prefix} value={prefix}>
                  {prefix}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <TextField
            name="pattern"
            label="검색 패턴"
            variant="outlined"
            value={searchParams.pattern}
            onChange={handleSearchParamChange}
            placeholder="예: user:*"
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
            검색
          </Button>
          
          <IconButton 
            color="primary" 
            onClick={refetch}
            sx={{ height: 56, width: 56 }}
          >
            <RefreshIcon />
          </IconButton>
        </Box>
        
        {prefixOptions.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
            <Chip 
              icon={<FilterIcon />} 
              label="접두사 필터:" 
              variant="outlined" 
              sx={{ bgcolor: 'background.default' }}
            />
            {prefixOptions.map((prefix) => (
              <Chip 
                key={prefix}
                label={prefix}
                onClick={() => handlePrefixSelect(prefix)}
                color={searchParams.prefix === prefix ? 'primary' : 'default'}
                variant={searchParams.prefix === prefix ? 'filled' : 'outlined'}
                sx={{ 
                  '&:hover': { 
                    bgcolor: searchParams.prefix === prefix ? '' : `${theme.palette.primary.main}20` 
                  } 
                }}
              />
            ))}
          </Box>
        )}
        
        {isError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            키 목록 조회 중 오류가 발생했습니다: {error?.message || '알 수 없는 오류'}
          </Alert>
        )}
      </Paper>
      
      <Paper 
        elevation={0} 
        sx={{ 
          borderRadius: 2, 
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          overflow: 'hidden'
        }}
      >
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell 
                  sx={{ 
                    bgcolor: theme.palette.background.default,
                    fontWeight: 600
                  }}
                >
                  키
                </TableCell>
                <TableCell 
                  align="right"
                  sx={{ 
                    bgcolor: theme.palette.background.default,
                    fontWeight: 600
                  }}
                >
                  타입
                </TableCell>
                <TableCell 
                  align="right"
                  sx={{ 
                    bgcolor: theme.palette.background.default,
                    fontWeight: 600,
                    width: 180
                  }}
                >
                  TTL (초)
                </TableCell>
                <TableCell 
                  align="right"
                  sx={{ 
                    bgcolor: theme.palette.background.default,
                    fontWeight: 600,
                    width: 150
                  }}
                >
                  작업
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={40} thickness={4} />
                    <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                      키 목록을 불러오는 중...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : processedKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 5 }}>
                    <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                      검색 결과가 없습니다.
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                      다른 검색어나 패턴으로 시도해보세요.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                processedKeys
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((key, index) => {
                    return (
                      <TableRow
                        key={key.key}
                        hover
                        sx={{ 
                          '&:nth-of-type(odd)': { 
                            bgcolor: 'rgba(0, 0, 0, 0.02)' 
                          } 
                        }}
                      >
                        <TableCell component="th" scope="row">
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            {key.key.includes(':') && (
                              <Chip 
                                label={key.key.split(':')[0]} 
                                size="small" 
                                color="primary" 
                                variant="outlined"
                                sx={{ mr: 1, fontSize: '0.7rem' }}
                              />
                            )}
                            <Tooltip title={key.key} arrow>
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  maxWidth: 400, 
                                  overflow: 'hidden', 
                                  textOverflow: 'ellipsis', 
                                  whiteSpace: 'nowrap' 
                                }}
                              >
                                {key.key.includes(':') ? key.key.substring(key.key.split(':')[0].length + 1) : key.key}
                              </Typography>
                            </Tooltip>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Chip 
                            label={key.type} 
                            size="small" 
                            sx={{ 
                              bgcolor: `${theme.palette.info.main}20`,
                              color: theme.palette.info.main,
                              fontWeight: 500,
                              fontSize: '0.7rem'
                            }} 
                          />
                        </TableCell>
                        <TableCell align="right">
                          {key.ttl === -1 ? (
                            <Chip 
                              label="무기한" 
                              size="small" 
                              sx={{ 
                                bgcolor: `${theme.palette.success.main}20`,
                                color: theme.palette.success.main,
                                fontWeight: 500,
                                fontSize: '0.7rem'
                              }} 
                            />
                          ) : key.ttl === -2 ? (
                            <Chip 
                              label="만료됨" 
                              size="small" 
                              sx={{ 
                                bgcolor: `${theme.palette.error.main}20`,
                                color: theme.palette.error.main,
                                fontWeight: 500,
                                fontSize: '0.7rem'
                              }} 
                            />
                          ) : (
                            key.ttl
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <Tooltip title="키 복사">
                              <IconButton 
                                size="small" 
                                onClick={() => handleCopyKey(key.key)}
                                sx={{ color: theme.palette.info.main }}
                              >
                                <CopyIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="키 삭제">
                              <IconButton 
                                size="small" 
                                onClick={() => handleOpenDeleteDialog(key.key)}
                                sx={{ color: theme.palette.error.main }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={processedKeys.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage="행 수:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
        />
      </Paper>
      
      {/* 키 삭제 확인 다이얼로그 */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          키 삭제 확인
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            정말로 <strong>{selectedKey}</strong> 키를 삭제하시겠습니까?
            <br />
            이 작업은 되돌릴 수 없습니다.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="primary">
            취소
          </Button>
          <Button 
            onClick={handleDeleteKey} 
            color="error" 
            variant="contained"
            startIcon={<DeleteIcon />}
            autoFocus
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* 알림 스낵바 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={handleCloseSnackbar} 
          severity={snackbar.severity} 
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default RedisKeysList;
