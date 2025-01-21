import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  DialogActions
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/auth';
import CVEDetail from './CVEDetail';
import CreateCVE from './CreateCVE';
import { debounce } from 'lodash';

const STATUS_COLORS = {
  '미할당': 'default',
  '분석중': 'info',
  '분석완료': 'warning',
  '대응완료': 'success'
};

const CVEList = ({ selectedCVE, setSelectedCVE }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cves, setCves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cveToDelete, setCveToDelete] = useState(null);

  useEffect(() => {
    if (selectedCVE?.id) {
      navigate(`/cves/${selectedCVE.id}`);
      setSelectedCVE(null);
    }
  }, [selectedCVE, navigate, setSelectedCVE]);

  const fetchCVEs = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/cves', {
        params: {
          skip: page * rowsPerPage,
          limit: rowsPerPage
        }
      });
      
      if (response.data && Array.isArray(response.data.items)) {
        setCves(response.data.items);
        setTotalCount(response.data.total || 0);
      } else {
        throw new Error('서버 응답 형식이 올바르지 않습니다.');
      }
    } catch (error) {
      console.error('Error fetching CVEs:', error);
      const errorMessage = error.response?.data?.detail || 'CVE 목록을 가져오는 중 오류가 발생했습니다.';
      setError(errorMessage);
      if (error.response?.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, navigate]);

  const debouncedSearchRef = useRef(null);

  const debouncedSearch = useCallback(
    debounce(async (query) => {
      if (query.trim()) {
        try {
          setLoading(true);
          setError('');
          const response = await api.get('/cves/search', {
            params: {
              query,
              skip: page * rowsPerPage,
              limit: rowsPerPage
            }
          });
          
          if (response.data && Array.isArray(response.data.items)) {
            setCves(response.data.items);
            setTotalCount(response.data.total || 0);
          } else {
            throw new Error('Invalid response format');
          }
        } catch (error) {
          console.error('Error searching CVEs:', error);
          setError(error.response?.data?.detail || 'CVE 검색 중 오류가 발생했습니다.');
          if (error.response?.status === 401) {
            navigate('/login');
          }
        } finally {
          setLoading(false);
        }
      } else {
        fetchCVEs();
      }
    }, 300),
    [fetchCVEs]
  );

  useEffect(() => {
    debouncedSearchRef.current = debouncedSearch;
  }, [debouncedSearch]);

  useEffect(() => {
    if (user) {
      fetchCVEs();
    }
  }, [fetchCVEs, user]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (searchQuery) {
      debouncedSearchRef.current(searchQuery);
    } else {
      fetchCVEs();
    }
  }, [user, searchQuery, page, rowsPerPage, fetchCVEs, navigate]);

  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
    setPage(0);
  };

  const handleRefresh = () => {
    fetchCVEs();
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleCVEClick = (cve) => {
    setSelectedCVE(cve);
  };

  const handleCloseDetail = () => {
    setSelectedCVE(null);
  };

  const handleCreateCVE = () => {
    setCreateDialogOpen(true);
  };

  const handleCloseCreate = () => {
    setCreateDialogOpen(false);
  };

  const handleCVECreated = () => {
    fetchCVEs();
    setCreateDialogOpen(false);
  };

  const handleCVEUpdated = (updatedCVE) => {
    setCves((prevCves) =>
      prevCves.map((cve) =>
        cve.cveId === updatedCVE.cveId ? updatedCVE : cve
      )
    );
  };

  const handleDeleteClick = (e, cve) => {
    e.stopPropagation();
    setCveToDelete(cve);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await api.delete(`/cves/${cveToDelete.cveId}`);
      setCves((prevCves) => prevCves.filter(cve => cve.cveId !== cveToDelete.cveId));
      setDeleteDialogOpen(false);
      setCveToDelete(null);
    } catch (error) {
      console.error('Error deleting CVE:', error);
      setError('CVE 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setCveToDelete(null);
  };

  const openCVEDetail = useCallback(async (cveId) => {
    try {
      const response = await api.get(`/cves/${cveId}`);
      setSelectedCVE(response.data);
    } catch (error) {
      console.error('Error fetching CVE details:', error);
      const errorMessage = error.response?.data?.detail || 'CVE 상세 정보를 가져오는 중 오류가 발생했습니다.';
      setError(errorMessage);
    }
  }, []);

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
              value={searchQuery}
              onChange={handleSearch}
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
                {loading ? renderSkeletons() : (
                  cves.map((cve) => (
                    <TableRow
                      key={cve.cveId}
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
                          label={cve.status}
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
                                e.stopPropagation();
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
                              onClick={(e) => handleDeleteClick(e, cve)}
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
                )}
                {!loading && cves.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 8 }}>
                      <Typography variant="body1" color="text.secondary">
                        {searchQuery ? '검색 결과가 없습니다' : '데이터가 없습니다'}
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
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            sx={{
              borderTop: '1px solid',
              borderColor: 'divider'
            }}
          />
        </CardContent>
      </Card>

      {selectedCVE && (
        <CVEDetail
          open={!!selectedCVE}
          onClose={handleCloseDetail}
          cve={selectedCVE}
          onSave={handleCVEUpdated}
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
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CVEList;