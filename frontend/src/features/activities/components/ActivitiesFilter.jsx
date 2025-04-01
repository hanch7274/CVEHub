import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, 
  Grid, 
  TextField, 
  InputAdornment,
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  Button,
  Chip,
  Stack,
  Typography,
  Paper,
  Divider,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
  CircularProgress,
  Collapse,
  Autocomplete,
  Fade
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import PersonIcon from '@mui/icons-material/Person';
import PublicIcon from '@mui/icons-material/Public';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import DateRangeIcon from '@mui/icons-material/DateRange';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SearchIcon from '@mui/icons-material/Search';
import CategoryIcon from '@mui/icons-material/Category';
import TargetIcon from '@mui/icons-material/Adjust';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ko } from 'date-fns/locale';
import { format, subDays, subMonths } from 'date-fns';
import { useAuth } from 'features/auth/contexts/AuthContext';
import { useUsers } from 'features/auth/hooks/useUsersQuery';

// 동작 유형 목록 (간소화됨)
const actionOptions = [
  { value: 'create', label: '생성' },
  { value: 'update', label: '수정' },
  { value: 'add', label: '추가' },
  { value: 'delete', label: '삭제' }
];

// 대상 유형 목록
const targetTypeOptions = [
  { value: 'cve', label: 'CVE' },
  { value: 'poc', label: 'PoC' },
  { value: 'snort_rule', label: 'Snort 규칙' },
  { value: 'reference', label: '참조문서' },
  { value: 'comment', label: '댓글' },
  { value: 'user', label: '사용자' },
  { value: 'system', label: '시스템' }
];

/**
 * 개선된 활동 필터링 컴포넌트
 * - 직관적인 UI로 간소화
 * - 모바일 대응 강화
 * - 통합 검색바 추가
 * 
 * @param {Object} props 컴포넌트 속성
 * @param {Object} props.filters 현재 필터 값
 * @param {Function} props.onFilterChange 필터 변경 핸들러
 * @param {Function} props.onFilterApply 필터 적용 핸들러
 * @param {Function} props.onFilterReset 필터 초기화 핸들러
 * @returns {JSX.Element} 렌더링된 컴포넌트
 */
