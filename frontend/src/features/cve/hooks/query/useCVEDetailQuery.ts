// query/useCVEDetailQuery.ts
import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import cveService from 'features/cve/services/cveService';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import { createLogger, useTimers, measurePerformance } from '../utils/cveQueryUtils';
import { QueryOptions, RETRY_CONFIG } from '../utils/types';
import type { CVEDetail } from 'features/cve/types/cve';

/**
 * CVE 상세 정보 조회 훅
 * 특정 CVE ID의 상세 정보를 조회
 * 
 * @param cveId - CVE ID
 * @param options - 쿼리 옵션
 * @param customService - 커스텀 서비스 객체 (테스트용)
 * @returns 쿼리 결과
 */
export const useCVEDetail = (
  cveId: string,
  options: QueryOptions<CVEDetail> = {},
  customService = cveService
) => {
  const logger = createLogger('useCVEDetail');
  const requestIdRef = useRef<string>('');

  const defaultOptions: QueryOptions<CVEDetail> = {
    enabled: !!cveId,
    retry: 1,
    retryDelay: 500,
    staleTime: 60000, // 1분으로 증가하여 불필요한 리페치 줄이기
    gcTime: 300000, // 5분으로 유지
    refetchOnWindowFocus: false, // 창 포커스 시 리페치 비활성화
    refetchOnMount: false, // 컴포넌트 마운트 시 자동 리페치 비활성화 (명시적 호출만 허용)
    refetchOnReconnect: false, // 재연결 시 자동 리페치 비활성화
  };

  const mergedOptions = { ...defaultOptions, ...options };

  return useQuery<CVEDetail, Error>({
    queryKey: QUERY_KEYS.CVE.detail(cveId),
    queryFn: async () => {
      try {
        requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
        logger.info(`CVE 상세 조회 요청(${requestIdRef.current})`, { cveId });
        
        const startTime = performance.now();
        const result = await customService.getCVEById(cveId);
        const endTime = performance.now();
        const elapsedTime = endTime - startTime;

        logger.info(`CVE 상세 조회 완료(${requestIdRef.current})`, { 
          cveId, 
          elapsedTime: `${elapsedTime.toFixed(2)}ms`,
          dataSize: JSON.stringify(result).length
        });

        return result;
      } catch (error: any) {
        // 세분화된 오류 처리 및 로깅
        if (error.response) {
          if (error.response.status === 404) {
            logger.warn(`CVE 상세 조회 - 항목 없음(${requestIdRef.current})`, { 
              cveId, 
              status: error.response.status 
            });
          } else {
            logger.error(`CVE 상세 조회 HTTP 오류(${requestIdRef.current})`, {
              cveId,
              status: error.response.status,
              statusText: error.response.statusText,
              url: error.response.config?.url,
              errorData: error.response.data
            });
          }
        } else if (error.request) {
          logger.error(`CVE 상세 조회 네트워크 오류(${requestIdRef.current})`, {
            cveId,
            message: error.message,
            code: error.code
          });
        } else {
          logger.error(`CVE 상세 조회 중 예상치 못한 오류(${requestIdRef.current})`, {
            cveId,
            error
          });
        }
        throw error;
      }
    },
    ...mergedOptions
  });
};

/**
 * CVE 새로고침 훅
 * 특정 CVE의 데이터를 강제로 새로고침 (캐시 무시)
 * 
 * @param cveId - CVE ID
 * @param options - 훅 옵션
 * @param customService - 커스텀 서비스 객체 (테스트용)
 * @returns 새로고침 함수와 상태
 */
export const useCVERefresh = (
  cveId: string,
  options: any = {},
  customService = cveService
) => {
  const queryClient = useQueryClient();
  const logger = createLogger('useCVERefresh');
  const { startTimer, clearAllTimers } = useTimers();
  const requestIdRef = useRef<string>('');
  
  // 재시도 메커니즘을 포함한 새로고침 함수
  const refreshFn = async (retryCount = 0) => {
    try {
      requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
      logger.info(`강제 새로고침 요청(${requestIdRef.current})`, { cveId, retryAttempt: retryCount });
      
      const data = await customService.getCVEByIdNoCache(cveId);
      
      // 성공 시 캐시 업데이트
      queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), data);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CVE.lists() });
      
      logger.info(`강제 새로고침 성공(${requestIdRef.current})`, { cveId });
      return data;
    } catch (error: any) {
      // 오류 유형에 따른 세분화된 처리
      if (error.response && error.response.status >= 500 && retryCount < RETRY_CONFIG.MAX_ATTEMPTS) {
        // 서버 오류의 경우 지수 백오프로 재시도
        const delay = Math.min(
          RETRY_CONFIG.INITIAL_DELAY * Math.pow(2, retryCount),
          RETRY_CONFIG.MAX_DELAY
        );
        
        logger.warn(`서버 오류로 재시도 예약(${requestIdRef.current})`, {
          cveId,
          retryAttempt: retryCount + 1,
          delay: `${delay}ms`,
          error: error.message
        });
        
        // 지정된 지연 후 재시도
        return new Promise((resolve, reject) => {
          startTimer(`refresh-retry-${retryCount}`, async () => {
            try {
              const result = await refreshFn(retryCount + 1);
              resolve(result);
            } catch (retryError) {
              reject(retryError);
            }
          }, delay);
        });
      }
      
      // 다른 오류는 자세히 로깅 후 throw
      logger.error(`강제 새로고침 실패(${requestIdRef.current})`, {
        cveId,
        retryAttempt: retryCount,
        errorType: error.response ? 'HTTP 오류' : error.request ? '네트워크 오류' : '예상치 못한 오류',
        status: error.response?.status,
        message: error.message
      });
      
      throw error;
    }
  };

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return clearAllTimers;
  }, [clearAllTimers]);

  return {
    mutate: refreshFn,
    isLoading: false,
    refresh: refreshFn
  };
};

