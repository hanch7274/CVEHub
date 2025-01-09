import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Login from './components/Login';
import Register from './components/Register';
import CVEList from './components/CVEList';
import CreateCVE from './components/CreateCVE';
import PrivateRoute from './components/PrivateRoute';

const App = () => {
  const token = localStorage.getItem('token');
  console.log('Current auth state:', { token });

  return (
    <Router>
      <div>
        {token && <Navbar />}
        <Routes>
          {/* 인증이 필요하지 않은 라우트 */}
          <Route path="/login" element={token ? <Navigate to="/cves" /> : <Login />} />
          <Route path="/register" element={token ? <Navigate to="/cves" /> : <Register />} />

          {/* 인증이 필요한 라우트 */}
          <Route
            path="/cves"
            element={
              <PrivateRoute>
                <CVEList />
              </PrivateRoute>
            }
          />
          <Route
            path="/create-cve"
            element={
              <PrivateRoute>
                <CreateCVE />
              </PrivateRoute>
            }
          />

          {/* 기본 라우트 */}
          <Route
            path="/"
            element={token ? <Navigate to="/cves" /> : <Navigate to="/login" />}
          />

          {/* 알 수 없는 라우트 */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