const ActivitiesFilter = ({ filters, onFilterChange, onFilterApply, onFilterReset }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();
  const currentUsername = user?.username || '';
  
  // 사용자 목록 가져오기
  const { data: usersData, isLoading: isLoadingUsers } = useUsers();
  const users = usersData?.items || [];
  
  // 적용된 필터 개수 계산
  const appliedFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.target_type && filters.target_type.length > 0) count += filters.target_type.length;
    if (filters.target_id) count++;
    if (filters.action && filters.action.length > 0) count += filters.action.length;
    if (filters.start_date) count++;
    if (filters.end_date) count++;
    if (filters.username && filters.username !== currentUsername) count++;
    return count;
  }, [filters, currentUsername]);

  // 검색어 적용 (target_id나 대상 검색에 활용)
  useEffect(() => {
    if (searchTerm.trim()) {
      // 검색어가 CVE 형식인지 확인 (CVE-YYYY-NNNNN)
      if (/^CVE-\d{4}-\d{4,}$/i.test(searchTerm.trim())) {
        onFilterChange({
          ...filters,
          target_type: 'cve',
          target_id: searchTerm.trim()
        });
      } else {
        onFilterChange({
          ...filters,
          target_id: searchTerm.trim()
        });
      }
    } else if (filters.target_id && !searchTerm) {
      // 검색어가 지워졌을 때 target_id 필터 제거
      onFilterChange({
        ...filters,
        target_id: ''
      });
    }
  }, [searchTerm]);

  // 필터 변경 핸들러 (즉시 적용)
  const handleQuickFilterChange = (field, value) => {
    let newValue = value;
    
    // 배열 필드 처리 (동작 유형, 대상 유형)
    if (field === 'action' || field === 'target_type') {
      if (Array.isArray(filters[field])) {
        // 이미 값이 있는지 확인
        const index = filters[field].indexOf(value);
        
        if (index === -1) {
          // 값이 없으면 추가
          newValue = [...filters[field], value];
        } else {
          // 값이 있으면 제거
          newValue = filters[field].filter(item => item !== value);
        }
      } else {
        // 배열이 아닌 경우 배열로 변환
        newValue = [value];
      }
    }
    
    const newFilters = {
      ...filters,
      [field]: newValue
    };
    onFilterChange(newFilters);
    onFilterApply();
  };

  // 필터 변경 핸들러 (적용 버튼 필요)
  const handleAdvancedFilterChange = (field, value) => {
    onFilterChange({
      ...filters,
      [field]: value
    });
  };

  // 폼 제출 핸들러
  const handleSubmit = (e) => {
    e.preventDefault();
    onFilterApply();
  };

  // 날짜 형식 포맷팅
  const formatDateForDisplay = (date) => {
    if (!date) return '';
    return format(new Date(date), 'yyyy-MM-dd');
  };
  
  // 현재 날짜
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // 기간 텍스트 계산
  const getPeriodText = () => {
    if (!filters.start_date || !filters.end_date) {
      return null;
    }
    
    const start = new Date(filters.start_date);
    const end = new Date(filters.end_date);
    
    // 오늘인지 확인
    const isToday = (date) => {
      const today = new Date();
      return date.getDate() === today.getDate() && 
             date.getMonth() === today.getMonth() && 
             date.getFullYear() === today.getFullYear();
    };
    
    // 오늘 필터 확인
    if (start.getDate() === end.getDate() && 
        start.getMonth() === end.getMonth() && 
        start.getFullYear() === end.getFullYear() && 
        isToday(end)) {
      return "오늘";
    }
    
    // 최근 7일 필터 확인
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    
    if (Math.abs(start.getTime() - sevenDaysAgo.getTime()) < 86400000 && isToday(end)) {
      return "최근 7일";
    }
    
    // 최근 30일 필터 확인
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    
    if (Math.abs(start.getTime() - thirtyDaysAgo.getTime()) < 86400000 && isToday(end)) {
      return "최근 30일";
    }
    
    // 사용자 지정 기간
    return `${formatDateForDisplay(start)} ~ ${formatDateForDisplay(end)}`;
  };

  // 빠른 필터 설정 함수들
  const handleSetToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    
    // 두 필터를 한번에 변경하고 한번만 API 호출하도록
    onFilterChange({
      ...filters,
      start_date: today,
      end_date: endOfDay
    });
    onFilterApply();
  };

  const handleSetLastWeek = () => {
    const oneWeekAgo = subDays(new Date(), 7);
    oneWeekAgo.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    
    onFilterChange({
      ...filters,
      start_date: oneWeekAgo,
      end_date: endOfDay
    });
    onFilterApply();
  };

  const handleSetLastMonth = () => {
    const oneMonthAgo = subMonths(new Date(), 1);
    oneMonthAgo.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    
    onFilterChange({
      ...filters,
      start_date: oneMonthAgo,
      end_date: endOfDay
    });
    onFilterApply();
  };

  const handleSetMyActivities = () => {
    handleQuickFilterChange('username', currentUsername);
  };

  const handleSetAllActivities = () => {
    handleQuickFilterChange('username', '');
  };

  // 현재 적용된 필터 칩 렌더링
  const renderFilterChips = () => {
    const chips = [];

    if (filters.action && filters.action.length > 0) {
      filters.action.forEach(actionValue => {
        const actionLabel = actionOptions.find(opt => opt.value === actionValue)?.label || actionValue;
        chips.push(
          <Chip
            key={`action-${actionValue}`}
            label={`동작: ${actionLabel}`}
            onDelete={() => {
              const newActions = filters.action.filter(a => a !== actionValue);
              handleQuickFilterChange('action', actionValue); // 토글 방식으로 제거
            }}
            color="primary"
            size="small"
          />
        );
      });
    }

    if (filters.target_type && filters.target_type.length > 0) {
      filters.target_type.forEach(typeValue => {
        const targetTypeLabel = targetTypeOptions.find(opt => opt.value === typeValue)?.label || typeValue;
        chips.push(
          <Chip
            key={`target_type-${typeValue}`}
            label={`대상 유형: ${targetTypeLabel}`}
            onDelete={() => {
              handleQuickFilterChange('target_type', typeValue); // 토글 방식으로 제거
            }}
            color="primary"
            size="small"
          />
        );
      });
    }

    if (filters.target_id) {
      chips.push(
        <Chip
          key="target_id"
          label={`대상 ID: ${filters.target_id}`}
          onDelete={() => {
            handleQuickFilterChange('target_id', '');
            setSearchTerm('');
          }}
          color="primary"
          size="small"
        />
      );
    }

    // 시작일과 종료일 필터 칩 (기간으로 통합)
    const periodText = getPeriodText();
    if (periodText) {
      chips.push(
        <Chip
          key="period"
          label={`기간: ${periodText}`}
          onDelete={() => {
            handleQuickFilterChange('start_date', null);
            handleQuickFilterChange('end_date', null);
          }}
          color="primary"
          size="small"
        />
      );
    } else {
      // 시작일, 종료일이 개별적으로 설정된 경우 (기간이 아닌 경우)
      if (filters.start_date) {
        chips.push(
          <Chip
            key="start_date"
            label={`시작일: ${formatDateForDisplay(filters.start_date)}`}
            onDelete={() => handleQuickFilterChange('start_date', null)}
            color="primary"
            size="small"
          />
        );
      }

      if (filters.end_date) {
        chips.push(
          <Chip
            key="end_date"
            label={`종료일: ${formatDateForDisplay(filters.end_date)}`}
            onDelete={() => handleQuickFilterChange('end_date', null)}
            color="primary"
            size="small"
          />
        );
      }
    }

    return chips;
  };

  // 버튼 활성화 상태 확인
  const isMyActivitiesActive = filters.username === currentUsername;
  const isAllActivitiesActive = !filters.username;

  return (
    <Paper sx={{ p: { xs: 1.5, sm: 2 } }} elevation={1}>
      {/* 헤더 영역 */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6" component="h2" sx={{ display: 'flex', alignItems: 'center' }}>
          <FilterListIcon sx={{ mr: 1 }} />
          필터
          {appliedFiltersCount > 0 && (
            <Chip
              label={appliedFiltersCount}
              color="primary"
              size="small"
              sx={{ ml: 1 }}
            />
          )}
        </Typography>
        
        {/* 필터 초기화 버튼 */}
        <Box>
          {appliedFiltersCount > 0 && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<ClearIcon />}
              onClick={onFilterReset}
            >
              초기화
            </Button>
          )}
        </Box>
      </Box>

      {/* 통합 검색바 */}
      <TextField
        fullWidth
        placeholder="CVE-2023-1234와 같은 대상 ID 또는 키워드 검색"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        size="small"
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
          endAdornment: searchTerm && (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setSearchTerm('')}>
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          )
        }}
        onKeyPress={(e) => e.key === 'Enter' && onFilterApply()}
      />

      {/* 빠른 필터 버튼 그룹 */}
      <Box sx={{ mb: 2 }}>
        <Grid container spacing={1}>
          {/* 사용자 필터 그룹 */}
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <PersonIcon fontSize="small" sx={{ mr: 0.5 }} />
              <Typography variant="body2" color="text.secondary">사용자</Typography>
            </Box>
            <Stack 
              direction="row" 
              spacing={1} 
              sx={{ 
                flexWrap: 'wrap', 
                gap: 1,
                '& > button': { mb: isMobile ? 1 : 0 }
              }}
            >
              <Button 
                size="small" 
                variant={isMyActivitiesActive ? "contained" : "outlined"}
                onClick={handleSetMyActivities}
                sx={{ minWidth: 0, px: 1.5 }}
              >
                내 활동
              </Button>
              <Button 
                size="small" 
                variant={isAllActivitiesActive ? "contained" : "outlined"}
                onClick={handleSetAllActivities}
                sx={{ minWidth: 0, px: 1.5 }}
              >
                모든 활동
              </Button>
              {!isMobile && (
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <Select
                    value={filters.username || ''}
                    onChange={(e) => handleQuickFilterChange('username', e.target.value)}
                    displayEmpty
                    renderValue={(selected) => {
                      if (!selected) return "사용자 선택";
                      
                      if (selected === currentUsername) {
                        return "내 활동";
                      }
                      
                      if (selected === 'system') {
                        return "시스템";
                      }
                      
                      const selectedUser = users.find(u => u.username === selected);
                      return selectedUser ? (selectedUser.display_name || selectedUser.username) : selected;
                    }}
                    sx={{ height: 32 }}
                  >
                    <MenuItem value="">모든 사용자</MenuItem>
                    <MenuItem value={currentUsername}>내 활동</MenuItem>
                    <MenuItem value="system">시스템</MenuItem>
                    {users
                      .filter(u => u.username !== currentUsername && u.username !== 'system')
                      .map((user) => (
                        <MenuItem key={user.id} value={user.username}>
                          {user.display_name || user.username}
                        </MenuItem>
                      ))
                    }
                  </Select>
                </FormControl>
              )}
            </Stack>
          </Grid>

          {/* 기간 필터 그룹 */}
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <CalendarTodayIcon fontSize="small" sx={{ mr: 0.5 }} />
              <Typography variant="body2" color="text.secondary">기간</Typography>
            </Box>
            <Stack 
              direction="row" 
              spacing={1} 
              sx={{ 
                flexWrap: 'wrap', 
                gap: 1,
                '& > button': { mb: isMobile ? 1 : 0 }
              }}
            >
              <Button 
                size="small" 
                variant="outlined"
                onClick={handleSetToday}
                sx={{ minWidth: 0, px: 1.5 }}
              >
                오늘
              </Button>
              <Button 
                size="small" 
                variant="outlined"
                onClick={handleSetLastWeek}
                sx={{ minWidth: 0, px: 1.5 }}
              >
                최근 7일
              </Button>
              <Button 
                size="small" 
                variant="outlined"
                onClick={handleSetLastMonth}
                sx={{ minWidth: 0, px: 1.5 }}
              >
                최근 30일
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Box>
      
      {/* 타입 필터 - 위치 변경 및 동작 유형 버튼으로 변경 */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6}>
          <FormControl size="small" fullWidth>
            <InputLabel id="target-type-label">대상 유형</InputLabel>
            <Select
              labelId="target-type-label"
              multiple
              value={filters.target_type || []}
              onChange={(e) => onFilterChange({
                ...filters,
                target_type: e.target.value
              })}
              onClose={() => onFilterApply()}
              label="대상 유형"
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => {
                    const label = targetTypeOptions.find(opt => opt.value === value)?.label || value;
                    return (
                      <Chip key={value} label={label} size="small" />
                    );
                  })}
                </Box>
              )}
            >
              {targetTypeOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">동작 유형</Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button 
                size="small" 
                variant={(filters.action.length === 0) ? "contained" : "outlined"}
                onClick={() => onFilterChange({
                  ...filters,
                  action: []
                })}
                sx={{ minWidth: 0, px: 1.5 }}
              >
                전체
              </Button>
              {actionOptions.map((option) => (
                <Button 
                  key={option.value}
                  size="small" 
                  variant={filters.action.includes(option.value) ? "contained" : "outlined"}
                  onClick={() => handleQuickFilterChange('action', option.value)}
                  sx={{ minWidth: 0, px: 1.5 }}
                >
                  {option.label}
                </Button>
              ))}
            </Stack>
          </Box>
        </Grid>
      </Grid>

      {/* 현재 적용된 필터 칩 표시 */}
      {appliedFiltersCount > 0 && (
        <Fade in={appliedFiltersCount > 0}>
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Typography variant="body2" color="text.secondary" gutterBottom>
              적용된 필터
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.5 }}>
              {renderFilterChips()}
            </Stack>
          </Box>
        </Fade>
      )}

      {/* 고급 필터 토글 버튼 */}
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
        <Button
          size="small"
          onClick={() => setShowAdvanced(!showAdvanced)}
          endIcon={<ExpandMoreIcon sx={{ 
            transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s'
          }} />}
          sx={{ textTransform: 'none' }}
        >
          {showAdvanced ? '고급 필터 닫기' : '고급 필터 열기'}
        </Button>
      </Box>

      {/* 고급 필터 패널 */}
      <Collapse in={showAdvanced}>
        <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ko}>
            <form onSubmit={handleSubmit}>
              <Grid container spacing={2}>
                {/* 날짜 필터 */}
                <Grid item xs={12} sm={6}>
                  <DatePicker
                    label="시작일"
                    value={filters.start_date ? new Date(filters.start_date) : null}
                    onChange={(date) => handleAdvancedFilterChange('start_date', date)}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <DatePicker
                    label="종료일"
                    value={filters.end_date ? new Date(filters.end_date) : null}
                    onChange={(date) => handleAdvancedFilterChange('end_date', date)}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                </Grid>
                
                {/* 모바일에서만 표시되는 사용자 선택 */}
                {isMobile && (
                  <Grid item xs={12}>
                    <Autocomplete
                      options={[
                        { username: '', display_name: '모든 사용자' },
                        { username: currentUsername, display_name: '내 활동' },
                        { username: 'system', display_name: '시스템' },
                        ...users.filter(u => u.username !== currentUsername && u.username !== 'system')
                      ]}
                      getOptionLabel={(option) => 
                        option.display_name || option.username
                      }
                      value={
                        filters.username === '' 
                          ? { username: '', display_name: '모든 사용자' }
                          : filters.username === currentUsername
                            ? { username: currentUsername, display_name: '내 활동' }
                            : filters.username === 'system'
                              ? { username: 'system', display_name: '시스템' }
                              : users.find(u => u.username === filters.username) || { username: filters.username, display_name: filters.username }
                      }
                      onChange={(event, newValue) => {
                        handleAdvancedFilterChange('username', newValue ? newValue.username : '');
                      }}
                      renderInput={(params) => (
                        <TextField {...params} label="사용자 선택" size="small" />
                      )}
                      loading={isLoadingUsers}
                      loadingText="사용자 목록 로딩 중..."
                    />
                  </Grid>
                )}

                <Grid item xs={12}>
                  <Box display="flex" justifyContent="flex-end" gap={1}>
                    <Button
                      variant="text"
                      color="inherit"
                      onClick={onFilterReset}
                      size="small"
                    >
                      초기화
                    </Button>
                    <Button
                      variant="contained"
                      color="primary"
                      type="submit"
                      size="small"
                    >
                      필터 적용
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </form>
          </LocalizationProvider>
        </Box>
      </Collapse>
    </Paper>
  );
};

export default React.memo(ActivitiesFilter);