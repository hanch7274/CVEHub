// frontend/src/features/cve/hooks/socket/cveHandlers.ts
import { QueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import logger from 'shared/utils/logging';
import socketService from 'core/socket/services/socketService';
import { 
  SOCKET_EVENTS, 
  CVE_EVENTS, 
  SUBSCRIPTION_EVENTS 
} from 'core/socket/services/constants';

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

  // 서버가 보내는 데이터 형식 로깅 (향상된 디버깅)
  logger.info('handleCVESubscriptionUpdate', `상세 이벤트 데이터 로깅(${eventId})`, {
    type,
    payload: payload ? {
      id: payload.id,
      cveId: payload.cveId,
      cve_id: payload.cve_id,
      keys: payload ? Object.keys(payload) : [],
      hasSubscribers: payload?.subscribers !== undefined,
      subscribersCount: Array.isArray(payload?.subscribers) ? payload.subscribers.length : '없음',
      isSubscribed: payload?.subscribed
    } : '페이로드 없음',
    rawData: {
      type,
      keys: Object.keys(data),
      payloadType: payload ? typeof payload : '없음',
    },
    timestamp: new Date().toISOString()
  });

  switch (type) {
    case CVE_EVENTS.CVE_CREATED:
      logger.info('handleCVESubscriptionUpdate', `CVE 생성 이벤트(${eventId}) 수신`, logData);
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchType: 'active'
      });
      logger.debug('handleCVESubscriptionUpdate', `CVE 생성 이벤트(${eventId}) 처리 완료`);
      break;

    case CVE_EVENTS.CVE_UPDATED:
      logger.info('handleCVESubscriptionUpdate', `CVE 업데이트 이벤트(${eventId}) 수신`, logData);
      
      // 구독 상태 관련 정보가 있으면 추가 로깅
      if (payload?.subscribed !== undefined || payload?.subscribers !== undefined) {
        logger.info('handleCVESubscriptionUpdate', `구독 관련 정보 포함됨(${eventId})`, {
          cveId: payload.id,
          isSubscribed: payload.subscribed,
          subscribersCount: Array.isArray(payload.subscribers) ? payload.subscribers.length : '알 수 없음',
          subscribersFormat: Array.isArray(payload.subscribers) 
            ? `배열: [${payload.subscribers.slice(0, 2).map(s => JSON.stringify({id: s.id, username: s.username})).join(', ')}${payload.subscribers.length > 2 ? '...' : ''}]`
            : typeof payload.subscribers
        });
        
        // socketService 상태 업데이트 (CveId가 있고 구독 정보가 있는 경우)
        if (payload.id && typeof payload.subscribed === 'boolean') {
          socketService.updateSubscription(payload.id, payload.subscribed);
          logger.debug('handleCVESubscriptionUpdate', `구독 상태 자동 업데이트: ${payload.id}`, {
            isSubscribed: payload.subscribed
          });
        }
      }
      
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

    case CVE_EVENTS.CVE_DELETED:
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
  
  // 향상된 로깅 - 실제 데이터 형식 기록
  logger.info('handleCVECreated', `CVE 생성 데이터 형식(${eventId})`, {
    // 원본 필드와 변환된 필드 함께 로깅 (서버와 클라이언트 형식 비교)
    id: newCve?.id,
    cveId: newCve?.cveId, 
    cve_id: newCve?.cve_id,
    
    // 데이터 구조 정보
    dataStructure: {
      keys: Object.keys(newCve || {}),
      types: Object.entries(newCve || {}).reduce((acc, [key, val]) => {
        acc[key] = typeof val;
        return acc;
      }, {} as Record<string, string>)
    },
    
    // 중요 필드 샘플 (구독 관련)
    subscribed: newCve?.subscribed,
    hasSubscribers: newCve?.subscribers !== undefined,
    subscribersType: newCve?.subscribers ? (Array.isArray(newCve.subscribers) ? 'array' : typeof newCve.subscribers) : 'undefined',
    subscribersCount: Array.isArray(newCve?.subscribers) ? newCve.subscribers.length : 0,
    
    timestamp: new Date().toISOString()
  });
  
  queryClient.invalidateQueries({ 
    queryKey: QUERY_KEYS.CVE.lists(),
    refetchType: 'active'
  });
  
  logger.debug('handleCVECreated', `CVE 생성 이벤트(${eventId}) 처리 완료`, {
    cveId: newCve?.id || newCve?.cveId || newCve?.cve_id
  });
};

