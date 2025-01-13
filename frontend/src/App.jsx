import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import CVEList from './components/CVEList';
import CreateCVE from './components/CreateCVE';
import SignUp from './components/SignUp';

const MainLayout = ({ children }) => (
  <Box sx={{ display: 'flex' }}>
    <Header />
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
      {children}
    </Box>
  </Box>
);

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

const App = () => {
  return (
    <Router>
      <Routes>
        {/* 인증 관련 라우트 */}
        <Route
          path="/signup"
          element={
            <AuthLayout>
              <SignUp />
            </AuthLayout>
          }
        />
        <Route
          path="/login"
          element={
            <AuthLayout>
              <SignUp />
            </AuthLayout>
          }
        />

        {/* 메인 앱 라우트 */}
        <Route
          path="/cves"
          element={
            <MainLayout>
              <CVEList />
            </MainLayout>
          }
        />
        <Route
          path="/create-cve"
          element={
            <MainLayout>
              <CreateCVE />
            </MainLayout>
          }
        />

        {/* 기본 라우트 */}
        <Route path="/" element={<Navigate to="/cves" />} />

        {/* 알 수 없는 라우트 */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
};

export default App;
