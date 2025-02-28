import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import PropTypes from 'prop-types';

/**
 * CVE 심각도를 표시하는 칩 컴포넌트
 * @param {string} severity - 심각도 (critical, high, medium, low)
 * @returns {JSX.Element} 심각도 표시 Chip 컴포넌트
 */
const SeverityChip = ({ severity }) => {
  // 심각도 레벨에 따른 설정
  const severityConfig = {
    critical: {
      color: '#7b1fa2', // 보라색
      backgroundColor: '#f3e5f5',
      label: '심각',
      tooltip: '심각한 수준의 취약점입니다. 즉시 조치가 필요합니다.'
    },
    high: {
      color: '#c62828', // 빨간색
      backgroundColor: '#ffebee',
      label: '높음',
      tooltip: '높은 수준의 취약점입니다. 빠른 조치가 필요합니다.'
    },
    medium: {
      color: '#ef6c00', // 주황색
      backgroundColor: '#fff3e0',
      label: '중간',
      tooltip: '중간 수준의 취약점입니다. 계획적인 조치가 필요합니다.'
    },
    low: {
      color: '#2e7d32', // 초록색
      backgroundColor: '#e8f5e9',
      label: '낮음',
      tooltip: '낮은 수준의 취약점입니다. 일반적인 관리 체계 내에서 처리 가능합니다.'
    },
    unknown: {
      color: '#546e7a', // 회색
      backgroundColor: '#eceff1',
      label: '알 수 없음',
      tooltip: '심각도가 정의되지 않았거나 알 수 없는 수준입니다.'
    }
  };

  // 심각도 값이 없거나 유효하지 않은 경우 'unknown' 사용
  const normalizedSeverity = (severity && severityConfig[severity.toLowerCase()]) 
    ? severity.toLowerCase() 
    : 'unknown';
  
  const config = severityConfig[normalizedSeverity];

  return (
    <Tooltip title={config.tooltip} arrow placement="top">
      <Chip
        label={config.label}
        size="small"
        sx={{
          color: config.color,
          backgroundColor: config.backgroundColor,
          fontWeight: 'bold',
          borderRadius: '4px',
          minWidth: '60px',
          '& .MuiChip-label': {
            padding: '0 8px',
          }
        }}
      />
    </Tooltip>
  );
};

SeverityChip.propTypes = {
  severity: PropTypes.string
};

SeverityChip.defaultProps = {
  severity: 'unknown'
};

export default SeverityChip; 