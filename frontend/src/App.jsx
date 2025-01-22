import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, Snackbar } from '@mui/material';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import CVEList from './components/CVEList';
import CreateCVE from './components/CreateCVE';
import SignUp from './components/SignUp';
import Login from './components/Login';
import PrivateRoute from './components/PrivateRoute';
import AuthRoute from './components/AuthRoute';
import { AuthProvider } from './contexts/AuthContext';
import CVEDetail from './components/CVEDetail';
import useWebSocket from './hooks/useWebSocket';
import { addNotificationAsync, updateUnreadCount } from './store/notificationSlice';
import { store } from './store';

const MainLayout = ({ children }) => {
  const [selectedCVE, setSelectedCVE] = useState(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);

  // 웹소켓 메시지 핸들러
  const handleWebSocketMessage = useCallback((data) => {
    console.log('[MainLayout] 웹소켓 메시지 수신:', {
      type: data.type,
      data: data.data,
      timestamp: new Date().toISOString()
    });

    if (data.type === 'notification') {
      console.log('[MainLayout] 알림 메시지 처리:', {
        notification: data.data.notification,
        unreadCount: data.data.unreadCount,
        toast: data.data.toast,
        timestamp: new Date().toISOString()
      });

      // notification과 unreadCount를 함께 전달
      dispatch(addNotificationAsync({
        notification: data.data.notification,
        unreadCount: data.data.unreadCount
      }));

      // 토스트 메시지 표시
      if (data.data.toast) {
        setSnackbar({
          open: true,
          message: data.data.toast.message,
          severity: data.data.toast.severity
        });
      }
    }
  }, [dispatch]);

  // 웹소켓 연결 설정
  const { isConnected } = useWebSocket(handleWebSocketMessage);

  // 웹소켓 연결 상태 로깅
  useEffect(() => {
    console.log('[MainLayout] 웹소켓 연결 상태:', {
      isConnected,
      userId: user?.id,
      timestamp: new Date().toISOString()
    });
  }, [isConnected, user]);

  const handleSnackbarClose = useCallback(() => {
    setSnackbar(prev => ({ ...prev, open: false }));
  }, []);

  const handleOpenCVEDetail = (cveId, commentId) => {
    setSelectedCVE(cveId);
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <Header onOpenCVEDetail={handleOpenCVEDetail} />
      <Sidebar />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 4,
          mt: '64px',
          backgroundColor: '#F8F9FA'
        }}
      >
        {React.cloneElement(children, { selectedCVE, setSelectedCVE })}
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
};

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

const AppRoutes = () => {
  return (
    <Routes>
      {/* 인증 관련 라우트 */}
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

      {/* 보호된 라우트 */}
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
              <CVEDetail />
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

      {/* 기본 라우트 */}
      <Route
        path="/"
        element={<Navigate to="/cves" replace />}
      />

      {/* 알 수 없는 라우트 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
};

export default App;
