/**
 * 캐시 정보 조회를 위한 React Query 훅
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCacheInfo,
  getCacheStats,
  getCacheKeys,
  getCacheValues,
  clearCache
} from '../services/cacheService';
import { formatToKST } from '../../utils/dateUtils';

/**
 * Redis 캐시 서버 정보 조회 훅
 * @returns {Object} 캐시 서버 정보 쿼리 결과
 */
export const useCacheInfoQuery = () => {
  return useQuery({
    queryKey: ['cacheInfo'],
    queryFn: getCacheInfo,
    staleTime: 1000 * 60, // 1분
  });
};

/**
 * Redis 캐시 통계 정보 조회 훅
 * @returns {Object} 캐시 통계 정보 쿼리 결과
 */
export const useCacheStatsQuery = () => {
  return useQuery({
    queryKey: ['cacheStats'],
    queryFn: getCacheStats,
    staleTime: 1000 * 30, // 30초
  });
};

/**
 * Redis 캐시 키 목록 조회 훅
 * @param {Object} params 조회 파라미터
 * @param {string} [params.prefix] 캐시 키 프리픽스
 * @param {string} [params.pattern] 검색 패턴
 * @param {number} [params.limit] 최대 조회 개수
 * @param {Object} options 쿼리 옵션
 * @returns {Object} 캐시 키 목록 쿼리 결과
 */
export const useCacheKeysQuery = (params = {}, options = {}) => {
  return useQuery({
    queryKey: ['cacheKeys', params],
    queryFn: () => getCacheKeys(params),
    staleTime: 1000 * 30, // 30초
    ...options,
  });
};

/**
 * Redis 캐시 값 조회 훅
 * @param {Object} params 조회 파라미터
 * @param {string} [params.prefix] 캐시 키 프리픽스
 * @param {string} [params.pattern] 검색 패턴
 * @param {number} [params.limit] 최대 조회 개수
 * @param {Object} options 쿼리 옵션
 * @returns {Object} 캐시 값 목록 쿼리 결과
 */
export const useCacheValuesQuery = (params = {}, options = {}) => {
  return useQuery({
    queryKey: ['cacheValues', params],
    queryFn: () => getCacheValues(params),
    staleTime: 1000 * 30, // 30초
    ...options,
  });
};

/**
 * Redis 캐시 삭제 뮤테이션 훅
 * @returns {Object} 캐시 삭제 뮤테이션 결과
 */
export const useClearCacheMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: clearCache,
    onSuccess: () => {
      // 캐시 삭제 후 관련 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['cacheInfo'] });
      queryClient.invalidateQueries({ queryKey: ['cacheStats'] });
      queryClient.invalidateQueries({ queryKey: ['cacheKeys'] });
      queryClient.invalidateQueries({ queryKey: ['cacheValues'] });
    },
  });
};

/**
 * React Query 캐시 정보 조회 훅
 * @returns {Object} React Query 캐시 정보
 */
export const useReactQueryCache = () => {
  const queryClient = useQueryClient();
  
  const getQueryCache = () => {
    const queryCache = queryClient.getQueryCache();
    const queries = queryCache.getAll();
    
    return queries.map(query => ({
      queryKey: JSON.stringify(query.queryKey),
      state: query.state,
      queryHash: query.queryHash,
      isStale: query.isStale(),
      isActive: query.isActive(),
      dataUpdatedAt: query.state.dataUpdatedAt,
      lastUpdated: query.state.dataUpdatedAt ? formatToKST(new Date(query.state.dataUpdatedAt)) : 'N/A',
    }));
  };
  
  return {
    getQueryCache,
    queryClient,
  };
};
