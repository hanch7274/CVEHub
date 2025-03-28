/**
 * 캐시 정보 조회를 위한 React Query 훅
 */
import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions, QueryClient } from '@tanstack/react-query';
import {
  getCacheInfo,
  getCacheStats,
  getCacheKeys,
  getCacheValues,
  clearCache
} from '../services/cacheService';
import { formatDateTime, TIME_ZONES } from '../../utils/dateUtils';
import { ApiResponse } from '../../types/api';

/**
 * 캐시 정보 인터페이스
 */
export interface CacheInfo {
  version: string;
  mode: string;
  os: string;
  arch: string;
  process_id: number;
  uptime_in_seconds: number;
  uptime_in_days: number;
  connected_clients: number;
  used_memory_human: string;
  used_memory_peak_human: string;
  total_connections_received: number;
  total_commands_processed: number;
  [key: string]: string | number | boolean;
}

/**
 * 캐시 통계 정보 인터페이스
 */
export interface CacheStats {
  total_keys: number;
  expires_keys: number;
  avg_ttl: number;
  memory_usage: string;
  hit_rate: number;
  miss_rate: number;
  [key: string]: string | number | boolean;
}

/**
 * 캐시 키 조회 파라미터 인터페이스
 */
export interface CacheQueryParams {
  prefix?: string;
  pattern?: string;
  limit?: number;
}

/**
 * 캐시 키 정보 인터페이스
 */
export interface CacheKey {
  key: string;
  type: string;
  ttl: number;
  size?: number;
}

/**
 * 캐시 값 정보 인터페이스
 */
export interface CacheValue {
  key: string;
  value: any;
  type: string;
  ttl: number;
  size?: number;
}

/**
 * React Query 캐시 항목 인터페이스
 */
export interface ReactQueryCacheItem {
  queryKey: string;
  state: any;
  queryHash: string;
  isStale: boolean;
  isActive: boolean;
  dataUpdatedAt: number;
  lastUpdated: string;
}

/**
 * Redis 캐시 서버 정보 조회 훅
 * @returns 캐시 서버 정보 쿼리 결과
 */
export const useCacheInfoQuery = (
  options?: UseQueryOptions<ApiResponse<CacheInfo>, Error>
) => {
  return useQuery<ApiResponse<CacheInfo>, Error>({
    queryKey: ['cacheInfo'],
    queryFn: getCacheInfo,
    staleTime: 1000 * 60, // 1분
    ...options,
  });
};

/**
 * Redis 캐시 통계 정보 조회 훅
 * @returns 캐시 통계 정보 쿼리 결과
 */
export const useCacheStatsQuery = (
  options?: UseQueryOptions<ApiResponse<CacheStats>, Error>
) => {
  return useQuery<ApiResponse<CacheStats>, Error>({
    queryKey: ['cacheStats'],
    queryFn: getCacheStats,
    staleTime: 1000 * 30, // 30초
    ...options,
  });
};

/**
 * Redis 캐시 키 목록 조회 훅
 * @param params 조회 파라미터
 * @param options 쿼리 옵션
 * @returns 캐시 키 목록 쿼리 결과
 */
export const useCacheKeysQuery = (
  params: CacheQueryParams = {}, 
  options?: UseQueryOptions<ApiResponse<CacheKey[]>, Error>
) => {
  return useQuery<ApiResponse<CacheKey[]>, Error>({
    queryKey: ['cacheKeys', params],
    queryFn: () => getCacheKeys(params),
    staleTime: 1000 * 30, // 30초
    ...options,
  });
};

/**
 * Redis 캐시 값 조회 훅
 * @param params 조회 파라미터
 * @param options 쿼리 옵션
 * @returns 캐시 값 목록 쿼리 결과
 */
export const useCacheValuesQuery = (
  params: CacheQueryParams = {}, 
  options?: UseQueryOptions<ApiResponse<CacheValue[]>, Error>
) => {
  return useQuery<ApiResponse<CacheValue[]>, Error>({
    queryKey: ['cacheValues', params],
    queryFn: () => getCacheValues(params),
    staleTime: 1000 * 30, // 30초
    ...options,
  });
};

/**
 * Redis 캐시 삭제 뮤테이션 훅
 * @returns 캐시 삭제 뮤테이션 결과
 */
export const useClearCacheMutation = (
  options?: UseMutationOptions<ApiResponse<any>, Error, CacheQueryParams>
) => {
  const queryClient = useQueryClient();
  
  return useMutation<ApiResponse<any>, Error, CacheQueryParams>({
    mutationFn: clearCache,
    onSuccess: () => {
      // 캐시 삭제 후 관련 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['cacheInfo'] });
      queryClient.invalidateQueries({ queryKey: ['cacheStats'] });
      queryClient.invalidateQueries({ queryKey: ['cacheKeys'] });
      queryClient.invalidateQueries({ queryKey: ['cacheValues'] });
    },
    ...options,
  });
};

/**
 * React Query 캐시 정보 조회 훅
 * @returns React Query 캐시 정보
 */
export const useReactQueryCache = () => {
  const queryClient = useQueryClient();
  
  const getQueryCache = (): ReactQueryCacheItem[] => {
    const queryCache = queryClient.getQueryCache();
    const queries = queryCache.getAll();
    
    return queries.map(query => ({
      queryKey: JSON.stringify(query.queryKey),
      state: query.state,
      queryHash: query.queryHash,
      isStale: query.isStale(),
      isActive: query.isActive(),
      dataUpdatedAt: query.state.dataUpdatedAt,
      lastUpdated: query.state.dataUpdatedAt ? formatDateTime(new Date(query.state.dataUpdatedAt), undefined, TIME_ZONES.KST) : 'N/A',
    }));
  };
  
  return {
    getQueryCache,
    queryClient,
  };
};
