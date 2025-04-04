import React from 'react';
import { 
  Box, 
  Typography, 
  CircularProgress, 
  Pagination, 
  Alert,
  Skeleton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  useMediaQuery,
  useTheme
} from '@mui/material';
import ActivityItem from './ActivityItem';

/**
 * 스켈레톤 로딩 컴포넌트
 * 
 * @returns {JSX.Element} 스켈레톤 UI
 */
const ActivitySkeleton = () => {
  const theme = useTheme();
  // PC 환경에 최적화
  
  return (
    <Box sx={{ 
      mb: 2, 
      p: 2, 
      borderRadius: 1, 
      border: `1px solid ${theme.palette.divider}`,
      borderLeft: `3px solid ${theme.palette.grey[400]}`
    }}>
      <Box display="flex" flexDirection="row" justifyContent="space-between" alignItems="center">
        <Box display="flex" alignItems="center" width="100%">
          <Skeleton variant="circular" width={24} height={24} sx={{ mr: 1 }} />
          <Skeleton variant="text" width="40%" height={24} />
        </Box>
        <Skeleton variant="text" width={100} />
      </Box>
      
      {/* PC 환경에서는 필요 없는 모바일 코드 제거 */}
      
      <Box mt={2}>
        <Skeleton variant="rectangular" width="100%" height={40} sx={{ borderRadius: 1 }} />
      </Box>
    </Box>
  );
};

/**
 * 개선된 활동 목록 컴포넌트
 * - 스켈레톤 로딩 UI 적용
 * - 페이지네이션 및 표시 개수 컨트롤 개선
 * - 성능 최적화
 * 
 * @param {Object} props 컴포넌트 속성
 * @param {Array} props.activities 활동 목록 데이터
 * @param {number} props.total 전체 항목 수
 * @param {boolean} props.isLoading 로딩 상태
 * @param {Object} props.error 에러 객체
 * @param {number} props.page 현재 페이지
 * @param {number} props.limit 페이지당 항목 수
 * @param {Function} props.onPageChange 페이지 변경 핸들러
 * @param {Function} props.onLimitChange 표시 개수 변경 핸들러
 * @returns {JSX.Element} 렌더링된 컴포넌트
 */
const ActivityList = ({ 
  activities = [], 
  total = 0,
  isLoading = false, 
  error = null, 
  page = 1, 
  limit = 10, 
  onPageChange,
  onLimitChange
}) => {
  const theme = useTheme();
  // PC 환경에 최적화
  
  // 총 페이지 수 계산
  const totalPages = Math.max(1, Math.ceil(total / limit));
  
  // 에러 표시
  if (error) {
    // 에러 메시지 추출 (객체인 경우 message 속성 사용, 아니면 문자열로 변환)
    const errorMessage = typeof error === 'object' ? 
      (error.message || JSON.stringify(error)) : 
      String(error);
      
    return (
      <Alert 
        severity="error" 
        sx={{ 
          mb: 2,
          borderRadius: 1,
          '& .MuiAlert-message': { width: '100%' }
        }}
      >
        <Typography variant="body2">
          활동 내역을 불러오는 중 오류가 발생했습니다
        </Typography>
        <Typography variant="caption" component="pre" sx={{ 
          mt: 1, 
          p: 1, 
          bgcolor: 'rgba(0, 0, 0, 0.04)', 
          borderRadius: 1,
          overflow: 'auto',
          maxHeight: '100px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {errorMessage}
        </Typography>
      </Alert>
    );
  }

  // 로딩 중 스켈레톤 UI 표시
  if (isLoading) {
    return (
      <>
        {[...Array(Math.min(limit, 5))].map((_, index) => (
          <ActivitySkeleton key={index} />
        ))}
      </>
    );
  }

  // 데이터가 없을 경우
  if (!activities || activities.length === 0) {
    return (
      <Box 
        display="flex" 
        flexDirection="column"
        justifyContent="center" 
        alignItems="center" 
        height="200px"
        bgcolor="background.paper"
        borderRadius={1}
        p={3}
        border={`1px dashed ${theme.palette.divider}`}
      >
        <Typography variant="body1" color="text.secondary" gutterBottom>
          표시할 활동 내역이 없습니다
        </Typography>
        <Typography variant="caption" color="text.secondary">
          다른 필터 조건을 적용해보세요
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* 활동 목록 - 항상 고유한 키 보장 (인덱스를 항상 포함) */}
      {activities.map((activity, index) => (
        <ActivityItem 
          key={activity?.id ? `item-${activity.id}-${index}` : `activity-${index}`} 
          activity={activity} 
        />
      ))}

      {/* 페이지네이션 및 표시 개수 컨트롤 */}
      {total > 0 && (
        <Box 
          sx={{ 
            mt: 3, 
            display: 'flex', 
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', order: 1 }}>
            <Typography variant="body2" color="text.secondary" mr={2}>
              총 {total}개 항목
            </Typography>
            
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <Select
                value={limit}
                onChange={(e) => onLimitChange(e.target.value)}
                displayEmpty
                variant="outlined"
              >
                <MenuItem value={5}>5개씩</MenuItem>
                <MenuItem value={10}>10개씩</MenuItem>
                <MenuItem value={20}>20개씩</MenuItem>
                <MenuItem value={50}>50개씩</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {totalPages > 1 && (
            <Stack 
              direction="row" 
              spacing={2} 
              justifyContent="center"
              order={2}
              width="auto"
            >
              <Pagination 
                count={totalPages} 
                page={page} 
                onChange={(event, value) => onPageChange(value)}
                color="primary"
                size="medium"
                showFirstButton={true}
                showLastButton={true}
                siblingCount={1}
              />
            </Stack>
          )}
        </Box>
      )}
    </Box>
  );
};

export default React.memo(ActivityList);