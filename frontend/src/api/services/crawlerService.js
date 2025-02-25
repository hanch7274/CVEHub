import api from '../config/axios';
import { CRAWLER } from '../config/endpoints';

export const crawlerService = {
  // 여러 CVE를 일괄 생성
  bulkCreateCVEs: async (data) => {
    const response = await api.post(CRAWLER.BULK_CREATE, data);
    return response.data;
  },

  // 여러 CVE를 일괄 업데이트
  bulkUpdateCVEs: async (data) => {
    const response = await api.put(CRAWLER.BULK_UPDATE, data);
    return response.data;
  },
}; 