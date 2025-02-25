import { api } from '../auth';

// Constants
const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

// Access Token
export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);
export const setAccessToken = (token) => localStorage.setItem(ACCESS_TOKEN_KEY, token);
export const removeAccessToken = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
};

// Refresh Token
export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY);
export const setRefreshToken = (token) => localStorage.setItem(REFRESH_TOKEN_KEY, token);
export const removeRefreshToken = () => {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

// User
export const getUser = () => {
  const userStr = localStorage.getItem(USER_KEY);
  return userStr ? JSON.parse(userStr) : null;
};
export const setUser = (user) => localStorage.setItem(USER_KEY, JSON.stringify(user));
export const removeUser = () => localStorage.removeItem(USER_KEY);

// Clear all auth related data
export const clearAuthStorage = () => {
  removeAccessToken();
  removeRefreshToken();
  removeUser();
};

export const clearAllTokens = () => {
  removeAccessToken();
  removeRefreshToken();
};

// 토큰 자동 갱신 함수 (axios와 WebSocket 모두에서 활용)
export const refreshAccessToken = async () => {
  try {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      console.error('[Token] No refresh token available');
      return null;
    }

    const response = await api.post('/auth/refresh', { refresh_token: refreshToken });
    const { access_token } = response.data;
    
    localStorage.setItem('accessToken', access_token);
    return access_token;
  } catch (error) {
    console.error('[Token] Failed to refresh token:', error);
    return null;
  }
};