/**
 * CVE 업데이트 훅
 * 특정 CVE 정보를 업데이트하기 위한 뮤테이션 훅
 * 
 * @param cveId - CVE ID
 * @param options - 뮤테이션 옵션
 * @returns 뮤테이션 결과
 */
export const useUpdateCVE = (
  cveId: string,
  options: any = {}
) => {
  const queryClient = useQueryClient();
  const logger = createLogger('useUpdateCVE');
  const requestIdRef = useRef('');
  const { startTimer, clearAllTimers } = useTimers();
  
  // 재시도 카운터
  const retryCountRef = useRef(0);
  
  // 재시도 함수
  const retryWithBackoff = useCallback(async (updateData: Partial<CVEDetail>) => {
    retryCountRef.current++;
    
    if (retryCountRef.current > RETRY_CONFIG.MAX_ATTEMPTS) {
      logger.error(`최대 재시도 횟수 초과(${requestIdRef.current})`);
      throw new Error(`최대 재시도 횟수(${RETRY_CONFIG.MAX_ATTEMPTS}회)를 초과했습니다.`);
    }
    
    const delay = Math.min(
      RETRY_CONFIG.INITIAL_DELAY * Math.pow(2, retryCountRef.current - 1),
      RETRY_CONFIG.MAX_DELAY
    );
    
    logger.info(`업데이트 재시도 예약(${requestIdRef.current})`, {
      cveId,
      retryCount: retryCountRef.current,
      delay: `${delay}ms`
    });
    
    return new Promise((resolve, reject) => {
      startTimer(`retry-update-${retryCountRef.current}`, async () => {
        try {
          const result = await cveService.updateCVE(cveId, updateData);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  }, [cveId, startTimer]);

  const mutation = {
    mutate: async (updateData: Partial<CVEDetail>) => {
      try {
        requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
        logger.info(`CVE 업데이트 요청(${requestIdRef.current}): ${cveId}`, { 
          updateFields: Object.keys(updateData),
          updateData
        });
        
        const startTime = performance.now();
        const result = await cveService.updateCVE(cveId, updateData);
        const endTime = performance.now();
        
        retryCountRef.current = 0; // 성공 시 재시도 카운터 리셋
        
        logger.info(`CVE 업데이트 성공(${requestIdRef.current}): ${cveId}`, {
          elapsedTime: `${(endTime - startTime).toFixed(2)}ms`
        });
        
        // 캐시 업데이트 성능 측정
        measurePerformance('캐시 업데이트', () => {
          // 기존 데이터 가져오기
          const previousData = queryClient.getQueryData<CVEDetail>(QUERY_KEYS.CVE.detail(cveId));
          
          if (previousData) {
            // 업데이트된 데이터로 캐시 업데이트
            queryClient.setQueryData(QUERY_KEYS.CVE.detail(cveId), {
              ...previousData,
              ...updateData,
              lastModifiedAt: new Date().toISOString()
            });
          }
          
          // 목록 쿼리 무효화
          queryClient.invalidateQueries({ 
            queryKey: QUERY_KEYS.CVE.lists(),
            refetchType: 'active'
          });
        });
        
        if (options.onSuccess) {
          options.onSuccess(result, updateData);
        }
        
        return result;
      } catch (error: any) {
        // 서버 오류인 경우 재시도
        if (error.response && error.response.status >= 500) {
          logger.warn(`서버 오류로 인한 재시도(${requestIdRef.current})`, {
            cveId,
            status: error.response.status,
            retry: retryCountRef.current + 1
          });
          return retryWithBackoff(updateData);
        }
        
        // 네트워크 오류인 경우 재시도
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout') || !error.response) {
          logger.warn(`네트워크 오류로 인한 재시도(${requestIdRef.current})`, {
            cveId,
            message: error.message,
            retry: retryCountRef.current + 1
          });
          return retryWithBackoff(updateData);
        }
        
        // 세분화된 오류 로깅
        if (error.response) {
          logger.error(`CVE 업데이트 HTTP 오류(${requestIdRef.current}): ${cveId}`, {
            status: error.response.status,
            statusText: error.response.statusText,
            url: error.response.config?.url,
            errorData: error.response.data
          });
        } else {
          logger.error(`CVE 업데이트 실패(${requestIdRef.current}): ${cveId}`, error);
        }
        
        if (options.onError) {
          options.onError(error, updateData);
        }
        
        throw error;
      }
    },
    isLoading: false
  };
  
  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return clearAllTimers;
  }, [clearAllTimers]);
  
  return mutation;
};