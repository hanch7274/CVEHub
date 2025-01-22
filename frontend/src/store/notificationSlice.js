import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../utils/auth';

// 초기 상태
const initialState = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null
};

// 알림 목록 조회
export const fetchNotifications = createAsyncThunk(
  'notifications/fetchNotifications',
  async (params = {}, { rejectWithValue }) => {
    try {
      const { skip = 0, limit = 20, is_read } = params;
      let url = `/notifications?skip=${skip}&limit=${limit}`;
      if (is_read !== undefined) {
        url += `&is_read=${is_read}`;
      }
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// 읽지 않은 알림 개수 조회
export const fetchUnreadCount = createAsyncThunk(
  'notifications/fetchUnreadCount',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/notifications/unread');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// 알림 읽음 처리
export const markAsRead = createAsyncThunk(
  'notifications/markAsRead',
  async (notificationId, { rejectWithValue }) => {
    try {
      await api.post(`/notifications/read/${notificationId}`);
      return notificationId;
    } catch (error) {
      return rejectWithValue(error.message);
    }
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
  async (_, { rejectWithValue }) => {
    try {
      await api.post('/notifications/read-all');
      return true;
    } catch (error) {
      return rejectWithValue(error.message);
    }
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
    addNewNotification: (state, action) => {
      state.notifications.unshift(action.payload);
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
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.notifications = action.payload;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unreadCount = action.payload;
      })
      .addCase(markAsRead.fulfilled, (state, action) => {
        const notification = state.notifications.find(n => n.id === action.payload);
        if (notification) {
          notification.is_read = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markAllAsRead.fulfilled, (state) => {
        state.notifications.forEach(notification => {
          notification.is_read = true;
        });
        state.unreadCount = 0;
      });
  }
});

export const { addNewNotification, updateUnreadCount } = notificationSlice.actions;
export default notificationSlice.reducer;
