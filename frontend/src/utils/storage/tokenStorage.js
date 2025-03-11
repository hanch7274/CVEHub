import { api } from '../auth';

// Constants
const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

// Access Token
export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);
export const setAccessToken = (token) => {
  if (!token) {
    console.error('[TokenStorage] Attempted to store empty access token');
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
};
export const removeAccessToken = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
};

// Refresh Token
export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY);
export const setRefreshToken = (token) => {
  if (!token) {
    console.error('[TokenStorage] Attempted to store empty refresh token');
    return;
  }
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
};
export const removeRefreshToken = () => {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

// User
export const getUser = () => {
  const userJson = localStorage.getItem(USER_KEY);
  return userJson ? JSON.parse(userJson) : null;
};
export const setUser = (user) => {
  if (!user) {
    console.error('[TokenStorage] Attempted to store empty user');
    return;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};
export const removeUser = () => localStorage.removeItem(USER_KEY);

// Clear all auth data
export const clearAuthStorage = () => {
  removeAccessToken();
  removeRefreshToken();
  removeUser();
};

// Clear only tokens
export const clearAllTokens = () => {
  removeAccessToken();
  removeRefreshToken();
};

// Refresh access token using refresh token
export const refreshAccessToken = async () => {
  try {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      console.error('[Token] No refresh token available');
      return null;
    }

    // 요청 데이터는 카멜케이스로 작성 (인터셉터에서 스네이크 케이스로 변환됨)
    const response = await api.post('/auth/refresh', { refreshToken });

    // 응답 데이터는 카멜케이스로 접근 (스네이크 케이스는 fallback으로 유지)
    const accessToken = response.data.accessToken || response.data.access_token;
    
    if (!accessToken) {
      console.error('[Token] No access token in refresh response');
      return null;
    }
    
    setAccessToken(accessToken);
    return accessToken;
  } catch (error) {
    console.error('[Token] Failed to refresh token:', error);
    return null;
  }
};
