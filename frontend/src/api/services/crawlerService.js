import api from '../config/axios';

const CRAWLER = {
  RUN: (type) => `/crawler/run/${type}`,
  STATUS: '/crawler/status'
};

export const crawlerService = {
  // 특정 크롤러 실행
  runCrawler: async (type) => {
    try {
      const response = await api.post(CRAWLER.RUN(type));
      return response.data;
    } catch (error) {
      console.error('Error running crawler:', error.response?.data || error);
      throw error;
    }
  },

  // 크롤러 상태 및 마지막 업데이트 시간 조회
  getCrawlerStatus: async () => {
    try {
      const response = await api.get(CRAWLER.STATUS);
      return response.data;
    } catch (error) {
      console.error('Error getting crawler status:', error.response?.data || error);
      throw error;
    }
  },

  // DB 상태 확인 함수 추가
  getDBStatus: async () => {
    try {
      const response = await api.get('/crawler/db-status');
      return response.data;
    } catch (error) {
      console.error('Error checking DB status:', error.response?.data || error);
      throw error;
    }
  }
};

export default crawlerService; 