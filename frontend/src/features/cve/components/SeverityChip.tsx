import React from 'react';
import { Chip, Tooltip, Theme, useTheme } from '@mui/material';
import { alpha } from '@mui/system';
import { SeverityChipProps } from '../types/cve';

// 심각도 타입 정의
type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

// 심각도 설정 인터페이스
interface SeverityConfig {
  color: string;
  backgroundColor: string;
  label: string;
  tooltip: string;
}

/**
 * CVE 심각도를 표시하는 칩 컴포넌트
 * @param {string} severity - 심각도 (critical, high, medium, low)
 * @returns {JSX.Element} 심각도 표시 Chip 컴포넌트
 */
const SeverityChip: React.FC<SeverityChipProps> = ({
  severity = 'unknown',
}) => {
  // 심각도 레벨에 따른 설정
  const severityConfig: Record<SeverityLevel, SeverityConfig> = {
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
  const normalizedSeverity = (severity && severity.toLowerCase() in severityConfig) 
    ? severity.toLowerCase() as SeverityLevel 
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

// React 18에서는 defaultProps 대신 함수 매개변수 기본값 사용

export default SeverityChip;