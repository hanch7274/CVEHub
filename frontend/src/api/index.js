import axios from 'axios';

const api = axios.create({
  baseURL: 'http://10.0.7.200:8000',
  withCredentials: true,  // 쿠키를 포함하여 요청
  headers: {
    'Content-Type': 'application/json',
  },
});

// 응답 인터셉터 추가
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 에러 처리
    if (error.response && error.response.status === 401) {
      // 로그인 페이지로 리다이렉트
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

export { authService } from './services/authService';
export { cveService } from './services/cveService';
export { notificationService } from './services/notificationService';
export { default as api } from './config/axios';
