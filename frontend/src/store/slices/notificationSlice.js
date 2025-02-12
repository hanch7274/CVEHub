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

export const fetchNotifications = createAsyncThunk(
  'notifications/fetchNotifications',
  async ({ skip = 0, limit = 10 } = {}) => {
    const response = await api.get(NOTIFICATION.BASE, {
      params: { skip, limit }
    });
    return response.data;
  }
);

export const markAsRead = createAsyncThunk(
  'notifications/markAsRead',
  async (notificationId) => {
    await api.put(NOTIFICATION.READ(notificationId));
    return notificationId;
  }
);

// 읽지 않은 알림 개수 조회
export const fetchUnreadCount = createAsyncThunk(
  'notifications/fetchUnreadCount',
  async () => {
    const response = await api.get(NOTIFICATION.UNREAD_COUNT);
    return response.data.count;
  }
);

// 모든 알림 읽음 처리
export const markAllAsRead = createAsyncThunk(
  'notifications/markAllAsRead',
  async () => {
    await api.put(NOTIFICATION.READ_ALL);
    return true;
  }
);

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification: (state, action) => {
      if (!Array.isArray(state.notifications)) {
        state.notifications = [];  // 배열이 아니면 초기화
      }
      state.notifications.unshift(action.payload);
      state.unreadCount += 1;
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
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        // 응답 데이터 구조 확인 및 처리
        if (action.payload && Array.isArray(action.payload.items)) {
          state.notifications = action.payload.items;
          state.total = action.payload.total || 0;
          state.unreadCount = action.payload.unreadCount || 0;
        } else {
          console.error('Invalid notifications data structure:', action.payload);
          state.notifications = [];
        }
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
        state.notifications = [];  // 에러 시 빈 배열로 초기화
      })
      // fetchUnreadCount 처리
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unreadCount = action.payload;
      })
      // markAllAsRead 처리
      .addCase(markAllAsRead.fulfilled, (state) => {
        state.notifications.forEach(notification => {
          notification.is_read = true;
        });
        state.unreadCount = 0;
      })
      // markAsRead
      .addCase(markAsRead.fulfilled, (state, action) => {
        const notification = state.notifications.find(item => item.id === action.payload);
        if (notification) {
          notification.is_read = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      });
  }
});

// 선택자 추가
export const selectNotifications = state => state.notifications.notifications || [];
export const selectUnreadCount = state => state.notifications.unreadCount;
export const selectNotificationLoading = state => state.notifications.loading;
export const selectNotificationError = state => state.notifications.error;

// 동기 액션들 export
export const { addNotification, updateUnreadCount, clearNotifications } = notificationSlice.actions;

// 비동기 액션들은 이미 위에서 export되어 있으므로 추가 export 불필요
// fetchNotifications, markAsRead, fetchUnreadCount, markAllAsRead는 
// 이미 createAsyncThunk로 생성하면서 export됨

export default notificationSlice.reducer;
