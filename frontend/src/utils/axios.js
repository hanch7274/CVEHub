import axios from 'axios';

// axios 인스턴스 생성
export const axiosInstance = axios.create({
  baseURL: 'http://localhost:8000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 토큰 검증 함수
export const isTokenValid = (token) => {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expirationTime = payload.exp * 1000; // 초를 밀리초로 변환
    const currentTime = Date.now();
    const issuedAt = payload.iat * 1000; // 토큰 발급 시간
    
    console.log('Token info:', {
      issuedAt: new Date(issuedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
      expiration: new Date(expirationTime).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
      currentTime: new Date(currentTime).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    });
    
    return currentTime < expirationTime;
  } catch (e) {
    console.error('토큰 검증 중 오류:', e);
    return false;
  }
};

let navigate = null;
export const setNavigate = (nav) => {
  navigate = nav;
};

const handleAuthError = () => {
  const token = localStorage.getItem('token');
  if (token) {
    localStorage.removeItem('token');
    if (window.location.pathname !== '/login') {
      localStorage.setItem('redirectUrl', window.location.pathname);
      if (navigate) {
        navigate('/login');
      } else {
        window.location.href = '/login';
      }
    }
  }
};

// 요청 인터셉터
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`Requesting ${config.url}`);
    }

    if (token && isTokenValid(token)) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (token) {
      console.warn('토큰이 만료되었습니다.');
      handleAuthError();
      return Promise.reject(new Error('토큰이 만료되었습니다.'));
    }

    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// 응답 인터셉터
axiosInstance.interceptors.response.use(
  (response) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Response:', response.config.url);
    }
    return response;
  },
  (error) => {
    if (error.response) {
      if (error.response.status === 401) {
        console.warn('Unauthorized access, redirecting to login...');
        handleAuthError();
      }
      console.error('Response error:', error.response.status, error.response.config.url);
    } else if (error.request) {
      console.error('Request error:', error.request);
    } else {
      console.error('Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
