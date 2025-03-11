import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
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
import { SocketIOProvider } from './contexts/SocketIOContext';
import { SnackbarProvider } from 'notistack';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import { injectErrorHandler, injectQueryClient } from './utils/auth';
import { ErrorProvider, useError } from './contexts/ErrorContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import WebSocketQueryBridge from './contexts/WebSocketQueryBridge';

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
              <Suspense fallback={<div>로딩 중...</div>}>
                <CVEDetail />
              </Suspense>
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

      {/* Default Route */}
      <Route
        path="/"
        element={<Navigate to="/cves" replace />}
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

const CVEDetail = lazy(() => import('./features/cve/CVEDetail'));

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

const App = () => {
  const [selectedCVE, setSelectedCVE] = useState(null);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <SnackbarProvider
          maxSnack={3}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          autoHideDuration={3000}
        >
          <AuthProvider>
            <SocketIOProvider>
              <Router>
                <ErrorProvider>
                  <ErrorHandlerSetup>
                    <CssBaseline />
                    <WebSocketQueryBridge />
                    <MainRoutes setSelectedCVE={setSelectedCVE} selectedCVE={selectedCVE} />
                  </ErrorHandlerSetup>
                </ErrorProvider>
              </Router>
            </SocketIOProvider>
          </AuthProvider>
        </SnackbarProvider>
        <ToastContainer
          position="bottom-center"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="colored"
        />
      </ThemeProvider>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
};

export default App;