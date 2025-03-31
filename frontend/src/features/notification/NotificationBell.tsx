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
import { useNotifications, useUnreadCount, useMarkAsRead, useMarkAllAsRead } from '../../features/notification/hooks/useNotifications';
import CVEDetail from '../cve/CVEDetail';
import { NotificationBellProps } from '../../shared/types/components';
/**
 * 알림 종 컴포넌트 - RxJS 마이그레이션 버전
 * 
 * 웹 알림을 표시하고 관리하는 컴포넌트입니다.
 * CVE 관련 알림을 받으면 사용자에게 표시하고, 클릭 시 상세 정보를 보여줍니다.
 */
const NotificationBell: React.FC<NotificationBellProps> = memo(({ onOpenCVEDetail }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info' as 'info' | 'error' | 'success' | 'warning'
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCVE, setSelectedCVE] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);

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
  
  const notifications = notificationsData?.notifications || [];
  const totalCount = notificationsData?.total || 0;
  const unreadCount = unreadCountData?.count || 0;
  
  const loadNotifications = useCallback((newPage: number) => {
    setPage(newPage);
    setHasMore((newPage + 1) * ITEMS_PER_PAGE < totalCount);
  }, [totalCount]);
  
  const loadMoreNotifications = useCallback(() => {
    if (hasMore && !notificationsLoading) {
      loadNotifications(page + 1);
    }
  }, [hasMore, notificationsLoading, loadNotifications, page]);
  
  // 알림 목록 가져오기
  useEffect(() => {
    if (Boolean(anchorEl)) {
      loadNotifications(0);
    }
  }, [anchorEl, loadNotifications]);
  
  // 알림 ID 추출 헬퍼 함수
  const getNotificationId = useCallback((notification: any): string | null => {
    if (!notification) return null;
    
    // MongoDB ObjectId 또는 일반 ID 처리
    if (notification._id) return notification._id;
    if (notification.id) return notification.id;
    
    return null;
  }, []);
  
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  
  const handleClose = () => {
    setAnchorEl(null);
  };
  
  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsReadMutation.mutateAsync();
      
      setSnackbar({
        open: true,
        message: '모든 알림을 읽음 처리했습니다.',
        severity: 'success'
      });
      
      // 알림 목록 새로고침
      refetchNotifications();
    } catch (error: any) {
      console.error('모든 알림 읽음 처리 오류:', error);
      
      setSnackbar({
        open: true,
        message: '모든 알림을 읽음 처리하는 중 오류가 발생했습니다.',
        severity: 'error'
      });
    }
  };
  
  const formatNotificationContent = useCallback((notification: any) => {
    const { type, content, metadata } = notification;
    
    switch (type) {
      case 'cve_update':
        return (
          <Typography variant="body1">
            <strong>CVE 업데이트:</strong> {content}
          </Typography>
        );
      
      case 'comment':
        return (
          <Typography variant="body1">
            <strong>댓글:</strong> {content}
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
  
  const handleNotificationClick = async (notification: any) => {
    try {
      const id = getNotificationId(notification);
      
      if (!id) {
        console.error('%c ❌ 알림 ID 오류', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', '유효하지 않은 알림 ID');
        return;
      }
      
      // 읽음 처리
      await markAsReadMutation.mutateAsync(id);
      
      // CVE 관련 알림인 경우 상세 정보 표시
      if (notification.metadata && notification.metadata.cve_id) {
        const cveId = notification.metadata.cve_id;
        const commentId = notification.metadata.comment_id || null;
        
        // 외부에서 전달된 onOpenCVEDetail 함수가 있으면 사용
        if (onOpenCVEDetail) {
          handleClose(); // 메뉴 닫기
          onOpenCVEDetail(cveId, commentId);
        } else {
          // 내부 다이얼로그 사용
          setSelectedCVE(cveId);
          setSelectedCommentId(commentId);
          setDialogOpen(true);
        }
      }
    } catch (error: any) {
      console.error('%c ❌ 알림 읽음 처리 오류', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', {
        message: error.message,
        code: error.code
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
    setSelectedCommentId(null);
  };
  
  const handleSnackbarClose = useCallback(() => {
    setSnackbar(prev => ({ ...prev, open: false }));
  }, []);
  
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffDay > 7) {
      return date.toLocaleDateString('ko-KR', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } else if (diffDay > 0) {
      return `${diffDay}일 전`;
    } else if (diffHour > 0) {
      return `${diffHour}시간 전`;
    } else if (diffMin > 0) {
      return `${diffMin}분 전`;
    } else {
      return '방금 전';
    }
  };
  
  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleClick}
        aria-label="알림"
      >
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      
      <Menu
        id="notification-menu"
        anchorEl={anchorEl}
        keepMounted
        open={Boolean(anchorEl)}
        onClose={handleClose}
        PaperProps={{
          style: {
            width: '320px',
            maxHeight: '70vh',
          },
        }}
      >
        <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
            알림
            {unreadCount > 0 && (
              <Typography component="span" color="error" sx={{ ml: 1 }}>
                ({unreadCount}개 안 읽음)
              </Typography>
            )}
          </Typography>
          
          {unreadCount > 0 && (
            <Button 
              size="small" 
              color="primary" 
              onClick={handleMarkAllAsRead}
              disabled={markAllAsReadMutation.isLoading}
            >
              {markAllAsReadMutation.isLoading ? (
                <CircularProgress size={16} />
              ) : (
                '모두 읽음'
              )}
            </Button>
          )}
        </Box>
        
        <Divider />
        
        {notificationsLoading && (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        )}
        
        {!notificationsLoading && notifications.length === 0 && (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              알림이 없습니다.
            </Typography>
          </Box>
        )}
        
        {notifications.map((notification: any, index: number) => (
          <React.Fragment key={getNotificationId(notification) || index}>
            <MenuItem 
              onClick={() => handleNotificationClick(notification)}
              sx={{ 
                py: 1.5,
                px: 2,
                borderLeft: notification.read ? 'none' : '4px solid',
                borderColor: 'primary.main',
                backgroundColor: notification.read ? 'transparent' : 'rgba(0, 0, 0, 0.04)',
                '&:hover': {
                  backgroundColor: notification.read ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.1)',
                }
              }}
            >
              <Box sx={{ width: '100%' }}>
                {formatNotificationContent(notification)}
                
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {formatDate(notification.createdAt)}
                </Typography>
              </Box>
            </MenuItem>
            {index < notifications.length - 1 && <Divider />}
          </React.Fragment>
        ))}
        
        {hasMore && (
          <Box sx={{ p: 1, textAlign: 'center' }}>
            <Button 
              size="small" 
              onClick={loadMoreNotifications}
              disabled={notificationsLoading}
            >
              더 보기
            </Button>
          </Box>
        )}
      </Menu>
      
      {/* CVE 상세 다이얼로그 */}
      {dialogOpen && selectedCVE && (
        <CVEDetail
          cveId={selectedCVE}
          open={dialogOpen}
          onClose={handleDialogClose}
          highlightCommentId={selectedCommentId}
        />
      )}
      
      {/* 알림 스낵바 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={handleSnackbarClose}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
});

export default NotificationBell;
