import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import CVEListPage from './pages/CVEListPage';
import CVEDetailPage from './pages/CVEDetailPage';
import PrivateLayout from './components/PrivateRoute';
import { useAuth } from './contexts/AuthContext';

const AppRoutes = () => {
  const { loading, checkAuthStatus } = useAuth();
  
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  if (loading) {
    return <div>로딩 중...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<PrivateLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/cves" element={<CVEListPage />} />
        <Route path="/cves/:id" element={<CVEDetailPage />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
