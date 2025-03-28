import React, { useEffect, useCallback, useMemo, useState } from 'react';
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
  Button,
  useTheme,
  alpha,
  Container,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocketIO } from '../contexts/SocketIOContext';
import { useSnackbar } from 'notistack';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import NotificationBell from '../features/notification/NotificationBell';
import { getAnimalEmoji } from '../utils/avatarUtils';
import SearchIcon from '@mui/icons-material/Search';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { SOCKET_EVENTS, SOCKET_STATE } from '../services/socketio/constants';
import logger from '../utils/logging';

interface HeaderProps {
  onOpenCVEDetail?: (cveId: string, commentId?: string) => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenCVEDetail }) => {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const { 
    connected,
    subscribeEvent, 
    unsubscribeEvent,
    connect,
    isReady
  } = useSocketIO();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  
  // 소켓 상태 변화 핸들러 - 간소화된 버전
  const handleSocketStateChange = useCallback((data: { state: string }) => {
    logger.debug('Header', '소켓 상태 변경 이벤트 수신', {
      state: data.state,
      connected: connected
    });
    // 핸들러는 단순 로깅만 수행. 상태 업데이트는 SocketIOContext에서 이미 처리됨
  }, [connected]);
  
  // 소켓 이벤트 구독 설정 - 마운트/언마운트 시에만 실행
  useEffect(() => {
    logger.info('Header', '소켓 이벤트 구독 설정', { connected });
    
    // 소켓 이벤트 리스너 등록
    subscribeEvent(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, handleSocketStateChange);
    
    return () => {
      logger.info('Header', '이벤트 구독 해제');
      unsubscribeEvent(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, handleSocketStateChange);
    };
  }, [subscribeEvent, unsubscribeEvent, handleSocketStateChange]);
  
  // 재연결 핸들러 - 간소화된 버전
  const handleReconnect = useCallback(() => {
    if (!connected) {
      logger.info('Header', '재연결 시도');
      enqueueSnackbar('서버에 재연결 시도 중...', { variant: 'info' });
      connect();
    } else {
      enqueueSnackbar('이미 서버에 연결되어 있습니다', { variant: 'info' });
    }
  }, [connect, enqueueSnackbar, connected]);
  
  // 연결 상태 아이콘 - connected 직접 사용
  const connectionIcon = useMemo(() => {
    return connected ? (
      <WifiIcon color="success" fontSize="small" />
    ) : (
      <WifiOffIcon color="error" fontSize="small" />
    );
  }, [connected]);
  
  // 메뉴 열기/닫기 핸들러
  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    // setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    // setAnchorEl(null);
  };

  // 로그아웃 처리
  const handleLogout = async () => {
    try {
      // 로그아웃 전에 소켓 이벤트 발생
      if (connected) {
        logger.debug('Header', '로그아웃: 소켓 연결 종료 시도');
      }
      
      // React Query 로그아웃 함수만 호출 (웹소켓 연결 종료는 AuthContext에서 처리)
      await logout();
      
      // 로그아웃 성공 메시지
      enqueueSnackbar('로그아웃 되었습니다', {
        variant: 'success',
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
      });
      
      // 홈 페이지로 이동
      navigate('/');
    } catch (error) {
      enqueueSnackbar('로그아웃 중 오류가 발생했습니다', {
        variant: 'error',
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
      });
    }
  };

  // 이메일이 없는 경우 기본 아바타 사용
  const animalEmoji = user?.email ? getAnimalEmoji(user.email) : '👤';

  return (
    <AppBar 
      position="fixed" 
      elevation={0}
      sx={{ 
        height: 'auto',
        minHeight: '64px',
        maxHeight: '64px',
        background: 'rgba(255, 255, 255, 0.2)', 
        backdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.2)}`,
        boxShadow: `0 4px 30px ${alpha('#000', 0.1)}`,
        zIndex: theme.zIndex.drawer + 1,
      }}
    >
      <Container maxWidth={false} sx={{ px: { xs: 1, sm: 2 } }}>
        <Toolbar 
          disableGutters
          sx={{ 
            minHeight: '64px',
            py: 0,
            display: 'flex',
            justifyContent: 'space-between'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'transform 0.2s ease',
                '&:hover': {
                  transform: 'scale(1.05)'
                }
              }}
              onClick={() => navigate('/')}
            >
              <Box 
                component="img"
                src="/cvehub_logo.png"
                alt="CVEHub Logo"
                sx={{
                  height: '60px',
                  mr: 1
                }}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Tooltip title={connected ? "서버와 실시간 연결 됨" : "서버 연결 끊김 (클릭하여 재연결)"}>
              <IconButton
                size="small"
                onClick={handleReconnect}
                sx={{ 
                  mr: 1,
                  backgroundColor: connected 
                    ? alpha(theme.palette.success.main, 0.1) 
                    : alpha(theme.palette.error.main, 0.1),
                  backdropFilter: 'blur(5px)',
                  border: `1px solid ${alpha(
                    connected ? theme.palette.success.main : theme.palette.error.main, 
                    0.2
                  )}`,
                  '&:hover': { 
                    backgroundColor: connected 
                      ? alpha(theme.palette.success.main, 0.2) 
                      : alpha(theme.palette.error.main, 0.2)
                  }
                }}
                aria-label="서버 연결 상태"
              >
                {connectionIcon}
              </IconButton>
            </Tooltip>
            
            {user && (
              <Box 
                sx={{ 
                  mx: 1,
                  transition: 'all 0.3s ease',
                  '& .MuiIconButton-root': {
                    color: '#ff006e'
                  },
                  '& .MuiSvgIcon-root': {
                    fontSize: '1.8rem'
                  }
                }}
              >
                <NotificationBell />
              </Box>
            )}
            
            {user ? (
              <Tooltip title={user.displayName || user.username}>
                <IconButton
                  onClick={handleMenu}
                  sx={{ 
                    ml: 1,
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'scale(1.05)' },
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(5px)',
                    border: `1px solid rgba(255, 255, 255, 0.3)`,
                    padding: '4px'
                  }}
                >
                  <Avatar 
                    sx={{ 
                      background: 'linear-gradient(135deg, #3a86ff 0%, #ff006e 100%)',
                      color: theme.palette.common.white,
                      fontWeight: 'bold',
                      boxShadow: `0 0 0 2px rgba(255, 255, 255, 0.3)`
                    }}
                  >
                    {animalEmoji}
                  </Avatar>
                </IconButton>
              </Tooltip>
            ) : (
              <Button 
                variant="outlined" 
                color="inherit" 
                onClick={() => navigate('/login')}
                sx={{ 
                  borderRadius: '20px',
                  px: 2,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(5px)',
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                  color: theme.palette.mode === 'dark' ? '#fff' : '#333',
                  '&:hover': { 
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)'
                  }
                }}
              >
                로그인
              </Button>
            )}
          </Box>

          <Menu
            id="menu-appbar"
            // anchorEl={anchorEl}
            open={false}
            onClose={handleClose}
            onClick={handleClose}
            PaperProps={{
              elevation: 0,
              sx: {
                mt: 1.5,
                minWidth: 220,
                overflow: 'visible',
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(10px)',
                border: `1px solid rgba(255, 255, 255, 0.3)`,
                borderRadius: '12px',
                boxShadow: `0 10px 30px ${alpha('#000', 0.15)}`,
                '&:before': {
                  content: '""',
                  display: 'block',
                  position: 'absolute',
                  top: 0,
                  right: 14,
                  width: 10,
                  height: 10,
                  background: 'rgba(255, 255, 255, 0.8)',
                  backdropFilter: 'blur(10px)',
                  transform: 'translateY(-50%) rotate(45deg)',
                  zIndex: 0,
                  border: `1px solid rgba(255, 255, 255, 0.3)`,
                  borderBottom: 'none',
                  borderRight: 'none'
                },
                '& .MuiMenuItem-root': {
                  px: 2,
                  py: 1.5,
                  gap: 1.5,
                  borderRadius: '8px',
                  mx: 0.5,
                  my: 0.2,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    background: 'linear-gradient(90deg, rgba(58, 134, 255, 0.08) 0%, rgba(255, 0, 110, 0.08) 100%)',
                    transform: 'translateX(5px)'
                  }
                },
              },
            }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <Box sx={{ px: 2, py: 1.5 }}>
              {user && (
                <>
                  <Typography variant="subtitle1" component="div" sx={{ fontWeight: 'bold' }}>
                    {user.displayName || user.username}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                    {user.email}
                  </Typography>
                </>
              )}
            </Box>
            <Divider sx={{ my: 1 }} />
            <MenuItem onClick={() => { handleClose(); navigate('/profile'); }}>
              <PersonIcon fontSize="small" sx={{ color: theme.palette.primary.main }} />
              프로필
            </MenuItem>
            <MenuItem onClick={() => { handleClose(); navigate('/settings'); }}>
              <SettingsIcon fontSize="small" sx={{ color: theme.palette.primary.main }} />
              설정
            </MenuItem>
            <Divider sx={{ my: 1 }} />
            <MenuItem 
              onClick={() => { handleClose(); handleLogout(); }}
              sx={{ color: theme.palette.error.main }}
            >
              <LogoutIcon fontSize="small" />
              로그아웃
            </MenuItem>
          </Menu>
        </Toolbar>
      </Container>
    </AppBar>
  );
};

export default Header;