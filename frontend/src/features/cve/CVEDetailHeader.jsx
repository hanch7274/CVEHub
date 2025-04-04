import React, { memo } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Tooltip,
  Chip,
  IconButton,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import SubscriberCount from './SubscriberCount'; // SubscriberCount 컴포넌트 경로 가정
import { formatDateTime, DATE_FORMATS } from 'shared/utils/dateUtils'; // 유틸리티 경로 가정

const CVEDetailHeader = memo(({
  cveId,
  subscribers,
  createdAt,
  lastModifiedAt,
  isCached,
  isLoading,
  onRefresh,
  onClose,
}) => {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      {/* 좌측: CVE ID, 구독자 수 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="h6">{cveId} 상세 정보</Typography>
        <SubscriberCount subscribers={subscribers} />
      </Box>

      {/* 우측: 시간 정보, 캐시 상태, 버튼 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* 생성 시간 */}
        <Tooltip title="생성 시간">
          <Chip
            size="small"
            icon={<HistoryIcon fontSize="small" />}
            label={`생성: ${formatDateTime(createdAt, DATE_FORMATS.DISPLAY.DEFAULT)}`}
            variant="outlined"
            sx={{ fontSize: '0.7rem', height: 24 }}
          />
        </Tooltip>

        {/* 마지막 수정 시간 */}
        <Tooltip title="마지막 업데이트 시간">
          <Chip
            size="small"
            icon={<HistoryIcon fontSize="small" />}
            label={`수정: ${formatDateTime(lastModifiedAt, DATE_FORMATS.DISPLAY.DEFAULT)}`}
            variant="outlined"
            sx={{ fontSize: '0.7rem', height: 24 }}
          />
        </Tooltip>

        {/* 캐시 상태 */}
        {isCached && (
          <Tooltip title="캐시된 데이터입니다. 새로고침을 클릭하여 최신 데이터를 불러올 수 있습니다.">
            <Chip
              size="small"
              label="캐시됨"
              color="warning"
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: 24 }}
            />
          </Tooltip>
        )}

        {/* 새로고침 버튼 */}
        <Tooltip title="새로고침">
          <span> {/* IconButton을 Tooltip으로 직접 감쌀 때 발생하는 이슈 방지 */}
            <IconButton onClick={onRefresh} disabled={isLoading}>
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>

        {/* 닫기 버튼 */}
        <Tooltip title="닫기">
          <span> {/* IconButton을 Tooltip으로 직접 감쌀 때 발생하는 이슈 방지 */}
            <IconButton onClick={onClose} disabled={isLoading}>
              <CloseIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
});

CVEDetailHeader.propTypes = {
  cveId: PropTypes.string,
  subscribers: PropTypes.array,
  createdAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
  lastModifiedAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
  isCached: PropTypes.bool,
  isLoading: PropTypes.bool,
  onRefresh: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default CVEDetailHeader;