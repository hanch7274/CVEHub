import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  Box,
  Tooltip,
  Divider,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import NotificationsIcon from '@mui/icons-material/Notifications';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import Badge from '@mui/material/Badge';
import { useAuth } from '../contexts/AuthContext';
import { getAnimalEmoji } from '../utils/avatarUtils';

const Header = () => {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState(null);

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleClose();
    logout();
  };

  const animalEmoji = user ? getAnimalEmoji(user.username) : '👤';

  return (
    <AppBar 
      position="fixed" 
      sx={{ 
        zIndex: theme.zIndex.drawer + 1,
        backgroundColor: theme.palette.background.paper,
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
      }}
    >
      <Toolbar>
        <Typography
          variant="h6"
          sx={{
            color: theme.palette.primary.main,
            fontWeight: 600,
            letterSpacing: '0.5px'
          }}
        >
          CVEHub
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        {/* 알림 아이콘 */}
        <Tooltip title="알림">
          <IconButton 
            size="small" 
            sx={{ 
              mr: 2,
              bgcolor: 'action.hover',
              '&:hover': { bgcolor: 'action.selected' }
            }}
          >
            <Badge badgeContent={4} color="error">
              <NotificationsIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>

        {/* 사용자 메뉴 */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography 
            variant="body1" 
            sx={{ 
              mr: 1,
              color: theme.palette.text.primary,
              fontWeight: 500
            }}
          >
            {user?.username || 'Guest'}
          </Typography>
          <Tooltip title="계정 메뉴">
            <IconButton
              onClick={handleMenu}
              size="small"
              sx={{ 
                ml: 1,
                bgcolor: 'action.hover',
                '&:hover': { bgcolor: 'action.selected' }
              }}
            >
              <Avatar 
                sx={{ 
                  width: 32, 
                  height: 32,
                  bgcolor: 'primary.light',
                  fontSize: '1.2rem'
                }}
              >
                {animalEmoji}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Box>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
          onClick={handleClose}
          PaperProps={{
            sx: {
              mt: 1.5,
              minWidth: 200,
              boxShadow: '0px 2px 8px rgba(0,0,0,0.1)',
              '& .MuiMenuItem-root': {
                px: 2,
                py: 1.5,
                gap: 1.5,
              },
            },
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <MenuItem onClick={handleClose}>
            <PersonIcon fontSize="small" />
            프로필
          </MenuItem>
          <MenuItem onClick={handleClose}>
            <SettingsIcon fontSize="small" />
            설정
          </MenuItem>
          <Divider sx={{ my: 1 }} />
          <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
            <LogoutIcon fontSize="small" />
            로그아웃
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
