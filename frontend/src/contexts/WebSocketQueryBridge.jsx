import React, { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useSocketIO } from './SocketIOContext';
import { QUERY_KEYS } from '../api/queryKeys';
import logger from '../utils/logging';
import { SOCKET_EVENTS } from '../services/socketio/constants';
import socketIOService from '../services/socketio/socketio';

/**
 * Socket.IO와 React Query를 연결하는 브릿지 컴포넌트
 * 소켓 이벤트를 수신하여 적절한 쿼리 캐시를 무효화합니다.
 * 
 * 이 컴포넌트는 전체 앱에서 단 하나만 존재해야 하며, App의 최상위 레벨에 배치해야 합니다.
 * 중앙집중형 웹소켓 관리의 핵심 부분으로, 모든 웹소켓 이벤트를 캐치하고 적절한 쿼리를 무효화합니다.
 */
const WebSocketQueryBridge = () => {
  const socketIO = useSocketIO();
  const queryClient = useQueryClient();
  const initAttemptRef = useRef(0);
  const maxInitAttempts = 5;
  const { enqueueSnackbar } = useSnackbar();
  const eventHandlersSetupRef = useRef(false);

  useEffect(() => {
    // 컨텍스트에서 소켓 정보 가져오기
    const { socket, connected } = socketIO || {};
    
    // 컨텍스트에서 소켓을 가져오지 못한 경우 서비스에서 직접 가져오기 시도
    const activeSocket = socket || socketIOService.getSocket();
    const isConnected = connected || socketIOService.isConnected;
    
    // 소켓이 없는 경우 핸들링
    if (!activeSocket) {
      // 최대 시도 횟수 이하일때만 경고 로그 출력
      if (initAttemptRef.current < maxInitAttempts) {
        logger.warn('WebSocketQueryBridge', 'Socket.IO 인스턴스를 찾을 수 없음');
        initAttemptRef.current += 1;
      }
      return;
    }
    
    if (!isConnected) {
      // 최대 시도 횟수 이하일때만 경고 로그 출력
      if (initAttemptRef.current < maxInitAttempts) {
        logger.warn('WebSocketQueryBridge', 'Socket.IO 연결되지 않음, 이벤트 리스너 설정 지연');
        initAttemptRef.current += 1;
      }
      return;
    }
    
    // 이미 이벤트 리스너가 설정되어 있다면 중복 설정 방지
    if (eventHandlersSetupRef.current) {
      return;
    }

    // 연결 성공 시 초기화 카운터 리셋
    initAttemptRef.current = 0;
    logger.info('WebSocketQueryBridge', '소켓 이벤트 리스너 설정');

    // CVE 생성 이벤트
    const handleCVECreated = (data) => {
      logger.info('WebSocketQueryBridge', 'CVE 생성 이벤트:', data);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_LIST] });
    };

    // CVE 업데이트 이벤트
    const handleCVEUpdated = (data) => {
      logger.info('WebSocketQueryBridge', 'CVE 업데이트 이벤트:', data);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_LIST] });
      if (data.id) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_DETAIL, data.id] });
      }
    };

    // CVE 삭제 이벤트
    const handleCVEDeleted = (data) => {
      logger.info('WebSocketQueryBridge', 'CVE 삭제 이벤트:', data);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_LIST] });
      if (data.id) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_DETAIL, data.id] });
      }
    };

    // 구독 상태 변경 이벤트
    const handleSubscriptionUpdated = (data) => {
      logger.info('WebSocketQueryBridge', '구독 상태 변경 이벤트:', data);
      if (data.cveId) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_DETAIL, data.cveId] });
      }
    };

    try {
      // 소켓 이벤트 리스너 등록
      activeSocket.on(SOCKET_EVENTS.CVE_CREATED, handleCVECreated);
      activeSocket.on(SOCKET_EVENTS.CVE_UPDATED, handleCVEUpdated);
      activeSocket.on(SOCKET_EVENTS.CVE_DELETED, handleCVEDeleted);
      activeSocket.on(SOCKET_EVENTS.SUBSCRIPTION_UPDATED, handleSubscriptionUpdated);
      
      // 이벤트 핸들러 설정 완료 표시
      eventHandlersSetupRef.current = true;
      
      logger.info('WebSocketQueryBridge', '이벤트 리스너 등록 완료');
    } catch (error) {
      logger.error('WebSocketQueryBridge', '이벤트 리스너 등록 오류', error);
    }

    // 클린업 함수
    return () => {
      // 컴포넌트가 언마운트될 때만 이벤트 리스너 해제
      logger.info('WebSocketQueryBridge', '소켓 이벤트 리스너 해제');
      
      try {
        if (activeSocket) {
          activeSocket.off(SOCKET_EVENTS.CVE_CREATED, handleCVECreated);
          activeSocket.off(SOCKET_EVENTS.CVE_UPDATED, handleCVEUpdated);
          activeSocket.off(SOCKET_EVENTS.CVE_DELETED, handleCVEDeleted);
          activeSocket.off(SOCKET_EVENTS.SUBSCRIPTION_UPDATED, handleSubscriptionUpdated);
          
          // 이벤트 핸들러 제거 표시
          eventHandlersSetupRef.current = false;
        }
      } catch (error) {
        logger.error('WebSocketQueryBridge', '이벤트 리스너 해제 오류', error);
      }
    };
  }, [queryClient]); // socketIO 의존성 제거, queryClient만 유지

  return null; // 이 컴포넌트는 UI를 렌더링하지 않습니다
};

export default WebSocketQueryBridge;