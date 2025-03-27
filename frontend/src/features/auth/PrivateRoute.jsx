import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { CircularProgress, Box, Typography } from '@mui/material';
import logger from '../../utils/logging';
import { getAccessToken } from '../../utils/storage/tokenStorage';

const PrivateRoute = ({ children }) => {
  const location = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const hasToken = !!getAccessToken();
  
  useEffect(() => {
    logger.info('PrivateRoute', '인증 상태 확인', { 
      isAuthenticated, 
      loading, 
      hasToken,
      path: location.pathname
    });
  }, [isAuthenticated, loading, hasToken, location.pathname]);
  
  // 토큰이 없으면 즉시 로그인 페이지로 리다이렉트
  if (!hasToken) {
    logger.info('PrivateRoute', '토큰 없음, 로그인 페이지로 리다이렉트');
    return <Navigate to="/login" state={{ from: location }} />;
  }
  
  // 로딩 중인 경우 로딩 표시
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh'
        }}
      >
        <CircularProgress size={40} />
        <Typography variant="body2" sx={{ mt: 2 }}>
          인증 정보를 확인하는 중입니다...
        </Typography>
      </Box>
    );
  }

  // 인증되지 않은 경우 로그인 페이지로 리다이렉트
  if (!isAuthenticated) {
    logger.info('PrivateRoute', '인증되지 않음, 로그인 페이지로 리다이렉트');
    return <Navigate to="/login" state={{ from: location }} />;
  }

  return children;
};

export default PrivateRoute;
