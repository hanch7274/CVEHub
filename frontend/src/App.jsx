import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import CVEList from './components/CVEList';
import CreateCVE from './components/CreateCVE';

const App = () => {
  return (
    <Router>
      <Box sx={{ display: 'flex' }}>
        <Header />
        <Sidebar />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 4,
            mt: '64px', // AppBar 높이
            backgroundColor: '#F8F9FA'
          }}
        >
          <Routes>
            <Route path="/cves" element={<CVEList />} />
            <Route path="/create-cve" element={<CreateCVE />} />
            
            {/* 기본 라우트 */}
            <Route path="/" element={<Navigate to="/cves" />} />
            
            {/* 알 수 없는 라우트 */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Box>
      </Box>
    </Router>
  );
};

export default App;
