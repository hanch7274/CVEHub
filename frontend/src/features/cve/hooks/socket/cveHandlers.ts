// core/socket/handlers/cveHandlers.ts
import { QueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import logger from 'shared/utils/logging';

/**
 * CVE 이벤트 핸들러 모음
 */

/**
 * CVE 웹소켓 업데이트 처리 함수
 * 웹소켓 이벤트로 수신된 CVE 변경사항을 React Query 캐시에 반영
 */
export const handleCVESubscriptionUpdate = (
  queryClient: QueryClient,
  data: { type?: string; payload?: any; }
) => {
  if (!data || !data.type) {
    logger.warn('handleCVESubscriptionUpdate', '유효하지 않은 이벤트 데이터', { data });
    return;
  }

  const { type, payload } = data;
  const logData = { type, payloadId: payload?.id };
  const eventId = Date.now().toString(36) + Math.random().toString(36).substr(2);

  switch (type) {
    case 'cve:created':
      logger.info('handleCVESubscriptionUpdate', `CVE 생성 이벤트(${eventId}) 수신`, logData);
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchType: 'active'
      });
      logger.debug('handleCVESubscriptionUpdate', `CVE 생성 이벤트(${eventId}) 처리 완료`);
      break;

    case 'cve:updated':
      logger.info('handleCVESubscriptionUpdate', `CVE 업데이트 이벤트(${eventId}) 수신`, logData);
      // 상세 정보 캐시 업데이트
      queryClient.setQueryData(
        QUERY_KEYS.CVE.detail(payload.id), 
        (oldData: any) => oldData ? { ...oldData, ...payload } : payload
      );
      // 목록 갱신
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchType: 'active'
      });
      logger.debug('handleCVESubscriptionUpdate', `CVE 업데이트 이벤트(${eventId}) 처리 완료`);
      break;

    case 'cve:deleted':
      logger.info('handleCVESubscriptionUpdate', `CVE 삭제 이벤트(${eventId}) 수신`, logData);
      // 상세 정보 캐시 제거
      queryClient.removeQueries({ 
        queryKey: QUERY_KEYS.CVE.detail(payload.id) 
      });
      // 목록 갱신
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchType: 'active'
      });
      logger.debug('handleCVESubscriptionUpdate', `CVE 삭제 이벤트(${eventId}) 처리 완료`);
      break;

    default:
      logger.warn('handleCVESubscriptionUpdate', `알 수 없는 이벤트 타입(${eventId})`, { type, payload });
  }
};

/**
 * CVE 생성 이벤트 처리 함수
 */
export const handleCVECreated = (queryClient: QueryClient, newCve: any) => {
  const eventId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  logger.info('handleCVECreated', `CVE 생성 이벤트(${eventId}) 수신`, { cveId: newCve?.id });
  
  queryClient.invalidateQueries({ 
    queryKey: QUERY_KEYS.CVE.lists(),
    refetchType: 'active'
  });
  
  logger.debug('handleCVECreated', `CVE 생성 이벤트(${eventId}) 처리 완료`);
};

/**
 * CVE 업데이트 이벤트 처리 함수
 */
export const handleCVEUpdated = (queryClient: QueryClient, updatedCve: any) => {
  const eventId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const updatedCveId = updatedCve?.id;
  
  logger.info('handleCVEUpdated', `CVE 업데이트 이벤트(${eventId}) 수신`, { cveId: updatedCveId });
  
  // 상세 정보 캐시 업데이트
  if (updatedCveId) {
    queryClient.setQueryData(
      QUERY_KEYS.CVE.detail(updatedCveId), 
      (oldData: any) => oldData ? { ...oldData, ...updatedCve } : updatedCve
    );
  }
  
  // 목록 갱신
  queryClient.invalidateQueries({ 
    queryKey: QUERY_KEYS.CVE.lists(),
    refetchType: 'active'
  });
  
  logger.debug('handleCVEUpdated', `CVE 업데이트 이벤트(${eventId}) 처리 완료`);
};

/**
 * CVE 삭제 이벤트 처리 함수
 */
export const handleCVEDeleted = (queryClient: QueryClient, deletedCve: any) => {
  const eventId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const deletedCveId = deletedCve?.id;
  
  logger.info('handleCVEDeleted', `CVE 삭제 이벤트(${eventId}) 수신`, { cveId: deletedCveId });
  
  // 해당 CVE의 상세 정보 캐시 무효화
  if (deletedCveId) {
    queryClient.removeQueries({
      queryKey: QUERY_KEYS.CVE.detail(deletedCveId)
    });
  }
  
  // 목록 갱신
  queryClient.invalidateQueries({ 
    queryKey: QUERY_KEYS.CVE.lists(),
    refetchType: 'active'
  });
  
  logger.debug('handleCVEDeleted', `CVE 삭제 이벤트(${eventId}) 처리 완료`);
};
