import api from '../config/axios';
import { AUTH } from '../config/endpoints';

export const userService = {
  // 사용자 등록
  register: async (data) => {
    const response = await api.post(AUTH.REGISTER, data);
    return response.data;
  },

  // 사용자 로그인
  login: async (data) => {
    const response = await api.post(AUTH.LOGIN, data);
    return response.data;
  },

  // 현재 사용자 정보 조회
  getCurrentUser: async () => {
    const response = await api.get(AUTH.ME);
    return response.data;
  },

  // 현재 사용자 정보 수정
  updateCurrentUser: async (data) => {
    const response = await api.patch(AUTH.ME, data);
    return response.data;
  },

  // 현재 사용자 계정 삭제
  deleteCurrentUser: async () => {
    const response = await api.delete(AUTH.ME);
    return response.data;
  },
}; 