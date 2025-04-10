import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from 'core/socket/hooks/useSocket';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import { SOCKET_EVENTS, SOCKET_STATE } from 'core/socket/services/constants';
import _ from 'lodash';
import logger from 'shared/utils/logging';

// 이벤트-쿼리 매핑 정의 (선언적 방식)
interface EventQueryMapping {
  event: string;
  queries: string[][];
  getDetailQuery?: (data: any) => string[] | null;
}

// 구독자 정보 타입 정의
interface Subscriber {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  profileImage?: string;
}

// 구독 상태 이벤트 타입 정의
interface SubscriptionStatusEvent {
  cve_id: string;
  cveId?: string;
  user_id?: string;
  userId?: string;
  username?: string;
  display_name?: string;
  displayName?: string;
  profile_image?: string;
  profileImage?: string;
  subscribed: boolean;
  timestamp?: number;
  subscribers?: Subscriber[] | string[];
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
  
  // 처리된 구독 이벤트를 추적하기 위한 참조
  const processedSubscriptionEventsRef = useRef<Record<string, boolean>>({});
  
  // 구독자 정보를 중앙에서 관리하는 함수
  const setCVESubscribers = useCallback((cveId: string, subscribers: Subscriber[]) => {
    // 기존 구독자 정보 로드
    const subscribersKey = [QUERY_KEYS.CVE_SUBSCRIBERS, cveId];
    
    // 로컬 스토리지에도 저장
    try {
      localStorage.setItem(`cve_subscribers_${cveId}`, JSON.stringify(subscribers));
    } catch (error) {
      logger.error('WebSocketQueryBridge', '구독자 정보 저장 중 오류 발생', error);
    }
    
    // 쿼리 클라이언트에 저장
    queryClient.setQueryData(subscribersKey, subscribers);
    logger.debug('WebSocketQueryBridge', `CVE ${cveId}의 구독자 정보 업데이트`, { subscribers });
    
    return subscribers;
  }, [queryClient]);
  
  // 구독 상태 이벤트 핸들러
  const handleSubscriptionStatus = useCallback((data: SubscriptionStatusEvent) => {
    // 로그 출력
    logger.info('WebSocketQueryBridge', '구독 상태 이벤트 수신', data);
    
    if (!data || !(data.cve_id || data.cveId)) {
      logger.warn('WebSocketQueryBridge', '구독 이벤트에 유효한 CVE ID가 없습니다');
      return;
    }
    
    // CVE ID 정규화
    const cveId = data.cve_id || data.cveId || '';
    
    // 중복 이벤트 처리 방지
    const eventId = `${cveId}_${data.timestamp || Date.now()}`;
    if (processedSubscriptionEventsRef.current[eventId]) {
      logger.debug('WebSocketQueryBridge', `이미 처리된 구독 이벤트 무시: ${eventId}`);
      return;
    }
    
    // 이벤트 처리 표시
    processedSubscriptionEventsRef.current[eventId] = true;
    
    // 구독자 목록 키
    const subscribersKey = [QUERY_KEYS.CVE_SUBSCRIBERS, cveId];
    
    // 현재 구독자 목록 가져오기
    let subscribers: Subscriber[] = queryClient.getQueryData(subscribersKey) || [];
    
    try {
      if (data.subscribed) {
        // 구독자 정보 생성
        const subscriber: Subscriber = {
          id: data.user_id || data.userId || '1', // ID가 없으면 기본값 제공
          userId: data.user_id || data.userId || '1',
          username: data.username || 'User',
          displayName: data.display_name || data.displayName || data.username || 'User',
          profileImage: data.profile_image || data.profileImage || ''
        };
        
        // 중복 구독자 필터링
        const existingIndex = subscribers.findIndex(sub => sub.id === subscriber.id);
        if (existingIndex >= 0) {
          // 기존 구독자 정보 업데이트
          subscribers[existingIndex] = subscriber;
        } else {
          // 새 구독자 추가
          subscribers = [...subscribers, subscriber];
        }
      } else {
        // 구독 취소: 사용자 ID로 구독자 제거
        const userId = data.user_id || data.userId;
        if (userId) {
          subscribers = subscribers.filter(sub => sub.id !== userId);
        }
      }
      
      // 구독자 목록에 서버에서 받은 subscribers 배열이 있는 경우 대체
      if (data.subscribers) {
        if (Array.isArray(data.subscribers)) {
          if (typeof data.subscribers[0] === 'string') {
            // 사용자명 배열인 경우 구독자 객체 배열로 변환
            subscribers = (data.subscribers as string[]).map(username => ({
              id: username,
              userId: username,
              username,
              displayName: username
            }));
          } else {
            // 이미 구독자 객체 배열인 경우 그대로 사용
            subscribers = data.subscribers as Subscriber[];
          }
        }
      }
      
      // 중앙에서 구독자 정보 설정
      setCVESubscribers(cveId, subscribers);
      
      // 관련 CVE 쿼리 무효화 (UI 업데이트 트리거)
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_DETAIL, cveId] });
      
    } catch (error) {
      logger.error('WebSocketQueryBridge', '구독 이벤트 처리 중 오류 발생', error);
    }
  }, [queryClient, setCVESubscribers]);
  
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
      
      // 구독 상태 이벤트 추가 처리
      try {
        const unsubscribe = on('subscription_status', handleSubscriptionStatus);
        subscriptionsRef.current.push(unsubscribe);
        logger.debug('WebSocketQueryBridge', '구독 상태 이벤트 구독 완료');
      } catch (error) {
        logger.error('WebSocketQueryBridge', '구독 상태 이벤트 구독 중 오류 발생', error);
      }

      eventHandlersSetupRef.current = true;
      logger.info('WebSocketQueryBridge', '모든 이벤트 리스너 등록 완료');
    }

    // 컴포넌트 언마운트 시 정리
    return () => {
      logger.info('WebSocketQueryBridge', '이벤트 리스너 정리');
      subscriptionsRef.current.forEach(unsubscribe => unsubscribe());
      subscriptionsRef.current = [];
    };
  }, [connected, eventQueryMapping, createEventHandler, on, handleSubscriptionStatus]);

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