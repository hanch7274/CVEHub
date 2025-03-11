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
import { useSocketIO } from '../contexts/SocketIOContext';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import { SignalWifiStatusbar4Bar, SignalWifiStatusbarConnectedNoInternet4, SignalWifiOff } from '@mui/icons-material';

const Header = ({ onOpenCVEDetail }) => {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const socketIO = useSocketIO();
  const isConnected = socketIO.connected;
  const isReady = socketIO.connected;
  const connectionState = socketIO.connected ? 'connected' : 'disconnected';
  const [anchorEl, setAnchorEl] = useState(null);
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
    
    // WebSocketContext에서 제공하는 값은 이미 통합된 상태
    // isConnected가 true이면 isReady도 true (통합 상태)
    setLocalConnected(isConnected);
    setLocalReady(isConnected); // isConnected가 true면 isReady도
    
    // 연결 상태 설정 (통합된 상태 기반)
    const status = isConnected ? 'connected' : 'disconnected';
    
    console.log(`[Header] 연결 상태 업데이트: ${status} (isConnected=${isConnected})`);
    setConnectionStatus(status);
    
    // 재연결 시도 중 상태 관리
    if (isReconnecting && isConnected) {
      // 완전히 연결되었을 때만 재연결 성공으로 처리
      setIsReconnecting(false);
      enqueueSnackbar('서버와 성공적으로 재연결되었습니다', { 
        variant: 'success',
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
      });
    }
    
    // 연결 확인 후 컴포넌트 강제 리렌더링을 위한 타임아웃
    if (isConnected) {
      setTimeout(() => {
        // 상태가 UI에 반영되었는지 확인
        console.log(`[Header] 연결 상태 UI 확인: connectionStatus=${connectionStatus}, isConnected=${isConnected}`);
        
        // 필요한 경우 상태 갱신을 강제
        if (connectionStatus !== 'connected') {
          console.log('[Header] 상태 불일치 감지, 강제 업데이트');
          setConnectionStatus('connected');
        }
      }, 50);
    }
  }, [isConnected, isReady, connectionState, isReconnecting, enqueueSnackbar, connectionStatus]);
  
  // 상태가 업데이트될 때마다 아이콘 설명 업데이트
  useEffect(() => {
    if (connectionStatus === 'connected') {
      // 연결됨 상태일 때 로그
      console.log('[Header] 웹소켓 연결 상태: 연결됨 (connectionStatus=connected)');
    }
  }, [connectionStatus]);

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

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
    
    setIsReconnecting(true);
    
    // 연결 시도 전 상태 초기화를 위해 먼저 연결 해제
    socketIO.disconnect();
    
    // 잠시 후 연결 시도
    setTimeout(() => {
      if (!socketIO.connected) {
        socketIO.connect();
        enqueueSnackbar('서버와 재연결을 시도합니다', { 
          variant: 'info',
          anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
        });
      }
    }, 500);
    
    // 타임아웃 설정 (10초 내에 연결 안되면 재시도 버튼 다시 활성화)
    setTimeout(() => {
      setIsReconnecting(false);
    }, 10000);
    
    // 마지막 연결 시도 시간 업데이트
    lastConnectionAttemptRef.current = now;
  };

  // 로그아웃 처리
  const handleLogout = async () => {
    try {
      // 웹소켓 연결 종료
      socketIO.disconnect(true);
      
      // React Query 로그아웃 함수 호출
      await logout();
      
      // 로그아웃 성공 메시지
      enqueueSnackbar('로그아웃되었습니다', { 
        variant: 'success', 
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' } 
      });
      
      // 로그인 페이지로 이동
      navigate('/login');
    } catch (error) {
      // 오류 발생 시 사용자에게 알림
      enqueueSnackbar('로그아웃 중 오류가 발생했습니다', { 
        variant: 'error', 
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' } 
      });
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
    
    // 연결 상태에 따른 아이콘 및 텍스트 결정
    let icon, color, tooltip, action;
    
    // 통합된 상태 기반으로 UI 결정 (isConnected만으로 판단)
    switch(connectionStatus) {
      case 'connected':
        icon = <SignalWifiStatusbar4Bar />;
        color = 'success';
        tooltip = '서버와 연결되어 있습니다';
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
    
    // 컬러 값을 MUI 컬러 시스템에 맞게 매핑
    const colorMap = {
      success: theme.palette.success.main,
      error: theme.palette.error.main,
      warning: theme.palette.warning.main
    };
    
    // 연결 상태 디버깅 로그
    console.log(`[Header] 연결 상태 아이콘 렌더링: 상태=${connectionStatus}, 색상=${color}, 액션=${!!action}`);
    
    return (
      <Tooltip title={tooltip}>
        <span>
          <IconButton
            size="small"
            aria-label="connection status"
            onClick={action}
            disabled={!action || isReconnecting}
            color={color}
            sx={{ 
              mr: 0.5,
              // 연결 상태에 따라 아이콘 색상 직접 설정 (disabled 상태에서도 적용)
              '& .MuiSvgIcon-root': {
                color: connectionStatus === 'connected' ? colorMap.success : 
                       connectionStatus === 'disconnected' ? colorMap.error : 
                       'inherit'
              }
            }}
          >
            {isReconnecting ? (
              <CircularProgress size={24} color="inherit" />
            ) : icon}
          </IconButton>
        </span>
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
