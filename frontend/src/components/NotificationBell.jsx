import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Badge,
  IconButton,
  Menu,
  MenuItem,
  Typography,
  Box,
  Divider,
  ListItemText
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { fetchNotifications, fetchUnreadCount, markAsRead } from '../store/notificationSlice';
import CVEDetail from './CVEDetail';
import { api } from '../utils/auth';

const NotificationBell = () => {
  const dispatch = useDispatch();
  const { items: notifications, unreadCount } = useSelector(state => state.notifications);
  const [anchorEl, setAnchorEl] = React.useState(null);
  const [selectedCVE, setSelectedCVE] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // 알림 목록 가져오기
  useEffect(() => {
    dispatch(fetchNotifications());
    dispatch(fetchUnreadCount());
    
    // 주기적으로 알림 업데이트
    const interval = setInterval(() => {
      dispatch(fetchNotifications());
      dispatch(fetchUnreadCount());
    }, 30000); // 30초마다 갱신
    
    return () => clearInterval(interval);
  }, [dispatch]);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
    console.log('Current notifications:', notifications);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedCVE(null);
  };

  const handleNotificationClick = async (notification) => {
    console.log('Clicked notification:', notification);
    
    try {
      // 현재 백엔드에서는 Id로 전달됨
      const notificationId = notification.Id;
      
      if (!notificationId) {
        console.error('No notification ID found:', notification);
        return;
      }

      // CVE 정보 가져오기
      if (notification.cveId) {
        console.log('Fetching CVE details with notification:', {
          cveId: notification.cveId,
          notificationId
        });

        try {
          const response = await api.get(`/cves/${notification.cveId}`, {
            params: {
              notification_id: notificationId
            }
          });
          
          setSelectedCVE(response.data);
          setDialogOpen(true);

          // 알림 목록 갱신
          await dispatch(fetchNotifications());
          await dispatch(fetchUnreadCount());

          console.log('Successfully processed notification:', {
            notificationId,
            cveId: notification.cveId,
            response: response.data
          });
        } catch (error) {
          console.error('Error fetching CVE details:', error, {
            notification,
            notificationId
          });
        }
      } else {
        console.log('No CVE ID in notification:', notification);
      }
      
      handleClose();
    } catch (error) {
      console.error('Error handling notification click:', error, {
        notification
      });
    }
  };

  const renderNotification = (notification) => {
    const notificationId = notification.Id;
    
    console.log('Rendering notification:', {
      id: notificationId,
      isRead: notification.isRead,
      content: notification.content,
      commentContent: notification.commentContent
    });

    return (
      <MenuItem
        key={notificationId}
        onClick={() => handleNotificationClick(notification)}
        sx={{
          backgroundColor: notification.isRead ? 'transparent' : '#e3f2fd',
          '&:hover': {
            backgroundColor: notification.isRead ? '#f5f5f5' : '#bbdefb'
          },
          padding: '12px 16px'
        }}
      >
        <Box>
          <Typography
            variant="body1"
            sx={{
              fontWeight: notification.isRead ? 400 : 500,
              marginBottom: notification.commentContent ? '4px' : 0
            }}
          >
            {notification.content}
          </Typography>
          {notification.commentContent && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                backgroundColor: '#f5f5f5',
                padding: '8px',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {notification.commentContent}
            </Typography>
          )}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', marginTop: '4px' }}
          >
            {new Date(notification.createdAt).toLocaleString('ko-KR', {
              timeZone: 'Asia/Seoul'
            })}
          </Typography>
        </Box>
      </MenuItem>
    );
  };

  return (
    <>
      <IconButton 
        color="inherit" 
        onClick={handleClick}
        sx={{
          position: 'relative',
          '& .MuiSvgIcon-root': {
            color: '#FFEB3B',
            stroke: '#FBC02D',
            strokeWidth: 0.5,
            filter: 'drop-shadow(0px 0px 3px rgba(251, 192, 45, 0.3))',
            fontSize: '28px',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          },
          '&:hover .MuiSvgIcon-root': {
            color: '#FFF59D',
            transform: 'scale(1.1) rotate(12deg)',
            filter: 'drop-shadow(0px 0px 4px rgba(251, 192, 45, 0.5))',
          },
          '&:active .MuiSvgIcon-root': {
            transform: 'scale(0.95)',
          }
        }}
      >
        <Badge 
          badgeContent={unreadCount} 
          color="error"
          sx={{
            '& .MuiBadge-badge': {
              backgroundColor: '#F44336',
              color: 'white',
              border: '2px solid',
              borderColor: '#FBC02D',
              boxShadow: '0 0 0 2px rgba(251, 192, 45, 0.2)',
              minWidth: '20px',
              height: '20px',
              padding: '0 4px',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              transform: 'scale(1) translate(25%, -25%)',
            }
          }}
        >
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        PaperProps={{
          sx: {
            width: 320,
            maxHeight: 400,
            overflowY: 'auto',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            borderRadius: '8px',
            mt: 1
          }
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid rgba(0, 0, 0, 0.12)' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
            알림
          </Typography>
        </Box>
        {notifications.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              새로운 알림이 없습니다
            </Typography>
          </MenuItem>
        ) : (
          notifications.map(notification => renderNotification(notification))
        )}
      </Menu>

      {/* CVE 상세 정보 Dialog */}
      {selectedCVE && (
        <CVEDetail
          open={dialogOpen}
          onClose={handleDialogClose}
          cve={selectedCVE}
          onSave={() => {}}
        />
      )}
    </>
  );
};

export default NotificationBell;
