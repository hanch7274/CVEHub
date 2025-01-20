import axios from 'axios';
import { toCamelCase, toSnakeCase } from './caseConverter';

let store;

export const injectStore = (_store) => {
  store = _store;
};

// Axios 인스턴스 생성
export const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터
api.interceptors.request.use((config) => {
  // URL에서 /api prefix 제거
  if (config.url?.startsWith('/api/')) {
    config.url = config.url.replace('/api/', '/');
  }

  // 토큰이 있으면 헤더에 추가
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // snake_case로 변환
  if (config.data && typeof config.data === 'object') {
    config.data = toSnakeCase(config.data);
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

// 응답 인터셉터
api.interceptors.response.use(
  (response) => {
    // 응답 데이터를 camelCase로 변환
    if (response.data) {
      response.data = toCamelCase(response.data);
    }
    return response;
  },
  (error) => {
    // 401 에러 처리 (인증 실패)
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      store?.dispatch({ type: 'auth/logout' });
    }
    return Promise.reject(error);
  }
);

// 로그인
export const login = async (email, password) => {
  const formData = new URLSearchParams();
  formData.append('email', email);
  formData.append('password', password);

  const response = await api.post('/auth/login', formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  // 응답 데이터를 그대로 반환 (이미 camelCase로 변환되어 있음)
  return response.data;
};

// 현재 사용자 정보 조회
export const getCurrentUser = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

// 로그아웃
export const logout = async () => {
  try {
    await api.post('/auth/logout');
  } catch (error) {
    console.error('Logout error:', error);
  }
};