/**
 * CVE 업데이트 이벤트 처리 함수
 */
export const handleCVEUpdated = (queryClient: QueryClient, updatedCve: any) => {
  const eventId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const updatedCveId = updatedCve?.id || updatedCve?.cveId;
  
  // 향상된 로깅 - 데이터 형식 및 구독 정보 기록
  logger.info('handleCVEUpdated', `CVE 업데이트 데이터 형식(${eventId})`, {
    // ID 정보 (다양한 형식 모두 로깅)
    id: updatedCve?.id,
    cveId: updatedCve?.cveId,
    cve_id: updatedCve?.cve_id,
    
    // 구독 관련 정보
    subscription: {
      isSubscribed: updatedCve?.subscribed,
      subscribersCount: Array.isArray(updatedCve?.subscribers) ? updatedCve.subscribers.length : 0,
      subscribersFormat: updatedCve?.subscribers 
        ? (Array.isArray(updatedCve.subscribers) 
          ? `배열[${updatedCve.subscribers.length}]: ${JSON.stringify(updatedCve.subscribers.slice(0, 1))}`
          : typeof updatedCve.subscribers)
        : '없음',
    },
    
    // 전체 데이터 키와 타입
    dataKeys: Object.keys(updatedCve || {}),
    topLevelTypes: Object.entries(updatedCve || {})
      .filter(([key]) => ['id', 'cveId', 'cve_id', 'subscribed', 'subscribers'].includes(key))
      .reduce((acc, [key, val]) => {
        acc[key] = `${typeof val}${Array.isArray(val) ? `[${(val as any[]).length}]` : ''}`;
        return acc;
      }, {} as Record<string, string>),
      
    timestamp: new Date().toISOString()
  });
  
  // 구독 상태 자동 업데이트 (필요한 경우)
  if (updatedCveId && typeof updatedCve.subscribed === 'boolean') {
    socketService.updateSubscription(updatedCveId, updatedCve.subscribed);
    logger.debug('handleCVEUpdated', `구독 상태 자동 업데이트: ${updatedCveId}`, {
      isSubscribed: updatedCve.subscribed
    });
  }
  
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
  
  logger.debug('handleCVEUpdated', `CVE 업데이트 이벤트(${eventId}) 처리 완료`, {
    cveId: updatedCveId
  });
};

/**
 * CVE 삭제 이벤트 처리 함수
 */
export const handleCVEDeleted = (queryClient: QueryClient, deletedCve: any) => {
  const eventId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const deletedCveId = deletedCve?.id || deletedCve?.cveId;
  
  // 향상된 로깅 - 데이터 형식 정보 포함
  logger.info('handleCVEDeleted', `CVE 삭제 데이터 형식(${eventId})`, {
    // ID 정보 (다양한 형식)
    id: deletedCve?.id,
    cveId: deletedCve?.cveId,
    cve_id: deletedCve?.cve_id,
    
    // 객체 구조 정보
    dataFormat: {
      keys: Object.keys(deletedCve || {}),
      objectType: typeof deletedCve,
      hasSubscriptionInfo: deletedCve?.subscribed !== undefined || deletedCve?.subscribers !== undefined
    },
    
    timestamp: new Date().toISOString()
  });
  
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
  
  logger.debug('handleCVEDeleted', `CVE 삭제 이벤트(${eventId}) 처리 완료`, {
    cveId: deletedCveId
  });
};
