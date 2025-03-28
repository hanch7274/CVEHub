import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketIO } from './SocketIOContext';
import { QUERY_KEYS } from '../api/queryKeys';
import logger from '../utils/logging';
import { SOCKET_EVENTS } from '../services/socketio/constants';
import socketIOService from '../services/socketio/socketio';
import { Socket } from 'socket.io-client';
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
 */
const WebSocketQueryBridge: React.FC = () => {
  const socketIO = useSocketIO();
  const queryClient = useQueryClient();
  const initAttemptRef = useRef(0);
  const maxInitAttempts = 5;
  const eventHandlersSetupRef = useRef(false);
  
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
  
  // 쿼리 무효화 함수 (쓰로틀링 적용)
  const invalidateQueries = useCallback(_.throttle((queryKey: string[]) => {
    queryClient.invalidateQueries({ queryKey });
  }, 300, { leading: true, trailing: true }), [queryClient]);
  
  // 쿼리 제거 함수 (쓰로틀링 적용)
  const removeQueries = useCallback(_.throttle((queryKey: string[]) => {
    queryClient.removeQueries({ queryKey });
  }, 300, { leading: true, trailing: true }), [queryClient]);
  
  // 이벤트 핸들러 생성 함수
  const createEventHandler = useCallback((mapping: EventQueryMapping) => {
    return _.throttle((data: any) => {
      logger.info('WebSocketQueryBridge', `${mapping.event} 이벤트 수신`, data);
      
      // 공통 쿼리 무효화
      mapping.queries.forEach(queryKey => {
        invalidateQueries(queryKey);
      });
      
      // 상세 쿼리 처리 (있는 경우)
      if (mapping.getDetailQuery) {
        const detailQueryKey = mapping.getDetailQuery(data);
        if (detailQueryKey) {
          if (mapping.event === SOCKET_EVENTS.CVE_DELETED) {
            removeQueries(detailQueryKey);
          } else {
            invalidateQueries(detailQueryKey);
          }
        }
      }
    }, 300, { leading: true, trailing: true });
  }, [invalidateQueries, removeQueries]);

  useEffect(() => {
    // 디바운스된 로깅 함수 (동일한 메시지가 빠르게 여러 번 로깅되는 것 방지)
    const logWarning = _.debounce((message: string) => {
      if (initAttemptRef.current < maxInitAttempts) {
        logger.warn('WebSocketQueryBridge', message);
        initAttemptRef.current += 1;
      }
    }, 1000, { leading: true, trailing: false });

    // 컨텍스트에서 소켓 정보 가져오기
    const { socket, connected } = socketIO;

    // 컨텍스트에서 소켓을 가져오지 못한 경우 서비스에서 직접 가져오기 시도
    const activeSocket: Socket | null = socket || socketIOService.getSocket();
    const isConnected: boolean = connected || socketIOService.isConnected;

    // 소켓이 없는 경우 핸들링
    if (!activeSocket) {
      logWarning('Socket.IO 인스턴스를 찾을 수 없음');
      return;
    }

    if (!isConnected) {
      logWarning('Socket.IO 연결되지 않음, 이벤트 리스너 설정 지연');
      return;
    }

    // 이미 이벤트 리스너가 설정되어 있다면 중복 설정 방지
    if (eventHandlersSetupRef.current) {
      return;
    }

    // 연결 성공 시 초기화 카운터 리셋
    initAttemptRef.current = 0;
    logger.info('WebSocketQueryBridge', '소켓 이벤트 리스너 설정');

    // 이벤트 핸들러와 클린업 함수 배열
    const cleanupFunctions: (() => void)[] = [];
    
    try {
      // 선언적으로 정의된 매핑을 기반으로 이벤트 핸들러 등록
      eventQueryMapping.forEach(mapping => {
        const handler = createEventHandler(mapping);
        
        // 이벤트 리스너 등록
        activeSocket.on(mapping.event, handler);
        
        // 클린업 함수 저장
        cleanupFunctions.push(() => {
          activeSocket.off(mapping.event, handler);
          // 쓰로틀된 함수 취소
          handler.cancel();
        });
      });
      
      // 이벤트 핸들러 설정 완료 표시
      eventHandlersSetupRef.current = true;
      
      logger.info('WebSocketQueryBridge', '이벤트 리스너 등록 완료');
    } catch (error) {
      logger.error('WebSocketQueryBridge', '이벤트 리스너 등록 오류', error);
    }

    // 클린업 함수
    return () => {
      // 컴포넌트가 언마운트될 때 모든 이벤트 리스너 해제
      logger.info('WebSocketQueryBridge', '소켓 이벤트 리스너 해제');
      
      try {
        if (activeSocket) {
          // 모든 클린업 함수 실행
          cleanupFunctions.forEach(cleanup => cleanup());
          
          // 이벤트 핸들러 제거 표시
          eventHandlersSetupRef.current = false;
        }
      } catch (error) {
        logger.error('WebSocketQueryBridge', '이벤트 리스너 해제 오류', error);
      }
      
      // 디바운스된 함수 취소
      logWarning.cancel();
      invalidateQueries.cancel();
      removeQueries.cancel();
    };
  }, [socketIO, queryClient, eventQueryMapping, createEventHandler, invalidateQueries, removeQueries]);

  return null; // 이 컴포넌트는 UI를 렌더링하지 않습니다
};

export default WebSocketQueryBridge;