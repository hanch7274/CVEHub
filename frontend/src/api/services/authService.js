import api from '../config/axios';
import { AUTH } from '../config/endpoints';
import { setToken, removeToken } from '../../utils/storage/auth';

export const authService = {
  // 로그인
  login: async (credentials) => {
    const response = await api.post(AUTH.LOGIN, credentials);
    if (response.data.accessToken) {
      setToken(response.data.accessToken);
    }
    return response.data;
  },

  // 회원가입
  register: async (userData) => {
    const response = await api.post(AUTH.REGISTER, userData);
    return response.data;
  },

  // 토큰 갱신
  refreshToken: async () => {
    const response = await api.post(AUTH.REFRESH);
    if (response.data.accessToken) {
      setToken(response.data.accessToken);
    }
    return response.data;
  },

  // 현재 사용자 정보 조회
  getCurrentUser: async () => {
    const response = await api.get(AUTH.ME);
    return response.data;
  },

  // 로그아웃
  logout: () => {
    removeToken();
  },
}; 