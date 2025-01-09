import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Button,
  Avatar,
  Menu,
  MenuItem,
  Box,
  InputBase,
  alpha,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsIcon from '@mui/icons-material/Notifications';
import Badge from '@mui/material/Badge';

const Header = () => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

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
        {/* 검색 바 */}
        <Box
          sx={{
            position: 'relative',
            borderRadius: 1,
            backgroundColor: alpha(theme.palette.common.black, 0.04),
            '&:hover': {
              backgroundColor: alpha(theme.palette.common.black, 0.08),
            },
            marginRight: 2,
            marginLeft: 0,
            width: '100%',
            maxWidth: '600px',
          }}
        >
          <Box sx={{ position: 'absolute', p: 2, height: '100%', display: 'flex', alignItems: 'center' }}>
            <SearchIcon sx={{ color: theme.palette.text.secondary }} />
          </Box>
          <InputBase
            placeholder="Search CVEs..."
            sx={{
              color: theme.palette.text.primary,
              pl: 6,
              pr: 1,
              py: 1,
              width: '100%',
            }}
          />
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {/* 알림 아이콘 */}
        <IconButton 
          size="large" 
          sx={{ mr: 2 }}
          color="primary"
        >
          <Badge badgeContent={4} color="error">
            <NotificationsIcon />
          </Badge>
        </IconButton>

        {/* 사용자 메뉴 */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography 
            variant="body1" 
            sx={{ 
              mr: 1,
              color: theme.palette.text.primary 
            }}
          >
            John Doe
          </Typography>
          <IconButton
            onClick={handleMenu}
            size="small"
            sx={{ ml: 1 }}
          >
            <Avatar 
              sx={{ 
                width: 32, 
                height: 32,
                backgroundColor: theme.palette.primary.main 
              }}
            >
              JD
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleClose}
            onClick={handleClose}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <MenuItem>Profile</MenuItem>
            <MenuItem>Settings</MenuItem>
            <MenuItem>Logout</MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
