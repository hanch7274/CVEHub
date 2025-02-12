import React, { useEffect, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useWebSocketContext } from './contexts/WebSocketContext';

// 레이지 로딩 적용
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage'));
const HomePage = React.lazy(() => import('./pages/HomePage'));
const CVEListPage = React.lazy(() => import('./pages/CVEListPage'));
const CVEDetailPage = React.lazy(() => import('./pages/CVEDetailPage'));
const PrivateLayout = React.lazy(() => import('./components/PrivateRoute'));

// 로딩 컴포넌트
const LoadingFallback = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '100vh' 
  }}>
    로딩 중...
  </div>
);

const ProtectedRoute = ({ children }) => {
    const { isAuthenticated } = useAuth();
    const { isReady, connectionState } = useWebSocketContext();
    
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // 웹소켓 연결 체크는 인증된 사용자에 대해서만 수행
    if (isAuthenticated && !isReady) {
        return null; // WebSocketProvider의 로딩 화면이 표시됨
    }

    return children;
};

const AppRoutes = () => {
  const { loading, checkAuthStatus, isAuthenticated } = useAuth();
  const location = useLocation();  // 현재 위치 확인을 위해 추가
  
  useEffect(() => {
    // 로그인 페이지가 아닐 때만 인증 상태 체크
    if (location.pathname !== '/login') {
      checkAuthStatus();
    }
  }, [checkAuthStatus, location]);

  if (loading) {
    return <LoadingFallback />;
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* 인증되지 않은 라우트는 웹소켓 체크 제외 */}
        <Route
          path="/login"
          element={
            isAuthenticated ? 
              <Navigate to="/cves" replace /> : 
              <LoginPage />
          }
        />
        <Route
          path="/register"
          element={
            isAuthenticated ? <Navigate to="/cves" replace /> : <RegisterPage />
          }
        />

        {/* 인증된 라우트만 웹소켓 체크 */}
        <Route element={<PrivateLayout />}>
          <Route path="/" element={<Navigate to="/cves" replace />} />
          <Route 
            path="/cves" 
            element={
              <ProtectedRoute>
                <CVEListPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/cves/:id" 
            element={
              <ProtectedRoute>
                <CVEDetailPage />
              </ProtectedRoute>
            } 
          />
        </Route>

        {/* 알 수 없는 경로 처리 */}
        <Route path="*" element={<Navigate to="/cves" replace />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
