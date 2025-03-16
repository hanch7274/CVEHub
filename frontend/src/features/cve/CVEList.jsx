// frontend/src/features/cve/CVEList.jsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Tooltip,
  IconButton,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  CircularProgress,
  Skeleton,
  Grid,
  Card,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  InputAdornment,
  useTheme,
  useMediaQuery,
  alpha,
  Pagination
} from '@mui/material';

import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { useAuth } from '../../contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketIO } from '../../contexts/SocketIOContext';

// 기존 import 대신 새로운 통합 서비스 사용
import { 
  useCVEList, 
  useCVEDetail,
  useCVEListUpdates,
  useTotalCVECount
} from '../../api/hooks/useCVEQuery';
import {
  useDeleteCVE,
  useCreateCVE
} from '../../api/hooks/useCVEMutation';

import CVEDetail from './CVEDetail';
import CrawlerUpdateButton from './components/CrawlerUpdateButton';
import CreateCVE from './CreateCVE';
import { useSnackbar } from 'notistack';

// 기본 폰트 스타일
const fontStyles = {
  fontFamily: "'Noto Sans KR', sans-serif",
  letterSpacing: '0.5px'
};

// 심각도별 스타일 (HTML 디자인과 유사하게 수정)
const getSeverityStyles = (severity) => {
  const styles = {
    'CRITICAL': { bg: 'rgba(255, 7, 58, 0.15)', color: '#ff073a' },
    'HIGH':     { bg: 'rgba(255, 84, 0, 0.15)', color: '#ff5400' },
    'MEDIUM':   { bg: 'rgba(255, 190, 11, 0.15)', color: '#e5a800' },
    'LOW':      { bg: 'rgba(56, 176, 0, 0.15)', color: '#38b000' },
    'NONE':     { bg: 'rgba(108, 117, 125, 0.15)', color: '#6c757d' }
  };
  return styles[severity] || styles['NONE'];
};

// 상태별 스타일 (HTML 디자인에 맞춤)
const getStatusStyles = (status) => {
  const styles = {
    '신규등록':  { bg: 'rgba(58, 134, 255, 0.15)', color: '#3a86ff' },
    '분석중':   { bg: 'rgba(131, 56, 236, 0.15)', color: '#8338ec' },
    '분석완료': { bg: 'rgba(56, 176, 0, 0.15)', color: '#38b000' },
    '대응완료': { bg: 'rgba(56, 176, 0, 0.15)', color: '#38b000' }
  };
  return styles[status] || { bg: 'rgba(108, 117, 125, 0.15)', color: '#6c757d' };
};

const CVECardSkeleton = () => (
  <Card elevation={0} variant="outlined" sx={{ height: '100%' }}>
    <Skeleton animation="wave" height={30} />
  </Card>
);

