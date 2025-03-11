// frontend/src/features/cve/CVEList.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Button,
  Box,
  Typography,
  Chip,
  TablePagination,
  TextField,
  InputAdornment,
  Alert,
  Card,
  CardContent,
  CardActions,
  CardHeader,
  Skeleton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Container,
  Grid,
  Stack,
  Divider,
  Avatar,
  Badge,
  Switch,
  FormControlLabel,
  Fade,
  useTheme,
  useMediaQuery,
  alpha
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  MoreVert as MoreVertIcon,
  Code as CodeIcon,
  OpenInNew as OpenInNewIcon,
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

import { useSocketIO } from '../../contexts/SocketIOContext';
import { useSnackbar } from 'notistack';
import CVEDetail from './CVEDetail';
import CreateCVE from './CreateCVE';
import { debounce } from 'lodash';

import CrawlerUpdateButton from './components/CrawlerUpdateButton';

// React Query와 Socket.IO 훅 가져오기
import { useCVEListQuery } from '../../api/hooks/useCVEListQuery';
import useCVEListUpdates from '../../api/hooks/useCVEListUpdates';
import { useDeleteCVEMutation, useCreateCVEMutation } from '../../api/hooks/useCVEMutation';

const STATUS_OPTIONS = ["전체", "신규등록", "분석중", "분석완료", "대응완료"];
const STATUS_COLORS = {
  '신규등록': 'default',
  '분석중': 'info',
  '분석완료': 'warning',
  '대응완료': 'success'
};

const SEVERITY_COLORS = {
  'CRITICAL': 'error',
  'HIGH': 'warning',
  'MEDIUM': 'info',
  'LOW': 'success',
  'NONE': 'default'
};

// CVE ID의 색상 지정 (심각도에 따라)
const getCveIdColor = (severity, theme) => {
  switch(severity) {
    case 'CRITICAL': return theme.palette.error.main;
    case 'HIGH': return theme.palette.warning.main;
    case 'MEDIUM': return theme.palette.info.main;
    case 'LOW': return theme.palette.success.main;
    default: return theme.palette.text.primary;
  }
};

