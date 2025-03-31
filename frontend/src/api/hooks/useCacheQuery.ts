/**
 * 캐시 정보 조회를 위한 React Query 훅
 * 웹소켓 통합 및 낙관적 업데이트 기능이 포함된 버전
 */
import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions, QueryClient } from '@tanstack/react-query';
import { useEffect, useCallback, useRef } from 'react';
import {
  getCacheInfo,
  getCacheStats,
  getCacheKeys,
  getCacheValues,
  clearCache
} from '../services/cacheService';
import { formatDateTime, TIME_ZONES } from '../../utils/dateUtils';
import { ApiResponse } from '../../types/api';
import { useSocket } from './useSocket';
import _ from 'lodash';
import logger from '../../utils/logging';

// 로거 팩토리 함수
const createLogger = (prefix: string) => ({
  info: (message: string, data?: any) => {
    if (data !== undefined) {
      logger.info(prefix, message, data);
    } else {
      logger.info(prefix, message);
    }
  },
  warn: (message: string, data?: any) => {
    if (data !== undefined) {
      logger.warn(prefix, message, data);
    } else {
      logger.warn(prefix, message);
    }
  },
  error: (message: string, error?: any) => {
    if (error !== undefined) {
      logger.error(prefix, message, error);
    } else {
      logger.error(prefix, message);
    }
  },
  debug: (message: string, data?: any) => {
    if (data !== undefined) {
      logger.debug(prefix, message, data);
    } else {
      logger.debug(prefix, message);
    }
  }
});

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
 * 낙관적 업데이트를 위한 컨텍스트 인터페이스
 */
interface CacheMutationContext {
  previousKeys?: ApiResponse<CacheKey[]>;
  previousStats?: ApiResponse<CacheStats>;
  previousInfo?: ApiResponse<CacheInfo>;
}

/**
 * Redis 캐시 서버 정보 조회 훅
 * @returns 캐시 서버 정보 쿼리 결과
 */
