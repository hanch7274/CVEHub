import React, { useEffect, useState, useCallback, memo } from 'react';
import {
  Badge,
  IconButton,
  Menu,
  MenuItem,
  Typography,
  Box,
  Divider,
  Button,
  Snackbar,
  Alert,
  CircularProgress
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useNotifications, useUnreadCount, useMarkAsRead, useMarkAllAsRead } from '../../api/hooks/useNotifications';
import CVEDetail from '../cve/CVEDetail';

const NotificationBell = memo(() => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCVE, setSelectedCVE] = useState(null);

  const ITEMS_PER_PAGE = 5;
  const skip = page * ITEMS_PER_PAGE;
  
  // React Query 훅 사용
  const { data: unreadCountData } = useUnreadCount({
    refetchOnWindowFocus: true,
    refetchInterval: 60000, // 1분마다 갱신
  });
  
  const { 
    data: notificationsData, 
    isLoading: notificationsLoading,
    refetch: refetchNotifications
  } = useNotifications(
    { skip, limit: ITEMS_PER_PAGE },
    { 
      enabled: Boolean(anchorEl),
      keepPreviousData: true
    }
  );
  
  const markAsReadMutation = useMarkAsRead();
  const markAllAsReadMutation = useMarkAllAsRead();
  
  // 알림 데이터 추출
  const notifications = notificationsData?.items || [];
  const unreadCount = unreadCountData?.count || 0;
  const loading = notificationsLoading;

  // 초기 데이터 로드
  useEffect(() => {
    console.log('=== NotificationBell: Component Mounted ===');
  }, []);

  const loadNotifications = useCallback(async (newPage = 0) => {
    try {
      console.log('=== NotificationBell: Loading Notifications ===');
      console.log('Page:', newPage);
      console.log('Items per page:', ITEMS_PER_PAGE);
      
      setPage(newPage);
      await refetchNotifications();
      
      if (notificationsData) {
        console.log('Notifications loaded successfully:', {
          resultLength: notificationsData.items.length,
          total: notificationsData.total,
          unreadCount: notificationsData.unreadCount
        });
        
        setHasMore(notificationsData.items.length === ITEMS_PER_PAGE);
      }
    } catch (error) {
      console.error('=== NotificationBell: Load Notifications Error ===');
      console.error('Error Details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      setSnackbar({
        open: true,
        message: '알림을 불러오는데 실패했습니다.',
        severity: 'error'
      });
    }
  }, [refetchNotifications, notificationsData]);

  const loadMoreNotifications = async () => {
    const nextPage = page + 1;
    await loadNotifications(nextPage);
  };

  // 알림 목록 가져오기
  useEffect(() => {
    if (Boolean(anchorEl)) {
      loadNotifications(0);
    }
  }, [loadNotifications, anchorEl]);

  const getNotificationId = (notification) => {
    if (!notification) return null;
    
    if (notification.id) return notification.id;
    if (notification.Id) return notification.Id;
    
    return null;
  };

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMarkAllAsRead = async () => {
    try {
      console.log('=== NotificationBell: Marking All As Read ===');
      await markAllAsReadMutation.mutateAsync();
      console.log('All notifications marked as read successfully');
      await loadNotifications(0);
    } catch (error) {
      console.error('=== NotificationBell: Mark All As Read Error ===');
      console.error('Error Details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      setSnackbar({
        open: true,
        message: '알림을 읽음 처리하는 중 오류가 발생했습니다.',
        severity: 'error'
      });
    }
  };

  const formatNotificationContent = useCallback((notification) => {
    const { type, content, metadata } = notification;
    
    switch (type) {
      case 'mention':
        return (
          <Box>
            <Typography variant="body1" gutterBottom>
              {content}
            </Typography>
            {metadata.comment_content && (
              <Typography
                variant="body2"
                sx={{
                  bgcolor: 'background.paper',
                  p: 1,
                  borderRadius: 1,
                  my: 1
                }}
              >
                {metadata.comment_content}
              </Typography>
            )}
          </Box>
        );
      
      case 'cve_update':
        return (
          <Typography variant="body1">
            {content}
          </Typography>
        );
      
      case 'system':
        return (
          <Typography variant="body1">
            {content}
          </Typography>
        );
      
      default:
        return (
          <Typography variant="body1">
            {content}
          </Typography>
        );
    }
  }, []);

  const handleNotificationClick = async (notification) => {
    try {
      const id = getNotificationId(notification);
      
      if (!id) {
        console.error('=== NotificationBell: Invalid notification ID ===');
        return;
      }
      
      console.log('=== NotificationBell: Marking Notification As Read ===');
      console.log('Notification ID:', id);
      
      // 읽음 처리
      await markAsReadMutation.mutateAsync(id);
      console.log('Notification marked as read successfully');
      
      // CVE 관련 알림인 경우 상세 정보 표시
      if (notification.metadata && notification.metadata.cve_id) {
        setSelectedCVE(notification.metadata.cve_id);
        setDialogOpen(true);
      }
    } catch (error) {
      console.error('=== NotificationBell: Mark As Read Error ===');
      console.error('Error Details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      setSnackbar({
        open: true,
        message: '알림을 읽음 처리하는 중 오류가 발생했습니다.',
        severity: 'error'
      });
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedCVE(null);
  };

  const handleSnackbarClose = useCallback(() => {
    setSnackbar(prev => ({ ...prev, open: false }));
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffSec < 60) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;
    if (diffDay < 7) return `${diffDay}일 전`;
    
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <>
      <IconButton
        color="inherit"
        aria-label="notifications"
        onClick={handleClick}
        sx={{ position: 'relative' }}
      >
        <Badge badgeContent={unreadCount} color="error">
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
            maxHeight: 500,
            overflowY: 'auto'
          }
        }}
      >
        <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            알림
          </Typography>
          {unreadCount > 0 && (
            <Button
              size="small"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsReadMutation.isLoading}
            >
              모두 읽음 처리
            </Button>
          )}
        </Box>
        
        <Divider />
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : notifications.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              알림이 없습니다
            </Typography>
          </MenuItem>
        ) : (
          <>
            {notifications.map((notification) => (
              <MenuItem
                key={getNotificationId(notification) || Math.random().toString()}
                onClick={() => handleNotificationClick(notification)}
                sx={{
                  whiteSpace: 'normal',
                  py: 1.5,
                  borderLeft: notification.read ? 'none' : '3px solid #1976d2',
                  bgcolor: notification.read ? 'inherit' : 'rgba(25, 118, 210, 0.08)'
                }}
              >
                <Box sx={{ width: '100%' }}>
                  {formatNotificationContent(notification)}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.5, textAlign: 'right' }}
                  >
                    {formatDate(notification.createdAt)}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
            
            {hasMore && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
                <Button
                  size="small"
                  onClick={loadMoreNotifications}
                  disabled={loading}
                >
                  더 보기
                </Button>
              </Box>
            )}
          </>
        )}
      </Menu>
      
      {selectedCVE && (
        <CVEDetail
          open={dialogOpen}
          onClose={handleDialogClose}
          cveId={selectedCVE}
        />
      )}
      
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
});

export default NotificationBell;
