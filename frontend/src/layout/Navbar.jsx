import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AppBar,
  Box,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Tooltip
} from '@mui/material';
import { Menu as MenuIcon, ExitToApp as LogoutIcon } from '@mui/icons-material';
import api from 'shared/api/config/axios';
import NotificationBell from './NotificationBell';
import { clearAuthStorage } from 'shared/utils/utils/storage/tokenStorage';

const Navbar = memo(() => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      // 백엔드 로그아웃 API 호출
      await api.post('/auth/logout');
      
      // 모든 인증 관련 데이터 제거
      clearAuthStorage();
      
      // 로그인 페이지로 리다이렉트
      navigate('/login', { 
        state: { message: 'Successfully logged out' }
      });
    } catch (error) {
      console.error('Logout error:', error);
      // 에러가 발생하더라도 인증 데이터는 클리어하고 로그인 페이지로 이동
      clearAuthStorage();
      navigate('/login');
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton
            size="large"
            edge="start"
            color="inherit"
            aria-label="menu"
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            CVE Hub
          </Typography>

          <Button
            color="inherit"
            onClick={() => navigate('/cves')}
          >
            CVE List
          </Button>
          
          <Button
            color="inherit"
            onClick={() => navigate('/create-cve')}
          >
            Create CVE
          </Button>

          <NotificationBell />

          <Tooltip title="Logout">
            <IconButton
              color="inherit"
              onClick={handleLogout}
              edge="end"
            >
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
    </Box>
  );
});

// displayName 추가
Navbar.displayName = 'Navbar';

export default Navbar;
