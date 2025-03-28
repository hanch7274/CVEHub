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
  TablePagination,
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
  alpha
} from '@mui/material';
import { TIME_ZONES, formatDateTime } from '../../utils/dateUtils';
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import { useAuth } from '../../contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query'; 
import { useSocketIO } from '../../contexts/SocketIOContext';
import { QUERY_KEYS } from '../../api/queryKeys';

// 기존 import 대신 새로운 통합 서비스 사용
import { 
  useCVEList, 
  useCVEDetail,
  useCVEListUpdates,
  useTotalCVECount,
  useCVEStats
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

// 공통 스타일 상수 - 카드 기본 스타일
const cardBaseStyle = {
  p: 2,
  borderRadius: '8px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
  textAlign: 'center',
  transition: 'all 0.3s ease',
};

// 공통 스타일 상수 - 호버 효과
const cardHoverStyle = {
  transform: 'translateY(-5px)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
};

// 공통 스타일 상수 - 필터 컴포넌트 기본 스타일
const filterBaseStyle = {
  borderRadius: '30px',
  backgroundColor: 'white',
  transition: 'all 0.2s ease',
};

// 공통 스타일 상수 - 테이블 셀 기본 스타일
const tableCellBaseStyle = {
  p: '12px 20px',
  ...fontStyles
};

// 심각도별 스타일 (HTML 디자인과 유사하게 수정)
const getSeverityStyles = (severity) => {
  // 대소문자 구분 없이 비교하기 위해 소문자로 변환하고 매핑
  const severityLower = severity ? severity.toLowerCase() : '';
  
  const styles = {
    'critical': { bg: 'rgba(255, 7, 58, 0.15)', color: '#ff073a' },
    'high':     { bg: 'rgba(255, 84, 0, 0.15)', color: '#ff5400' },
    'medium':   { bg: 'rgba(255, 190, 11, 0.15)', color: '#e5a800' },
    'low':      { bg: 'rgba(56, 176, 0, 0.15)', color: '#38b000' },
    'none':     { bg: 'rgba(108, 117, 125, 0.15)', color: '#6c757d' }
  };
  
  return styles[severityLower] || styles['none'];
};

// 상태별 스타일 (HTML 디자인에 맞춤)
const getStatusStyles = (status) => {
  const styles = {
    '신규등록':  { bg: 'rgba(58, 134, 255, 0.15)', color: '#3a86ff' },
    '분석중':   { bg: 'rgba(131, 56, 236, 0.15)', color: '#8338ec' },
    '릴리즈 완료': { bg: 'rgba(56, 176, 0, 0.15)', color: '#38b000' },
    '분석불가': { bg: 'rgba(244, 67, 54, 0.15)', color: '#f44336' }
  };
  return styles[status] || { bg: 'rgba(108, 117, 125, 0.15)', color: '#6c757d' };
};

// 심각도별 색상 설정 함수
const getSeverityColor = (severity, theme) => {
  // 대소문자 구분 없이 비교하기 위해 소문자로 변환
  const severityLower = severity ? severity.toLowerCase() : '';
  
  switch (severityLower) {
    case 'critical':
      return theme.palette.error.main;
    case 'high':
      return theme.palette.secondary.main;
    case 'medium':
      return theme.palette.warning.main;
    case 'low':
      return theme.palette.info.main;
    default:
      return theme.palette.text.secondary;
  }
};

// 상태별 색상 설정 함수
const getStatusColor = (status, theme) => {
  switch (status) {
    case '신규등록':
      return theme.palette.info.main;
    case '분석중':
      return theme.palette.warning.main;
    case '릴리즈 완료':
      return theme.palette.success.main;
    case '분석불가':
      return theme.palette.error.main;
    default:
      return theme.palette.text.secondary;
  }
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

const StatisticsSection = React.memo(({ statsData, totalCVECount, theme }) => {
  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid item xs={12} sm={6} md={3}>
        <Card
          elevation={0}
          sx={{
            ...cardBaseStyle,
            '&:hover': cardHoverStyle,
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.primary.main, 0.1)} 100%)`
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
            ...cardBaseStyle,
            '&:hover': cardHoverStyle,
            background: `linear-gradient(135deg, ${alpha(theme.palette.secondary.main, 0.05)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`
          }}
        >
          <Typography variant="caption" sx={{ textTransform: 'uppercase', color: theme.palette.text.secondary }}>
            위험도 높음
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: theme.palette.secondary.main, my: 1 }}>
            {statsData.highSeverityCount || 0}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>심각한 취약점</Typography>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card
          elevation={0}
          sx={{
            ...cardBaseStyle,
            '&:hover': cardHoverStyle,
            background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.05)} 0%, ${alpha(theme.palette.info.main, 0.1)} 100%)`
          }}
        >
          <Typography variant="caption" sx={{ textTransform: 'uppercase', color: theme.palette.text.secondary }}>
            최근 7일
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: theme.palette.info.main, my: 1 }}>
            {statsData.newLastWeekCount || 0}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>신규 등록</Typography>
        </Card>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Card
          elevation={0}
          sx={{
            ...cardBaseStyle,
            '&:hover': cardHoverStyle,
            background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.05)} 0%, ${alpha(theme.palette.success.main, 0.1)} 100%)`
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
});

const FilterBar = React.memo(({ 
  searchInput, 
  statusFilter, 
  severityFilter, 
  sortOption, 
  handleSearchChange, 
  handleStatusFilterChange, 
  handleSeverityFilterChange, 
  handleSortOptionChange, 
  handleRefresh,
  theme
}) => {
  return (
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
            ...filterBaseStyle,
            '&:hover': {
              boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}`
            }
          }}
        >
          <MenuItem value="">전체</MenuItem>
          <MenuItem value="신규등록">신규등록</MenuItem>
          <MenuItem value="분석중">분석중</MenuItem>
          <MenuItem value="릴리즈 완료">릴리즈 완료</MenuItem>
          <MenuItem value="분석불가">분석불가</MenuItem>
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel sx={fontStyles}>심각도별 필터</InputLabel>
        <Select
          value={severityFilter}
          label="심각도별 필터"
          onChange={handleSeverityFilterChange}
          sx={{
            ...filterBaseStyle,
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
            ...filterBaseStyle,
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
});

