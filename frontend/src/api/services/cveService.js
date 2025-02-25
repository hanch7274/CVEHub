import api from '../config/axios';
import { CVE } from '../config/endpoints';

// 메모리 캐시 (서비스 레벨 캐싱)
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10분으로 기본 TTL 연장

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
  getCVEById: async (cveId, options = {}) => {
    const { forceRefresh = false, checkModified = true } = options;
    const cacheKey = `cve_${cveId}`;
    const cachedItem = cache.get(cacheKey);
    
    // 1. 강제 새로고침이면 캐시 무시
    if (forceRefresh) {
      console.log(`[API] Force refreshing CVE ${cveId}`);
      return cveService.fetchAndCacheFullCVE(cveId);
    }
    
    // 2. 캐시가 없으면 전체 데이터 가져오기
    if (!cachedItem) {
      console.log(`[API] No cache found for CVE ${cveId}`);
      return cveService.fetchAndCacheFullCVE(cveId);
    }
    
    // 3. 캐시 만료 확인
    const isCacheExpired = Date.now() - cachedItem.timestamp > CACHE_TTL;
    
    // 4. 만료되었거나 수정 확인이 필요하면 HEAD 요청으로 lastModifiedDate 확인
    if (isCacheExpired || checkModified) {
      try {
        // HEAD 요청으로 메타데이터만 가져오기 (효율적)
        const headResponse = await api.head(`/cves/${cveId}`);
        const serverLastModified = headResponse.headers['last-modified'] || 
                                  headResponse.headers['x-last-modified'];
        
        // 서버측 lastModified 정보가 있고, 캐시된 lastModified와 다르면 새로운 데이터 가져오기
        if (serverLastModified && 
            (!cachedItem.lastModified || new Date(serverLastModified) > new Date(cachedItem.lastModified))) {
          console.log(`[API] CVE ${cveId} was modified, fetching new data`);
          return cveService.fetchAndCacheFullCVE(cveId);
        }
        
        // 변경되지 않았으면 캐시 사용
        console.log(`[API] Using cache for CVE ${cveId} (not modified since last fetch)`);
        
        // 캐시 타임스탬프 갱신 (프레시니스 업데이트)
        cachedItem.timestamp = Date.now();
        cache.set(cacheKey, cachedItem);
        
        return cachedItem.data;
      } catch (error) {
        console.warn(`[API] Error checking modification status for CVE ${cveId}:`, error);
        // 오류 시 캐시가 유효하면 캐시 사용, 아니면 새로 가져오기
        if (!isCacheExpired) {
          return cachedItem.data;
        }
        return cveService.fetchAndCacheFullCVE(cveId);
      }
    }
    
    // 캐시가 유효하고, 수정 확인이 필요없으면 캐시 데이터 반환
    console.log(`[API] Using valid cache for CVE ${cveId}`);
    return cachedItem.data;
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

  // 전체 CVE 데이터를 가져와서 캐싱하는 헬퍼 메서드 (재사용성)
  fetchAndCacheFullCVE: async (cveId) => {
    console.log(`[API] Fetching full CVE ${cveId} data`);
    const response = await api.get(`/cves/${cveId}`);
    
    // 응답에서 lastModifiedDate 추출
    const lastModified = response.headers['last-modified'] || 
                         response.headers['x-last-modified'] ||
                         response.data.lastModifiedDate ||
                         response.data.updatedAt ||
                         new Date().toISOString(); // 기본값
    
    // 캐시에 저장
    cache.set(`cve_${cveId}`, {
      data: response.data,
      timestamp: Date.now(),
      lastModified: lastModified
    });
    
    return response.data;
  },

  // 기존 캐시 무효화 메서드 유지
  invalidateCache(cveId) {
    if (cveId) {
      cache.delete(`cve_${cveId}`);
    } else {
      cache.clear();
    }
  }
};

// WebSocket 이벤트 리스너 추가 (별도 설정 필요)
export const setupCacheInvalidationListeners = (socket) => {
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'cve_updated' && data.data?.cveId) {
      cveService.invalidateCache(data.data.cveId);
    }
  });
}; 