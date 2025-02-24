import React, { useEffect, useState, useCallback, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
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
import { 
  fetchNotifications, 
  markAsRead, 
  markAllAsRead,
  fetchUnreadCount,
  selectNotifications,
  selectUnreadCount,
  selectNotificationLoading
} from '../../store/slices/notificationSlice';
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

  const dispatch = useDispatch();
  
  const notifications = useSelector(selectNotifications);
  const unreadCount = useSelector(selectUnreadCount);
  const loading = useSelector(selectNotificationLoading);

  const ITEMS_PER_PAGE = 5;

  // 초기 데이터 로드
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        await dispatch(fetchUnreadCount()).unwrap();
      } catch (error) {
        console.error('[NotificationBell] 읽지 않은 알림 개수 조회 실패:', error);
      }
    };

    fetchInitialData();
  }, [dispatch]);

  const loadNotifications = useCallback(async (newPage = 0) => {
    try {
      const skip = newPage * ITEMS_PER_PAGE;
      const result = await dispatch(fetchNotifications({ 
        skip, 
        limit: ITEMS_PER_PAGE 
      })).unwrap();
      
      setHasMore(result.length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error('알림을 가져오는 중 오류 발생:', error);
      setSnackbar({
        open: true,
        message: '알림을 불러오는데 실패했습니다.',
        severity: 'error'
      });
    }
  }, [dispatch]);

  const loadMoreNotifications = async () => {
    const nextPage = page + 1;
    setPage(nextPage);
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
    loadNotifications();
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await dispatch(markAllAsRead()).unwrap();
      console.log('모든 알림을 읽음 처리했습니다.');
      await loadNotifications(); // 알림 목록 새로고침
    } catch (error) {
      console.error('알림 일괄 읽음 처리 중 오류:', error);
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
      // 읽음 처리
      await dispatch(markAsRead(notification.id)).unwrap();

      // CVE 상세 페이지로 이동 (있는 경우)
      if (notification.cveId) {
        setSelectedCVE(notification.cveId);
        setDialogOpen(true);
      }
    } catch (error) {
      console.error('알림 처리 중 오류:', error);
      setSnackbar({
        open: true,
        message: '알림을 처리하는 중 오류가 발생했습니다.',
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
    try {
      if (!dateString) return '';
      
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.error('Invalid date string:', dateString);
        return '';
      }

      return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(date);
    } catch (error) {
      console.error('Error formatting date:', error, dateString);
      return '';
    }
  };

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleClick}
        aria-label={`${unreadCount}개의 새로운 알림`}
        sx={{ 
          color: '#FFD700',  // 원래 색상 복원
          position: 'relative' 
        }}
      >
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon sx={{ fontSize: '2rem' }} />
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        PaperProps={{
          sx: {
            maxHeight: '80vh',
            width: '400px',
            overflowX: 'hidden'
          }
        }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">알림</Typography>
          {unreadCount > 0 && (
            <Button onClick={handleMarkAllAsRead} size="small">
              모두 읽음
            </Button>
          )}
        </Box>
        <Divider />
        <Box sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={20} />
            </Box>
          ) : !Array.isArray(notifications) || notifications.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography color="textSecondary">
                알림이 없습니다.
              </Typography>
            </Box>
          ) : (
            notifications.map((notification, index) => (
              <React.Fragment key={notification.id}>
                <MenuItem
                  onClick={() => handleNotificationClick(notification)}
                  sx={{
                    bgcolor: notification.status === 'unread' ? 'action.hover' : 'inherit',
                    py: 1.5
                  }}
                >
                  {formatNotificationContent(notification)}
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                    {formatDate(notification.createdAt)}
                  </Typography>
                </MenuItem>
                {index < notifications.length - 1 && <Divider />}
              </React.Fragment>
            ))
          )}
        </Box>
        {hasMore && (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            padding: '8px',
            borderTop: '1px solid rgba(0, 0, 0, 0.12)'
          }}>
            <Button
              onClick={loadMoreNotifications}
              disabled={loading}
              size="small"
              sx={{ textTransform: 'none' }}
            >
              {loading ? (
                <CircularProgress size={20} sx={{ mr: 1 }} />
              ) : null}
              더보기
            </Button>
          </Box>
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
        autoHideDuration={5000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
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

NotificationBell.displayName = 'NotificationBell';

export default NotificationBell;
