import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Skeleton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../utils/auth';
import CVEDetail from './CVEDetail';
import CreateCVE from './CreateCVE';
import { debounce } from 'lodash';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchCVEList,
  updateFilters,
  selectCVEListData,
  selectCVEFiltersData,
  selectCVELoading,
  refreshCVEList,
  deleteCVE,
  addCVEFromWebSocket,
  updateCVEFromWebSocket,
  deleteCVEFromWebSocket
} from '../../store/slices/cveSlice';
import { useSnackbar } from 'notistack';
import { useWebSocketContext } from '../../contexts/WebSocketContext';

import { useWebSocketMessage } from '../../contexts/WebSocketContext';

const STATUS_COLORS = {
  '미할당': 'default',
  '분석중': 'info',
  '분석완료': 'warning',
  '대응완료': 'success'
};

const CVEList = () => {
  const dispatch = useDispatch();
  const { enqueueSnackbar } = useSnackbar();
  const { isConnected, isReady } = useWebSocketContext();
  
  // Redux selectors
  const { items: cves, total: totalCount, loading, error, forceRefresh } = 
    useSelector(selectCVEListData);
  const { page, rowsPerPage, search: searchQuery } = 
    useSelector(selectCVEFiltersData);

  const { user } = useAuth();
  const navigate = useNavigate();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cveToDelete, setCveToDelete] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const initialLoadRef = useRef(false);
  const lastFetchParamsRef = useRef(null);
  const [selectedCVE, setSelectedCVE] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  console.log('[CVE] Current state:', {
    cves,
    loading,
    error,
    page,
    rowsPerPage,
    searchQuery
  });

  useEffect(() => {
    if (selectedCVE?.id) {
      navigate(`/cves/${selectedCVE.id}`);
      setSelectedCVE(null);
    }
  }, [selectedCVE, navigate, setSelectedCVE]);

  // 로그인 체크
  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  // 데이터 로딩 로직
  useEffect(() => {
    const fetchData = () => {
      console.log('Fetching CVE data with params:', {
        skip: page * rowsPerPage,
        limit: rowsPerPage,
        search: searchQuery
      });
      
      dispatch(fetchCVEList({
        skip: page * rowsPerPage,
        limit: rowsPerPage,
        search: searchQuery
      }))
      .unwrap()
      .then(response => {
        console.log('CVE data fetched successfully:', response);
      })
      .catch(error => {
        console.error('Failed to fetch CVE data:', error);
        enqueueSnackbar('CVE 목록을 불러오는데 실패했습니다.', { 
          variant: 'error' 
        });
      });
    };

    if (user && isReady) {
      fetchData();
    }
  }, [dispatch, page, rowsPerPage, searchQuery, user, isReady, enqueueSnackbar]);

  // 검색 디바운스 처리
  const debouncedSearch = useMemo(
    () => debounce((term) => {
      dispatch(updateFilters({ 
        search: term,
        page: 0  // 검색 시 첫 페이지로 이동
      }));
    }, 300),
    [dispatch]
  );

  // 입력 핸들러 최적화
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    setSearchInput(value);  // 즉시 입력값 반영
    debouncedSearch(value); // 디바운스된 검색 실행
  }, [debouncedSearch]);

  // 컴포넌트 언마운트 시 디바운스 취소
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  // 페이지 변경 핸들러
  const handlePageChange = (event, newPage) => {
    dispatch(updateFilters({ page: newPage }));
  };

  // 페이지당 행 수 변경 핸들러
  const handleRowsPerPageChange = (event) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    dispatch(updateFilters({ 
      page: 0,
      rowsPerPage: newRowsPerPage
    }));
  };

  // 새로고침 핸들러
  const handleRefresh = () => {
    dispatch(refreshCVEList());
  };

  // CVE 클릭 핸들러 수정
  const handleCVEClick = (cve) => {
    console.log('Clicked CVE:', cve);
    setSelectedCVE(cve);
    setDetailOpen(true);
  };

  const handleDetailClose = () => {
    setDetailOpen(false);
    setSelectedCVE(null);
  };

  const handleCreateCVE = () => {
    setCreateDialogOpen(true);
  };

  const handleCloseCreate = () => {
    setCreateDialogOpen(false);
  };

  const handleCVECreated = () => {
    handleCloseCreate();
    dispatch(refreshCVEList());
  };

  const handleCVEUpdated = (updatedCVE) => {
    dispatch(refreshCVEList());
  };

  const handleDeleteClick = (e, cve) => {
    e.stopPropagation();  // 이벤트 전파 중단
    setCveToDelete(cve);
    setDeleteDialogOpen(true);
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setCveToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!cveToDelete) return;

    try {
      await dispatch(deleteCVE(cveToDelete.cveId)).unwrap();
      enqueueSnackbar('CVE가 성공적으로 삭제되었습니다.', {
        variant: 'success',
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
      });
    } catch (error) {
      enqueueSnackbar(error.message || 'CVE 삭제 중 오류가 발생했습니다.', {
        variant: 'error',
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
      });
    } finally {
      setDeleteDialogOpen(false);
      setCveToDelete(null);
    }
  };

  const openCVEDetail = useCallback(async (cveId) => {
    try {
      const response = await api.get(`/cves/${cveId}`);
      setSelectedCVE(response.data);
    } catch (error) {
      console.error('Error fetching CVE details:', error);
      dispatch(updateFilters({ 
        error: error.response?.data?.detail || 'CVE 상세 정보를 가져오는 중 오류가 발생했습니다.' 
      }));
    }
  }, [dispatch]);

  const renderSkeletons = () => (
    Array(rowsPerPage).fill(0).map((_, index) => (
      <TableRow key={index}>
        <TableCell><Skeleton animation="wave" /></TableCell>
        <TableCell><Skeleton animation="wave" /></TableCell>
        <TableCell><Skeleton animation="wave" width={100} /></TableCell>
        <TableCell align="right"><Skeleton animation="wave" width={80} /></TableCell>
      </TableRow>
    ))
  );

  // WebSocket 메시지 핸들러
  useWebSocketMessage('cve_update', () => {
    // 새로고침 버튼 클릭 시 실행될 콜백
    dispatch(refreshCVEList());
  });

  // 로딩 상태 표시
  if (!user) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh' 
      }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>
          인증 확인 중...
        </Typography>
      </Box>
    );
  }

  if (!isReady) {
    console.log('Waiting for WebSocket connection...', { isReady });
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh' 
      }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>
          서버와 연결 설정 중...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', mb: 2 }}>
      <Card elevation={0} sx={{ mb: 3, bgcolor: 'background.paper', borderRadius: 2 }}>
        <CardContent>
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h5" sx={{ fontWeight: 500, color: 'text.primary' }}>
              CVE 목록
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="새로고침">
                <IconButton onClick={handleRefresh} size="small" sx={{ bgcolor: 'action.hover' }}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreateCVE}
                sx={{ 
                  borderRadius: 1,
                  textTransform: 'none',
                  bgcolor: 'primary.main',
                  '&:hover': { bgcolor: 'primary.dark' }
                }}
              >
                CVE 추가
              </Button>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3 }}>
            <TextField
              placeholder="CVE 검색"
              value={searchInput}
              onChange={handleSearchChange}
              size="small"
              sx={{ 
                width: 300,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1,
                  bgcolor: 'background.default'
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
            />
            <Tooltip title="필터">
              <IconButton size="small" sx={{ bgcolor: 'action.hover' }}>
                <FilterIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {error && (
            <Alert 
              severity="error" 
              sx={{ 
                mb: 2,
                borderRadius: 1
              }}
            >
              {error}
            </Alert>
          )}

          <TableContainer 
            component={Paper} 
            elevation={0}
            sx={{ 
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Table sx={{ minWidth: 650 }} aria-label="CVE table">
              <TableHead>
                <TableRow>
                  <TableCell>CVE ID</TableCell>
                  <TableCell>제목</TableCell>
                  <TableCell>상태</TableCell>
                  <TableCell align="right">작업</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  renderSkeletons()
                ) : Array.isArray(cves) && cves.length > 0 ? (
                  cves.map((cve) => (
                    <TableRow
                      key={cve.Id || cve.cveId}
                      sx={{ 
                        '&:last-child td, &:last-child th': { border: 0 },
                        '&:hover': { bgcolor: 'action.hover' },
                        cursor: 'pointer'
                      }}
                      onClick={() => handleCVEClick(cve)}
                    >
                      <TableCell 
                        component="th" 
                        scope="row"
                        sx={{ 
                          color: 'primary.main',
                          fontWeight: 500
                        }}
                      >
                        {cve.cveId}
                      </TableCell>
                      <TableCell>{cve.title || '제목 없음'}</TableCell>
                      <TableCell>
                        <Chip
                          label={cve.status || '상태 없음'}
                          color={STATUS_COLORS[cve.status] || 'default'}
                          size="small"
                          sx={{ 
                            borderRadius: 1,
                            fontWeight: 500
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                          <Tooltip title="상세 정보">
                            <IconButton
                              size="medium"
                              onClick={(e) => {
                                e.stopPropagation();  // 이벤트 전파 중단
                                handleCVEClick(cve);
                              }}
                              sx={{ 
                                width: 36,
                                height: 36,
                                bgcolor: 'primary.main',
                                color: 'primary.contrastText',
                                '&:hover': { 
                                  bgcolor: 'primary.dark'
                                }
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="삭제">
                            <IconButton
                              size="medium"
                              onClick={(e) => handleDeleteClick(e, cve)}  // 이벤트 객체 전달
                              sx={{ 
                                width: 36,
                                height: 36,
                                bgcolor: 'error.main',
                                color: 'error.contrastText',
                                '&:hover': { 
                                  bgcolor: 'error.dark'
                                }
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 8 }}>
                      <Typography variant="body1" color="text.secondary">
                        {searchInput ? '검색 결과가 없습니다' : '데이터가 없습니다'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            rowsPerPageOptions={[5, 10, 25]}
            component="div"
            count={totalCount}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handlePageChange}
            onRowsPerPageChange={handleRowsPerPageChange}
            sx={{
              borderTop: '1px solid',
              borderColor: 'divider'
            }}
          />
        </CardContent>
      </Card>

      {detailOpen && selectedCVE && (
        <CVEDetail
          open={detailOpen}
          onClose={handleDetailClose}
          cveId={selectedCVE.cveId}
        />
      )}

      {createDialogOpen && (
        <CreateCVE
          onClose={handleCloseCreate}
          onSuccess={handleCVECreated}
          currentUser={user}
        />
      )}

      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>CVE 삭제 확인</DialogTitle>
        <DialogContent>
          <Typography>
            정말로 이 CVE를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>취소</Button>
          <Button 
            onClick={handleDeleteConfirm} 
            color="error" 
            variant="contained"
            disabled={!cveToDelete}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CVEList;