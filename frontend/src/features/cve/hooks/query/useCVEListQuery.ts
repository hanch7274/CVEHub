// query/useCVEListQuery.ts
import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import cveService from 'features/cve/services/cveService';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import { createLogger } from '../utils/cveQueryUtils';
import { Filters, QueryOptions } from '../utils/types';
import type { CVEListResponse } from 'features/cve/types/cve';

/**
 * CVE 목록 조회 훅
 * 필터링 옵션을 적용하여 CVE 목록을 조회
 * 
 * @param filters - 필터 옵션
 * @param options - 쿼리 옵션
 * @param customService - 커스텀 서비스 객체 (테스트용)
 * @returns 쿼리 결과
 */
export const useCVEList = (
  filters: Filters = {},
  options: QueryOptions<CVEListResponse> = {},
  customService = cveService
) => {
  const logger = createLogger('useCVEList');
  const requestIdRef = useRef<string>('');

  return useQuery<CVEListResponse, Error>({
    queryKey: QUERY_KEYS.CVE.list(filters),
    queryFn: async () => {
      try {
        // 요청 ID 생성 (디버깅/추적용)
        requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
        logger.info(`목록 조회 요청(${requestIdRef.current})`, { filters });
        
        const startTime = performance.now();
        const result = await customService.getCVEs(filters);
        const endTime = performance.now();

        // 응답 필드 정규화 (백엔드 응답이 일관되지 않을 경우 대비)
        if (!result.total && result.totalItems) {
          result.total = result.totalItems;
        }
        if (!result.items && result.results) {
          result.items = result.results;
        }

        logger.info(`목록 조회 결과(${requestIdRef.current})`, { 
          totalItems: result.total || result.totalItems || 0,
          itemsCount: result.items?.length || result.results?.length || 0,
          page: filters.page || 1,
          elapsedTime: `${(endTime - startTime).toFixed(2)}ms`
        });

        return result;
      } catch (error: any) {
        // 오류 분류 및 세분화된 로깅
        if (error.response) {
          logger.error(`목록 조회 HTTP 오류(${requestIdRef.current})`, {
            status: error.response.status,
            statusText: error.response.statusText,
            url: error.response.config?.url,
            errorData: error.response.data
          });
        } else if (error.request) {
          logger.error(`목록 조회 네트워크 오류(${requestIdRef.current})`, {
            message: error.message,
            code: error.code
          });
        } else {
          logger.error(`목록 조회 중 예상치 못한 오류(${requestIdRef.current})`, error);
        }
        throw error;
      }
    },
    placeholderData: (oldData) => oldData,
    staleTime: 10000,
    gcTime: 60000,
    refetchOnWindowFocus: true,
    ...options,
  });
};

/**
 * (하위 호환성) CVE 목록 조회 훅
 * 이전 버전 API와의 호환성을 위한 래퍼 함수
 * 
 * @param params - 조회 파라미터
 * @returns 쿼리 결과
 * @deprecated useCVEList를 직접 사용하세요
 */
export const useCVEListQuery = (params: {
  page?: number;
  rowsPerPage?: number;
  filters?: Filters;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
} = {}) => {
  const { 
    page = 0, 
    rowsPerPage = 10, 
    filters = {}, 
    sortBy = 'createdAt', 
    sortOrder = 'desc' 
  } = params;

  const convertedFilters = {
    page,
    rowsPerPage,
    search: filters.search,
    sortBy,
    sortOrder,
    filters
  };

  const logger = createLogger('useCVEListQuery');
  logger.info('호환성 모드로 호출됨 (deprecated)', { params });
  
  return useCVEList(convertedFilters);
};