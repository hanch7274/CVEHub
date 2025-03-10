import React, { useState, useEffect, useRef } from 'react';
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
  Badge,
  CircularProgress,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import SignalWifi4BarIcon from '@mui/icons-material/SignalWifi4Bar';
import SignalWifi3BarIcon from '@mui/icons-material/SignalWifi3Bar';
import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAuth } from '../contexts/AuthContext';
import { getAnimalEmoji } from '../utils/avatarUtils';
import NotificationBell from '../features/notification/NotificationBell';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { useDispatch } from 'react-redux';
import { logout } from '../store/slices/authSlice';
import webSocketInstance from '../services/websocket';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import { SignalWifiStatusbar4Bar, SignalWifiStatusbarConnectedNoInternet4, SignalWifiOff } from '@mui/icons-material';

const Header = ({ onOpenCVEDetail }) => {
  const theme = useTheme();
  const { user } = useAuth();
  const { isConnected, isReady, connectionState } = useWebSocketContext();
  const [anchorEl, setAnchorEl] = useState(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  
  // 웹소켓 상태 모니터링을 위한 로컬 상태
  const [localConnected, setLocalConnected] = useState(isConnected);
  const [localReady, setLocalReady] = useState(isReady);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const lastConnectionAttemptRef = useRef(0);
  
  // WebSocket 상태 변경 즉시 감지 및 로컬 상태 동기화
  useEffect(() => {
    console.log(`[Header] WebSocket 상태 변경: isConnected=${isConnected}, isReady=${isReady}, state=${connectionState}`);
    
    // 상태 변경을 로컬 상태에 즉시 반영
    setLocalConnected(isConnected);
    setLocalReady(isReady);
    
    // 연결 상태 판단 로직
    let status = 'disconnected';
    
    if (isConnected && isReady) {
      // 물리적 연결 + connect_ack = 완전 연결
      status = 'connected';
    } else if (isConnected && !isReady) {
      // 물리적 연결만 됐고 connect_ack 대기 중 = 연결 중
      status = 'connecting';
    } else if (!isConnected) {
      // 연결되지 않음
      status = 'disconnected';
    }
    
    setConnectionStatus(status);
    
    // 재연결 시도 중 상태 관리
    if (isReconnecting && isConnected && isReady) {
      // 완전히 연결되었을 때만 재연결 성공으로 처리
      setIsReconnecting(false);
      enqueueSnackbar('서버와 성공적으로 재연결되었습니다', { 
        variant: 'success',
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
      });
    }
  }, [isConnected, isReady, connectionState, isReconnecting, enqueueSnackbar]);

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
      
      // 4. 로컬 스토리지 및 세션 스토리지 완전 정리 (마지막에 수행)
      console.log('[Logout] 4. Clearing storage...');
      localStorage.clear();
      sessionStorage.clear(); // 세션 스토리지도 함께 정리
      
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
    
    // 수동 재연결 처리 함수
    const handleReconnect = () => {
      // 재연결 요청 간격 제한 (3초)
      const now = Date.now();
      if (now - lastConnectionAttemptRef.current < 3000) {
        enqueueSnackbar('잠시 후 다시 시도해주세요', { 
          variant: 'info',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
        });
        return;
      }
      
      console.log('[Header] 수동 재연결 시도');
      lastConnectionAttemptRef.current = now;
      setIsReconnecting(true);
      
      // 연결 시도 전 상태 초기화를 위해 먼저 연결 해제
      webSocketInstance.disconnect();
      
      // 잠시 후 연결 시도
      setTimeout(() => {
        if (!localConnected || !localReady) {
          webSocketInstance.connect();
          enqueueSnackbar('서버와 재연결을 시도합니다', { 
            variant: 'info',
            anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
          });
        }
        
        // 30초 후에도 재연결 시도 중 상태가 계속되면 리셋
        setTimeout(() => {
          if (isReconnecting) {
            setIsReconnecting(false);
          }
        }, 30000);
      }, 500);
    };
    
    // 연결 상태에 따른 아이콘 및 텍스트 결정
    let icon, color, tooltip, action;
    
    switch(connectionStatus) {
      case 'connected':
        icon = <SignalWifiStatusbar4Bar />;
        color = 'success';
        tooltip = '서버와 연결되어 있습니다';
        action = null;
        break;
        
      case 'connecting':
        icon = <SignalWifiStatusbarConnectedNoInternet4 />;
        color = 'warning';
        tooltip = '서버 연결 중입니다...';
        action = null;
        break;
        
      case 'disconnected':
      default:
        icon = <SignalWifiOff />;
        color = 'error';
        tooltip = '서버와 연결이 끊어졌습니다. 클릭하여 재연결';
        action = handleReconnect;
        break;
    }
    
    return (
      <Tooltip title={tooltip}>
        <IconButton
          size="small"
          aria-label="connection status"
          onClick={action}
          disabled={!action || isReconnecting}
          color={color}
          sx={{ mr: 0.5 }}
        >
          {isReconnecting ? (
            <CircularProgress size={24} color="inherit" />
          ) : icon}
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

// 글로벌 스타일 요소 추가
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0% { opacity: 0.6; }
    50% { opacity: 1; }
    100% { opacity: 0.6; }
  }
  
  @keyframes errorPulse {
    0% { opacity: 0.7; }
    50% { opacity: 1; }
    100% { opacity: 0.7; }
  }
`;
document.head.appendChild(style);
