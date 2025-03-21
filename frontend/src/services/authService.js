import api from '../api/config/axios';
import { setAccessToken, setRefreshToken, getRefreshToken, getAccessToken, clearAuthStorage, setUser } from '../utils/storage/tokenStorage';
import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '../config';

// 현재 사용자 정보 조회
export const getCurrentUser = async () => {
  try {
    const response = await api.get('/auth/me');
    return response.data;
  } catch (error) {
    console.error('Get current user error:', error);
    throw error;
  }
};

// 토큰 갱신 (자동 갱신 로직 적용)
export const refreshToken = async () => {
  const currentRefreshToken = getRefreshToken();
  
  if (!currentRefreshToken) {
    console.log('No refresh token available');
    throw new Error('No refresh token available');
  }

  try {
    console.log('Attempting to refresh token...');

    // api 인스턴스 대신 기본 axios 사용하여 순환 참조 방지
    // 또한 skipAuthRefresh 플래그를 추가하여 인터셉터에서 토큰 갱신 로직 건너뛰기
    const response = await axios.post(
      `${API_BASE_URL}${API_ENDPOINTS.AUTH.REFRESH}`, 
      {
        refresh_token: currentRefreshToken  // 직접 스네이크 케이스 사용 (인터셉터를 거치지 않으므로)
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        skipAuthRefresh: true  // 이 플래그로 인터셉터에서 토큰 갱신 로직 건너뛰기
      }
    );

    console.log('Token refresh response received');

    // 카멜케이스 필드명 사용 (스네이크 케이스 필드명은 fallback으로 유지)
    const accessToken = response.data.accessToken || response.data.access_token;
    const refreshTokenValue = response.data.refreshToken || response.data.refresh_token;
    const user = response.data.user;
    
    if (!accessToken) {
      console.error('New access token is missing in the response');
      throw new Error('New access token is missing in the response');
    }

    setAccessToken(accessToken);
    if (refreshTokenValue) {
      setRefreshToken(refreshTokenValue);
    }
    if (user) {
      setUser(user);
    }

    console.log('Token refresh successful');
    return accessToken;
  } catch (error) {
    console.error('Token refresh error:', {
      status: error.response?.status,
      message: error.message
    });

    if (error.response?.status === 401 || error.response?.status === 403) {
      console.log('Token refresh failed with auth error, clearing storage...');
      clearAuthStorage();
      
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname + window.location.search;
        sessionStorage.setItem('redirectAfterLogin', currentPath);
      }
    }

    throw error;
  }
};

// 로그인
export const login = async (credentials) => {
  try {
    console.log('=== Login Request Debug ===');
    console.log('Request URL:', '/auth/token');
    console.log('Request Data:', credentials);
    console.log('API Base URL:', process.env.REACT_APP_API_URL || 'http://localhost:8000');

    const formData = new URLSearchParams();
    formData.append('username', credentials.email);
    formData.append('password', credentials.password);

    console.log('Form Data:', formData.toString());

    const response = await api.post('/auth/token', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });

    console.log('=== Login Response Debug ===');
    console.log('Response Status:', response.status);
    console.log('Raw Response Data:', response.data);
    console.log('Response Data Keys:', Object.keys(response.data));

    // 카멜케이스 필드명 사용 (스네이크 케이스 필드명은 fallback으로 유지)
    const accessToken = response.data.accessToken || response.data.access_token;
    const refreshToken = response.data.refreshToken || response.data.refresh_token;
    const user = response.data.user;

    // 토큰 유효성 검사
    if (!accessToken || !user) {
      console.error('Invalid response data:', {
        hasAccessToken: !!accessToken,
        hasUser: !!user,
        responseKeys: Object.keys(response.data)
      });
      throw new Error('Invalid response data: Missing access token or user data');
    }

    try {
      setAccessToken(accessToken);
      console.log('Access token saved successfully');

      if (refreshToken) {
        setRefreshToken(refreshToken);
        console.log('Refresh token saved successfully');
      }

      setUser(user);
      console.log('User data saved successfully');
    } catch (storageError) {
      console.error('Error saving authentication data:', storageError);
      clearAuthStorage();
      throw new Error('Failed to save authentication data');
    }

    return {
      user,
      isAuthenticated: true
    };
  } catch (error) {
    console.error('=== Login Error Debug ===');
    console.error('Error Details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
        data: error.config?.data
      }
    });
    throw error.response?.data?.detail || error.message || '로그인 중 오류가 발생했습니다.';
  }
};

// 로그아웃
export const logout = async () => {
  try {
    const refreshToken = getRefreshToken();
    await api.post('/auth/logout', { refresh_token: refreshToken });
    clearAuthStorage();
  } catch (error) {
    console.error('Logout error:', error);
    clearAuthStorage();
    throw error;
  }
};

// 로그인 여부 확인
export const isAuthenticated = () => {
  return !!getAccessToken();
};

// 회원가입
export const register = async (userData) => {
  try {
    console.log('=== Register Request Debug ===');
    console.log('Request URL:', '/auth/signup');
    console.log('Request Data:', userData);

    const response = await api.post('/auth/signup', userData);

    console.log('=== Register Response Debug ===');
    console.log('Response Status:', response.status);
    console.log('Response Data:', response.data);

    return response.data;
  } catch (error) {
    console.error('=== Register Error Debug ===');
    console.error('Error Details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
        data: error.config?.data
      }
    });
    throw error.response?.data?.detail || error.message || '회원가입 중 오류가 발생했습니다.';
  }
};
