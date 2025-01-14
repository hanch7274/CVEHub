import axios from 'axios';

// axios 인스턴스 생성
export const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  withCredentials: true, // 쿠키를 포함하기 위해 필요
  headers: {
    'Content-Type': 'application/json',
  },
});

// 로그인 함수
export const login = async (email, password) => {
  try {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || '로그인 중 오류가 발생했습니다';
  }
};

// 로그아웃 함수
export const logout = async () => {
  try {
    await api.post('/auth/logout');
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
      return null; // 인증되지 않은 상태는 정상적인 케이스
    }
    console.error('사용자 정보 가져오기 오류:', error);
    return null;
  }
};
