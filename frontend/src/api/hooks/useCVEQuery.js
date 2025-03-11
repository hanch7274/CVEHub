import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cveService } from '../services/cveService';

// 쿼리 키 상수 정의
export const CVE_QUERY_KEYS = {
  all: ['cves'],
  lists: () => [...CVE_QUERY_KEYS.all, 'list'],
  list: (filters) => [...CVE_QUERY_KEYS.lists(), filters],
  details: () => [...CVE_QUERY_KEYS.all, 'detail'],
  detail: (id) => [...CVE_QUERY_KEYS.details(), id],
};

/**
 * CVE 목록 조회 Hook
 * @param {Object} filters - 페이지네이션, 검색, 필터링 옵션
 * @param {Object} options - React Query 옵션
 */
export const useCVEList = (filters = {}, options = {}) => {
  return useQuery({
    queryKey: CVE_QUERY_KEYS.list(filters),
    queryFn: () => cveService.getCVEs(filters),
    keepPreviousData: true, // 페이지네이션시 이전 데이터 유지
    ...options,
  });
};

/**
 * CVE 상세 정보 조회 Hook
 * @param {string} cveId - CVE ID
 * @param {Object} options - React Query 옵션
 */
export const useCVEDetail = (cveId, options = {}) => {
  return useQuery({
    queryKey: CVE_QUERY_KEYS.detail(cveId),
    queryFn: () => cveService.getCVEById(cveId),
    enabled: !!cveId, // cveId가 있을 때만 쿼리 활성화
    ...options,
  });
};

/**
 * CVE 상세 정보 강제 새로고침 Hook
 * @param {string} cveId - CVE ID
 */
export const useCVERefresh = (cveId) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => cveService.getCVEById(cveId, { forceRefresh: true }),
    onSuccess: (data) => {
      // 캐시 업데이트
      queryClient.setQueryData(CVE_QUERY_KEYS.detail(cveId), data);
      // toast 알림 등 추가 가능
    },
  });
};

/**
 * CVE 업데이트 Hook
 */
export const useCVEUpdate = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ cveId, updateData }) => cveService.updateCVE(cveId, updateData),
    onSuccess: (data, variables) => {
      // 상세 정보 캐시 업데이트
      queryClient.setQueryData(CVE_QUERY_KEYS.detail(variables.cveId), data);
      // 목록 데이터 무효화 (다음 접근시 재조회)
      queryClient.invalidateQueries(CVE_QUERY_KEYS.lists());
    },
  });
};

/**
 * 특정 필드 업데이트 Hook (상태, PoC, 코멘트 등)
 */
export const useCVEFieldUpdate = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ cveId, field, value }) => 
      cveService.updateCVEField(cveId, field, value),
    onSuccess: (data, variables) => {
      // 캐시에서 현재 데이터 가져오기
      const currentData = queryClient.getQueryData(
        CVE_QUERY_KEYS.detail(variables.cveId)
      );
      
      if (currentData) {
        // 필드 업데이트된 새 데이터 생성
        const updatedData = {
          ...currentData,
          [variables.field]: variables.value,
          updated_at: new Date().toISOString(),
        };
        
        // 캐시 업데이트
        queryClient.setQueryData(
          CVE_QUERY_KEYS.detail(variables.cveId), 
          updatedData
        );
      }
    },
  });
};

/**
 * CVE 구독 상태 업데이트 핸들러 (WebSocket 이벤트용)
 * @param {Object} queryClient - QueryClient 인스턴스
 */
export const handleCVESubscriptionUpdate = (queryClient, data) => {
  const { cveId, updates } = data;
  
  if (!cveId || !updates) return;
  
  // 현재 캐시된 데이터 가져오기
  const currentData = queryClient.getQueryData(CVE_QUERY_KEYS.detail(cveId));
  
  if (currentData) {
    // 업데이트된 데이터로 캐시 업데이트
    queryClient.setQueryData(
      CVE_QUERY_KEYS.detail(cveId),
      { ...currentData, ...updates }
    );
  }
  
  // 목록 쿼리도 무효화 고려
  if (updates.status || updates.severity) {
    queryClient.invalidateQueries(CVE_QUERY_KEYS.lists());
  }
};

/**
 * WebSocket을 통한 CVE 실시간 업데이트 구독 설정
 * @param {Object} queryClient - QueryClient 인스턴스 
 * @param {Object} webSocketService - WebSocket 서비스
 */
export const setupCVESubscriptions = (queryClient, webSocketService) => {
  if (!webSocketService || !webSocketService.on) return () => {};
  
  // 실시간 업데이트 구독
  const unsubscribe = webSocketService.on('cve_update', (data) => {
    handleCVESubscriptionUpdate(queryClient, data);
  });
  
  // 캐시 무효화 이벤트 구독
  const unsubscribeInvalidation = webSocketService.on('cache_invalidated', (data) => {
    if (data.cveId) {
      // 특정 CVE 캐시 무효화
      queryClient.invalidateQueries(CVE_QUERY_KEYS.detail(data.cveId));
    }
    
    if (data.invalidateLists) {
      // 목록 캐시 무효화
      queryClient.invalidateQueries(CVE_QUERY_KEYS.lists());
    }
  });
  
  // 구독 해제 함수 반환
  return () => {
    if (typeof unsubscribe === 'function') unsubscribe();
    if (typeof unsubscribeInvalidation === 'function') unsubscribeInvalidation();
  };
}; 