export const useCacheInfoQuery = (
  options?: UseQueryOptions<ApiResponse<CacheInfo>, Error>
) => {
  const queryLog = createLogger('useCacheInfoQuery');
  
  return useQuery<ApiResponse<CacheInfo>, Error>({
    queryKey: ['cacheInfo'],
    queryFn: async () => {
      queryLog.info('캐시 서버 정보 조회 요청');
      try {
        const result = await getCacheInfo();
        queryLog.debug('캐시 서버 정보 조회 완료', result);
        return result;
      } catch (error) {
        queryLog.error('캐시 서버 정보 조회 오류', error);
        throw error;
      }
    },
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
  const queryLog = createLogger('useCacheStatsQuery');
  
  return useQuery<ApiResponse<CacheStats>, Error>({
    queryKey: ['cacheStats'],
    queryFn: async () => {
      queryLog.info('캐시 통계 정보 조회 요청');
      try {
        const result = await getCacheStats();
        queryLog.debug('캐시 통계 정보 조회 완료', result);
        return result;
      } catch (error) {
        queryLog.error('캐시 통계 정보 조회 오류', error);
        throw error;
      }
    },
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
  const queryLog = createLogger('useCacheKeysQuery');
  
  return useQuery<ApiResponse<CacheKey[]>, Error>({
    queryKey: ['cacheKeys', params],
    queryFn: async () => {
      queryLog.info('캐시 키 목록 조회 요청', params);
      try {
        const result = await getCacheKeys(params);
        queryLog.debug('캐시 키 목록 조회 완료', {
          params,
          keyCount: result.data?.length || 0
        });
        return result;
      } catch (error) {
        queryLog.error('캐시 키 목록 조회 오류', error);
        throw error;
      }
    },
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
  const queryLog = createLogger('useCacheValuesQuery');
  
  return useQuery<ApiResponse<CacheValue[]>, Error>({
    queryKey: ['cacheValues', params],
    queryFn: async () => {
      queryLog.info('캐시 값 목록 조회 요청', params);
      try {
        const result = await getCacheValues(params);
        queryLog.debug('캐시 값 목록 조회 완료', {
          params,
          valueCount: result.data?.length || 0
        });
        return result;
      } catch (error) {
        queryLog.error('캐시 값 목록 조회 오류', error);
        throw error;
      }
    },
    staleTime: 1000 * 30, // 30초
    ...options,
  });
};

/**
 * Redis 캐시 삭제 뮤테이션 훅 (낙관적 업데이트 적용)
 * @returns 캐시 삭제 뮤테이션 결과
 */
export const useClearCacheMutation = (
  options?: UseMutationOptions<ApiResponse<any>, Error, CacheQueryParams, CacheMutationContext>
) => {
  const queryClient = useQueryClient();
  const mutationLog = createLogger('useClearCacheMutation');
  
  return useMutation<ApiResponse<any>, Error, CacheQueryParams, CacheMutationContext>({
    mutationFn: async (params) => {
      mutationLog.info('캐시 삭제 요청', params);
      try {
        const result = await clearCache(params);
        mutationLog.info('캐시 삭제 성공', params);
        return result;
      } catch (error) {
        mutationLog.error('캐시 삭제 오류', error);
        throw error;
      }
    },
    
    // 낙관적 업데이트를 위한 onMutate
    onMutate: async (params) => {
      mutationLog.debug('낙관적 업데이트 시작', params);
      
      // 진행 중인 관련 쿼리 취소
      await queryClient.cancelQueries({ queryKey: ['cacheKeys', params] });
      await queryClient.cancelQueries({ queryKey: ['cacheStats'] });
      await queryClient.cancelQueries({ queryKey: ['cacheInfo'] });
      
      // 이전 상태 스냅샷 저장
      const previousKeys = queryClient.getQueryData<ApiResponse<CacheKey[]>>(['cacheKeys', params]);
      const previousStats = queryClient.getQueryData<ApiResponse<CacheStats>>(['cacheStats']);
      const previousInfo = queryClient.getQueryData<ApiResponse<CacheInfo>>(['cacheInfo']);
      
      // 낙관적으로 캐시 키 목록 업데이트
      if (previousKeys) {
        queryClient.setQueryData<ApiResponse<CacheKey[]>>(['cacheKeys', params], {
          ...previousKeys,
          data: [], // 삭제했으므로 빈 배열로 설정
          message: '캐시가 삭제되었습니다.',
          success: true
        });
      }
      
      // 낙관적으로 캐시 통계 업데이트
      if (previousStats && previousStats.data) {
        queryClient.setQueryData<ApiResponse<CacheStats>>(['cacheStats'], {
          ...previousStats,
          data: {
            ...previousStats.data,
            total_keys: 0,
            expires_keys: 0,
            memory_usage: '0 bytes'
          }
        });
      }
      
      mutationLog.debug('낙관적 업데이트 완료');
      
      return { previousKeys, previousStats, previousInfo };
    },
    
    // 오류 발생 시 롤백
    onError: (err, params, context) => {
      mutationLog.error('캐시 삭제 실패, 롤백 수행', err);
      
      if (context?.previousKeys) {
        queryClient.setQueryData(['cacheKeys', params], context.previousKeys);
      }
      
      if (context?.previousStats) {
        queryClient.setQueryData(['cacheStats'], context.previousStats);
      }
      
      if (context?.previousInfo) {
        queryClient.setQueryData(['cacheInfo'], context.previousInfo);
      }
    },
    
    // 성공 시 쿼리 무효화
    onSuccess: () => {
      mutationLog.info('캐시 삭제 후 쿼리 무효화');
      
      // 모든 관련 쿼리 무효화
      queryClient.invalidateQueries({ 
        queryKey: ['cacheInfo'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['cacheStats'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['cacheKeys'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['cacheValues'],
        refetchType: 'active'
      });
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
  
  const getQueryCache = useCallback((): ReactQueryCacheItem[] => {
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
  }, [queryClient]);
  
  return {
    getQueryCache,
    queryClient,
  };
};

/**
 * 디바운스된 캐시 쿼리 갱신 훅
 * @returns 캐시 쿼리 갱신 함수
 */
export const useRefreshCacheQueries = () => {
  const queryClient = useQueryClient();
  const logRefresh = createLogger('useRefreshCacheQueries');
  
  // 디바운스된 캐시 새로고침 함수
  const refreshCache = useCallback(
    _.debounce(() => {
      logRefresh.info('디바운스된 캐시 새로고침 실행');
      
      queryClient.invalidateQueries({ 
        queryKey: ['cacheInfo'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['cacheStats'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['cacheKeys'],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ['cacheValues'],
        refetchType: 'active'
      });
    }, 300),
    [queryClient]
  );
  
  // 컴포넌트 언마운트 시 디바운스 함수 취소
  useEffect(() => {
    return () => {
      refreshCache.cancel();
    };
  }, [refreshCache]);
  
  return { refreshCache };
};

/**
 * 실시간 캐시 업데이트 구독 훅
 * 웹소켓을 통해 캐시 변경 이벤트를 구독하고 관련 쿼리를 자동으로 갱신합니다.
 * @returns 연결 상태 객체
 */
export const useCacheUpdates = () => {
  const queryClient = useQueryClient();
  const logCache = createLogger('useCacheUpdates');
  
  // 디바운스된 캐시 새로고침 훅 사용
  const { refreshCache } = useRefreshCacheQueries();
  
  // 구독 상태 추적용 Ref
  const isSubscribedRef = useRef(false);
  
  // useSocket 훅 사용
  const { connected, on, emit, cleanup } = useSocket(
    undefined, undefined, [], { 
      componentId: 'cache-updates',
      useRxJS: true
    }
  );
  
  // 캐시 변경 이벤트 처리
  useEffect(() => {
    if (connected && !isSubscribedRef.current) {
      logCache.info('캐시 업데이트 구독 시작');
      
      // 서버에 캐시 모니터링 요청
      emit('MONITOR_CACHE', { enabled: true });
      
      // 캐시 키 변경 이벤트
      const unsubCacheKeysChanged = on('CACHE_KEYS_CHANGED', (data) => {
        logCache.info('캐시 키 변경 감지', data);
        queryClient.invalidateQueries({ 
          queryKey: ['cacheKeys'],
          refetchType: 'active'
        });
        queryClient.invalidateQueries({ 
          queryKey: ['cacheStats'],
          refetchType: 'active'
        });
      });
      
      // 캐시 값 변경 이벤트
      const unsubCacheValuesChanged = on('CACHE_VALUES_CHANGED', (data) => {
        logCache.info('캐시 값 변경 감지', data);
        queryClient.invalidateQueries({ 
          queryKey: ['cacheValues'],
          refetchType: 'active'
        });
      });
      
      // 캐시 정보 변경 이벤트
      const unsubCacheInfoChanged = on('CACHE_INFO_CHANGED', (data) => {
        logCache.info('캐시 정보 변경 감지', data);
        queryClient.invalidateQueries({ 
          queryKey: ['cacheInfo'],
          refetchType: 'active'
        });
      });
      
      // 캐시 플러시 이벤트 (모든 캐시가 삭제된 경우)
      const unsubCacheFlushed = on('CACHE_FLUSHED', () => {
        logCache.info('캐시 플러시 감지');
        refreshCache();
      });
      
      isSubscribedRef.current = true;
      
      return () => {
        logCache.info('캐시 업데이트 구독 해제');
        
        // 서버에 모니터링 중지 요청
        if (connected) {
          emit('MONITOR_CACHE', { enabled: false });
        }
        
        // 이벤트 구독 해제
        unsubCacheKeysChanged();
        unsubCacheValuesChanged();
        unsubCacheInfoChanged();
        unsubCacheFlushed();
        
        // 디바운스된 함수 취소
        refreshCache.cancel();
        
        // 소켓 정리
        cleanup();
        
        isSubscribedRef.current = false;
      };
    }
    
    return () => {
      // 연결되지 않은 경우에도 정리
      refreshCache.cancel();
    };
  }, [connected, on, emit, cleanup, queryClient, refreshCache]);
  
  return { isConnected: connected };
};

// 모든 캐시 관련 훅을 단일 객체로 내보내기
export default {
  useCacheInfoQuery,
  useCacheStatsQuery,
  useCacheKeysQuery,
  useCacheValuesQuery,
  useClearCacheMutation,
  useReactQueryCache,
  useRefreshCacheQueries,
  useCacheUpdates
};