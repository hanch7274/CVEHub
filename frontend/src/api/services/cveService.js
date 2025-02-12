import api from '../config/axios';
import { CVE } from '../config/endpoints';

export const cveService = {
  // CVE 관리
  getCVEs: async (params) => {
    try {
      console.log('Requesting CVEs with params:', params);
      const response = await api.get('/cves', { params });
      console.log('CVE response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching CVEs:', error);
      throw error;
    }
  },

  // CVE 상세 조회
  getCVEById: async (cveId) => {
    try {
      console.log('Requesting CVE:', cveId);
      const response = await api.get(`/cves/${cveId}`);
      console.log('CVE response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error in getCVEById:', error);
      throw error;
    }
  },

  // CVE 생성
  createCVE: async (data) => {
    try {
      console.log('Creating CVE with data:', data);
      const response = await api.post(CVE.BASE, data);
      return response.data;
    } catch (error) {
      console.error('Error creating CVE:', error.response?.data || error);
      throw error;
    }
  },

  // CVE 수정
  updateCVE: async (id, data) => {
    const response = await api.patch(CVE.DETAIL(id), data);
    return response.data;
  },

  // CVE 삭제
  deleteCVE: async (id) => {
    const response = await api.delete(CVE.DETAIL(id));
    return response.data;
  },

  // CVE 검색
  searchCVEs: async (params) => {
    const response = await api.get(CVE.SEARCH, { params });
    return response.data;
  },

  // 댓글 관리
  getComments: async (id) => {
    const response = await api.get(CVE.COMMENTS(id));
    return response.data;
  },

  // 댓글 작성
  createComment: async (id, data) => {
    const response = await api.post(CVE.COMMENTS(id), data);
    return response.data;
  },

  // 댓글 수정
  updateComment: async (cveId, commentId, data) => {
    const response = await api.patch(CVE.COMMENT(cveId, commentId), data);
    return response.data;
  },

  // 댓글 삭제
  deleteComment: async (cveId, commentId, permanent = false) => {
    const response = await api.delete(CVE.COMMENT(cveId, commentId), {
      params: { permanent },
    });
    return response.data;
  },

  // 보안 도구 관리
  addPoC: async (id, data) => {
    const response = await api.post(CVE.POC(id), data);
    return response.data;
  },

  // Snort Rule 추가
  addSnortRule: async (id, data) => {
    const response = await api.post(CVE.SNORT_RULE(id), data);
    return response.data;
  },

  // Lock 관리
  acquireLock: async (id) => {
    const response = await api.post(CVE.LOCK(id));
    return response.data;
  },

  releaseLock: async (id) => {
    const response = await api.delete(CVE.LOCK(id));
    return response.data;
  },
}; 