// query/useCVEStatsQuery.ts
import { useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import api from 'shared/api/config/axios';
import cveService from 'features/cve/services/cveService';
import { createLogger, useTimers } from '../utils/cveQueryUtils';
import { QueryOptions, CVEStats, RETRY_CONFIG } from '../utils/types';

/**
 * CVE 통계 정보 조회 훅
 * 시스템의 CVE 통계 정보를 조회
 * 
 * @param options - 쿼리 옵션
 * @returns 쿼리 결과
 */
export const useCVEStats = (options: QueryOptions<CVEStats> = {}) => {
  const logger = createLogger('useCVEStats');
  const requestIdRef = useRef('');
  
  return useQuery<CVEStats, Error>({
    queryKey: QUERY_KEYS.CVE.stats(),
    queryFn: async () => {
      try {
        requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
        logger.info(`CVE 통계 조회 요청(${requestIdRef.current})`);
        
        const startTime = performance.now();
        const response = await api.get('/cves/stats');
        const endTime = performance.now();
        
        const result = response.data;
        logger.info(`CVE 통계 조회 결과(${requestIdRef.current})`, { 
          stats: result,
          elapsedTime: `${(endTime - startTime).toFixed(2)}ms`
        });
        
        return result;
      } catch (error: any) {
        // 세분화된 오류 로깅
        if (error.response) {
          logger.error(`CVE 통계 조회 HTTP 오류(${requestIdRef.current})`, {
            status: error.response.status,
            statusText: error.response.statusText,
            url: error.response.config?.url,
            errorData: error.response.data
          });
        } else if (error.request) {
          logger.error(`CVE 통계 조회 네트워크 오류(${requestIdRef.current})`, {
            message: error.message,
            code: error.code
          });
        } else {
          logger.error(`CVE 통계 조회 중 예상치 못한 오류(${requestIdRef.current})`, error);
        }
        throw error;
      }
    },
    // 기본 옵션
    staleTime: 300000, // 5분
    gcTime: 600000, // 10분
    ...options
  });
};

/**
 * 전체 CVE 수 조회 훅
 * 시스템에 등록된 총 CVE 수를 조회
 * 
 * @param options - 쿼리 옵션
 * @returns 쿼리 결과
 */
export const useTotalCVECount = (options: QueryOptions<number> = {}) => {
  const logger = createLogger('useTotalCVECount');
  const requestIdRef = useRef('');
  const { startTimer, clearAllTimers } = useTimers();
  
  // 재시도 카운터
  const retryCountRef = useRef(0);
  
  // 재시도 함수
  const retryWithBackoff = useCallback(async (queryFn: () => Promise<number>) => {
    retryCountRef.current++;
    
    if (retryCountRef.current > RETRY_CONFIG.MAX_ATTEMPTS) {
      logger.error(`최대 재시도 횟수 초과(${requestIdRef.current})`);
      throw new Error(`최대 재시도 횟수(${RETRY_CONFIG.MAX_ATTEMPTS}회)를 초과했습니다.`);
    }
    
    const delay = Math.min(
      RETRY_CONFIG.INITIAL_DELAY * Math.pow(2, retryCountRef.current - 1),
      RETRY_CONFIG.MAX_DELAY
    );
    
    logger.info(`재시도 예약(${requestIdRef.current})`, {
      retryCount: retryCountRef.current,
      delay: `${delay}ms`
    });
    
    return new Promise<number>((resolve, reject) => {
      startTimer(`retry-total-count-${retryCountRef.current}`, async () => {
        try {
          const result = await queryFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  }, [startTimer]);
  
  const query = useQuery<number, Error>({
    queryKey: QUERY_KEYS.CVE.totalCount(),
    queryFn: async () => {
      try {
        requestIdRef.current = Date.now().toString(36) + Math.random().toString(36).substr(2);
        logger.info(`전체 CVE 수 조회 요청(${requestIdRef.current})`);
        
        const startTime = performance.now();
        const result = await cveService.getTotalCVECount();
        const endTime = performance.now();
        
        retryCountRef.current = 0; // 성공 시 재시도 카운터 리셋
        
        logger.info(`전체 CVE 수 조회 결과(${requestIdRef.current})`, { 
          count: result,
          elapsedTime: `${(endTime - startTime).toFixed(2)}ms`
        });
        
        return result;
      } catch (error: any) {
        // 서버 오류인 경우 재시도
        if (error.response && error.response.status >= 500) {
          logger.warn(`서버 오류로 인한 재시도(${requestIdRef.current})`, {
            status: error.response.status,
            retry: retryCountRef.current + 1
          });
          return retryWithBackoff(() => cveService.getTotalCVECount());
        }
        
        // 네트워크 오류인 경우 재시도
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout') || !error.response) {
          logger.warn(`네트워크 오류로 인한 재시도(${requestIdRef.current})`, {
            message: error.message,
            retry: retryCountRef.current + 1
          });
          return retryWithBackoff(() => cveService.getTotalCVECount());
        }
        
        // 세분화된 오류 로깅
        if (error.response) {
          logger.error(`전체 CVE 수 조회 HTTP 오류(${requestIdRef.current})`, {
            status: error.response.status,
            statusText: error.response.statusText,
            url: error.response.config?.url,
            errorData: error.response.data
          });
        } else {
          logger.error(`전체 CVE 수 조회 중 예상치 못한 오류(${requestIdRef.current})`, error);
        }
        
        throw error;
      }
    },
    // 기본 옵션
    staleTime: 300000, // 5분
    gcTime: 600000, // 10분
    ...options
  });
  
  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return clearAllTimers;
  }, [clearAllTimers]);
  
  return query;
};