const CVEDetailWrapper = ({ cveId, open, onClose }) => {
  const { data: cve, isLoading, isError, error, refetch } = useCVEDetail(cveId, {
    enabled: !!cveId && open,
    refetchOnWindowFocus: false
  });

  useEffect(() => {
    if (error) console.error('CVE 세부 정보 조회 중 오류:', error);
  }, [error]);

  if (!cveId || !open) return null;

  if (isLoading) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>CVE 세부 정보 로드 중...</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  if (isError) {
    return (
      <Dialog open={open} onClose={onClose}>
        <DialogTitle>오류 발생</DialogTitle>
        <DialogContent>
          <Typography color="error">데이터 로딩 중 오류가 발생했습니다.</Typography>
          <Button onClick={refetch}>다시 시도</Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>닫기</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return <CVEDetail cveId={cveId} open={open} onClose={onClose} />;
};

const CVEList = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { currentUser: user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { socket } = useSocketIO();

  // 실시간 업데이트 구독
  useCVEListUpdates();

  // 전체 CVE 개수 조회
  const { data: totalCVECount = 0, isLoading: isTotalCountLoading } = useTotalCVECount();
  
  // 필터 상태 (상태, 심각도, 정렬 옵션)
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [sortOption, setSortOption] = useState('newest');
  
  // 다이얼로그 및 검색 관련 상태
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cveToDelete, setCveToDelete] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [selectedCVE, setSelectedCVE] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  
  // 검색 디바운스 ref
  const searchTimeoutRef = useRef(null);

  // 상단 액션 버튼 렌더링 (새 CVE 생성, 크롤러 업데이트)
  const renderActionButtons = () => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCreateCVE}
          sx={{
            ...fontStyles,
            borderRadius: '20px',
            fontWeight: 500,
            boxShadow: '0 4px 12px rgba(58, 134, 255, 0.2)',
            background: 'linear-gradient(135deg, #3a86ff, #8338ec)',
            '&:hover': {
              background: 'linear-gradient(135deg, #2a76ef, #7328dc)',
              boxShadow: '0 6px 16px rgba(58, 134, 255, 0.3)'
            }
          }}
        >
          새 CVE 생성
        </Button>
        <CrawlerUpdateButton />
      </Box>
    </Box>
  );

  // React Query: CVE 목록 가져오기 (필터와 정렬 옵션 반영)
  const { 
    data: queryData, 
    isLoading, 
    isError, 
    error: queryError, 
    refetch: refetchCVEList 
  } = useCVEList({ 
    page, 
    rowsPerPage, 
    filters: { 
      status: statusFilter,
      severity: severityFilter,
      search: searchQuery
    },
    sortBy: sortOption === 'newest' ? 'createdAt' : sortOption === 'severity' ? 'severity' : 'status',
    sortOrder: sortOption === 'newest' ? 'desc' : (sortOption === 'severity' ? 'desc' : 'asc')
  });
  
  const cves = useMemo(() => queryData?.items || [], [queryData]);
  const totalCount = useMemo(() => queryData?.totalItems || 0, [queryData]);
  
  // 통계 데이터 (예시)
  const statsData = useMemo(() => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return {
      totalCount,
      newLastWeekCount: cves.filter(cve => new Date(cve.createdAt) >= oneWeekAgo).length,
      inProgressCount: cves.filter(cve => cve.status === '분석중').length,
      completedCount: cves.filter(cve => cve.status === '분석완료').length
    };
  }, [cves, totalCount]);

  // 필터 핸들러들
  const handleSearchChange = useCallback((e) => {
    setSearchInput(e.target.value);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(e.target.value.trim());
      setPage(0);
    }, 300);
  }, []);

  const handleStatusFilterChange = useCallback((e) => {
    setStatusFilter(e.target.value);
    setPage(0);
  }, []);

  const handleSeverityFilterChange = useCallback((e) => {
    setSeverityFilter(e.target.value);
    setPage(0);
  }, []);

  const handleSortOptionChange = useCallback((e) => {
    setSortOption(e.target.value);
    setPage(0);
  }, []);

  const handlePageChange = useCallback((event, newPage) => {
    setPage(newPage - 1); // Pagination 컴포넌트는 1부터 시작하므로 -1 해줍니다
  }, []);

  const handleRowsPerPageChange = useCallback((event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  const handleRefresh = useCallback(() => {
    refetchCVEList();
    enqueueSnackbar('데이터 새로고침 중...', { variant: 'info', autoHideDuration: 1000 });
  }, [refetchCVEList, enqueueSnackbar]);

  const handleCVEClick = useCallback((cve) => {
    setSelectedCVE(cve);
    setDetailOpen(true);
  }, []);

  const handleDetailClose = useCallback(() => {
    setDetailOpen(false);
    setSelectedCVE(null);
  }, []);

  const handleCreateCVE = useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

  const handleCreateDialogClose = useCallback(() => {
    setCreateDialogOpen(false);
  }, []);

  // 새로운 훅 사용
  const deleteMutation = useDeleteCVE();
  const createMutation = useCreateCVE();

  const handleCreateSubmit = useCallback(async (cveData) => {
    try {
      await createMutation.mutateAsync(cveData);
      // 성공 메시지는 useCVEService 내부에서 처리됨
      handleCreateDialogClose();
    } catch (error) {
      // 에러 메시지는 useCVEService 내부에서 처리됨
      console.error('CVE 생성 중 오류:', error);
    }
  }, [createMutation, handleCreateDialogClose]);

  const handleCreateFormSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = {
      cveId: formData.get('cveId'),
      title: formData.get('title'),
      description: formData.get('description'),
      status: formData.get('status') || '신규등록'
    };
    handleCreateSubmit(data);
  };

  const handleDeleteClick = useCallback((e, cve) => {
    e.stopPropagation();
    setCveToDelete(cve);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false);
    setCveToDelete(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!cveToDelete) return;
    try {
      const cveId = cveToDelete.id || cveToDelete.cveId;
      await deleteMutation.mutateAsync(cveId);
      setDeleteDialogOpen(false);
      setCveToDelete(null);
      // 성공 메시지는 useCVEService 내부에서 처리됨
    } catch (error) {
      // 에러 메시지는 useCVEService 내부에서 처리됨
      console.error('CVE 삭제 중 오류:', error);
    }
  }, [cveToDelete, deleteMutation]);

  const handleCVECreated = useCallback((newCVEData) => {
    handleCreateDialogClose();
    // refetchCVEList()는 더 이상 필요하지 않음 (자동으로 무효화됨)
  }, [handleCreateDialogClose]);

  // 상단 통계 영역 렌더링
  const renderStatistics = () => (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid item xs={12} sm={6} md={3}>
        <Card
          elevation={0}
          sx={{
            p: 2,
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            textAlign: 'center',
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-5px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.primary.main, 0.1)} 100%)`
            }
          }}
        >
          <Typography variant="caption" sx={{ textTransform: 'uppercase', color: theme.palette.text.secondary }}>
            전체 CVE
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: theme.palette.primary.main, my: 1 }}>
            {totalCVECount}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>등록된 취약점</Typography>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card
          elevation={0}
          sx={{
            p: 2,
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            textAlign: 'center',
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-5px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              background: `linear-gradient(135deg, ${alpha(theme.palette.secondary.main, 0.05)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`
            }
          }}
        >
          <Typography variant="caption" sx={{ textTransform: 'uppercase', color: theme.palette.text.secondary }}>
            위험도 높음
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: theme.palette.secondary.main, my: 1 }}>
            {statsData.newLastWeekCount}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>심각한 취약점</Typography>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card
          elevation={0}
          sx={{
            p: 2,
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            textAlign: 'center',
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-5px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.05)} 0%, ${alpha(theme.palette.info.main, 0.1)} 100%)`
            }
          }}
        >
          <Typography variant="caption" sx={{ textTransform: 'uppercase', color: theme.palette.text.secondary }}>
            최근 7일
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: theme.palette.info.main, my: 1 }}>
            {statsData.inProgressCount}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>신규 등록</Typography>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card
          elevation={0}
          sx={{
            p: 2,
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            textAlign: 'center',
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-5px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.05)} 0%, ${alpha(theme.palette.success.main, 0.1)} 100%)`
            }
          }}
        >
          <Typography variant="caption" sx={{ textTransform: 'uppercase', color: theme.palette.text.secondary }}>
            완료됨
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: theme.palette.success.main, my: 1 }}>
            {statsData.completedCount}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>분석 완료</Typography>
        </Card>
      </Grid>
    </Grid>
  );

  // 필터바 렌더링
  const renderFilterBar = () => (
    <Box
      sx={{
        backgroundColor: theme.palette.background.paper,
        p: 2.5,
        borderRadius: '8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        mb: 3,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        alignItems: 'center',
        transition: 'all 0.3s ease',
        '&:hover': {
          boxShadow: '0 6px 20px rgba(0,0,0,0.15)'
        }
      }}
    >
      <Box sx={{ flex: 1, position: 'relative', minWidth: 300 }}>
        <SearchIcon
          sx={{
            position: 'absolute',
            left: 15,
            top: '50%',
            transform: 'translateY(-50%)',
            color: theme.palette.text.secondary
          }}
        />
        <TextField
          placeholder="CVE ID, 키워드 또는 제목으로 검색"
          size="small"
          value={searchInput}
          onChange={handleSearchChange}
          fullWidth
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '30px',
              pl: '45px',
              backgroundColor: 'white',
              transition: 'all 0.2s ease',
              '& fieldset': { borderColor: '#e0e0e0' },
              '&:hover fieldset': { borderColor: theme.palette.primary.main },
              '&.Mui-focused': {
                boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}`
              }
            }
          }}
        />
      </Box>
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel sx={fontStyles}>상태별 필터</InputLabel>
        <Select
          value={statusFilter}
          label="상태별 필터"
          onChange={handleStatusFilterChange}
          sx={{
            borderRadius: '30px',
            backgroundColor: 'white',
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}`
            }
          }}
        >
          <MenuItem value="">전체</MenuItem>
          <MenuItem value="신규등록">신규등록</MenuItem>
          <MenuItem value="분석중">분석중</MenuItem>
          <MenuItem value="분석완료">분석완료</MenuItem>
          <MenuItem value="대응완료">대응완료</MenuItem>
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel sx={fontStyles}>심각도별 필터</InputLabel>
        <Select
          value={severityFilter}
          label="심각도별 필터"
          onChange={handleSeverityFilterChange}
          sx={{
            borderRadius: '30px',
            backgroundColor: 'white',
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}`
            }
          }}
        >
          <MenuItem value="">전체</MenuItem>
          <MenuItem value="CRITICAL">심각</MenuItem>
          <MenuItem value="HIGH">높음</MenuItem>
          <MenuItem value="MEDIUM">중간</MenuItem>
          <MenuItem value="LOW">낮음</MenuItem>
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel sx={fontStyles}>정렬 기준</InputLabel>
        <Select
          value={sortOption}
          label="정렬 기준"
          onChange={handleSortOptionChange}
          sx={{
            borderRadius: '30px',
            backgroundColor: 'white',
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}`
            }
          }}
        >
          <MenuItem value="newest">최신순</MenuItem>
          <MenuItem value="severity">심각도순</MenuItem>
          <MenuItem value="status">상태순</MenuItem>
        </Select>
      </FormControl>
      <Tooltip title="새로고침">
        <IconButton 
          onClick={handleRefresh}
          sx={{
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              transform: 'rotate(180deg)'
            }
          }}
        >
          <RefreshIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );

  return (
    <Box sx={{ width: '100%', px: { xs: 1, sm: 2, md: 3 } }}>
      {/* 상단 액션 버튼 추가 */}
      {renderActionButtons()}
      
      {renderStatistics()}
      {renderFilterBar()}

      <Paper
        elevation={0}
        sx={{
          borderRadius: '8px',
          overflow: 'hidden',
          mb: 3,
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
        }}
      >
        <TableContainer>
          <Table stickyHeader size="medium" sx={{ minWidth: 800, borderCollapse: 'collapse' }}>
            <TableHead>
              <TableRow>
                {['CVE ID', '제목', '심각도', '상태', '등록일', '최종 수정일', '액션'].map((header) => (
                  <TableCell
                    key={header}
                    sx={{
                      backgroundColor: theme.palette.mode === 'dark' ? '#2d3748' : '#f2f5f9',
                      p: '15px 20px',
                      fontWeight: 600,
                      borderBottom: `2px solid ${theme.palette.mode === 'dark' ? '#4a5568' : '#e9ecef'}`,
                      ...fontStyles
                    }}
                  >
                    {header}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading
                ? Array(rowsPerPage).fill(0).map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      {Array(7)
                        .fill(0)
                        .map((_, i) => (
                          <TableCell key={i}><Skeleton animation="wave" /></TableCell>
                        ))}
                    </TableRow>
                  ))
                : cves.length > 0
                  ? cves.map((cve, index) => {
                      const uniqueKey = cve.id || cve.cveId || `cve-item-${index}`;
                      const severityStyle = getSeverityStyles(cve.severity);
                      const statusStyle = getStatusStyles(cve.status);
                      return (
                        <TableRow
                          key={uniqueKey}
                          hover
                          onClick={() => handleCVEClick(cve)}
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { 
                              backgroundColor: theme.palette.mode === 'dark' ? '#3a4a61' : '#e9effd',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                              transform: 'scale(1.005)',
                              '& .MuiTableCell-root': {
                                color: theme.palette.mode === 'dark' ? '#ffffff' : theme.palette.primary.main,
                              },
                              '& .action-icon': {
                                opacity: 1,
                                transform: 'translateY(0)',
                              }
                            },
                            height: '60px',
                            borderBottom: `1px solid ${theme.palette.mode === 'dark' ? '#4a5568' : '#e9ecef'}`,
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {/* CVE ID 컬럼: 모던한 스타일 적용 */}
                          <TableCell sx={{ p: '12px 20px', ...fontStyles, fontWeight: 'bold', fontSize: '1rem', color: severityStyle.color }}>
                            {cve.cveId || '알 수 없음'}
                          </TableCell>
                          <TableCell sx={{
                            p: '12px 20px',
                            maxWidth: { xs: '150px', sm: '300px', md: '400px' },
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '0.9rem',
                            fontWeight: 500,
                            ...fontStyles
                          }}>
                            {cve.title || '제목 없음'}
                          </TableCell>
                          <TableCell sx={{ p: '12px 20px' }}>
                            <Chip
                              label={cve.severity || '미정'}
                              size="small"
                              sx={{
                                minWidth: 70,
                                backgroundColor: severityStyle.bg,
                                color: severityStyle.color,
                                fontWeight: 'bold',
                                fontSize: '0.75rem',
                                border: `1px solid ${alpha(severityStyle.color, 0.2)}`,
                                '& .MuiChip-label': { px: 1.5 }
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ p: '12px 20px' }}>
                            <Chip
                              label={cve.status || '상태 없음'}
                              size="small"
                              sx={{
                                minWidth: 65,
                                backgroundColor: statusStyle.bg,
                                color: statusStyle.color,
                                fontWeight: 500,
                                fontSize: '0.75rem',
                                border: `1px solid ${alpha(statusStyle.color, 0.2)}`,
                                '& .MuiChip-label': { px: 1.5 }
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ p: '12px 20px', fontSize: '0.85rem', color: theme.palette.text.secondary }}>
                            {cve.createdAt
                              ? new Date(cve.createdAt).toLocaleDateString('ko-KR', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })
                              : '-'
                            }
                          </TableCell>
                          <TableCell sx={{ p: '12px 20px', fontSize: '0.85rem', color: theme.palette.text.secondary }}>
                            {cve.updatedAt
                              ? new Date(cve.updatedAt).toLocaleDateString('ko-KR', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })
                              : '-'
                            }
                          </TableCell>
                          <TableCell align="center" sx={{ p: '12px 20px' }} onClick={(e) => e.stopPropagation()}>
                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                              <Tooltip title="상세 보기">
                                <IconButton 
                                  size="small" 
                                  onClick={() => handleCVEClick(cve)}
                                  className="action-icon"
                                  sx={{
                                    opacity: 0.7,
                                    transform: 'translateY(2px)',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                                      color: theme.palette.primary.main
                                    }
                                  }}
                                >
                                  <VisibilityIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="수정">
                                <IconButton 
                                  size="small" 
                                  onClick={() => {/* 수정 로직 추가 */}}
                                  className="action-icon"
                                  sx={{
                                    opacity: 0.7,
                                    transform: 'translateY(2px)',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                      backgroundColor: alpha(theme.palette.info.main, 0.1),
                                      color: theme.palette.info.main
                                    }
                                  }}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="삭제">
                                <IconButton
                                  size="small"
                                  onClick={(e) => handleDeleteClick(e, cve)}
                                  color="error"
                                  className="action-icon"
                                  sx={{
                                    opacity: 0.7,
                                    transform: 'translateY(2px)',
                                    transition: 'all 0.2s ease',
                                    '&:hover': { 
                                      backgroundColor: alpha(theme.palette.error.main, 0.1),
                                      color: theme.palette.error.main
                                    }
                                  }}
                                >
                                  {deleteMutation.isPending && deleteMutation.variables === cve.id ? (
                                    <CircularProgress size={20} color="inherit" />
                                  ) : (
                                    <DeleteIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  : (
                    <TableRow key="no-data">
                      <TableCell colSpan={7}>
                        <Box
                          sx={{
                            p: 4,
                            textAlign: 'center',
                            backgroundColor: theme.palette.background.paper,
                            borderRadius: '8px',
                            border: 1,
                            borderColor: 'divider'
                          }}
                        >
                          <Typography color="text.secondary" sx={fontStyles}>검색 결과가 없습니다</Typography>
                          {searchQuery && (
                            <>
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                검색어: "{searchQuery}"
                              </Typography>
                              <Button
                                onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                                variant="outlined"
                                size="small"
                                sx={{ mt: 2 }}
                              >
                                검색 초기화
                              </Button>
                            </>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
              }
            </TableBody>
          </Table>
        </TableContainer>
        <Box
          sx={{
            p: '15px 20px',
            backgroundColor: theme.palette.mode === 'dark' ? '#2d3748' : '#f8f9fa',
            borderTop: `1px solid ${theme.palette.mode === 'dark' ? '#4a5568' : '#e9ecef'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <Typography sx={{ fontSize: '14px', color: theme.palette.text.secondary }}>
            전체 {totalCVECount}개 중 {totalCVECount > 0 ? page * rowsPerPage + 1 : 0}-{Math.min((page + 1) * rowsPerPage, totalCVECount)} 표시
          </Typography>
          <Pagination 
            count={Math.ceil(totalCVECount / rowsPerPage)}
            page={page + 1} // Pagination 컴포넌트는 1부터 시작하므로 +1 해줍니다
            onChange={handlePageChange}
            color="primary"
            size="medium"
            showFirstButton
            showLastButton
            siblingCount={1}
            boundaryCount={1}
            sx={{
              '& .MuiPaginationItem-root': {
                fontWeight: 500,
                borderRadius: '6px',
                '&.Mui-selected': {
                  backgroundColor: theme.palette.primary.main,
                  color: 'white',
                  '&:hover': {
                    backgroundColor: theme.palette.primary.dark,
                  }
                },
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                }
              }
            }}
          />
        </Box>
      </Paper>

      {selectedCVE && (
        <CVEDetailWrapper
          cveId={selectedCVE.cveId}
          open={detailOpen}
          onClose={handleDetailClose}
        />
      )}

      <Dialog
        open={createDialogOpen}
        onClose={handleCreateDialogClose}
        maxWidth="md"
        fullWidth
        PaperProps={{ elevation: 3, sx: { borderRadius: '8px', overflow: 'hidden' } }}
      >
        <DialogTitle
          sx={{
            p: 3,
            borderBottom: 1,
            borderColor: 'divider',
            backgroundColor: theme.palette.background.default
          }}
        >
          새 CVE 생성
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <CreateCVE open={createDialogOpen} onSuccess={handleCVECreated} onClose={handleCreateDialogClose} />
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle sx={{ p: 2 }}>CVE 삭제 확인</DialogTitle>
        <DialogContent sx={{ px: 3, pt: 1, pb: 2 }}>
          <Typography sx={fontStyles}>
            '{cveToDelete?.cveId || ""}' 항목을 삭제하시겠습니까?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            이 작업은 되돌릴 수 없습니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleDeleteCancel} color="inherit">취소</Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
            startIcon={deleteMutation.isPending ? <CircularProgress size={20} color="inherit" /> : null}
            sx={{
              boxShadow: 'none',
              '&:hover': { boxShadow: 'none', backgroundColor: 'error.dark' }
            }}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CVEList;
