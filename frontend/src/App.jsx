import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Box } from '@mui/material';
import { Alert, Snackbar } from '@mui/material';
import Header from './layout/Header';
import Sidebar from './layout/Sidebar';
import CVEList from './features/cve/CVEList';
import CreateCVE from './features/cve/CreateCVE';
import SignUp from './features/auth/SignUp';
import Login from './features/auth/Login.tsx';
import PrivateRoute from './features/auth/PrivateRoute';
import AuthRoute from 'features/auth/AuthRoute';
import { AuthProvider } from 'features/auth/contexts/AuthContext';
import { SnackbarProvider } from 'notistack';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import { injectErrorHandler, injectQueryClient } from 'features/auth/services/authService';
import { ErrorProvider, useError } from 'shared/contexts/ErrorContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import WebSocketQueryBridge from 'core/socket/bridge/WebSocketQueryBridge';
import { getAccessToken } from 'shared/utils/storage/tokenStorage';
import socketService from 'core/socket/services/socketService';  // Socket.IO 서비스 임포트
import { HelmetProvider } from 'react-helmet-async';

// CVEDetail 컴포넌트를 lazy 로딩으로 가져옵니다
const CVEDetail = lazy(() => import('./features/cve/CVEDetail'));
// CacheVisualization 컴포넌트를 lazy 로딩으로 가져옵니다
const CacheVisualization = lazy(() => import('./features/cache/CacheVisualization'));
// ActivitiesPage 컴포넌트를 lazy 로딩으로 가져옵니다
const ActivitiesPage = lazy(() => import('./features/activities/pages/ActivitiesPage'));

// URL 파라미터를 가져와 CVEDetail에 전달하는 래퍼 컴포넌트
const CVEDetailWrapper = () => {
  const params = useParams();
  const cveId = params.cveId;
  const [isOpen, setIsOpen] = useState(true);
  
  // 디버깅을 위한 로깅 추가
  useEffect(() => {
    console.log('[CVEDetailWrapper] 마운트됨, cveId:', cveId);
  }, [cveId]);
  
  const handleClose = useCallback(() => {
    console.log('[CVEDetailWrapper] 닫기 이벤트 발생');
    setIsOpen(false);
    // 닫기 후 목록 페이지로 이동
    window.history.back();
  }, []);

  if (!cveId) {
    console.error('[CVEDetailWrapper] cveId가 없습니다!');
    return <div>CVE ID가 필요합니다</div>;
  }

  console.log('[CVEDetailWrapper] 렌더링:', { cveId, isOpen });
  
  return (
    <Suspense fallback={<div>로딩 중...</div>}>
      <CVEDetail 
        cveId={cveId}
        open={isOpen}
        onClose={handleClose}
      />
    </Suspense>
  );
};

const MainLayout = React.memo(({ children }) => {
  const [selectedCVE, setSelectedCVE] = useState(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info'
  });

  const handleSnackbarClose = useCallback(() => {
    setSnackbar(prev => ({ ...prev, open: false }));
  }, []);

  const handleOpenCVEDetail = useCallback((cveId, commentId) => {
    setSelectedCVE(cveId);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header onOpenCVEDetail={handleOpenCVEDetail} />
      <Box sx={{ display: 'flex', flexGrow: 1, height: 'calc(100vh - 64px)', mt: '64px' }}>
        <Sidebar />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: { xs: 2, md: 4 },
            backgroundColor: '#F8F9FA',
            overflow: 'auto',
            position: 'relative',
            zIndex: 0
          }}
        >
          {React.cloneElement(children, { selectedCVE, setSelectedCVE })}
        </Box>
      </Box>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert 
          onClose={handleSnackbarClose} 
          severity={snackbar.severity} 
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
});

const AuthLayout = ({ children }) => (
  <Box
    sx={{
      minHeight: '100vh',
      backgroundColor: '#F8F9FA'
    }}
  >
    {children}
  </Box>
);

const ErrorHandlerSetup = ({ children }) => {
  const { handleError } = useError();
  
  useEffect(() => {
    injectErrorHandler(handleError);
  }, [handleError]);
  
  return children;
};

const MainRoutes = ({ setSelectedCVE, selectedCVE }) => {
  return (
    <Routes>
      {/* Authentication Routes */}
      <Route
        path="/signup"
        element={
          <AuthRoute>
            <AuthLayout>
              <SignUp />
            </AuthLayout>
          </AuthRoute>
        }
      />
      <Route
        path="/login"
        element={
          <AuthRoute>
            <AuthLayout>
              <Login />
            </AuthLayout>
          </AuthRoute>
        }
      />

      {/* Protected Routes */}
      <Route
        path="/cves"
        element={
          <PrivateRoute>
            <MainLayout>
              <CVEList />
            </MainLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/cves/:cveId"
        element={
          <PrivateRoute>
            <MainLayout>
              <CVEDetailWrapper />
            </MainLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/create-cve"
        element={
          <PrivateRoute>
            <MainLayout>
              <CreateCVE />
            </MainLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/cache"
        element={
          <PrivateRoute>
            <MainLayout>
              <Suspense fallback={<div>로딩 중...</div>}>
                <CacheVisualization />
              </Suspense>
            </MainLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/activities"
        element={
          <PrivateRoute>
            <MainLayout>
              <Suspense fallback={<div>로딩 중...</div>}>
                <ActivitiesPage />
              </Suspense>
            </MainLayout>
          </PrivateRoute>
        }
      />

      {/* Default Route */}
      <Route
        path="/"
        element={
          getAccessToken() ? <Navigate to="/cves" replace /> : <Navigate to="/login" replace />
        }
      />

      {/* Catch-all Route */}
      <Route path="*" element={<Navigate to="/" replace />} />
      
      {/* Render CVEDetail as modal when selectedCVE is set */}
      {selectedCVE && (
        <Route
          path="*"
          element={
            <Suspense fallback={<div>로딩 중...</div>}>
              <CVEDetail 
                cveId={selectedCVE}
                open={true}
                onClose={() => setSelectedCVE(null)}
              />
            </Suspense>
          }
        />
      )}
    </Routes>
  );
};

// React Query 클라이언트 생성
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // 창 포커스시 자동 리페치 비활성화
      staleTime: 5 * 60 * 1000, // 5분 동안 데이터 신선하게 유지
      retry: 1, // 실패시 1번 재시도
      cacheTime: 10 * 60 * 1000, // 10분 동안 캐시 유지
    },
  },
});

