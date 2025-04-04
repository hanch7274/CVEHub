// core/socket/hooks/useCVESocket.ts
import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import { SOCKET_EVENTS } from 'core/socket/services/constants';
import useSocket from 'core/socket/hooks/useSocket';
import { 
  handleCVECreated, 
  handleCVEUpdated, 
  handleCVEDeleted 
} from './cveHandlers';
import logger from 'shared/utils/logging';

/**
 * CVE 관련 소켓 이벤트 처리를 위한 훅
 * 기본 소켓 기능에 CVE 이벤트 처리 기능을 추가합니다.
 */
export function useCVESocket(cveId?: string) {
  const queryClient = useQueryClient();
  const reconnectAttemptsRef = useRef(0);
  const isSubscribedRef = useRef(false);
  
  // 컴포넌트 ID - 식별을 위해 cveId 활용
  const componentId = cveId 
    ? `cve-socket-${cveId}` 
    : 'cve-socket-list';
  
  // 기본 소켓 훅 사용
  const { 
    connected, 
    emit, 
    on, 
    cleanup,
    socket
  } = useSocket(undefined, undefined, [], {
    componentId,
    useRxJS: true
  });
  
  // 디바운스된 쿼리 무효화 함수
  const invalidateCVEQueries = useCallback(
    _.debounce(() => {
      logger.debug('useCVESocket', '디바운스된 쿼리 무효화 실행');
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CVE.lists(),
        refetchType: 'active'
      });
    }, 300),
    [queryClient]
  );
  
  // CVE 생성 이벤트 핸들러
  const onCVECreated = useCallback((data: any) => {
    handleCVECreated(queryClient, data);
  }, [queryClient]);
  
  // CVE 업데이트 이벤트 핸들러
  const onCVEUpdated = useCallback((data: any) => {
    handleCVEUpdated(queryClient, data);
  }, [queryClient]);
  
  // CVE 삭제 이벤트 핸들러
  const onCVEDeleted = useCallback((data: any) => {
    handleCVEDeleted(queryClient, data);
  }, [queryClient]);
  
  // CVE 목록 구독 기능
  const subscribeCVEList = useCallback(() => {
    if (connected && !isSubscribedRef.current) {
      logger.info('useCVESocket', 'CVE 목록 업데이트 구독 요청');
      
      // 서버에 구독 요청 전송
      emit(SOCKET_EVENTS.SUBSCRIBE_CVES, {});
      isSubscribedRef.current = true;
      
      return true;
    }
    return false;
  }, [connected, emit]);
  
  // CVE 목록 구독 해제 기능
  const unsubscribeCVEList = useCallback(() => {
    if (connected && isSubscribedRef.current) {
      logger.info('useCVESocket', 'CVE 목록 업데이트 구독 해제');
      
      // 서버에 구독 해제 요청 전송
      emit(SOCKET_EVENTS.UNSUBSCRIBE_CVES, {});
      isSubscribedRef.current = false;
      
      return true;
    }
    return false;
  }, [connected, emit]);
  
  // 단일 CVE 구독 기능
  const subscribeCVE = useCallback((id: string) => {
    if (connected && id) {
      logger.info('useCVESocket', `단일 CVE 구독: ${id}`);
      emit(SOCKET_EVENTS.SUBSCRIBE_CVE, { cve_id: id });
      return true;
    }
    return false;
  }, [connected, emit]);
  
  // 단일 CVE 구독 해제 기능
  const unsubscribeCVE = useCallback((id: string) => {
    if (connected && id) {
      logger.info('useCVESocket', `단일 CVE 구독 해제: ${id}`);
      emit(SOCKET_EVENTS.UNSUBSCRIBE_CVE, { cve_id: id });
      return true;
    }
    return false;
  }, [connected, emit]);
  
  return {
    // 기본 소켓 속성 및 메서드
    connected,
    socket,
    on,
    emit,
    cleanup,
    
    // CVE 특화 이벤트 핸들러
    onCVECreated,
    onCVEUpdated,
    onCVEDeleted,
    
    // CVE 특화 기능
    invalidateCVEQueries,
    subscribeCVEList,
    unsubscribeCVEList,
    subscribeCVE,
    unsubscribeCVE,
    
    // 상태 관리
    isSubscribed: isSubscribedRef.current,
    reconnectAttempts: reconnectAttemptsRef.current
  };
}

export default useCVESocket;
