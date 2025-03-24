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

interface HeaderProps {
  onOpenCVEDetail?: (cveId: string, commentId?: string) => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenCVEDetail }) => {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const socketIO = useSocketIO();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  
  // 웹소켓 상태 관련 변수
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const lastConnectionAttemptRef = useRef<number>(0);
  
  // socketIO 객체의 안정적인 참조를 위한 ref
  const socketIORef = useRef(socketIO);
  const connectedRef = useRef(socketIO.connected);

  // 연결 상태 표시를 위한 state 추가
  const [connectionState, setConnectionState] = useState<boolean>(socketIO.connected);

  // 메뉴 열기/닫기 핸들러
  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  // 재연결 핸들러
  const handleReconnect = () => {
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
    setIsReconnecting(true);
    
    // 연결 상태 이벤트 발생 - SocketIOContext에서 처리
    if (socketIO.emit) {
      socketIO.emit('request_reconnect');
    }
    
    // 5초 후 재연결 상태 초기화
    setTimeout(() => {
      setIsReconnecting(false);
    }, 5000);
  };

  // 연결 상태 렌더링 함수
  const renderConnectionStatus = () => {
    // 디버깅을 위한 로그 추가
    console.log('Header: renderConnectionStatus 호출됨', {
      socketConnected: socketIO.connected,
      connectionState
    });
    
    if (socketIO.connected) {
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
  };

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

  // socketIO 객체 업데이트 시 ref 업데이트
  useEffect(() => {
    socketIORef.current = socketIO;
    // 실제 연결 상태 업데이트 - socket.connected 값을 직접 사용
    const actualConnected = socketIO.connected;
    connectedRef.current = actualConnected;
    // 상태 업데이트로 UI 렌더링 트리거
    setConnectionState(actualConnected);
    
    // 디버깅을 위한 로그 추가
    console.log('Header: socketIO 업데이트', {
      connected: socketIO.connected,
      socketInstance: !!socketIO.socket,
      socketInstanceConnected: socketIO.socket?.connected,
      connectedRef: connectedRef.current,
      connectionState
    });
  }, [socketIO, socketIO.connected]);

  // 웹소켓 연결 상태 모니터링 - 컴포넌트 마운트 시 한 번만 설정
  useEffect(() => {
    // 초기 연결 상태 확인
    let prevConnectionState = connectedRef.current;
    
    // 연결 상태 변경 감지 함수
    const handleConnectionChange = () => {
      // 소켓 인스턴스가 있는지 확인하고 실제 연결 상태 가져오기
      const currentConnected = socketIORef.current.connected;
      
      // 디버깅을 위한 로그 추가
      console.log('Header: 연결 상태 확인', { 
        prev: prevConnectionState, 
        current: currentConnected,
        socketInstance: !!socketIORef.current.socket,
        socketInstanceConnected: socketIORef.current.socket?.connected,
        changed: currentConnected !== prevConnectionState
      });
      
      // 연결 상태가 변경된 경우에만 처리
      if (currentConnected !== prevConnectionState) {
        console.log('Header: 연결 상태 변경 감지', { 
          prev: prevConnectionState, 
          current: currentConnected 
        });
        
        // 연결됨 -> 연결 끊김
        if (prevConnectionState && !currentConnected) {
          enqueueSnackbar('서버 연결이 끊어졌습니다', {
            variant: 'error',
            anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
          });
        }
        // 연결 끊김 -> 연결됨
        else if (!prevConnectionState && currentConnected) {
          enqueueSnackbar('서버에 연결되었습니다', {
            variant: 'success',
            anchorOrigin: { vertical: 'bottom', horizontal: 'center' }
          });
        }
        
        // 상태 업데이트
        prevConnectionState = currentConnected;
        connectedRef.current = currentConnected;
        setConnectionState(currentConnected);
      }
    };
    
    // 주기적으로 연결 상태 확인 (100ms 간격으로 변경하여 더 빠르게 감지)
    const intervalId = setInterval(handleConnectionChange, 100);
    
    // 컴포넌트 언마운트 시 인터벌 정리
    return () => {
      clearInterval(intervalId);
    };
  }, []); // 빈 의존성 배열로 컴포넌트 마운트 시 한 번만 실행

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
