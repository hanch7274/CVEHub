import api from '../api/config/axios';
import { setAccessToken, setRefreshToken, getRefreshToken, getAccessToken, clearAuthStorage, setUser } from '../utils/storage/tokenStorage';
import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '../config';

// store를 동적으로 주입하기 위한 변수 (필요 시 사용)
let store = null;

export const injectStore = (_store) => {
  store = _store;
};

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
    console.log('=== Token Refresh Debug ===');
    console.log('Attempting to refresh token...');

    const formData = new FormData();
    formData.append('refresh_token', currentRefreshToken);

    const response = await axios.post(
      `${API_BASE_URL}${API_ENDPOINTS.AUTH.REFRESH}`, 
      formData, 
      { withCredentials: true }
    );

    console.log('=== Token Refresh Response Debug ===');
    console.log('Response Status:', response.status);
    console.log('Response Data:', {
      hasAccessToken: !!response.data.accessToken,
      hasRefreshToken: !!response.data.refreshToken
    });

    const { accessToken, refreshToken } = response.data;
    
    // 토큰 유효성 검사
    if (!accessToken) {
      console.error('New access token is missing in the response');
      throw new Error('New access token is missing in the response');
    }

    // 토큰 저장
    setAccessToken(accessToken);
    if (refreshToken) {
      setRefreshToken(refreshToken);
    }

    console.log('Token refresh successful');
    return accessToken;
  } catch (error) {
    console.error('=== Token Refresh Error Debug ===');
    console.error('Error Details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      stack: error.stack
    });

    // 401 또는 403 에러인 경우 저장소 초기화 및 리다이렉트
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

    const { accessToken, refreshToken, user } = response.data;

    // 토큰 유효성 검사
    if (!accessToken || !user) {
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
    await api.post('/auth/logout');
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
