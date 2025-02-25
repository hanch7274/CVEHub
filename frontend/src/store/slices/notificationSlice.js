import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../utils/auth';
import { NOTIFICATION } from '../../api/config/endpoints';

// 초기 상태 정의
const initialState = {
  notifications: [],  // 반드시 배열로 초기화
  unreadCount: 0,
  loading: false,
  error: null,
  total: 0
};

// 알림 목록 조회
export const fetchNotifications = createAsyncThunk(
  'notifications/fetchNotifications',
  async ({ skip = 0, limit = 10 } = {}) => {
    try {
      console.log('=== Fetching Notifications Debug ===');
      console.log('Request URL:', NOTIFICATION.BASE);
      console.log('Request Params:', { skip, limit });

      const response = await api.get(NOTIFICATION.BASE, {
        params: { skip, limit }
      });

      console.log('Response Status:', response.status);
      console.log('Response Headers:', {
        'X-Total-Count': response.headers['x-total-count'],
        'X-Unread-Count': response.headers['x-unread-count']
      });
      console.log('Response Data:', response.data);

      return {
        items: response.data,
        total: response.headers['x-total-count'] || 0,
        unreadCount: response.headers['x-unread-count'] || 0
      };
    } catch (error) {
      console.error('=== Fetch Notifications Error ===');
      console.error('Error Details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers,
          params: error.config?.params
        }
      });
      throw error;
    }
  }
);

// 알림 읽음 처리
export const markAsRead = createAsyncThunk(
  'notifications/markAsRead',
  async (notificationId) => {
    try {
      console.log('=== Mark As Read Debug ===');
      console.log('Request URL:', `${NOTIFICATION.BASE}/${notificationId}/read`);
      console.log('Notification ID:', notificationId);

      const response = await api.put(`${NOTIFICATION.BASE}/${notificationId}/read`);
      
      console.log('Response Status:', response.status);
      console.log('Response Data:', response.data);

      return notificationId;
    } catch (error) {
      console.error('=== Mark As Read Error ===');
      console.error('Error Details:', {
        notificationId,
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }
);

// 읽지 않은 알림 개수 조회
export const fetchUnreadCount = createAsyncThunk(
  'notifications/fetchUnreadCount',
  async () => {
    try {
      console.log('=== Fetch Unread Count Debug ===');
      console.log('Request URL:', NOTIFICATION.UNREAD_COUNT);

      const response = await api.get(NOTIFICATION.UNREAD_COUNT);

      console.log('Response Status:', response.status);
      console.log('Response Data:', response.data);

      return response.data.count;
    } catch (error) {
      console.error('=== Fetch Unread Count Error ===');
      console.error('Error Details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }
);

// 모든 알림 읽음 처리
export const markAllAsRead = createAsyncThunk(
  'notifications/markAllAsRead',
  async () => {
    try {
      console.log('=== Mark All As Read Debug ===');
      console.log('Request URL:', NOTIFICATION.READ_ALL);

      const response = await api.put(NOTIFICATION.READ_ALL);

      console.log('Response Status:', response.status);
      console.log('Response Data:', response.data);

      return true;
    } catch (error) {
      console.error('=== Mark All As Read Error ===');
      console.error('Error Details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }
);

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification: (state, action) => {
      state.notifications.unshift(action.payload.notification);
      state.unreadCount = action.payload.unreadCount;
    },
    updateUnreadCount: (state, action) => {
      state.unreadCount = action.payload;
    },
    clearNotifications: (state) => {
      state.notifications = [];
      state.unreadCount = 0;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.notifications = action.payload.items;
        state.total = action.payload.total;
        state.unreadCount = action.payload.unreadCount;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // fetchUnreadCount 처리
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unreadCount = action.payload;
      })
      // markAllAsRead 처리
      .addCase(markAllAsRead.fulfilled, (state) => {
        state.notifications.forEach(notification => {
          notification.status = 'read';
          notification.readAt = new Date().toISOString();
        });
        state.unreadCount = 0;
      })
      // markAsRead
      .addCase(markAsRead.fulfilled, (state, action) => {
        const notification = state.notifications.find(n => n.id === action.payload);
        if (notification) {
          notification.status = 'read';
          notification.readAt = new Date().toISOString();
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      });
  }
});

// 선택자 추가
export const selectNotifications = state => state.notifications.notifications;
export const selectUnreadCount = state => state.notifications.unreadCount;
export const selectNotificationLoading = state => state.notifications.loading;
export const selectNotificationError = state => state.notifications.error;

// 동기 액션들 export
export const { addNotification, updateUnreadCount, clearNotifications } = notificationSlice.actions;

// 비동기 액션들은 이미 위에서 export되어 있으므로 추가 export 불필요
// fetchNotifications, markAsRead, fetchUnreadCount, markAllAsRead는 
// 이미 createAsyncThunk로 생성하면서 export됨

export default notificationSlice.reducer;