// CVE 카드 컴포넌트
const CVECard = ({ cve, onDelete, onView, isDeleting }) => {
  const theme = useTheme();
  
  // 타이틀 길이 제한
  const truncatedTitle = cve.title.length > 60 
    ? `${cve.title.substring(0, 60)}...` 
    : cve.title;
    
  // 카드 내 날짜 포맷
  const formattedDate = cve.createdAt 
    ? new Date(cve.createdAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : '-';
    
  // 클릭 핸들러에서 이벤트 전파 방지
  const handleDeleteClick = (e) => {
    e.stopPropagation();
    onDelete(e, cve);  // 이벤트 객체와 cve 객체 모두 전달
  };
  
  return (
    <Card 
      elevation={0}
      variant="outlined"
      sx={{ 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: 'pointer',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: theme.shadows[4],
          borderColor: theme.palette.primary.light
        }
      }}
      onClick={() => onView(cve)}
    >
      <CardHeader
        sx={{ pb: 0 }}
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography
              variant="subtitle2"
              fontFamily="monospace"
              fontWeight="600"
              component="span"
              color={getCveIdColor(cve.severity, theme)}
            >
              {cve.cveId}
            </Typography>
          </Box>
        }
        action={
          <Tooltip title="삭제">
            <IconButton 
              size="small" 
              color="error"
              onClick={handleDeleteClick}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <CircularProgress size={18} />
              ) : (
                <DeleteIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        }
      />
      <CardContent sx={{ pt: 1, pb: 1, flexGrow: 1 }}>
        <Typography
          variant="body2"
          component="div"
          sx={{ 
            fontWeight: 500,
            mb: 2,
            height: '2.5em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical'
          }}
        >
          {truncatedTitle}
        </Typography>
        
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip 
            label={cve.severity || '미정'} 
            size="small"
            color={SEVERITY_COLORS[cve.severity] || 'default'}
            sx={{ minWidth: 70, '& .MuiChip-label': { px: 1 } }}
          />
          <Chip 
            label={cve.status || '상태 없음'} 
            size="small"
            color={STATUS_COLORS[cve.status] || 'default'}
            sx={{ minWidth: 65, '& .MuiChip-label': { px: 1 } }}
          />
        </Stack>
      </CardContent>
      <Divider />
      <CardActions sx={{ pt: 0.5, pb: 0.5, px: 2, justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary">
          {formattedDate}
        </Typography>
        <Tooltip title="상세 보기">
          <IconButton size="small" edge="end" onClick={() => onView(cve)}>
            <OpenInNewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </CardActions>
    </Card>
  );
};

// 로딩 중 스켈레톤 카드
const CVECardSkeleton = () => {
  return (
    <Card elevation={0} variant="outlined" sx={{ height: '100%' }}>
      <CardHeader
        sx={{ pb: 0 }}
        title={<Skeleton animation="wave" width="70%" height={24} />}
        action={<Skeleton animation="wave" variant="circular" width={24} height={24} />}
      />
      <CardContent sx={{ pt: 1, pb: 1 }}>
        <Skeleton animation="wave" height={20} sx={{ mb: 1 }} />
        <Skeleton animation="wave" height={20} width="80%" sx={{ mb: 1.5 }} />
        <Stack direction="row" spacing={1}>
          <Skeleton animation="wave" width={70} height={24} />
          <Skeleton animation="wave" width={65} height={24} />
        </Stack>
      </CardContent>
      <Divider />
      <CardActions sx={{ pt: 0.5, pb: 0.5, px: 2, justifyContent: 'space-between' }}>
        <Skeleton animation="wave" width="40%" height={20} />
        <Skeleton animation="wave" variant="circular" width={24} height={24} />
      </CardActions>
    </Card>
  );
};

const CVEList = () => {
  // Redux 의존성 제거
  // const dispatch = useDispatch();
  const { enqueueSnackbar } = useSnackbar();
  // Socket.IO 훅 사용
  const { socket, connected: isSocketConnected } = useSocketIO();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Redux selectors 제거
  // const { items: cves, total: totalCount, loading, error } = useSelector(selectCVEListData);
  // const { page, rowsPerPage, search: searchQuery, status: statusFilter } = useSelector(selectCVEFiltersData);

  // 로컬 상태 관리로 교체
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10); // 테이블 뷰에 적합하게 조정
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState("전체");
  // 뷰 모드 상태 제거 (항상 테이블 모드로 설정)
  // const [viewMode, setViewMode] = useState('table'); // 'grid' 또는 'table'
  
  const { user } = useAuth();
  const navigate = useNavigate();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cveToDelete, setCveToDelete] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [selectedCVE, setSelectedCVE] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  
  // 컴포넌트 마운트 시 createDialogOpen 초기화 확인
  useEffect(() => {
    // 페이지 로드 시 모달이 열려있지 않도록 확인
    if (createDialogOpen) {
      setCreateDialogOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React Query로 CVE 목록 가져오기
  const { 
    data: queryData, 
    isLoading, 
    isError, 
    error: queryError, 
    refetch: refetchCVEList 
  } = useCVEListQuery({ 
    page, 
    rowsPerPage, 
    filters: { 
      status: statusFilter !== '전체' ? statusFilter : '',
      search: searchQuery
    },
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });
  
  // 데이터 변수 추출
  const cves = queryData?.items || [];
  const totalCount = queryData?.totalItems || 0;
  
  // 디버깅: 데이터 로깅
  useEffect(() => {
    if (cves.length > 0) {
      console.log('[CVEList] 데이터 디버깅:', cves.map(cve => ({
        id: cve.id,
        cveId: cve.cveId,
        title: cve.title,
        hasId: !!cve.id,
        hasCveId: !!cve.cveId
      })));
      
      // 중복 ID 확인
      const idCounts = {};
      cves.forEach(cve => {
        const keyValue = cve.id || cve.cveId;
        idCounts[keyValue] = (idCounts[keyValue] || 0) + 1;
      });
      
      const duplicates = Object.entries(idCounts)
        .filter(([key, count]) => count > 1 || key === 'undefined')
        .map(([key, count]) => ({ key, count }));
      
      if (duplicates.length > 0) {
        console.warn('[CVEList] 중복 키 발견:', duplicates);
      }
    }
  }, [cves]);
  
  // Socket.IO로 실시간 업데이트
  const { isConnected: isRealtimeConnected } = useCVEListUpdates();
  
  // CVE 삭제 mutation
  const deleteMutation = useDeleteCVEMutation();
  
  // CVE 생성 mutation
  const createMutation = useCreateCVEMutation();

  // 검색어 변경 핸들러
  const handleSearchChange = useCallback((e) => {
    setSearchInput(e.target.value);
    debouncedSearch(e.target.value);
  }, []);

  // 디바운스된 검색 함수
  const debouncedSearch = useMemo(
    () => debounce((term) => {
      setSearchQuery(term);
      setPage(0);
    }, 300),
    []
  );

  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  // 상태 필터 변경 핸들러
  const handleStatusFilterChange = useCallback((e) => {
    const value = e.target.value;
    setStatusFilter(value);
    setPage(0);
  }, []);

  // 페이지 변경 핸들러
  const handlePageChange = useCallback((event, newPage) => {
    setPage(newPage);
  }, []);

  // 페이지당 행 수 변경 핸들러
  const handleRowsPerPageChange = useCallback((event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  // 데이터 새로고침 핸들러
  const handleRefresh = useCallback(() => {
    refetchCVEList();
    
    enqueueSnackbar('데이터를 새로고침하고 있습니다...', {
      variant: 'info',
      autoHideDuration: 1000
    });
  }, [refetchCVEList, enqueueSnackbar]);

  // CVE 항목 클릭 핸들러
  const handleCVEClick = useCallback((cve) => {
    setSelectedCVE(cve);
    setDetailOpen(true);
  }, []);

  // 상세 다이얼로그 닫기 핸들러
  const handleDetailClose = useCallback(() => {
    setDetailOpen(false);
    setSelectedCVE(null);
  }, []);

  // 생성 다이얼로그 핸들러
  const handleCreateCVE = useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

  const handleCloseCreate = useCallback(() => {
    setCreateDialogOpen(false);
  }, []);

  // CVE 생성 완료 핸들러
  const handleCVECreated = useCallback((newCVEData) => {
    handleCloseCreate();
    
    // 생성 완료 후 목록 갱신
    refetchCVEList();
    
    enqueueSnackbar('CVE가 성공적으로 생성되었습니다', {
      variant: 'success',
      autoHideDuration: 3000
    });
  }, [handleCloseCreate, refetchCVEList, enqueueSnackbar]);

  // 삭제 확인 다이얼로그 열기
  const handleDeleteClick = useCallback((e, cve) => {
    e.stopPropagation();
    setCveToDelete(cve);
    setDeleteDialogOpen(true);
  }, []);

  // 삭제 취소
  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false);
    setCveToDelete(null);
  }, []);

  // 삭제 확인
  const handleDeleteConfirm = useCallback(async () => {
    if (!cveToDelete) return;
    
    try {
      await deleteMutation.mutateAsync(cveToDelete.id || cveToDelete.cveId);
      
      enqueueSnackbar('CVE가 성공적으로 삭제되었습니다.', {
        variant: 'success',
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
      });
      
      // 삭제 후 목록 갱신
      refetchCVEList();
    } catch (error) {
      enqueueSnackbar(error.message || 'CVE 삭제 중 오류가 발생했습니다.', {
        variant: 'error',
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
      });
    } finally {
      setDeleteDialogOpen(false);
      setCveToDelete(null);
    }
  }, [cveToDelete, deleteMutation, enqueueSnackbar, refetchCVEList]);

  // Socket.IO 메시지 처리 - 이벤트 리스너 설정
  useEffect(() => {
    if (!socket || !isSocketConnected) return;
    
    // CVE 업데이트 이벤트 핸들러
    const handleCVEUpdate = (data) => {
      console.log('[CVEList] WebSocket 메시지 수신: CVE 업데이트', data);
      refetchCVEList();
    };
    
    // 이벤트 리스너 등록
    socket.on('cve:created', handleCVEUpdate);
    socket.on('cve:updated', handleCVEUpdate);
    socket.on('cve:deleted', handleCVEUpdate);
    
    // 클린업 함수
    return () => {
      socket.off('cve:created', handleCVEUpdate);
      socket.off('cve:updated', handleCVEUpdate);
      socket.off('cve:deleted', handleCVEUpdate);
    };
  }, [socket, isSocketConnected, refetchCVEList]);

  return (
    <Box sx={{ width: '100%', px: { xs: 1, sm: 2, md: 3 } }}>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Typography 
            variant="h5" 
            component="h1" 
            sx={{ 
              fontWeight: 600,
              color: 'primary.main',
              mb: { xs: 1, md: 0 }
            }}
          >
            CVE 목록
          </Typography>
          
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Tooltip title="새로고침">
              <IconButton color="primary" onClick={handleRefresh}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <CrawlerUpdateButton />
            <Button 
              variant="contained" 
              color="primary" 
              startIcon={<AddIcon />} 
              onClick={handleCreateCVE}
            >
              새 CVE 생성
            </Button>
          </Stack>
        </Grid>
        
        {isRealtimeConnected && (
          <Grid item xs={12}>
            <Alert 
              severity="success" 
              icon={false} 
              sx={{ 
                py: 0.3,
                backgroundColor: alpha(theme.palette.success.light, 0.1)
              }}
            >
              <Box display="flex" alignItems="center" gap={1}>
                <Box 
                  sx={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: '50%', 
                    bgcolor: 'success.main',
                    animation: 'pulse 1.5s infinite',
                    '@keyframes pulse': {
                      '0%': { opacity: 1 },
                      '50%': { opacity: 0.4 },
                      '100%': { opacity: 1 }
                    }
                  }} 
                />
                <Typography variant="caption" fontWeight="medium">실시간 업데이트 활성화됨</Typography>
              </Box>
            </Alert>
          </Grid>
        )}
      </Grid>

      <Paper 
        elevation={0} 
        variant="outlined" 
        sx={{ 
          borderRadius: 1,
          overflow: 'hidden',
          mb: 3
        }}
      >
        <Box 
          sx={{ 
            p: 2, 
            display: 'flex', 
            flexWrap: 'wrap',
            gap: 2, 
            alignItems: 'center', 
            borderBottom: 1, 
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }}
        >
          <TextField
            placeholder="CVE 검색"
            value={searchInput}
            onChange={handleSearchChange}
            size="small"
            sx={{ 
              flexGrow: { xs: 1, sm: 0 },
              width: { xs: '100%', sm: 250, md: 300 } 
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }}
          />
          <FormControl 
            size="small" 
            sx={{ 
              minWidth: 120,
              flexGrow: { xs: 1, sm: 0 },
              width: { xs: '100%', sm: 'auto' }
            }}
          >
            <InputLabel id="status-filter-label">상태</InputLabel>
            <Select
              labelId="status-filter-label"
              label="상태"
              value={statusFilter}
              onChange={handleStatusFilterChange}
            >
              {STATUS_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>{option}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        
        {isError && (
          <Alert severity="error" sx={{ m: 2 }}>
            {queryError?.message || '데이터를 불러오는 중 오류가 발생했습니다'}
          </Alert>
        )}

        {/* 항상 테이블 뷰로 표시 */}
        <TableContainer 
          component={Paper} 
          elevation={0} 
          variant="outlined" 
          sx={{ 
            borderRadius: 1,
            overflowX: 'auto', // 가로 스크롤 허용
            width: '100%', // 전체 너비 사용
            '& .MuiTable-root': {
              minWidth: 800, // 테이블 최소 너비 설정
              tableLayout: 'fixed' // 고정 테이블 레이아웃 사용
            }
          }}
        >
          <Table stickyHeader size="medium">
            <TableHead>
              <TableRow sx={{ 
                '& th': { 
                  backgroundColor: theme.palette.mode === 'dark' 
                    ? theme.palette.grey[800] 
                    : theme.palette.grey[100],
                  fontWeight: 'bold'
                } 
              }}>
                <TableCell width="15%">CVE ID</TableCell>
                <TableCell width="45%">제목</TableCell>
                <TableCell width="13%">심각도</TableCell>
                <TableCell width="13%">상태</TableCell>
                <TableCell width="10%">생성일</TableCell>
                <TableCell width="4%" align="center">작업</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                // 로딩 중 스켈레톤 표시
                Array(rowsPerPage).fill(0).map((_, index) => (
                  <TableRow key={`skeleton-${index}`}>
                    <TableCell><Skeleton animation="wave" /></TableCell>
                    <TableCell><Skeleton animation="wave" /></TableCell>
                    <TableCell><Skeleton animation="wave" /></TableCell>
                    <TableCell><Skeleton animation="wave" /></TableCell>
                    <TableCell><Skeleton animation="wave" /></TableCell>
                    <TableCell align="center"><Skeleton animation="wave" width={20} /></TableCell>
                  </TableRow>
                ))
              ) : cves.length > 0 ? (
                cves.map((cve, index) => {
                  // 고유 키 생성 로직
                  const uniqueKey = cve.id || cve.cveId || `cve-item-${index}`;
                  
                  return (
                    <TableRow 
                      key={uniqueKey}
                      hover 
                      onClick={() => handleCVEClick(cve)}
                      sx={{ 
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                        height: '60px'
                      }}
                    >
                      <TableCell 
                        component="th" 
                        scope="row" 
                        sx={{ 
                          fontFamily: 'monospace', 
                          fontWeight: 'medium',
                          color: getCveIdColor(cve.severity, theme)
                        }}
                      >
                        {cve.cveId || '알 수 없음'}
                      </TableCell>
                      <TableCell 
                        sx={{ 
                          maxWidth: { xs: '150px', sm: '300px', md: '400px' },
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {cve.title || '제목 없음'}
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={cve.severity || '미정'} 
                          size="small"
                          color={SEVERITY_COLORS[cve.severity] || 'default'}
                          sx={{ minWidth: 70 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={cve.status || '상태 없음'} 
                          size="small"
                          color={STATUS_COLORS[cve.status] || 'default'}
                          sx={{ minWidth: 65 }}
                        />
                      </TableCell>
                      <TableCell>
                        {cve.createdAt 
                          ? new Date(cve.createdAt).toLocaleDateString('ko-KR', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            }) 
                          : '-'
                        }
                      </TableCell>
                      <TableCell align="center">
                        <IconButton 
                          size="small" 
                          onClick={(e) => handleDeleteClick(e, cve)}
                          disabled={deleteMutation.isPending && deleteMutation.variables === cve.id}
                          color="error"
                          sx={{ 
                            '&:hover': { 
                              backgroundColor: alpha(theme.palette.error.main, 0.1)
                            }
                          }}
                        >
                          {deleteMutation.isPending && deleteMutation.variables === cve.id ? (
                            <CircularProgress size={20} color="inherit" />
                          ) : (
                            <DeleteIcon fontSize="small" />
                          )}
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow key="no-data">
                  <TableCell colSpan={6}>
                    <Box 
                      sx={{ 
                        p: 4,
                        textAlign: 'center',
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                        border: 1,
                        borderColor: 'divider'
                      }}
                    >
                      <Typography color="text.secondary">검색 결과가 없습니다</Typography>
                      {searchQuery && (
                        <React.Fragment key="search-info">
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            검색어: "{searchQuery}"
                          </Typography>
                          <Button
                            onClick={() => {
                              setSearchInput('');
                              setSearchQuery('');
                            }}
                            variant="outlined"
                            size="small"
                            sx={{ mt: 2 }}
                          >
                            검색 초기화
                          </Button>
                        </React.Fragment>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        <Divider />
        
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={handlePageChange}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleRowsPerPageChange}
          labelRowsPerPage="페이지당 행 수:"
          rowsPerPageOptions={[5, 10, 25, 50]}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count !== -1 ? count : `${to}+`}`}
          sx={{ 
            borderTop: 1, 
            borderColor: 'divider',
            overflow: 'hidden' // 넘치는 부분 숨김
          }}
        />
      </Paper>

      {/* CVE 상세 다이얼로그 */}
      {selectedCVE && (
        <CVEDetail
          cveId={selectedCVE.id || selectedCVE.cveId}
          open={detailOpen}
          onClose={handleDetailClose}
        />
      )}

      {/* CVE 생성 다이얼로그 */}
      <Dialog 
        open={createDialogOpen} 
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h6" component="div">
            새 CVE 생성
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <CreateCVE 
            onCreated={handleCVECreated} 
            onClose={() => setCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>CVE 삭제 확인</DialogTitle>
        <DialogContent>
          <Typography>
            {cveToDelete?.cveId || '선택한 CVE'}를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>취소</Button>
          <Button 
            onClick={handleDeleteConfirm} 
            color="error" 
            variant="contained"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              '삭제'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CVEList;
