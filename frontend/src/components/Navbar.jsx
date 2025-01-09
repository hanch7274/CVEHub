import React from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
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

const Navbar = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      // 백엔드 로그아웃 API 호출
      await axios.post('/api/logout');
      
      // 로컬 스토리지에서 인증 정보 삭제
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // 로그인 페이지로 리다이렉트
      navigate('/login', { 
        state: { message: 'Successfully logged out' }
      });
    } catch (error) {
      console.error('Logout error:', error);
      // 에러가 발생하더라도 로컬 스토리지는 클리어하고 로그인 페이지로 이동
      localStorage.removeItem('token');
      localStorage.removeItem('user');
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
};

export default Navbar;
