import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { login as authLogin, getCurrentUser } from '../utils/auth';

// 초기 상태
const initialState = {
  token: null,
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null
};

// 로그인 Thunk
export const loginThunk = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await authLogin(email, password);
      return response;
    } catch (error) {
      return rejectWithValue(error.response?.data?.detail || '로그인 중 오류가 발생했습니다.');
    }
  }
);

// 현재 사용자 정보 조회 Thunk
export const getCurrentUserThunk = createAsyncThunk(
  'auth/getCurrentUser',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { token } = getState().auth;
      if (!token) {
        throw new Error('토큰이 없습니다.');
      }
      const user = await getCurrentUser();
      return user;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Auth Slice
export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setToken: (state, action) => {
      state.token = action.payload;
      state.isAuthenticated = !!action.payload;
    },
    setUser: (state, action) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
    },
    logout: (state) => {
      state.token = null;
      state.user = null;
      state.isAuthenticated = false;
      state.error = null;
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
        state.token = action.payload.accessToken;
        state.isAuthenticated = true;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // 사용자 정보 조회
      .addCase(getCurrentUserThunk.pending, (state) => {
        state.loading = true;
      })
      .addCase(getCurrentUserThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(getCurrentUserThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.token = null;
        state.user = null;
        state.isAuthenticated = false;
      });
  }
});

export const { setToken, setUser, logout, clearError } = authSlice.actions;

export default authSlice.reducer;
