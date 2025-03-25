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
