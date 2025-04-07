// CVEDetailHeader.tsx

import React, { memo } from 'react';
// PropTypes는 더 이상 필요 없으므로 제거합니다.
// import PropTypes from 'prop-types';
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
// SubscriberCount 컴포넌트 import (확장자 없이 또는 .tsx)
import SubscriberCount from './SubscriberCount';
// 유틸리티 함수 및 상수 import (타입 정의가 되어 있다고 가정)
import { formatDateTime, DATE_FORMATS } from 'shared/utils/dateUtils';
// Subscriber 타입 import
import { Subscriber, CVEDetailHeaderProps } from './types/cve';

// Props 인터페이스는 types/cve.ts에서 import 했으므로 중복 정의 제거

// React.memo와 함께 타입 적용 (React.FC 사용하지 않는 방식 선호)
const CVEDetailHeader = memo((props: CVEDetailHeaderProps) => {
  const {
    cveId,
    subscribers,
    createdAt,
    lastModifiedAt,
    isCached,
    isLoading,
    onRefresh,
    onClose,
  } = props;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      {/* 좌측: CVE ID, 구독자 수 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* cveId가 있을 때만 표시 (optional이므로) */}
        <Typography variant="h6">{cveId ? `${cveId} 상세 정보` : '상세 정보'}</Typography>
        {/* SubscriberCount에는 subscribers와 cveId 전달 */}
        {/* subscribers가 undefined일 수 있으므로 빈 배열([]) 전달 */}
        <SubscriberCount subscribers={subscribers || []} cveId={cveId} />
      </Box>

      {/* 우측: 시간 정보, 캐시 상태, 버튼 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* 생성 시간 (createdAt이 있을 때만 렌더링 또는 formatDateTime이 null/undefined 처리 가능해야 함) */}
        {createdAt && (
          <Tooltip title="생성 시간">
            <Chip
              size="small"
              icon={<HistoryIcon fontSize="small" />}
              // formatDateTime이 null/undefined를 안전하게 처리한다고 가정
              label={`생성: ${formatDateTime(createdAt, DATE_FORMATS.DISPLAY.DEFAULT)}`}
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: 24 }}
            />
          </Tooltip>
        )}

        {/* 마지막 수정 시간 (lastModifiedAt이 있을 때만 렌더링) */}
        {lastModifiedAt && (
          <Tooltip title="마지막 업데이트 시간">
            <Chip
              size="small"
              icon={<HistoryIcon fontSize="small" />}
              label={`수정: ${formatDateTime(lastModifiedAt, DATE_FORMATS.DISPLAY.DEFAULT)}`}
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: 24 }}
            />
          </Tooltip>
        )}

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
          <span> {/* Tooltip과 disabled 버튼 호환성 위한 span */}
            <IconButton onClick={onRefresh} disabled={isLoading}>
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>

        {/* 닫기 버튼 */}
        <Tooltip title="닫기">
          <span> {/* Tooltip과 disabled 버튼 호환성 위한 span */}
            <IconButton onClick={onClose} disabled={isLoading}>
              <CloseIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
});

// DisplayName 설정 (React DevTools에서 컴포넌트 이름 식별 용이)
CVEDetailHeader.displayName = 'CVEDetailHeader';

// PropTypes 정의는 제거합니다.

export default CVEDetailHeader;