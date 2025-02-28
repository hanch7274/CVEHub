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
import { store } from './store';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { Provider } from 'react-redux';
import { SnackbarProvider } from 'notistack';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import { injectStore, injectErrorHandler } from './utils/auth';
import { ErrorProvider, useError } from './contexts/ErrorContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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

const MainRoutes = () => {
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

      {/* Default Route */}
      <Route
        path="/"
        element={<Navigate to="/cves" replace />}
      />

      {/* Catch-all Route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const CVEDetail = lazy(() => import('./features/cve/CVEDetail'));

const App = () => {
  // Inject store on load
  useEffect(() => {
    injectStore(store);
  }, []);

  const [selectedCVE, setSelectedCVE] = useState(null);

  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <SnackbarProvider
          maxSnack={3}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'center'
          }}
          style={{
            marginBottom: '20px'
          }}
        >
          <AuthProvider>
            <WebSocketProvider>
              <Router>
                <ErrorProvider>
                  <ErrorHandlerSetup>
                    <CssBaseline />
                    <MainRoutes />
                  </ErrorHandlerSetup>
                </ErrorProvider>
              </Router>
            </WebSocketProvider>
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
        <Suspense fallback={<div>로딩 중...</div>}>
          {selectedCVE && (
            <CVEDetail 
              cveId={selectedCVE}
              open={true}
              onClose={() => setSelectedCVE(null)}
            />
          )}
        </Suspense>
      </ThemeProvider>
    </Provider>
  );
};

export default App;