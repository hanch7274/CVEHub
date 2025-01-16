import axios from 'axios';

// axios 인스턴스 생성
export const api = axios.create({
  baseURL: 'http://localhost:8000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터 추가
api.interceptors.request.use(
  (config) => {
    // /auth/me 요청이고 토큰이 없으면 요청 중단
    if (config.url === '/auth/me' && !localStorage.getItem('token')) {
      return Promise.reject({ noAuth: true });
    }

    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 응답 인터셉터 추가
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // noAuth 플래그가 있으면 조용히 실패 처리
    if (error.noAuth) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !error.config.url.includes('/auth/login')) {
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      
      // 현재 페이지가 로그인 페이지가 아닐 때만 리다이렉트
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// JWT 토큰 관리
const setToken = (token) => {
  if (token) {
    localStorage.setItem('token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
  }
};

// 초기 토큰 설정
const token = localStorage.getItem('token');
if (token) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

// 로그인 함수
export const login = async (email, password) => {
  try {
    const formData = new URLSearchParams();
    formData.append('username', email);  // 이메일을 username 필드로 전송
    formData.append('password', password);

    const response = await api.post('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    const { access_token } = response.data;
    setToken(access_token);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || '로그인 중 오류가 발생했습니다';
  }
};

// 로그아웃 함수
export const logout = async () => {
  try {
    await api.post('/auth/logout');
    setToken(null);
  } catch (error) {
    console.error('로그아웃 중 오류:', error);
    throw error.response?.data?.detail || '로그아웃 중 오류가 발생했습니다';
  }
};

// 현재 사용자 정보 가져오기
export const getCurrentUser = async () => {
  try {
    const response = await api.get('/auth/me');
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      setToken(null); // 인증 오류시 토큰 제거
      return null;
    }
    console.error('사용자 정보 가져오기 오류:', error);
    return null;
  }
};
