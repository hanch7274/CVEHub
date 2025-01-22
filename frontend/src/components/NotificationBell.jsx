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
import { api } from '../utils/auth';
import { 
  fetchNotifications, 
  markAsRead, 
  markAllAsRead,
  fetchUnreadCount
} from '../store/notificationSlice';
import CVEDetail from './CVEDetail';

const NotificationBell = memo(() => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCVE, setSelectedCVE] = useState(null);

  const dispatch = useDispatch();
  
  // notifications와 unreadCount를 직접 구독
  const notifications = useSelector(state => state.notifications.notifications);
  const unreadCount = useSelector(state => state.notifications.unreadCount);

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
      setLoading(true);
      const skip = newPage * ITEMS_PER_PAGE;
      const result = await dispatch(fetchNotifications({ 
        skip, 
        limit: ITEMS_PER_PAGE 
      })).unwrap();
      
      // 더 로드할 데이터가 있는지 확인
      setHasMore(result.length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error('알림을 가져오는 중 오류 발생:', error);
      setSnackbar({
        open: true,
        message: '알림을 불러오는데 실패했습니다.',
        severity: 'error'
      });
    } finally {
      setLoading(false);
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

  const handleNotificationClick = async (notification) => {
    const notificationId = getNotificationId(notification);
    if (!notificationId) {
      console.error('알림 ID를 찾을 수 없음:', notification);
      return;
    }

    try {
      // 알림을 읽음 상태로 변경
      if (!notification.is_read) {
        await dispatch(markAsRead(notificationId)).unwrap();
        console.log('[NotificationBell] 알림 읽음 처리 완료:', {
          notificationId,
          timestamp: new Date().toISOString()
        });
      }
      
      // CVE 상세 정보 다이얼로그 표시
      setSelectedCVE(notification.cveId);
      setDialogOpen(true);
      handleClose();
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
        sx={{ color: '#FFD700' }}
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
          style: {
            maxHeight: '500px',
            width: '400px',
            overflowY: 'hidden'
          }
        }}
      >
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '8px 16px',
          borderBottom: '1px solid rgba(0, 0, 0, 0.12)'
        }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
            알림
          </Typography>
          {unreadCount > 0 && (
            <Button
              size="small"
              onClick={handleMarkAllAsRead}
              sx={{ 
                minWidth: 'auto',
                textTransform: 'none',
                fontSize: '0.8rem'
              }}
            >
              모두 읽기
            </Button>
          )}
        </Box>
        <Box sx={{ maxHeight: '400px', overflowY: 'auto' }}>
          {notifications.length === 0 ? (
            <MenuItem disabled>
              <Typography variant="body2" color="textSecondary">
                알림이 없습니다
              </Typography>
            </MenuItem>
          ) : (
            notifications.map((notification, index) => (
              <React.Fragment key={getNotificationId(notification) || index}>
                <MenuItem
                  onClick={() => handleNotificationClick(notification)}
                  sx={{
                    backgroundColor: notification.is_read ? 'transparent' : '#e3f2fd',
                    '&:hover': {
                      backgroundColor: notification.is_read ? '#f5f5f5' : '#bbdefb'
                    },
                    padding: '8px 16px'
                  }}
                >
                  <Box sx={{ width: '100%' }}>
                    <Typography variant="body1" gutterBottom>
                      {notification.content}
                    </Typography>
                    {notification.commentContent && (
                      <Typography
                        variant="body2"
                        sx={{
                          backgroundColor: '#f5f5f5',
                          padding: 1,
                          borderRadius: 1,
                          marginY: 1
                        }}
                      >
                        {notification.commentContent}
                      </Typography>
                    )}
                    <Typography variant="caption" color="textSecondary">
                      {formatDate(notification.createdAt)}
                    </Typography>
                  </Box>
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
