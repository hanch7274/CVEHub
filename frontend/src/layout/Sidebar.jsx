import React, { useState } from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  ListItemButton,
  IconButton
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ListAltIcon from '@mui/icons-material/ListAlt';
import StorageIcon from '@mui/icons-material/Storage';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { useTheme } from '@mui/material/styles';
import { Link, useLocation } from 'react-router-dom';

const drawerWidth = 240;

const Sidebar = () => {
  const theme = useTheme();
  const location = useLocation();
  const [open, setOpen] = useState(true);

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
          backgroundColor: theme.palette.background.paper,
          borderRight: `1px solid ${theme.palette.divider}`,
          overflowX: 'hidden',
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        },
      }}
    >
      <Box sx={{ 
        p: 2, 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${theme.palette.divider}`
      }}>
        {open && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <SecurityIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
              <Typography variant="h6" component="div" sx={{ 
                color: theme.palette.primary.main,
                fontWeight: 600
              }}>
                CVE Hub
              </Typography>
            </Box>
            <IconButton onClick={handleDrawerToggle}>
              <ChevronLeftIcon />
            </IconButton>
          </>
        )}
        {!open && (
          <IconButton onClick={handleDrawerToggle} sx={{ mx: 'auto' }}>
            <MenuIcon />
          </IconButton>
        )}
      </Box>
      <List>
        <ListItem disablePadding>
          <ListItemButton 
            component={Link} 
            to="/"
            selected={location.pathname === '/'}
          >
            <ListItemIcon>
              <DashboardIcon color={location.pathname === '/' ? "primary" : "inherit"} />
            </ListItemIcon>
            {open && (
              <ListItemText 
                primary="Dashboard" 
                primaryTypographyProps={{
                  color: location.pathname === '/' ? theme.palette.primary.main : theme.palette.text.primary,
                  fontWeight: location.pathname === '/' ? 500 : 400
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
          >
            <ListItemIcon>
              <SecurityIcon color={location.pathname.startsWith('/cves') ? "primary" : "inherit"} />
            </ListItemIcon>
            {open && (
              <ListItemText 
                primary="CVEs" 
                primaryTypographyProps={{
                  color: location.pathname.startsWith('/cves') ? theme.palette.primary.main : theme.palette.text.primary,
                  fontWeight: location.pathname.startsWith('/cves') ? 500 : 400
                }}
              />
            )}
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton 
            component={Link} 
            to="/tasks"
            selected={location.pathname.startsWith('/tasks')}
          >
            <ListItemIcon>
              <ListAltIcon color={location.pathname.startsWith('/tasks') ? "primary" : "inherit"} />
            </ListItemIcon>
            {open && (
              <ListItemText 
                primary="My Tasks" 
                primaryTypographyProps={{
                  color: location.pathname.startsWith('/tasks') ? theme.palette.primary.main : theme.palette.text.primary,
                  fontWeight: location.pathname.startsWith('/tasks') ? 500 : 400
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
          >
            <ListItemIcon>
              <StorageIcon color={location.pathname.startsWith('/cache') ? "primary" : "inherit"} />
            </ListItemIcon>
            {open && (
              <ListItemText 
                primary="캐시 시각화" 
                primaryTypographyProps={{
                  color: location.pathname.startsWith('/cache') ? theme.palette.primary.main : theme.palette.text.primary,
                  fontWeight: location.pathname.startsWith('/cache') ? 500 : 400
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
