import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, Snackbar } from '@mui/material';
import Header from './layout/Header';
import Sidebar from './layout/Sidebar';
import CVEList from './features/cve/CVEList';
import CreateCVE from './features/cve/CreateCVE';
import SignUp from './features/auth/SignUp';
import Login from './features/auth/Login';
import PrivateRoute from './features/auth/PrivateRoute';
import AuthRoute from './features/auth/AuthRoute';
import { AuthProvider } from './contexts/AuthContext';
import CVEDetail from './features/cve/CVEDetail';
import { addNotificationAsync } from './store/notificationSlice';
import { store } from './store';
import { WebSocketProvider, useWebSocketContext } from './contexts/WebSocketContext';
import { Provider } from 'react-redux';
import { SnackbarProvider } from 'notistack';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';

const MainLayout = ({ children }) => {
  const [selectedCVE, setSelectedCVE] = useState(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { isConnected, lastMessage } = useWebSocketContext();

  // 웹소켓 메시지 처리
  useEffect(() => {
    if (lastMessage?.type === 'notification') {
      // notification과 unreadCount를 함께 전달
      dispatch(addNotificationAsync({
        notification: lastMessage.data.notification,
        unreadCount: lastMessage.data.unreadCount
      }));

      // 토스트 메시지 표시
      if (lastMessage.data.toast) {
        setSnackbar({
          open: true,
          message: lastMessage.data.toast.message,
          severity: lastMessage.data.toast.severity
        });
      }
    }
  }, [lastMessage, dispatch]);

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
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <SnackbarProvider maxSnack={3}>
          <WebSocketProvider>
            <AuthProvider>
              <Router>
                <CssBaseline />
                <AppRoutes />
              </Router>
            </AuthProvider>
          </WebSocketProvider>
        </SnackbarProvider>
      </ThemeProvider>
    </Provider>
  );
};

export default App;
