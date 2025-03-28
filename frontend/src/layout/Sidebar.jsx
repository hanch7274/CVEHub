import React, { useState, useEffect } from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  ListItemButton,
  IconButton,
  useMediaQuery,
  alpha
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SecurityIcon from '@mui/icons-material/Security';
import StorageIcon from '@mui/icons-material/Storage';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { useTheme } from '@mui/material/styles';
import { Link, useLocation } from 'react-router-dom';

const drawerWidth = 240;

const Sidebar = () => {
  const theme = useTheme();
  const location = useLocation();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState(!isMobile);

  // 화면 크기가 변경될 때 사이드바 상태 조정
  useEffect(() => {
    setOpen(!isMobile);
  }, [isMobile]);

  const handleDrawerToggle = () => {
    setOpen(!open);
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: open ? drawerWidth : 64,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: open ? drawerWidth : 64,
          boxSizing: 'border-box',
          background: 'rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(10px)',
          borderRight: `1px solid ${alpha(theme.palette.common.white, 0.2)}`,
          overflowX: 'hidden',
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
          boxShadow: `4px 0 20px ${alpha('#000', 0.05)}`,
          mt: '64px', // Header 높이만큼 여백 추가
          height: 'calc(100% - 64px)', // Header 높이 제외
        },
      }}
    >
      <Box sx={{ 
        p: open ? 1.5 : 1, 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: open ? 'flex-end' : 'center',
        borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.2)}`
      }}>
        {open ? (
          <IconButton 
            onClick={handleDrawerToggle}
            sx={{
              color: theme.palette.mode === 'dark' ? '#fff' : '#333',
              '&:hover': {
                backgroundColor: alpha(theme.palette.common.white, 0.1)
              },
              transition: 'transform 0.2s ease',
              '&:hover': {
                transform: 'scale(1.1)',
                backgroundColor: alpha(theme.palette.common.white, 0.1)
              }
            }}
          >
            <ChevronLeftIcon />
          </IconButton>
        ) : (
          <IconButton 
            onClick={handleDrawerToggle} 
            sx={{ 
              color: theme.palette.mode === 'dark' ? '#fff' : '#333',
              '&:hover': {
                backgroundColor: alpha(theme.palette.common.white, 0.1)
              },
              transition: 'transform 0.2s ease',
              '&:hover': {
                transform: 'scale(1.1)',
                backgroundColor: alpha(theme.palette.common.white, 0.1)
              }
            }}
          >
            <MenuIcon />
          </IconButton>
        )}
      </Box>
      <List sx={{ mt: 2 }}>
        <ListItem disablePadding>
          <ListItemButton 
            component={Link} 
            to="/"
            selected={location.pathname === '/'}
            sx={{
              borderRadius: open ? '0 20px 20px 0' : '50%',
              mx: open ? 1 : 'auto',
              my: 0.5,
              pl: open ? 2 : 1.5,
              justifyContent: open ? 'flex-start' : 'center',
              '&.Mui-selected': {
                background: 'linear-gradient(90deg, rgba(58, 134, 255, 0.1) 0%, rgba(255, 0, 110, 0.1) 100%)',
              },
              '&:hover': {
                background: 'linear-gradient(90deg, rgba(58, 134, 255, 0.05) 0%, rgba(255, 0, 110, 0.05) 100%)',
              }
            }}
          >
            <ListItemIcon sx={{ 
              minWidth: open ? 40 : 'auto',
              color: location.pathname === '/' ? '#3a86ff' : alpha(theme.palette.text.primary, 0.7)
            }}>
              <DashboardIcon />
            </ListItemIcon>
            {open && (
              <ListItemText 
                primary="Dashboard" 
                primaryTypographyProps={{
                  color: location.pathname === '/' ? '#3a86ff' : theme.palette.text.primary,
                  fontWeight: location.pathname === '/' ? 500 : 400,
                  fontSize: '0.95rem'
                }}
              />
            )}
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton 
            component={Link} 
            to="/cves"
            selected={location.pathname.startsWith('/cves')}
            sx={{
              borderRadius: open ? '0 20px 20px 0' : '50%',
              mx: open ? 1 : 'auto',
              my: 0.5,
              pl: open ? 2 : 1.5,
              justifyContent: open ? 'flex-start' : 'center',
              '&.Mui-selected': {
                background: 'linear-gradient(90deg, rgba(58, 134, 255, 0.1) 0%, rgba(255, 0, 110, 0.1) 100%)',
              },
              '&:hover': {
                background: 'linear-gradient(90deg, rgba(58, 134, 255, 0.05) 0%, rgba(255, 0, 110, 0.05) 100%)',
              }
            }}
          >
            <ListItemIcon sx={{ 
              minWidth: open ? 40 : 'auto',
              color: location.pathname.startsWith('/cves') ? '#3a86ff' : alpha(theme.palette.text.primary, 0.7)
            }}>
              <SecurityIcon />
            </ListItemIcon>
            {open && (
              <ListItemText 
                primary="CVEs" 
                primaryTypographyProps={{
                  color: location.pathname.startsWith('/cves') ? '#3a86ff' : theme.palette.text.primary,
                  fontWeight: location.pathname.startsWith('/cves') ? 500 : 400,
                  fontSize: '0.95rem'
                }}
              />
            )}
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton 
            component={Link} 
            to="/cache"
            selected={location.pathname.startsWith('/cache')}
            sx={{
              borderRadius: open ? '0 20px 20px 0' : '50%',
              mx: open ? 1 : 'auto',
              my: 0.5,
              pl: open ? 2 : 1.5,
              justifyContent: open ? 'flex-start' : 'center',
              '&.Mui-selected': {
                background: 'linear-gradient(90deg, rgba(58, 134, 255, 0.1) 0%, rgba(255, 0, 110, 0.1) 100%)',
              },
              '&:hover': {
                background: 'linear-gradient(90deg, rgba(58, 134, 255, 0.05) 0%, rgba(255, 0, 110, 0.05) 100%)',
              }
            }}
          >
            <ListItemIcon sx={{ 
              minWidth: open ? 40 : 'auto',
              color: location.pathname.startsWith('/cache') ? '#3a86ff' : alpha(theme.palette.text.primary, 0.7)
            }}>
              <StorageIcon />
            </ListItemIcon>
            {open && (
              <ListItemText 
                primary="캐시 시각화" 
                primaryTypographyProps={{
                  color: location.pathname.startsWith('/cache') ? '#3a86ff' : theme.palette.text.primary,
                  fontWeight: location.pathname.startsWith('/cache') ? 500 : 400,
                  fontSize: '0.95rem',
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis' 
                }}
              />
            )}
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );
};

export default Sidebar;
