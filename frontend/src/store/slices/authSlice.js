import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { 
  login as authLogin, 
  getCurrentUser,
  logout as authLogout  // logout 함수 직접 import
} from '../../services/authService';
import { getAccessToken } from '../../utils/storage/tokenStorage';

// 초기 상태
const initialState = {
  user: null,
  isAuthenticated: !!getAccessToken(),
  loading: false,
  error: null,
  isInitialized: false
};

// 로그인 Thunk
export const loginThunk = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await authLogin(credentials);
      return response;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// 현재 사용자 정보 조회 Thunk
export const getCurrentUserThunk = createAsyncThunk(
  'auth/getCurrentUser',
  async (_, { rejectWithValue, getState }) => {
    const { auth } = getState();
    // 이미 초기화되었거나 인증되지 않은 경우 스킵
    if (auth.isInitialized || !auth.isAuthenticated) {
      return null;
    }

    try {
      const user = await getCurrentUser();
      return user;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// 로그아웃 액션 생성
export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await authLogout();  // authService.logout() 대신 authLogout() 사용
      return null;
    } catch (error) {
      return rejectWithValue(error.message || '로그아웃 실패');
    }
  }
);

// Auth Slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // 로그인
      .addCase(loginThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.isInitialized = true;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.isInitialized = true;
      })
      // 사용자 정보 조회
      .addCase(getCurrentUserThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getCurrentUserThunk.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          state.user = action.payload;
          state.isAuthenticated = true;
        }
        state.isInitialized = true;
      })
      .addCase(getCurrentUserThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.user = null;
        state.isAuthenticated = false;
        state.isInitialized = true;
      })
      // 로그아웃 액션 처리
      .addCase(logout.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.loading = false;
        state.error = null;
      })
      .addCase(logout.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export const { setUser, clearError } = authSlice.actions;

export default authSlice.reducer;
