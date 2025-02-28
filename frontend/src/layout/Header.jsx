import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  Box,
  Tooltip,
  Divider,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import SignalWifiStatusbar4BarIcon from '@mui/icons-material/SignalWifiStatusbar4Bar';
import SignalWifiConnectedNoInternet4Icon from '@mui/icons-material/SignalWifiConnectedNoInternet4';
import Wifi1BarIcon from '@mui/icons-material/Wifi1Bar';
import { useAuth } from '../contexts/AuthContext';
import { getAnimalEmoji } from '../utils/avatarUtils';
import NotificationBell from '../features/notification/NotificationBell';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { useDispatch } from 'react-redux';
import { logout } from '../store/slices/authSlice';
import webSocketInstance from '../services/websocket';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';

const Header = ({ onOpenCVEDetail }) => {
  const theme = useTheme();
  const { user } = useAuth();
  const { isConnected, isReady } = useWebSocketContext();
  const [anchorEl, setAnchorEl] = useState(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  // WebSocket 상태 변경 모니터링
  useEffect(() => {
    console.log(`[Header] WebSocket 상태 변경: isConnected=${isConnected}, isReady=${isReady}, bypassCheck=${window.bypassWebSocketCheck}`);
  }, [isConnected, isReady]);

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      handleClose();
      
      // 1. 로그아웃 API 호출 (가장 먼저 수행)
      console.log('[Logout] 1. Calling logout API...');
      try {
        await dispatch(logout()).unwrap();
      } catch (logoutError) {
        console.warn('[Logout] API call failed:', logoutError);
      }
      
      // 2. 웹소켓 연결 종료
      console.log('[Logout] 2. Disconnecting WebSocket...');
      webSocketInstance.disconnect();
      
      // 3. 리덕스 스토어 초기화
      console.log('[Logout] 3. Resetting Redux Store...');
      dispatch({ type: 'RESET_STORE' });
      
      // 4. 로컬 스토리지 완전 정리 (마지막에 수행)
      console.log('[Logout] 4. Clearing localStorage...');
      localStorage.clear();
      
      // 5. 페이지 이동 (즉시 수행)
      console.log('[Logout] 5. Navigating to login page...');
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('[Logout] Final error:', error);
      // 에러가 발생해도 로컬 스토리지 정리 및 페이지 이동
      localStorage.clear();
      navigate('/login', { replace: true });
    }
  };

  const handleNotificationClick = (cveId, commentId) => {
    if (onOpenCVEDetail) {
      onOpenCVEDetail(cveId, commentId);
    }
  };

  // 이메일이 없는 경우 기본 아바타 사용
  const animalEmoji = user?.email ? getAnimalEmoji(user.email) : '👤';

  // 웹소켓 연결 상태 표시 아이콘
  const renderConnectionStatus = () => {
    if (!user) return null;  // 로그인하지 않은 경우 표시하지 않음
    
    // WebSocket 우회 모드
    if (window.bypassWebSocketCheck) {
      return (
        <Tooltip title="WebSocket 체크 우회 모드 (테스트용)">
          <IconButton 
            size="small" 
            sx={{ ml: 2 }}
            onClick={() => {
              window.bypassWebSocketCheck = false;
              console.log('[Header] WebSocket 체크 우회 모드 해제');
              enqueueSnackbar('WebSocket 체크 우회 모드가 해제되었습니다.', { 
                variant: 'info', 
                anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
              });
              // 페이지 새로고침
              window.location.reload();
            }}
          >
            <Wifi1BarIcon 
              sx={{ 
                color: theme.palette.warning.main,
                animation: 'pulse 1.5s infinite'
              }} 
            />
          </IconButton>
        </Tooltip>
      );
    }
    
    // 일반 모드 (연결 상태에 따른 아이콘)
    return (
      <Tooltip title={
        isConnected 
          ? (isReady ? "서버와 연결됨 (준비 완료)" : "서버와 연결됨 (준비 중...)")
          : "서버와 연결 끊김 (클릭하여 재연결 시도)"
      }>
        <IconButton 
          size="small" 
          sx={{ ml: 2 }}
          onClick={() => {
            if (!isConnected) {
              console.log('[Header] 수동 재연결 시도');
              webSocketInstance.connect();
              enqueueSnackbar('WebSocket 재연결을 시도합니다.', { 
                variant: 'info', 
                anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
              });
            } else {
              // 테스트용 우회 모드 활성화
              window.bypassWebSocketCheck = true;
              console.log('[Header] WebSocket 체크 우회 모드 활성화');
              enqueueSnackbar('WebSocket 체크 우회 모드가 활성화되었습니다.', { 
                variant: 'warning', 
                anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
              });
              // 페이지 새로고침
              window.location.reload();
            }
          }}
        >
          {isConnected ? (
            isReady ? (
              <SignalWifiStatusbar4BarIcon 
                sx={{ 
                  color: theme.palette.success.main,
                  animation: 'readyPulse 2s infinite'
                }} 
              />
            ) : (
              <SignalWifiStatusbar4BarIcon 
                sx={{ 
                  color: theme.palette.info.main,
                  animation: 'pulse 1.5s infinite'
                }} 
              />
            )
          ) : (
            <SignalWifiConnectedNoInternet4Icon 
              sx={{ 
                color: theme.palette.error.main,
                animation: 'errorPulse 1.2s infinite'
              }} 
            />
          )}
        </IconButton>
      </Tooltip>
    );
  };

  return (
    <AppBar 
      position="fixed" 
      sx={{ 
        zIndex: theme.zIndex.drawer + 1,
        backgroundColor: theme.palette.background.paper,
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
      }}
    >
      <Toolbar>
        <Typography
          variant="h6"
          sx={{
            color: theme.palette.primary.main,
            fontWeight: 600,
            letterSpacing: '0.5px'
          }}
        >
          CVEHub
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {renderConnectionStatus()}
          <NotificationBell onNotificationClick={handleNotificationClick} />
          <IconButton
            onClick={handleMenu}
            sx={{ ml: 2 }}
          >
            <Avatar sx={{ bgcolor: 'primary.main' }}>
              {animalEmoji}
            </Avatar>
          </IconButton>
        </Box>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
          onClick={handleClose}
          PaperProps={{
            sx: {
              mt: 1.5,
              minWidth: 200,
              boxShadow: '0px 2px 8px rgba(0,0,0,0.1)',
              '& .MuiMenuItem-root': {
                px: 2,
                py: 1.5,
                gap: 1.5,
              },
            },
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <MenuItem onClick={handleClose}>
            <PersonIcon fontSize="small" />
            프로필
          </MenuItem>
          <MenuItem onClick={handleClose}>
            <SettingsIcon fontSize="small" />
            설정
          </MenuItem>
          <Divider sx={{ my: 1 }} />
          <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
            <LogoutIcon fontSize="small" />
            로그아웃
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
