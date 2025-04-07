import React from 'react';
import { Box } from '@mui/material';
import { TabPanelProps } from '../types/cve';

/**
 * 탭 패널 컴포넌트 - 선택된 탭의 내용을 표시합니다.
 *
 * @param children 탭 패널에 표시할 내용
 * @param value 현재 선택된 탭 인덱스
 * @param index 이 패널의 인덱스
 * @param other 기타 props
 */
const TabPanel: React.FC<TabPanelProps> = ({ children, value, index, ...other }) => {
  if (value !== index) return null;  // 선택되지 않은 탭은 렌더링하지 않음

  return (
    <Box
      role="tabpanel"
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        '&::-webkit-scrollbar': {
          width: '8px',
          backgroundColor: 'transparent'
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: 'rgba(0, 0, 0, 0.1)',
          borderRadius: '4px',
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.2)'
          }
        }
      }}
      {...other}
    >
      <Box sx={{ p: 3 }}>
        {children}
      </Box>
    </Box>
  );
};

export default TabPanel;
