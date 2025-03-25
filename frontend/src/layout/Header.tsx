import React, { useState, useEffect, useRef, useCallback } from 'react';
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

interface HeaderProps {
  onOpenCVEDetail?: (cveId: string, commentId?: string) => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenCVEDetail }) => {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const socketIO = useSocketIO();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  
  // 웹소켓 연결 상태 관리
  const socketIORef = useRef(socketIO);
  const [connectionState, setConnectionState] = useState<boolean>(socketIO.connected);
  
  // 메뉴 및 재연결 관련 상태
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const lastConnectionAttemptRef = useRef<number>(0);
  
  // socketIO 객체 관련 useEffect 수정
  useEffect(() => {
    // socketIO 객체만 ref에 업데이트
    socketIORef.current = socketIO;
  }, [socketIO]); // socketIO를 의존성으로 유지

  // 초기 마운트 시 연결 상태 설정을 위한 별도 useEffect
  useEffect(() => {
    // 컴포넌트 마운트 시 한 번만 초기 연결 상태 설정
    setConnectionState(socketIO.connected);
    
    // 연결 상태 변경 이벤트 구독
    const handleConnectionStateChange = (data) => {
      const newConnectionState = data.state === SOCKET_STATE.CONNECTED;
      
      // 함수형 업데이트를 사용하여 최신 상태 참조
      setConnectionState(prevState => {
        // 상태가 실제로 변경될 때만 업데이트
        if (prevState !== newConnectionState) {
          // 연결이 복구되었을 경우 재연결 상태 업데이트
          if (newConnectionState && isReconnecting) {
            setIsReconnecting(false);
          }
          return newConnectionState;
        }
        return prevState;
      });
    };
    
    // 이벤트 구독 
    const unsubscribe = socketIO.subscribeEvent(SOCKET_EVENTS.CONNECTION_STATE_CHANGE, handleConnectionStateChange);
    
    // 클린업 함수
    return () => {
      unsubscribe();
    };
  }, []); // 빈 의존성 배열 사용하여 마운트/언마운트 시에만 실행

  // 메뉴 열기/닫기 핸들러
  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  // 재연결 핸들러 최적화
  const handleReconnect = useCallback(() => {
    // 마지막 연결 시도로부터 3초 이내에는 재시도 방지
    const now = Date.now();
    if (lastConnectionAttemptRef.current && now - lastConnectionAttemptRef.current < 3000) {
      enqueueSnackbar('잠시 후 다시 시도해주세요', { 
        variant: 'warning',
        anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
      });
      return;
    }
    
    lastConnectionAttemptRef.current = now;
    
    // 이미 재연결 중이 아닐 때만 상태 업데이트
    setIsReconnecting(prev => {
      if (!prev) {
        // 실제 연결 로직
        if (socketIORef.current.emit) {
          socketIORef.current.emit('request_reconnect');
        }
        
        // 5초 후 재연결 상태 초기화
        setTimeout(() => {
          setIsReconnecting(false);
        }, 5000);
        
        return true; // 재연결 시작
      }
      return prev; // 이미 재연결 중이면 상태 유지
    });
  }, [enqueueSnackbar]); // socketIO 의존성 제거하고 socketIORef 사용

  // 연결 상태 렌더링 함수
  const renderConnectionStatus = useCallback(() => {
    // 불필요한 렌더링을 줄이기 위해 최적화
    if (connectionState) {
      return (
        <Tooltip title="서버에 연결됨">
          <IconButton
            size="small"
            sx={{ mr: 1 }}
            disabled
          >
            <WifiIcon 
              fontSize="small" 
              sx={{ 
                color: theme.palette.success.main,
                filter: `drop-shadow(0px 0px 2px ${alpha(theme.palette.success.main, 0.5)})` 
              }} 
            />
          </IconButton>
        </Tooltip>
      );
    } else if (isReconnecting) {
      return (
        <Tooltip title="서버에 재연결 중...">
          <CircularProgress
            size={16}
            thickness={5}
            sx={{ mr: 2, color: theme.palette.warning.main }}
          />
        </Tooltip>
      );
    } else {
      return (
        <Tooltip title="서버 연결 끊김. 클릭하여 재연결">
          <IconButton
            size="small"
            onClick={handleReconnect}
            sx={{ mr: 1 }}
          >
            <WifiOffIcon 
              fontSize="small" 
              sx={{ 
                color: theme.palette.error.main,
                filter: `drop-shadow(0px 0px 2px ${alpha(theme.palette.error.main, 0.5)})` 
              }} 
            />
          </IconButton>
        </Tooltip>
      );
    }
  }, [connectionState, isReconnecting, theme.palette, handleReconnect]); // 모든 의존성 명시적으로 포함

  // 로그아웃 처리
  const handleLogout = async () => {
    try {
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
        backgroundColor: theme.palette.primary.main,
        borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.1)}`,
        backdropFilter: 'blur(20px)',
        zIndex: theme.zIndex.drawer + 1
      }}
    >
      <Container maxWidth={false}>
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
            <Typography
              variant="h6"
              component="div"
              sx={{
                fontWeight: 700,
                letterSpacing: '0.5px',
                color: theme.palette.primary.contrastText,
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer'
              }}
              onClick={() => navigate('/')}
            >
              <SearchIcon sx={{ mr: 1, fontSize: '1.5rem' }} />
              CVEHub
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {renderConnectionStatus()}
            
            {user && (
              <NotificationBell />
            )}
            
            {user ? (
              <Tooltip title={user.displayName || user.username}>
                <IconButton
                  onClick={handleMenu}
                  sx={{ 
                    ml: 1,
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'scale(1.05)' }
                  }}
                >
                  <Avatar 
                    sx={{ 
                      bgcolor: alpha(theme.palette.primary.light, 0.8),
                      color: theme.palette.common.white,
                      fontWeight: 'bold',
                      boxShadow: `0 0 0 2px ${alpha(theme.palette.common.white, 0.2)}`
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
                  borderColor: alpha(theme.palette.common.white, 0.5),
                  '&:hover': { 
                    borderColor: theme.palette.common.white,
                    backgroundColor: alpha(theme.palette.common.white, 0.1)
                  }
                }}
              >
                로그인
              </Button>
            )}
          </Box>

          <Menu
            id="menu-appbar"
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleClose}
            onClick={handleClose}
            PaperProps={{
              elevation: 3,
              sx: {
                mt: 1.5,
                minWidth: 220,
                overflow: 'visible',
                filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.15))',
                '&:before': {
                  content: '""',
                  display: 'block',
                  position: 'absolute',
                  top: 0,
                  right: 14,
                  width: 10,
                  height: 10,
                  bgcolor: 'background.paper',
                  transform: 'translateY(-50%) rotate(45deg)',
                  zIndex: 0,
                },
                '& .MuiMenuItem-root': {
                  px: 2,
                  py: 1.5,
                  gap: 1.5,
                  borderRadius: '4px',
                  mx: 0.5,
                  my: 0.2,
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.08)
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