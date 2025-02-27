import axios from 'axios';

// API 타임아웃 설정 증가
const api = axios.create({
  timeout: 30000  // 30초로 늘림
});

export const runCrawler = async (crawlerType) => {
  try {
    const response = await api.post(`/crawler/run/${crawlerType}`);
    return response.data;
  } catch (error) {
    console.error('Error running crawler:', error.response?.data || error);
    throw error.response?.data || { code: 500, message: error.message };
  }
};

export const getCrawlerStatus = async () => {
  try {
    const response = await api.get('/crawler/status');
    return response.data;
  } catch (error) {
    console.error('Error getting crawler status:', error.response?.data || error);
    throw error.response?.data || { code: 500, message: error.message };
  }
}; 