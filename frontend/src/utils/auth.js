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
  transformRequest: [
    function (data, headers) {
      if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
        return data; // form-urlencoded 데이터는 변환하지 않음
      }
      if (data && typeof data === 'object') {
        return JSON.stringify(toSnakeCase(data));
      }
      return data;
    }
  ],
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

  // snake_case로 변환 (form-urlencoded 데이터 제외)
  if (config.data && typeof config.data === 'object' && 
      config.headers['Content-Type'] !== 'application/x-www-form-urlencoded') {
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
      store?.dispatch({ type: 'auth/logout' });
    }

    // 에러 메시지 처리
    const message = error.response?.data?.detail || error.message || '알 수 없는 오류가 발생했습니다.';
    error.message = message;
    return Promise.reject(message);
  }
);

// 로그인
export const login = async (email, password) => {
  try {
    const data = new URLSearchParams();
    data.append('username', email); // OAuth2 스펙을 따르기 위해 username 필드 사용
    data.append('password', password);

    // 디버깅: 요청 데이터 출력
    console.log('=== Login Request Debug ===');
    console.log('Request URL:', '/auth/token');
    console.log('Request Headers:', {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    console.log('Request Data:', {
      raw: data.toString(),
      parsed: Object.fromEntries(data.entries()),
    });

    const response = await api.post('/auth/token', data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      transformRequest: [(data) => {
        // 디버깅: 변환된 데이터 출력
        console.log('Transformed Request Data:', data);
        return data;
      }],
    });

    // 디버깅: 응답 데이터 출력
    console.log('Response:', response.data);
    
    return response.data;
  } catch (error) {
    // 디버깅: 에러 상세 정보 출력
    console.error('Login Error Details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      headers: error.response?.headers,
    });

    if (Array.isArray(error)) {
      throw error[0]?.msg || '로그인 중 오류가 발생했습니다.';
    }
    throw error;
  }
};

// 현재 사용자 정보 조회
export const getCurrentUser = async () => {
  try {
    const response = await api.get('/auth/me');
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 로그아웃
export const logout = () => {
  localStorage.removeItem('token');
  store?.dispatch({ type: 'auth/logout' });
};
