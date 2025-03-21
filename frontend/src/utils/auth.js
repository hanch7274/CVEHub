import api from '../api/config/axios';
import { camelToSnake, snakeToCamel } from './caseConverter';
import { CASE_CONVERSION } from '../config';
import { 
  getAccessToken, 
  setAccessToken, 
  setRefreshToken, 
  getRefreshToken,
  setUser,
  getUser,
  clearAuthStorage,
  removeAccessToken,
  removeRefreshToken
} from './storage/tokenStorage';

// 오류 핸들러와 queryClient를 동적으로 주입하기 위한 변수
let errorHandler = null;
let queryClient = null;
let isRefreshing = false;
let failedQueue = [];

// 디버그 모드 설정
const DEBUG_MODE = process.env.NODE_ENV === 'development';

// 디버그 로그 출력 함수
const debugLog = (...args) => {
  if (DEBUG_MODE) {
    // 로그 타입에 따라 색상 지정
    const isError = args[0]?.includes('Error') || args[0]?.includes('실패');
    const isWarning = args[0]?.includes('Warning') || args[0]?.includes('경고');
    const isAuth = args[0]?.includes('Auth') || args[0]?.includes('Token');
    
    // 중요 로그만 컬러로 출력
    if (isError) {
      console.log('%c 🔴 Auth Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', ...args);
    } else if (isWarning) {
      console.log('%c 🟠 Auth Warning', 'background: #ff9800; color: white; padding: 2px 4px; border-radius: 2px;', ...args);
    } else if (isAuth) {
      console.log('%c 🔵 Auth Info', 'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px;', ...args);
    }
    // 일반 디버그 로그는 출력하지 않음
  }
};

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

export const injectErrorHandler = (_errorHandler) => {
  errorHandler = _errorHandler;
};

// React Query의 queryClient 주입
export const injectQueryClient = (_queryClient) => {
  queryClient = _queryClient;
};

// 토큰 갱신
export const refreshTokenFn = async () => {
  try {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      throw new Error('Refresh token not found');
    }

    debugLog('=== Token Refresh Debug ===');
    debugLog('Current refresh token:', refreshToken);

    const response = await api.post(
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

    // queryClient의 invalidateQueries를 호출하여 캐시 무효화
    if (queryClient) {
      queryClient.invalidateQueries();
    }

    return newAccessToken;
  } catch (error) {
    console.error('%c 🔴 Token Refresh Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', '=== Token Refresh Error ===');
    console.error('%c 🔴 Token Refresh Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', 'Error:', error.response?.status, error.response?.data);
    clearAuthStorage();
    throw error;
  }
};

// axios.js에서 생성한 api 인스턴스를 export
export { api };

// 응답 인터셉터
api.interceptors.response.use(
  (response) => {
    // 응답 데이터를 카멜 케이스로 변환
    if (response.data) {
      // 중요한 API 요청에 대해서만 로깅 (auth 관련)
      const isAuthEndpoint = response.config.url && (
        response.config.url.includes('/auth/') || 
        response.config.url.includes('/login') || 
        response.config.url.includes('/signup')
      );
      
      if (isAuthEndpoint && DEBUG_MODE) {
        console.log('%c 🔵 Auth Response', 'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px;', '[Axios Interceptor] 응답 데이터 변환 전:', {
          url: response.config.url,
          method: response.config.method,
          dataType: typeof response.data,
          isArray: Array.isArray(response.data),
          originalKeys: typeof response.data === 'object' ? Object.keys(response.data) : []
        });
      }
      
      response.data = snakeToCamel(response.data);
      
      if (isAuthEndpoint && DEBUG_MODE) {
        console.log('%c 🔵 Auth Response', 'background: #2196f3; color: white; padding: 2px 4px; border-radius: 2px;', '[Axios Interceptor] 응답 데이터 변환 후:', {
          convertedKeys: typeof response.data === 'object' ? Object.keys(response.data) : [],
          sample: response.data
        });
      }
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
      setUser(user);  // 서버에서 받은 실제 사용자 정보 저장
    }
    
    // queryClient의 invalidateQueries를 호출하여 캐시 무효화
    if (queryClient) {
      queryClient.invalidateQueries();
    }
    
    return response.data;
  } catch (error) {
    console.error('%c 🔴 Login Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', 'Login error:', error);
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
export const logout = async () => {
  try {
    // 백엔드에 로그아웃 요청
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      await api.post('/auth/logout', { refresh_token: refreshToken });
    }
  } catch (error) {
    console.error('%c 🔴 Logout Error', 'background: #f44336; color: white; padding: 2px 4px; border-radius: 2px;', 'Logout error:', error);
  } finally {
    // 로컬 저장소에서 사용자 정보 및 토큰 삭제
    clearAuthStorage();
    
    // queryClient의 invalidateQueries를 호출하여 캐시 무효화
    if (queryClient) {
      queryClient.invalidateQueries();
    }
  }
};

// 로그인 여부 확인
export const isAuthenticated = () => {
  return !!getAccessToken();
};

// 토큰 가져오기 (Socket.IO 인증용)
export const getTokenFromStorage = () => {
  return getAccessToken();
};