const TableSkeletonRow = React.memo(() => (
  <TableRow>
    <TableCell><Skeleton variant="text" /></TableCell>
    <TableCell><Skeleton variant="text" /></TableCell>
    <TableCell><Skeleton variant="text" /></TableCell>
    <TableCell><Skeleton variant="text" /></TableCell>
    <TableCell><Skeleton variant="text" /></TableCell>
    <TableCell><Skeleton variant="text" /></TableCell>
    <TableCell><Skeleton variant="text" /></TableCell>
  </TableRow>
));

const NoDataRow = ({ colSpan, searchQuery, onResetSearch, theme }) => (
  <TableRow>
    <TableCell
      colSpan={colSpan}
      sx={{ ...tableCellBaseStyle, textAlign: 'center', py: 4 }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 2 }}>
        <SearchOffIcon sx={{ fontSize: 48, color: theme.palette.text.secondary, mb: 1 }} />
        <Typography variant="body1" sx={{ color: theme.palette.text.secondary }}>
          검색 결과가 없습니다
        </Typography>
        {searchQuery && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              검색어: "{searchQuery}"
            </Typography>
            <Button
              onClick={onResetSearch}
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
);

const CVETable = React.memo(({ 
  cves, 
  isLoading, 
  page, 
  totalCVECount, 
  rowsPerPage, 
  onPageChange, 
  onRowsPerPageChange, 
  onCVEClick,
  theme,
  sortOption,
  searchQuery,
  onResetSearch,
  onDeleteClick
}) => {
  return (
    <Paper
      elevation={0}
      sx={{
        width: '100%',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        mb: 4,
        transition: 'box-shadow 0.3s ease',
        '&:hover': {
          boxShadow: '0 6px 20px rgba(0,0,0,0.15)'
        }
      }}
    >
      <TableContainer sx={{ maxHeight: '60vh' }}>
        <Table stickyHeader sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>CVE ID</TableCell>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>제목</TableCell>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>심각도</TableCell>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>상태</TableCell>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>등록일</TableCell>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>최종 수정일</TableCell>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>액션</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              // 로딩 중일 때 스켈레톤 UI 표시
              Array.from(new Array(5)).map((_, index) => (
                <TableSkeletonRow key={`skeleton-${index}`} />
              ))
            ) : cves && cves.length > 0 ? (
              cves.map((cve) => (
                <TableRow
                  key={cve.cveId}
                  onClick={() => onCVEClick(cve)}
                  sx={{
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.primary.main, 0.04)
                    }
                  }}
                >
                  <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'medium', color: theme.palette.primary.main }}>
                    {cve.cveId}
                  </TableCell>
                  <TableCell sx={tableCellBaseStyle}>
                    <Tooltip title={cve.title || ''} placement="top">
                      <Typography
                        variant="body2"
                        sx={{
                          maxWidth: 400,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {cve.title || '-'}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={tableCellBaseStyle}>
                    <Chip
                      label={cve.severity ? cve.severity.toUpperCase() : '미정'}
                      size="small"
                      sx={{
                        backgroundColor: alpha(getSeverityColor(cve.severity, theme), 0.1),
                        color: getSeverityColor(cve.severity, theme),
                        fontWeight: 'medium',
                        borderRadius: '4px'
                      }}
                    />
                  </TableCell>
                  <TableCell sx={tableCellBaseStyle}>
                    <Chip
                      label={cve.status}
                      size="small"
                      sx={{
                        backgroundColor: alpha(getStatusColor(cve.status, theme), 0.1),
                        color: getStatusColor(cve.status, theme),
                        fontWeight: 'medium',
                        borderRadius: '4px'
                      }}
                    />
                  </TableCell>
                  <TableCell sx={tableCellBaseStyle}>
                    {formatDateTime(cve.createdAt || cve.created_at, undefined, TIME_ZONES.KST)}
                  </TableCell>
                  <TableCell sx={tableCellBaseStyle}>
                    {formatDateTime(cve.lastModifiedAt || cve.last_modified_at, undefined, TIME_ZONES.KST)}
                  </TableCell>
                  <TableCell sx={tableCellBaseStyle}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Tooltip title="삭제">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => onDeleteClick(e, cve)}
                          sx={{
                            '&:hover': {
                              backgroundColor: alpha(theme.palette.error.main, 0.1),
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
              <NoDataRow 
                colSpan={7} 
                searchQuery={searchQuery} 
                onResetSearch={onResetSearch}
                theme={theme}
              />
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[1, 5, 10, 25]}
        component="div"
        count={totalCVECount} 
        rowsPerPage={rowsPerPage}
        page={page - 1}
        onPageChange={onPageChange}
        onRowsPerPageChange={onRowsPerPageChange}
        labelRowsPerPage="페이지당 행 수"
        labelDisplayedRows={({ from, to, count }) => {
          // 검색 결과가 없는 경우
          if (count === 0) return '검색 결과 없음';
          // 일반적인 경우
          return `${from}-${to} / 총 ${count !== -1 ? count : '?'}개${searchQuery ? ' (검색 결과)' : ''}`;
        }}
        sx={{
          borderTop: `1px solid ${theme.palette.divider}`,
          '& .MuiToolbar-root': {
            ...fontStyles,
            height: 56
          }
        }}
      />
    </Paper>
  );
});

// 테이블 로딩 상태를 위한 스켈레톤 UI
const CVETableSkeleton = () => {
  const theme = useTheme();
  
  return (
    <Paper
      elevation={0}
      sx={{
        width: '100%',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        mb: 4
      }}
    >
      <TableContainer>
        <Table sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>CVE ID</TableCell>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>제목</TableCell>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>심각도</TableCell>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>상태</TableCell>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>등록일</TableCell>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>최종 수정일</TableCell>
              <TableCell sx={{ ...tableCellBaseStyle, fontWeight: 'bold', backgroundColor: alpha(theme.palette.primary.main, 0.08) }}>액션</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from(new Array(5)).map((_, index) => (
              <TableRow key={`skeleton-${index}`}>
                <TableCell><Skeleton animation="wave" height={30} /></TableCell>
                <TableCell><Skeleton animation="wave" height={30} /></TableCell>
                <TableCell><Skeleton animation="wave" height={30} /></TableCell>
                <TableCell><Skeleton animation="wave" height={30} /></TableCell>
                <TableCell><Skeleton animation="wave" height={30} /></TableCell>
                <TableCell><Skeleton animation="wave" height={30} /></TableCell>
                <TableCell><Skeleton animation="wave" height={30} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

// 에러 표시 컴포넌트
const ErrorDisplay = ({ error, onRetry }) => {
  const theme = useTheme();
  
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: '8px',
        textAlign: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        mb: 4
      }}
    >
      <Typography variant="h6" color="error" sx={{ mb: 2 }}>
        데이터를 불러오는 중 오류가 발생했습니다
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {error?.message || '알 수 없는 오류가 발생했습니다. 다시 시도해주세요.'}
      </Typography>
      <Button
        variant="contained"
        color="primary"
        onClick={onRetry}
        startIcon={<RefreshIcon />}
        sx={{
          borderRadius: '20px',
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' }
        }}
      >
        다시 시도
      </Button>
    </Paper>
  );
};

// 빈 상태 표시 컴포넌트
const EmptyStateDisplay = ({ searchQuery, onResetSearch, isFiltered }) => {
  const theme = useTheme();
  
  return (
    <Paper
      elevation={0}
      sx={{
        p: 4,
        borderRadius: '8px',
        textAlign: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        mb: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <SearchOffIcon sx={{ fontSize: 64, color: theme.palette.text.secondary, mb: 2 }} />
      
      <Typography variant="h6" sx={{ mb: 1 }}>
        {searchQuery ? '검색 결과가 없습니다' : '등록된 CVE가 없습니다'}
      </Typography>
      
      {isFiltered ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {searchQuery ? `"${searchQuery}"에 대한 검색 결과가 없습니다.` : '현재 필터 조건에 맞는 CVE가 없습니다.'}
          </Typography>
          <Button
            variant="outlined"
            color="primary"
            onClick={onResetSearch}
            sx={{
              borderRadius: '20px',
              mt: 1
            }}
          >
            필터 초기화
          </Button>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          새로운 CVE를 등록해 보세요.
        </Typography>
      )}
    </Paper>
  );
};

const CVEList = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { currentUser: user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { socket } = useSocketIO();
  const queryClient = useQueryClient(); 

  // 실시간 업데이트 구독
  useCVEListUpdates();

  // 전체 CVE 개수 조회
  const { data: totalCVECount = 0, isLoading: isTotalCountLoading } = useTotalCVECount();

  // 통계 데이터를 가져오는 쿼리
  const { data: backendStats, isLoading: isLoadingStats } = useCVEStats();
  
  // 필터 상태 (상태, 심각도, 정렬 옵션)
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(1); // 테스트를 위해 1로 변경
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
          onClick={() => setCreateDialogOpen(true)}
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
    page: page,
    rowsPerPage, 
    filters: { 
      status: statusFilter,
      severity: severityFilter,
      search: searchQuery
    },
    sortBy: sortOption === 'newest' ? 'createdAt' : sortOption === 'severity' ? 'severity' : 'status',
    sortOrder: sortOption === 'newest' ? 'desc' : (sortOption === 'severity' ? 'desc' : 'asc')
  });
  
  // 쿼리 실행 후 로깅 추가
  useEffect(() => {
    console.log('쿼리 매개변수:', {
      page,
      rowsPerPage,
      필터: { 상태: statusFilter, 심각도: severityFilter, 검색어: searchQuery },
      정렬: sortOption
    });
    console.log('쿼리 결과:', queryData?.items?.length, '아이템 중', queryData?.total || queryData?.totalItems, '총 아이템');
    
    // 백엔드 검색 API에 전달되는 실제 파라미터 구조 출력 (백엔드 /cves/list 엔드포인트에 맞춤)
    console.log('백엔드로 전송되는 검색 파라미터:', { 
      search: searchQuery,
      page: page,
      limit: rowsPerPage,
      status: statusFilter,
      severity: severityFilter,
      sort_by: sortOption === 'newest' ? 'createdAt' : sortOption === 'severity' ? 'severity' : 'status',
      sort_order: sortOption === 'newest' ? 'desc' : (sortOption === 'severity' ? 'desc' : 'asc')
    });
  }, [queryData, page, rowsPerPage, statusFilter, severityFilter, searchQuery, sortOption]);
  
  const cves = useMemo(() => queryData?.items || [], [queryData]);
  const totalCount = useMemo(() => queryData?.total || queryData?.totalItems || 0, [queryData]);
  
  // 통계 데이터 (백엔드 API 결과와 로컬 데이터 결합)
  const statsData = useMemo(() => {
    // 백엔드 통계 데이터가 있으면 사용
    if (backendStats) {
      return {
        totalCount,
        ...backendStats
      };
    }
    
    // 백엔드 데이터가 없으면 현재 페이지 데이터로 계산 (임시 방법)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    return {
      totalCount,
      newLastWeekCount: cves.filter(cve => new Date(cve.createdAt) >= oneWeekAgo).length,
      highSeverityCount: cves.filter(cve => 
        cve.severity?.toLowerCase() === 'critical' || 
        cve.severity?.toLowerCase() === 'high'
      ).length,
      inProgressCount: cves.filter(cve => cve.status === '분석중').length,
      completedCount: cves.filter(cve => cve.status === '릴리즈 완료').length
    };
  }, [cves, totalCount, backendStats]);

  // 개선된 검색 핸들러 - 디바운스 및 유효성 검사 강화
  const handleSearchChange = useCallback((e) => {
    // 현재 입력값 설정
    const inputValue = e.target.value;
    setSearchInput(inputValue);
    
    // 이전 타이머 클리어
    clearTimeout(searchTimeoutRef.current);
    
    // 검색어가 너무 짧으면 검색하지 않음 (공백만 있는 경우 제외)
    const trimmedValue = inputValue.trim();
    
    // 검색 입력값 디버깅
    console.log('검색 입력 값:', inputValue, '정제된 값:', trimmedValue, '길이:', trimmedValue.length);
    
    // 디바운스 처리 - 입력 후 300ms 후에 검색 실행
    searchTimeoutRef.current = setTimeout(() => {
      // 검색어가 비어있거나 공백만 있는 경우
      if (trimmedValue === '' && searchQuery !== '') {
        console.log('검색어 초기화');
        setSearchQuery('');
        setPage(1);
        
        // 검색 초기화 시 캐시 무효화
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.CVE.list],
          refetchType: 'active'
        });
      } 
      // 검색어가 1글자 이상인 경우
      else if (trimmedValue.length >= 1 && trimmedValue !== searchQuery) {
        console.log('검색 쿼리 설정:', trimmedValue);
        // 쿼리 캐시 무효화 후 새 검색 실행
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.CVE.list],
          refetchType: 'active'
        });
        setSearchQuery(trimmedValue);
        setPage(1); // 페이지 초기화
      }
    }, 300);
  }, [searchQuery, queryClient]);

  // 검색 리셋 핸들러 개선
  const handleResetSearch = useCallback(() => {
    console.log('검색 초기화');
    setSearchInput('');
    setSearchQuery('');
    
    // 검색 초기화 시 캐시 무효화
    queryClient.invalidateQueries({
      queryKey: [QUERY_KEYS.CVE.list],
      refetchType: 'active'
    });
    
    setPage(1);
  }, [queryClient]);

  // 필터 핸들러들
  const handleStatusFilterChange = useCallback((e) => {
    setStatusFilter(e.target.value);
    setPage(1);
  }, []);

  const handleSeverityFilterChange = useCallback((e) => {
    setSeverityFilter(e.target.value);
    setPage(1);
  }, []);

  const handleSortOptionChange = useCallback((e) => {
    setSortOption(e.target.value);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((event, newPage) => {
    setPage(newPage + 1);
  }, []);

  const handleRowsPerPageChange = useCallback((event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(1);
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
      const cveId = cveToDelete.cveId;
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
    refetchCVEList();
  }, [handleCreateDialogClose, refetchCVEList]);

  return (
    <Box sx={{ width: '100%', px: { sm: 2, md: 3 } }}>
      {/* 상단 액션 버튼 추가 */}
      {renderActionButtons()}
      
      <StatisticsSection 
        statsData={statsData} 
        totalCVECount={totalCVECount} 
        theme={theme} 
      />

      {/* 필터 섹션 */}
      <FilterBar 
        searchInput={searchInput}
        statusFilter={statusFilter}
        severityFilter={severityFilter}
        sortOption={sortOption}
        handleSearchChange={handleSearchChange}
        handleStatusFilterChange={handleStatusFilterChange}
        handleSeverityFilterChange={handleSeverityFilterChange}
        handleSortOptionChange={handleSortOptionChange}
        handleRefresh={handleRefresh}
        theme={theme}
      />

      {isLoading ? (
        <CVETableSkeleton />
      ) : isError ? (
        <ErrorDisplay error={queryError} onRetry={handleRefresh} />
      ) : (
        <>
          {cves.length === 0 ? (
            <EmptyStateDisplay 
              searchQuery={searchQuery} 
              onResetSearch={handleResetSearch}
              isFiltered={!!statusFilter || !!severityFilter || !!searchQuery}
            />
          ) : (
            <CVETable 
              cves={cves} 
              isLoading={isLoading} 
              page={page} 
              totalCVECount={totalCount}
              rowsPerPage={rowsPerPage}
              onPageChange={handlePageChange}
              onRowsPerPageChange={handleRowsPerPageChange}
              onCVEClick={handleCVEClick}
              theme={theme}
              sortOption={sortOption}
              searchQuery={searchQuery}
              onResetSearch={handleResetSearch}
              onDeleteClick={handleDeleteClick}
            />
          )}
        </>
      )}

      {/* 다이얼로그 컴포넌트들 */}
      <CreateCVE open={createDialogOpen} onSuccess={handleCVECreated} onClose={handleCreateDialogClose} />

      {/* 상세보기 모달 */}
      {selectedCVE && (
        <CVEDetailWrapper
          cveId={selectedCVE.cveId}
          open={detailOpen}
          onClose={handleDetailClose}
        />
      )}

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