// auth.js에 queryClient 주입
injectQueryClient(queryClient);

// Socket.IO 디버깅을 위한 전역 객체 노출
window._socketDebug = socketService;

const App = () => {
  const [selectedCVE, setSelectedCVE] = useState(null);

  // 현재 경로 확인을 위한 추가 상태
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  // 현재 경로 업데이트 함수
  useEffect(() => {
    // 초기 경로 설정
    setCurrentPath(window.location.pathname);

    // 경로 변경 감지
    const handleRouteChange = () => {
      setCurrentPath(window.location.pathname);
    };

    // popstate 이벤트 리스너 등록 (뒤로가기/앞으로가기 감지)
    window.addEventListener('popstate', handleRouteChange);

    // 정리 함수
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  // 앱 시작 시 소켓 연결 초기화 (로그인/회원가입 페이지 제외)
  useEffect(() => {
    console.log('[App] Socket connection initialization, current path:', currentPath);
    
    // 로그인/회원가입 페이지인지 확인
    const isAuthPage = currentPath === '/login' || currentPath === '/signup';
    
    // 인증 토큰 확인
    const token = getAccessToken();
    
    if (token && !isAuthPage) {
      console.log('[App] Token exists and not on auth page, connecting socket');
      socketService.connect(token);
    } else if (token && isAuthPage) {
      console.log('[App] On auth page, not connecting socket despite token presence');
      // 인증 페이지에 있을 때는 연결하지 않음
      socketService.disconnect();
    } else {
      console.log('[App] No token, not connecting socket');
    }

    // 앱 종료 시 소켓 연결 정리
    return () => {
      console.log('[App] Cleaning up socket connection');
      socketService.disconnect();
    };
  }, [currentPath]);

  // 인증 상태 변경 감지 및 소켓 연결 업데이트
  useEffect(() => {
    // AuthContext에서 인증 상태 변경 이벤트 구독
    const handleAuthChange = (e) => {
      const isAuthenticated = e.detail.isAuthenticated;
      console.log('[App] Auth state changed:', isAuthenticated);
      
      // 로그인/회원가입 페이지인지 확인
      const isAuthPage = currentPath === '/login' || currentPath === '/signup';
      
      if (isAuthenticated && !isAuthPage) {
        // 인증되었고 인증 페이지가 아닌 경우에만 연결
        socketService.handleAuthStateChange(isAuthenticated);
      } else if (!isAuthenticated) {
        // 인증되지 않은 경우 연결 해제
        socketService.disconnect();
      }
    };

    // 이벤트 리스너 등록
    window.addEventListener('auth-state-changed', handleAuthChange);

    // 정리 함수
    return () => {
      window.removeEventListener('auth-state-changed', handleAuthChange);
    };
  }, [currentPath]);

  // 페이지 가시성 변경 감지
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[App] Page visibility changed to visible');
        const token = getAccessToken();
        // 로그인/회원가입 페이지인지 확인
        const isAuthPage = currentPath === '/login' || currentPath === '/signup';
        
        if (token && !socketService.isSocketConnected() && !isAuthPage) {
          console.log('[App] Reconnecting socket on visibility change (not on auth page)');
          socketService.connect(token);
        }
      }
    };

    // 온라인/오프라인 상태 감지
    const handleOnline = () => {
      console.log('[App] Browser went online');
      const token = getAccessToken();
      // 로그인/회원가입 페이지인지 확인
      const isAuthPage = currentPath === '/login' || currentPath === '/signup';
      
      if (token && !socketService.isSocketConnected() && !isAuthPage) {
        console.log('[App] Reconnecting socket on online state (not on auth page)');
        socketService.connect(token);
      }
    };

    // 이벤트 리스너 등록
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    // 정리 함수
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [currentPath]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <HelmetProvider>
          <SnackbarProvider
            maxSnack={3}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            autoHideDuration={3000}
          >
            <AuthProvider>
              <Router>
                <ErrorProvider>
                  <ErrorHandlerSetup>
                    <CssBaseline />
                    <WebSocketQueryBridge />
                    <MainRoutes setSelectedCVE={setSelectedCVE} selectedCVE={selectedCVE} />
                  </ErrorHandlerSetup>
                </ErrorProvider>
              </Router>
            </AuthProvider>
          </SnackbarProvider>
        </HelmetProvider>
      </ThemeProvider>
    {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
};

export default App;