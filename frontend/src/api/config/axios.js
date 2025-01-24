import axios from 'axios';
import { getToken, refreshToken } from '../../utils/storage/auth';
import { camelToSnake, snakeToCamel } from '../../utils/format/caseConverter';

const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const axiosInstance = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    // 토큰 추가
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // camelCase to snake_case
    if (config.data) {
      config.data = camelToSnake(config.data);
    }
    if (config.params) {
      config.params = camelToSnake(config.params);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor
axiosInstance.interceptors.response.use(
  (response) => {
    // snake_case to camelCase
    if (response.data) {
      response.data = snakeToCamel(response.data);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // 토큰 만료 시 갱신 시도
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance; 