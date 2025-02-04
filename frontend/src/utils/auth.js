import axios from 'axios';
import { camelToSnake, snakeToCamel } from './caseConverter';
import { 
  getAccessToken, 
  setAccessToken, 
  setRefreshToken, 
  getRefreshToken,
  setUser,
  getUser,
  clearAuthStorage 
} from './storage/tokenStorage';

// store를 동적으로 주입하기 위한 변수
let store = null;
let errorHandler = null;
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

export const injectStore = (_store) => {
  store = _store;
};

export const injectErrorHandler = (_errorHandler) => {
  errorHandler = _errorHandler;
};

// 상수 정의
const SESSION_ID_KEY = 'sessionId';

// 토큰 갱신
const refreshTokenFn = async () => {
  try {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      throw new Error('Refresh token not found');
    }

    console.log('=== Token Refresh Debug ===');
    console.log('Current refresh token:', refreshToken);

    const response = await axios.post(
      `${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/auth/refresh`,
      {},  // empty body
      {
        skipAuthRefresh: true,
        headers: {
          'Authorization': `Bearer ${refreshToken}`,
          'Content-Type': 'application/json',
        }
      }
    );

    console.log('=== Token Refresh Response ===');
    console.log('Status:', response.status);
    console.log('Data:', response.data);

    // snake_case로 받은 데이터 처리
    const { access_token: newAccessToken, refresh_token: newRefreshToken, user } = response.data;
    
    if (!newAccessToken) {
      throw new Error('New access token not received');
    }

    setAccessToken(newAccessToken);
    if (newRefreshToken) {
      setRefreshToken(newRefreshToken);
    }
    if (user) {
      setUser(user);
    }

    return newAccessToken;
  } catch (error) {
    console.error('=== Token Refresh Error ===');
    console.error('Error:', error.response?.status, error.response?.data);
    clearAuthStorage();
    store?.dispatch({ type: 'auth/logout' });
    throw error;
  }
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
  // skipAuthRefresh가 true인 경우 인터셉터 스킵
  if (config.skipAuthRefresh) {
    return config;
  }

  // URL에서 /api prefix 제거
  if (config.url?.startsWith('/api/')) {
    config.url = config.url.replace('/api/', '/');
  }

  // 토큰이 있으면 헤더에 추가
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // 요청 데이터가 있는 경우 스네이크 케이스로 변환
  if (config.data) {
    config.data = camelToSnake(config.data);
  }

  // 쿼리 파라미터가 있는 경우 스네이크 케이스로 변환
  if (config.params) {
    config.params = camelToSnake(config.params);
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

// 응답 인터셉터
api.interceptors.response.use(
  (response) => {
    // 응답 데이터를 카멜 케이스로 변환
    if (response.data) {
      response.data = snakeToCamel(response.data);
    }
    return response;
  },
  async (error) => {
    // 에러 응답 데이터도 카멜 케이스로 변환
    if (error.response?.data) {
      error.response.data = snakeToCamel(error.response.data);
    }

    const originalRequest = error.config;

    // 토큰 갱신 요청이거나 이미 재시도된 요청인 경우 에러 전파
    if (originalRequest.skipAuthRefresh || originalRequest._retry) {
      if (errorHandler) {
        errorHandler(error);
      }
      return Promise.reject(error);
    }

    // 401 에러인 경우 토큰 갱신 시도
    if (error.response?.status === 401 && getRefreshToken()) {
      if (isRefreshing) {
        try {
          const token = await new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          });
          // 새로운 토큰으로 원래 요청 재시도
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        } catch (err) {
          return Promise.reject(err);
        }
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newAccessToken = await refreshTokenFn();
        processQueue(null, newAccessToken);
        
        // 새로운 토큰으로 원래 요청 재시도
        originalRequest.headers = {
          ...originalRequest.headers,
          Authorization: `Bearer ${newAccessToken}`
        };
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        if (errorHandler) {
          errorHandler(refreshError);
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // 전역 에러 핸들러가 있으면 사용
    if (errorHandler) {
      errorHandler(error);
    }
    
    return Promise.reject(error);
  }
);

// 로그인
export const login = async (email, password) => {
  try {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);
    formData.append('grant_type', 'password');

    const response = await api.post('/auth/token', formData, {
      skipAuthRefresh: true,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
    
    // 응답은 자동으로 카멜케이스로 변환됨
    const { accessToken, refreshToken, user } = response.data;
    
    if (!accessToken) {
      throw new Error('액세스 토큰이 없습니다');
    }
    
    // 토큰과 사용자 정보 저장
    setAccessToken(accessToken);
    if (refreshToken) {
      setRefreshToken(refreshToken);
    }
    if (user) {
      setUser(user);
    }
    
    // store에 로그인 상태 업데이트
    store?.dispatch({ 
      type: 'auth/login', 
      payload: { 
        user,
        isAuthenticated: true
      } 
    });
    
    return response.data;
  } catch (error) {
    console.error('Login error:', error);
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
  clearAuthStorage();
  store?.dispatch({ type: 'auth/logout' });
};

// 로그인 여부 확인
export const isAuthenticated = () => {
  return !!getAccessToken();
};

// 세션 ID 관리
export const getSessionId = () => {
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
};

export const removeSessionId = () => {
  localStorage.removeItem(SESSION_ID_KEY);
};
