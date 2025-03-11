import api from '../config/axios';
import { CVE } from '../config/endpoints';

// 로그 레벨 설정
const LOG_LEVEL = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4
};

// 현재 로그 레벨 설정
const CURRENT_LOG_LEVEL = process.env.NODE_ENV === 'development' ? LOG_LEVEL.INFO : LOG_LEVEL.ERROR;

// 로그 유틸리티
const log = {
  debug: (message, data) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG) {
      console.debug(`[API] ${message}`, data);
    }
  },
  info: (message, data) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO) {
      console.log(`[API] ${message}`, data);
    }
  },
  warn: (message, data) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN) {
      console.warn(`[API] ${message}`, data);
    }
  },
  error: (message, error) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR) {
      console.error(`[API] ${message}`, error);
    }
  }
};

// 메모리 캐시 (서비스 레벨 캐싱)
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10분으로 기본 TTL 연장

// 최근 HEAD 요청 타임스탬프를 추적하는 맵
const lastHeadRequestTime = new Map();
const HEAD_REQUEST_DEBOUNCE = 5000; // 5초 디바운싱

// 캐시 접근 횟수 측정 (디버깅용)
const cacheStats = {
  hits: 0,
  misses: 0,
  invalidations: 0
};

export const cveService = {
  // CVE 관리
  getCVEs: async (params) => {
    try {
      log.debug('CVE 목록 요청', params);
      const response = await api.get('/cves', { params });
      log.debug(`CVE 목록 ${response.data.items?.length || 0}개 응답 수신`);
      return response.data;
    } catch (error) {
      log.error('CVE 목록 조회 오류', error);
      throw error;
    }
  },

  // CVE 상세 조회
  getCVEById: async (cveId, options = {}) => {
    // cveId 유효성 검사
    if (!cveId || typeof cveId !== 'string' || cveId.trim() === '') {
      log.error(`유효하지 않은 CVE ID: ${cveId}`, { type: typeof cveId });
      throw new Error('유효하지 않은 CVE ID');
    }

    const { forceRefresh = false, checkModified = true } = options;
    const cacheKey = `cve_${cveId}`;
    const cachedItem = cache.get(cacheKey);
    
    // 1. 강제 새로고침이면 캐시 무시
    if (forceRefresh) {
      log.debug(`강제 새로고침: ${cveId}`);
      cacheStats.misses++;
      return cveService.fetchAndCacheFullCVE(cveId);
    }
    
    // 2. 캐시가 없으면 전체 데이터 가져오기
    if (!cachedItem) {
      log.debug(`캐시 없음: ${cveId}`);
      cacheStats.misses++;
      return cveService.fetchAndCacheFullCVE(cveId);
    }
    
    // 3. 캐시 만료 확인
    const isCacheExpired = Date.now() - cachedItem.timestamp > CACHE_TTL;
    
    // 4. 최근 HEAD 요청 시간 확인하여 디바운싱 적용
    const now = Date.now();
    const lastHeadTime = lastHeadRequestTime.get(cveId) || 0;
    const shouldSkipHeadRequest = now - lastHeadTime < HEAD_REQUEST_DEBOUNCE;
    
    // 5. 만료되었거나 수정 확인이 필요하고, 디바운싱 기간이 지났으면 HEAD 요청으로 확인
    if ((isCacheExpired || checkModified) && !shouldSkipHeadRequest) {
      try {
        // HEAD 요청 시간 기록
        lastHeadRequestTime.set(cveId, now);
        
        // HEAD 요청으로 메타데이터만 가져오기 (효율적)
        const headResponse = await api.head(`/cves/${cveId}`);
        const serverLastModified = headResponse.headers['last-modified'] || 
                                  headResponse.headers['x-last-modified'];
        
        // 서버측 lastModified 정보가 있고, 캐시된 lastModified와 다르면 새로운 데이터 가져오기
        if (serverLastModified && 
            (!cachedItem.lastModified || new Date(serverLastModified) > new Date(cachedItem.lastModified))) {
          log.debug(`변경 감지: ${cveId} - 새 데이터 가져오기`);
          cacheStats.misses++;
          return cveService.fetchAndCacheFullCVE(cveId);
        }
        
        // 변경되지 않았으면 캐시 사용
        log.debug(`수정 없음, 캐시 사용: ${cveId}`);
        
        // 캐시 타임스탬프 갱신 (프레시니스 업데이트)
        cachedItem.timestamp = Date.now();
        cache.set(cacheKey, cachedItem);
        
        cacheStats.hits++;
        return cachedItem.data;
      } catch (error) {
        log.warn(`변경 확인 오류: ${cveId}`, error);
        // 오류 시 캐시가 유효하면 캐시 사용, 아니면 새로 가져오기
        if (!isCacheExpired) {
          cacheStats.hits++;
          return cachedItem.data;
        }
        cacheStats.misses++;
        return cveService.fetchAndCacheFullCVE(cveId);
      }
    } else if (shouldSkipHeadRequest) {
      // 최근에 HEAD 요청을 했으면 추가 요청 없이 캐시 사용
      log.debug(`디바운싱 적용, 캐시 사용: ${cveId}`);
      cacheStats.hits++;
      return cachedItem.data;
    }
    
    // 캐시가 유효하고, 수정 확인이 필요없으면 캐시 데이터 반환
    log.debug(`유효한 캐시 사용: ${cveId}`);
    cacheStats.hits++;
    return cachedItem.data;
  },

  // CVE 상세 정보 가져오기 (캐시 사용 안함)
  getCVEByIdNoCache: async (cveId, timestamp = Date.now()) => {
    try {
      log.debug(`캐시 우회 요청: ${cveId}`);
      
      // 서비스 레벨 메모리 캐시에서 먼저 삭제
      const cacheKey = `cve_${cveId}`;
      if (cache.has(cacheKey)) {
        cache.delete(cacheKey);
        log.debug(`서비스 캐시 삭제: ${cveId}`);
      }
      
      // 타임스탬프를 URL과 쿼리 파라미터 모두에 추가 (가장 확실한 캐시 방지 방법)
      const url = `/cves/${cveId}?_t=${timestamp}&nocache=true`;
      
      // 캐시 무시 헤더 추가
      const response = await api.get(url, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-No-Cache': timestamp.toString() // 커스텀 헤더로 추가적인 캐시 방지
        }
      });
      
      // 반환된 데이터에 타임스탬프 표시 추가
      const data = response.data;
      if (data) {
        // _fetchedAt 메타데이터 추가 (디버깅 및 모니터링 용도)
        Object.defineProperty(data, '_fetchedAt', {
          value: Date.now(),
          enumerable: false, // JSON 직렬화 시 제외되도록 설정
          configurable: true
        });
        
        // 서비스 캐시 강제 갱신 (신선한 데이터로)
        cache.set(cacheKey, {
          data: data,
          timestamp: Date.now(),
          lastModified: data.lastModifiedDate || data.lastModified || new Date().toISOString()
        });
      }
      
      return data;
    } catch (error) {
      log.error(`캐시 우회 요청 실패: ${cveId}`, error);
      throw error;
    }
  },

  // CVE 생성
  createCVE: async (data) => {
    try {
      log.debug('CVE 생성 요청', data);
      const response = await api.post(CVE.BASE, data);
      return response.data;
    } catch (error) {
      log.error('CVE 생성 실패', error);
      throw error;
    }
  },

  // CVE 수정
  updateCVE: async (cveId, data) => {
    try {
      log.debug(`CVE 업데이트: ${cveId}`, data);
      const response = await api.patch(`${CVE.BASE}/${cveId}`, data);
      
      // 캐시 무효화
      cveService.invalidateCache(cveId);
      
      return response.data;
    } catch (error) {
      log.error(`CVE 업데이트 실패: ${cveId}`, error);
      throw error;
    }
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
    // cveId 유효성 검사
    if (!cveId || typeof cveId !== 'string' || cveId.trim() === '') {
      log.error(`유효하지 않은 CVE ID (fetchAndCacheFullCVE): ${cveId}`);
      throw new Error('유효하지 않은 CVE ID');
    }

    try {
      log.debug(`전체 데이터 가져오기: ${cveId}`);
      const response = await api.get(`/cves/${cveId}`);
      const data = response.data;
      
      // 캐시에 저장
      const cacheKey = `cve_${cveId}`;
      cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        lastModified: data.lastModifiedDate || data.lastModified
      });
      
      log.debug(`전체 데이터 캐싱 완료: ${cveId}`);
      return data;
    } catch (error) {
      log.error(`전체 데이터 요청 실패: ${cveId}`, error);
      throw error;
    }
  },

  // 캐시 무효화
  invalidateCache: async (cveId) => {
    try {
      const cacheKey = `cve_${cveId}`;
      // 서비스 레벨 캐시에서 삭제
      if (cache.has(cacheKey)) {
        cache.delete(cacheKey);
        cacheStats.invalidations++;
        log.debug(`캐시 무효화 성공: ${cveId}`);
      } else {
        log.debug(`캐시 무효화 불필요: ${cveId} - 캐시에 없음`);
      }
      
      // 서버에 캐시 무효화 요청
      try {
        await api.post(`/cves/${cveId}/invalidate-cache`);
        log.debug(`서버측 캐시 무효화 요청 성공: ${cveId}`);
      } catch (error) {
        // 백엔드에 해당 엔드포인트가 없을 수 있으므로 오류는 무시
        log.warn(`서버측 캐시 무효화 요청 실패: ${cveId}`, error);
      }
      
      return true;
    } catch (error) {
      log.error(`캐시 무효화 실패: ${cveId}`, error);
      return false;
    }
  },

  // 캐시 통계 조회
  getCacheStats: () => {
    const cacheSize = cache.size;
    const keys = Array.from(cache.keys());
    return {
      ...cacheStats,
      size: cacheSize,
      keys: keys.slice(0, 10), // 처음 10개만 표시
      hitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) || 0
    };
  },

  // 전체 캐시 초기화
  clearAllCache: () => {
    const size = cache.size;
    cache.clear();
    log.info(`전체 캐시 ${size}개 항목 삭제됨`);
    return size;
  },

  // CVE 상태 업데이트
  updateCVEStatus: async (cveId, status) => {
    try {
      log.debug(`CVE 상태 업데이트: ${cveId} → ${status}`);
      return await cveService.updateCVE(cveId, { status });
    } catch (error) {
      log.error(`CVE 상태 업데이트 실패: ${cveId}`, error);
      throw error;
    }
  }
};

// 웹소켓 캐시 무효화 리스너 설정
export const setupCacheInvalidationListeners = (socket) => {
  if (!socket) {
    log.warn('웹소켓이 제공되지 않아 캐시 무효화 리스너를 설정할 수 없습니다.');
    return;
  }
  
  // cve_updated 이벤트 리스너
  socket.on('cve_updated', (data) => {
    const cveId = data?.cveId;
    if (cveId) {
      log.debug(`웹소켓 업데이트로 캐시 무효화: ${cveId}`);
      cveService.invalidateCache(cveId);
    }
  });
  
  // cache_invalidated 이벤트 리스너
  socket.on('cache_invalidated', (data) => {
    const cveId = data?.cve_id;
    if (cveId) {
      log.debug(`웹소켓 캐시 무효화 이벤트: ${cveId}`);
      cveService.invalidateCache(cveId);
    }
  });
  
  log.info('캐시 무효화 리스너 설정 완료');
  
  return () => {
    socket.off('cve_updated');
    socket.off('cache_invalidated');
    log.debug('캐시 무효화 리스너 해제');
  };
}; 