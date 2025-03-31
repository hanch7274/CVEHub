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
import { useSnackbar } from 'notistack';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import NotificationBell from '../features/notification/NotificationBell';
import logger from 'shared/utils/logging';
import { useAuth } from 'features/auth/contexts/AuthContext';
import useSocket from 'core/socket/hooks/useSocket';
import SOCKET_EVENTS from 'core/socket/services/constants';
import { getAnimalEmoji } from 'shared/utils/avatarUtils';

interface HeaderProps {
  onOpenCVEDetail?: (cveId: string, commentId?: string) => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenCVEDetail }) => {
  const theme = useTheme();
  const { user, logout } = useAuth();
  
  // 새로운 useSocket 훅 사용
  const socket = useSocket();
  const { connected } = socket;

  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  
  // 소켓 상태 변화 핸들러 - 간소화된 버전
  const handleSocketStateChange = useCallback((data: { state: string }) => {
    logger.debug('Header', '소켓 상태 변경 이벤트 수신', {
      state: data.state,
      connected: connected
    });
    // 핸들러는 단순 로깅만 수행. 상태 업데이트는 내부적으로 이미 처리됨
  }, [connected]);

  // 기존 useSocketEventListener 대신에 useEffect와 socket.on 사용
  useEffect(() => {
    // 이벤트 구독 설정
    const unsubscribe = socket.on(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, handleSocketStateChange);
    
    // 컴포넌트 언마운트 시 구독 해제
    return () => {
      unsubscribe();
    };
  }, [handleSocketStateChange]);
  

  // 재연결 핸들러 - useSocket 사용 방식으로 업데이트
  const handleReconnect = useCallback(() => {
    if (!connected) {
      logger.info('Header', '재연결 시도');
      enqueueSnackbar('서버에 재연결 시도 중...', { variant: 'info' });
      
      // 토큰 새로 받아서 재연결 시도 
      const token = localStorage.getItem('token');
      if (token) {
        // 새로고침으로 연결 재시도
        window.location.reload();
      } else {
        enqueueSnackbar('인증 정보가 없어 재연결할 수 없습니다. 다시 로그인해주세요.', {
          variant: 'warning'
        });
        navigate('/login');
      }
    }
  }, [connected, navigate, enqueueSnackbar]);

  // 사용자 메뉴 관련 상태
  const [anchorElUser, setAnchorElUser] = useState<null | HTMLElement>(null);
  
  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorElUser(event.currentTarget);
  };
  
  const handleCloseUserMenu = () => {
    setAnchorElUser(null);
  };
  
  const handleLogout = async () => {
    handleCloseUserMenu();
    try {
      await logout();
      enqueueSnackbar('로그아웃 되었습니다.', { 
        variant: 'success',
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
      });
      navigate('/login');
    } catch (error) {
      console.error('로그아웃 실패:', error);
      enqueueSnackbar('로그아웃 중 오류가 발생했습니다.', { 
        variant: 'error',
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
      });
    }
  };
  
  const handleProfileClick = () => {
    handleCloseUserMenu();
    navigate('/profile');
  };
  
  const handleSettingsClick = () => {
    handleCloseUserMenu();
    navigate('/settings');
  };
  
  // 연결 상태 아이콘 - connected 직접 사용
  const connectionIcon = useMemo(() => {
    return connected ? (
      <WifiIcon color="success" fontSize="small" />
    ) : (
      <WifiOffIcon color="error" fontSize="small" />
    );
  }, [connected]);
  
  const userAvatar = useMemo(() => {
    if (!user) return '👤';
    return getAnimalEmoji(user.username || user.email || '');
  }, [user]);

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
            {/* 웹소켓 연결 상태 */}
            <Tooltip title={connected ? "서버와 실시간 연결 됨" : "서버 연결 끊김 (클릭하여 재연결)"}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleReconnect}
                  disabled={connected}
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
              </span>
            </Tooltip>

            {/* 알림 벨 */}
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
                {onOpenCVEDetail ? (
                  <NotificationBell onOpenCVEDetail={onOpenCVEDetail} />
                ) : (
                  <NotificationBell />
                )}
              </Box>
            )}
            
            {/* 사용자 메뉴 */}
            {user ? (
              <Tooltip title={user.displayName || user.username || ''}>
                <IconButton
                  onClick={handleOpenUserMenu}
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
                    {userAvatar}
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
            anchorEl={anchorElUser}
            open={Boolean(anchorElUser)}
            onClose={handleCloseUserMenu}
            onClick={handleCloseUserMenu}
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
                    {user.displayName || user.username || '사용자'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                    {user.email || ''}
                  </Typography>
                </>
              )}
            </Box>
            <Divider sx={{ my: 1 }} />
            <MenuItem onClick={handleProfileClick}>
              <PersonIcon fontSize="small" sx={{ color: theme.palette.primary.main }} />
              프로필
            </MenuItem>
            <MenuItem onClick={handleSettingsClick}>
              <SettingsIcon fontSize="small" sx={{ color: theme.palette.primary.main }} />
              설정
            </MenuItem>
            <Divider sx={{ my: 1 }} />
            <MenuItem 
              onClick={handleLogout}
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