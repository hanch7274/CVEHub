import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../utils/auth';

// 초기 상태
const initialState = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
  total: 0
};

// 알림 목록 조회
export const fetchNotifications = createAsyncThunk(
  'notifications/fetchNotifications',
  async ({ skip = 0, limit = 10 }) => {
    const response = await api.get('/notification', {
      params: { skip, limit }
    });
    return response.data;
  }
);

// 읽지 않은 알림 개수 조회
export const fetchUnreadCount = createAsyncThunk(
  'notifications/fetchUnreadCount',
  async () => {
    const response = await api.get('/notification/unread-count');
    return response.data.count;
  }
);

// 알림 읽음 처리
export const markAsRead = createAsyncThunk(
  'notifications/markAsRead',
  async (notificationId) => {
    const response = await api.patch(`/notification/${notificationId}/read`);
    return response.data;
  }
);

// 여러 알림 읽음 처리
export const markMultipleAsRead = createAsyncThunk(
  'notifications/markMultipleAsRead',
  async (notificationIds, { rejectWithValue }) => {
    try {
      await api.post('/notifications/read-multiple', { notification_ids: notificationIds });
      return notificationIds;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// 모든 알림 읽음 처리
export const markAllAsRead = createAsyncThunk(
  'notifications/markAllAsRead',
  async () => {
    const response = await api.patch('/notification/read-all');
    return response.data;
  }
);

// 새 알림 추가 thunk
export const addNotificationAsync = createAsyncThunk(
  'notifications/addNotificationAsync',
  async (data) => {
    const { notification, unreadCount } = data;
    return { notification, unreadCount };
  }
);

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification: (state, action) => {
      state.notifications.unshift(action.payload);
      state.unreadCount += 1;
    },
    updateUnreadCount: (state, action) => {
      state.unreadCount = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(addNotificationAsync.fulfilled, (state, action) => {
        const { notification, unreadCount } = action.payload;
        state.notifications.unshift(notification);
        state.unreadCount = unreadCount;
      })
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.notifications = action.payload.items;
        state.total = action.payload.total;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(fetchUnreadCount.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.loading = false;
        state.unreadCount = action.payload;
      })
      .addCase(fetchUnreadCount.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(markAsRead.fulfilled, (state, action) => {
        const updatedNotification = action.payload;
        state.notifications = state.notifications.map(notification =>
          notification.id === updatedNotification.id ? updatedNotification : notification
        );
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      })
      .addCase(markAllAsRead.fulfilled, (state) => {
        state.notifications = state.notifications.map(notification => ({
          ...notification,
          is_read: true
        }));
        state.unreadCount = 0;
      });
  }
});

export const { addNotification, updateUnreadCount } = notificationSlice.actions;
export default notificationSlice.reducer;
