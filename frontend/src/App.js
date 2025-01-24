import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Sidebar from './components/Sidebar';
import CVEList from './components/CVEList';
import Header from './components/Header';
import Login from './components/Login';
import { AuthProvider } from './contexts/AuthContext';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
    },
    secondary: {
      main: '#9c27b0',
      light: '#ba68c8',
      dark: '#7b1fa2',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    text: {
      primary: '#2c3e50',
      secondary: '#546e7a',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h5: {
      fontWeight: 500,
    },
    h6: {
      fontWeight: 500,
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          color: '#2c3e50',
          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        },
      },
    },
  },
});

function App() {
  return (
    <AuthProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Box sx={{ display: 'flex', bgcolor: 'background.default', minHeight: '100vh' }}>
            <Header />
            <Sidebar />
            <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
              <Toolbar /> {/* 상단 바 아래 여백 */}
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/cves" element={<CVEList />} />
                <Route path="/" element={<Navigate to="/cves" replace />} />
              </Routes>
            </Box>
          </Box>
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
