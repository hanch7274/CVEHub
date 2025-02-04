import React from 'react';
import { Box } from '@mui/material';

const TabPanel = ({ children, value, index, ...other }) => {
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
