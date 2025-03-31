import { User } from '../../../features/auth/types';

// 상수
const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

// 액세스 토큰
export const getAccessToken = (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY);
export const setAccessToken = (token: string): void => {
  if (!token) {
    console.error('[TokenStorage] 빈 액세스 토큰 저장 시도');
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
};
export const removeAccessToken = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
};

// 리프레시 토큰
export const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY);
export const setRefreshToken = (token: string): void => {
  if (!token) {
    console.error('[TokenStorage] 빈 리프레시 토큰 저장 시도');
    return;
  }
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
};
export const removeRefreshToken = (): void => {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

// 사용자 정보
export const getUser = (): User | null => {
  const userJson = localStorage.getItem(USER_KEY);
  return userJson ? JSON.parse(userJson) : null;
};
export const setUser = (user: User): void => {
  if (!user) {
    console.error('[TokenStorage] 빈 사용자 정보 저장 시도');
    return;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};
export const removeUser = (): void => localStorage.removeItem(USER_KEY);

// 모든 인증 데이터 삭제
export const clearAuthStorage = (): void => {
  removeAccessToken();
  removeRefreshToken();
  removeUser();
};

// 토큰만 삭제
export const clearAllTokens = (): void => {
  removeAccessToken();
  removeRefreshToken();
};

// 현재 사용자 설정 (setUser의 별칭)
export const setCurrentUser = setUser;
