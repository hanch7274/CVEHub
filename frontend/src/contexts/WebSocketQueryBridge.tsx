import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '../api/hooks/useSocket';
import { QUERY_KEYS } from '../api/queryKeys';
import logger from '../utils/logging';
import { SOCKET_EVENTS, SOCKET_STATE } from '../services/socketio/constants';
import _ from 'lodash';

// 이벤트-쿼리 매핑 정의 (선언적 방식)
interface EventQueryMapping {
  event: string;
  queries: string[][];
  getDetailQuery?: (data: any) => string[] | null;
}

/**
 * Socket.IO와 React Query를 연결하는 브릿지 컴포넌트
 * 소켓 이벤트를 수신하여 적절한 쿼리 캐시를 무효화합니다.
 * RxJS 기반 웹소켓 구독을 사용하여 안정적인 이벤트 처리를 제공합니다.
 */
const WebSocketQueryBridge: React.FC = () => {
  // useSocket 훅 사용 - 첫 번째 인자는 이벤트 이름(없으면 undefined), 네 번째 인자가 옵션
  const socket = useSocket(undefined, undefined, [], {
    componentId: 'websocket-query-bridge',
    useRxJS: true
  });
  const { connected, on } = socket;
  
  const queryClient = useQueryClient();
  const initAttemptRef = useRef(0);
  const maxInitAttempts = 5;
  const eventHandlersSetupRef = useRef(false);
  const subscriptionsRef = useRef<Array<() => void>>([]);
  
  // 이벤트-쿼리 매핑 정의 (메모이제이션)
  const eventQueryMapping = useMemo<EventQueryMapping[]>(() => [
    { 
      event: SOCKET_EVENTS.CVE_CREATED, 
      queries: [[QUERY_KEYS.CVE_LIST]]
    },
    { 
      event: SOCKET_EVENTS.CVE_UPDATED, 
      queries: [[QUERY_KEYS.CVE_LIST]],
      getDetailQuery: (data) => data.id ? [QUERY_KEYS.CVE_DETAIL, data.id] : null
    },
    { 
      event: SOCKET_EVENTS.CVE_DELETED, 
      queries: [[QUERY_KEYS.CVE_LIST]],
      getDetailQuery: (data) => data.id ? [QUERY_KEYS.CVE_DETAIL, data.id] : null
    },
    { 
      event: SOCKET_EVENTS.SUBSCRIPTION_UPDATED, 
      queries: [],
      getDetailQuery: (data) => data.cveId ? [QUERY_KEYS.CVE_DETAIL, data.cveId] : null
    },
    // 다른 이벤트-쿼리 매핑을 여기에 추가...
  ], []);

  // 이벤트 핸들러 팩토리 함수 (메모이제이션)
  const createEventHandler = useCallback((mapping: EventQueryMapping) => {
    // 실제 이벤트 처리 함수
    return (data: any) => {
      logger.info('WebSocketQueryBridge', `소켓 이벤트 수신: ${mapping.event}`, {
        event: mapping.event,
        dataType: typeof data,
        data: _.isObject(data) ? data : null,
      });

      try {
        // 기본 쿼리 무효화 처리
        if (mapping.queries && mapping.queries.length > 0) {
          mapping.queries.forEach(queryKey => {
            queryClient.invalidateQueries({ queryKey });
            logger.debug('WebSocketQueryBridge', `쿼리 무효화: ${queryKey.join('.')}`, {
              queryKey
            });
          });
        }

        // 상세 쿼리 무효화 처리 (있는 경우)
        if (mapping.getDetailQuery && data) {
          const detailQueryKey = mapping.getDetailQuery(data);
          if (detailQueryKey) {
            queryClient.invalidateQueries({ queryKey: detailQueryKey });
            logger.debug('WebSocketQueryBridge', `상세 쿼리 무효화: ${detailQueryKey.join('.')}`, {
              detailQueryKey
            });
          }
        }
      } catch (error) {
        logger.error('WebSocketQueryBridge', `이벤트 처리 중 오류 발생: ${mapping.event}`, error);
      }
    };
  }, [queryClient]);

  // 소켓 연결 설정 - useEffect 안에서 이벤트 리스너 등록
  useEffect(() => {
    // 연결 상태 확인
    if (!connected) {
      if (initAttemptRef.current < maxInitAttempts) {
        logger.warn('WebSocketQueryBridge', '소켓 연결 대기 중...', {
          attempt: initAttemptRef.current + 1,
          maxAttempts: maxInitAttempts,
          connectedFlag: connected,
        });
        initAttemptRef.current++;
        return;
      } else if (!eventHandlersSetupRef.current) {
        logger.error('WebSocketQueryBridge', '최대 시도 횟수 초과: 소켓 연결 불가능');
        return;
      }
    }

    if (!eventHandlersSetupRef.current) {
      logger.info('WebSocketQueryBridge', '이벤트 리스너 등록 시작');

      // 기존 구독 정리
      subscriptionsRef.current.forEach(unsubscribe => unsubscribe());
      subscriptionsRef.current = [];

      // 각 이벤트-쿼리 매핑에 대해 이벤트 리스너 설정
      eventQueryMapping.forEach(mapping => {
        try {
          const handler = createEventHandler(mapping);
          
          // 새로운 useSocket의 on 메서드를 사용하여 이벤트 구독
          const unsubscribe = on(mapping.event, handler);
          
          // 구독 해제 함수 저장 (정리에 사용)
          subscriptionsRef.current.push(unsubscribe);
          
          logger.debug('WebSocketQueryBridge', `이벤트 "${mapping.event}" 구독 완료`);
        } catch (error) {
          logger.error('WebSocketQueryBridge', `이벤트 "${mapping.event}" 구독 중 오류 발생`, error);
        }
      });

      eventHandlersSetupRef.current = true;
      logger.info('WebSocketQueryBridge', '모든 이벤트 리스너 등록 완료');
    }

    // 컴포넌트 언마운트 시 정리
    return () => {
      logger.info('WebSocketQueryBridge', '이벤트 리스너 정리');
      subscriptionsRef.current.forEach(unsubscribe => unsubscribe());
      subscriptionsRef.current = [];
    };
  }, [connected, eventQueryMapping, createEventHandler, on]);

  // 소켓 연결 상태 모니터링 및 이벤트 핸들러 재설정
  useEffect(() => {
    // 연결 상태가 변경되어 연결되었을 때, 이벤트 핸들러가 설정되지 않았다면 재시도
    if (connected && !eventHandlersSetupRef.current) {
      logger.info('WebSocketQueryBridge', '소켓이 연결되어 이벤트 핸들러 설정 재시도');
      initAttemptRef.current = 0; // 시도 횟수 초기화
    }
  }, [connected]);

  // 브릿지 컴포넌트는 UI를 렌더링하지 않음
  return null;
};

export default WebSocketQueryBridge;