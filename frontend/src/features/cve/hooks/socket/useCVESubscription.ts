// socket/useCVESubscription.ts
import { useEffect, useRef, useCallback, useReducer, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useCVESocket from './useCVESocket';
import socketService from 'core/socket/services/socketService';
import { createLogger } from '../utils/cveQueryUtils';
import { SOCKET_EVENTS } from 'core/socket/services/constants';
import _ from 'lodash';

// 구독 상태 리듀서 정의
type SubscriptionState = {
  isSubscribed: boolean;
  subscribers: any[];
  isLoading: boolean;
  error: Error | null;
  connectionLost: boolean;
};

type SubscriptionAction =
  | { type: 'SUBSCRIBE_REQUEST' }
  | { type: 'SUBSCRIBE_SUCCESS'; subscribers: any[] }
  | { type: 'SUBSCRIBE_FAILURE'; error: Error }
  | { type: 'UNSUBSCRIBE_REQUEST' }
  | { type: 'UNSUBSCRIBE_SUCCESS'; subscribers: any[] }
  | { type: 'UNSUBSCRIBE_FAILURE'; error: Error }
  | { type: 'UPDATE_SUBSCRIBERS'; subscribers: any[] }
  | { type: 'CONNECTION_LOST' }
  | { type: 'CONNECTION_RESTORED' };

const subscriptionReducer = (state: SubscriptionState, action: SubscriptionAction): SubscriptionState => {
  switch (action.type) {
    case 'SUBSCRIBE_REQUEST':
      return { ...state, isLoading: true, error: null };
    case 'SUBSCRIBE_SUCCESS':
      return { ...state, isSubscribed: true, subscribers: action.subscribers, isLoading: false, error: null };
    case 'SUBSCRIBE_FAILURE':
      return { ...state, isLoading: false, error: action.error };
    case 'UNSUBSCRIBE_REQUEST':
      return { ...state, isLoading: true, error: null };
    case 'UNSUBSCRIBE_SUCCESS':
      return { ...state, isSubscribed: false, subscribers: action.subscribers, isLoading: false, error: null };
    case 'UNSUBSCRIBE_FAILURE':
      return { ...state, isLoading: false, error: action.error };
    case 'UPDATE_SUBSCRIBERS':
      return { ...state, subscribers: action.subscribers };
    case 'CONNECTION_LOST':
      return { ...state, connectionLost: true };
    case 'CONNECTION_RESTORED':
      return { ...state, connectionLost: false };
    default:
      return state;
  }
};

/**
 * CVE 구독 관리 훅 (리팩토링 버전)
 * 특정 CVE에 대한 실시간 구독을 관리합니다.
 * useCVESocket 훅과 socketService를 통해 구독 상태를 중앙 관리하여 다음의 이점을 제공합니다:
 * - 한 번 구독한 CVE는 여러 컴포넌트에서 일관된 구독 상태 공유
 * - 상태 변경 이벤트 발행을 통한 구독 상태 변경 알림
 * - 로컬 스토리지 저장함으로써 브라우저 새로고침 후에도 상태 유지
 * 
 * @param cveId - 구독할 CVE ID
 * @returns 구독 상태와 관리 함수를 포함한 객체
 */
export const useCVESubscription = (cveId: string) => {
  const logger = createLogger('useCVESubscription');
  const queryClient = useQueryClient();
  
  // 구독 요청 추적을 위한 refs
  const subscriptionPendingRef = useRef(false);
  const requestIdRef = useRef('');
  
  // 초기 구독 상태 확인
  const initialSubscriptionState = useMemo(() => {
    const isSubscribed = socketService.isSubscribedToCVE(cveId);
    logger.debug(`CVE 구독 초기화: ${cveId}, 구독상태: ${isSubscribed}`);
    return isSubscribed;
  }, [cveId]);
  
  // useReducer로 상태 관리 단순화
  const [state, dispatch] = useReducer(subscriptionReducer, {
    isSubscribed: initialSubscriptionState, // socketService에서 초기 구독 상태 확인
    subscribers: [],
    isLoading: false,
    error: null,
    connectionLost: false
  });
  
  // useCVESocket 훅 사용 - CVE 소켓 연결 및 이벤트 중앙화
  const { 
    connected,
    socket, 
    on, 
    emit, 
    cleanup
  } = useCVESocket(cveId);
  
  // 현재 사용자 정보 가져오기 (메모이제이션 적용)
  const getCurrentUserInfo = useCallback(() => {
    const currentUserId = localStorage.getItem('userId');
    if (!currentUserId) return null;
    
    return {
      id: currentUserId,
      userId: currentUserId,
      username: localStorage.getItem('username') || '사용자',
      displayName: localStorage.getItem('displayName') || localStorage.getItem('username') || '사용자'
    };
  }, []);
  
  // 낙관적 UI 업데이트를 위한 구독자 목록 (메모이제이션 적용)
  const optimisticSubscribers = useMemo(() => {
    // 1. 훅 상태의 구독자 정보
    let subscribersList = state.isSubscribed ? state.subscribers : [];
    
    // 2. 로컬 스토리지에서 구독 정보 확인
    try {
      const subscribedCves = JSON.parse(localStorage.getItem('cvehub_subscribed_cves') || '[]');
      const isLocallySubscribed = Array.isArray(subscribedCves) && subscribedCves.includes(cveId);
      const currentUser = getCurrentUserInfo();
      
      if (!currentUser) {
        return subscribersList;
      }
      
      // 현재 사용자가 이미 목록에 있는지 확인
      const hasCurrentUser = subscribersList.some(sub => 
        sub.id === currentUser.id || sub.userId === currentUser.id
      );
      
      // 로컬 스토리지와 상태 간 불일치 감지 및 기록
      if (isLocallySubscribed !== state.isSubscribed) {
        logger.debug(`구독 상태 불일치: 로컬=${isLocallySubscribed}, 상태=${state.isSubscribed}, CVE=${cveId}`);
      }
      
      // 로컬에 구독되어 있고 목록에 없으면 사용자 추가
      if (isLocallySubscribed && !hasCurrentUser) {
        const updatedList = [...subscribersList, currentUser];
        return updatedList;
      }
      
      // 구독 해제됐지만 아직 목록에 있으면 제거
      if (!isLocallySubscribed && hasCurrentUser) {
        return subscribersList.filter(sub => 
          sub.id !== currentUser.id && sub.userId !== currentUser.id
        );
      }
      
      return subscribersList;
    } catch (error) {
      logger.error(`로컬 스토리지 구독 정보 처리 오류: ${cveId}`, error);
      return subscribersList;
    }
  }, [state.isSubscribed, state.subscribers, getCurrentUserInfo, cveId, logger]);
  
  // 구독 처리 함수
  const subscribe = useCallback(async (silent = false) => {
    if (subscriptionPendingRef.current) {
      logger.debug('이미 구독 요청 중입니다');
      return;
    }

    if (!silent) {
      dispatch({ type: 'SUBSCRIBE_REQUEST' });
    }

    subscriptionPendingRef.current = true;
    const reqId = Date.now().toString(36);
    requestIdRef.current = reqId;

    try {
      logger.info(`CVE 구독 요청: ${cveId}`);
      
      // 서버에 구독 요청 전송
      if (connected) {
        emit(SOCKET_EVENTS.SUBSCRIBE_CVE, { cve_id: cveId });
      }
      
      // 로컬 서비스에 구독 상태 등록
      socketService.subscribeCVE(cveId);
      
      dispatch({ 
        type: 'SUBSCRIBE_SUCCESS', 
        subscribers: optimisticSubscribers 
      });
      
      logger.info(`CVE 구독 성공: ${cveId}`);
    } catch (error) {
      logger.error(`CVE 구독 실패: ${cveId}`, error);
      dispatch({ 
        type: 'SUBSCRIBE_FAILURE', 
        error: error instanceof Error ? error : new Error('Unknown error') 
      });
    } finally {
      if (requestIdRef.current === reqId) {
        subscriptionPendingRef.current = false;
      }
    }
  }, [cveId, connected, emit, optimisticSubscribers]);

  // 구독 해제 처리 함수
  const unsubscribe = useCallback(async (silent = false) => {
    if (subscriptionPendingRef.current) {
      logger.debug('이미 구독 해제 요청 중입니다');
      return;
    }

    if (!silent) {
      dispatch({ type: 'UNSUBSCRIBE_REQUEST' });
    }

    subscriptionPendingRef.current = true;
    const reqId = Date.now().toString(36);
    requestIdRef.current = reqId;

    try {
      logger.info(`CVE 구독 해제 요청: ${cveId}`);
      
      // 서버에 구독 해제 요청 전송
      if (connected) {
        emit(SOCKET_EVENTS.UNSUBSCRIBE_CVE, { cve_id: cveId });
      }
      
      // 로컬 서비스에서 구독 상태 제거
      socketService.unsubscribeCVE(cveId);
      
      // 로컬 스토리지에서 구독 정보 삭제
      try {
        const storedCves = JSON.parse(localStorage.getItem('cvehub_subscribed_cves') || '[]');
        const updatedCves = Array.isArray(storedCves) ? storedCves.filter(id => id !== cveId) : [];
        localStorage.setItem('cvehub_subscribed_cves', JSON.stringify(updatedCves));
        logger.debug(`로컬 스토리지 구독 정보 삭제: ${cveId}`);
      } catch (err) {
        logger.error(`로컬 스토리지 구독 정보 삭제 실패: ${cveId}`, err);
      }
      
      dispatch({ 
        type: 'UNSUBSCRIBE_SUCCESS', 
        subscribers: optimisticSubscribers.filter(sub => {
          const currentUser = getCurrentUserInfo();
          return currentUser ? (sub.id !== currentUser.id && sub.userId !== currentUser.id) : true;
        })
      });
      
      logger.info(`CVE 구독 해제 성공: ${cveId}`);
    } catch (error) {
      logger.error(`CVE 구독 해제 실패: ${cveId}`, error);
      dispatch({ 
        type: 'UNSUBSCRIBE_FAILURE', 
        error: error instanceof Error ? error : new Error('Unknown error') 
      });
    } finally {
      if (requestIdRef.current === reqId) {
        subscriptionPendingRef.current = false;
      }
    }
  }, [cveId, connected, emit, optimisticSubscribers, getCurrentUserInfo]);

  // 구독자 목록 업데이트 핸들러
  const handleSubscribersUpdate = useCallback((data: any) => {
    if (!data || !data.cve_id || data.cve_id !== cveId) return;
    
    logger.debug(`CVE 구독자 목록 업데이트 수신: ${cveId}`, data);
    dispatch({ type: 'UPDATE_SUBSCRIBERS', subscribers: data.subscribers || [] });
  }, [cveId]);

  // 연결 상태 변경 처리
  const handleConnectionChange = useCallback((isConnected: boolean) => {
    if (!isConnected) {
      logger.warn(`연결 끊김 감지, CVE 구독 상태: ${cveId}`);
      dispatch({ type: 'CONNECTION_LOST' });
    } else if (state.connectionLost) {
      logger.info(`연결 복구됨, CVE 구독 상태 복원: ${cveId}`);
      dispatch({ type: 'CONNECTION_RESTORED' });
      
      // 연결 복구 후 구독 상태 복원
      if (state.isSubscribed) {
        subscribe(true);
      }
    }
  }, [cveId, state.connectionLost, state.isSubscribed, subscribe]);

  // 웹소켓 이벤트 구독 설정
  useEffect(() => {
    // 구독자 목록 업데이트 이벤트 구독
    const unsubSubscribersUpdate = on(SOCKET_EVENTS.CVE_SUBSCRIBERS_UPDATED, handleSubscribersUpdate);
    
    // 초기 구독 상태를 서버와 동기화
    if (connected && initialSubscriptionState) {
      logger.debug(`초기 구독 상태 동기화: ${cveId} (이미 구독됨)`);
      subscribe(true);
    }
    
    // 연결 상태 변경 감지
    handleConnectionChange(connected);
    
    // 컴포넌트 언마운트 시 정리
    return () => {
      logger.debug(`컴포넌트 언마운트: ${cveId}`);
      unsubSubscribersUpdate();
      
      // 구독 해제 처리
      if (socketService.isSubscribedToCVE(cveId) && !subscriptionPendingRef.current) {
        logger.info(`컴포넌트 언마운트: CVE 구독 자동 해제 ${cveId}`);
        unsubscribe(true);
      }
      
      // 소켓 리소스 정리
      cleanup();
    };
  }, [cveId, connected, on, subscribe, unsubscribe, handleSubscribersUpdate, handleConnectionChange, cleanup, initialSubscriptionState]);

  // 서비스 상태와 로컬 상태 동기화 검사
  const socketSubscriptionStatus = useMemo(() => {
    const serviceStatus = socketService.isSubscribedToCVE(cveId);
    if (serviceStatus !== state.isSubscribed) {
      logger.debug(`구독 상태 불일치 검출: ${cveId}`, {
        stateIsSubscribed: state.isSubscribed,
        socketServiceIsSubscribed: serviceStatus
      });
    }
    return serviceStatus;
  }, [cveId, state.isSubscribed]);
  
  // 반환값
  return {
    subscribe,
    unsubscribe,
    isSubscribed: socketSubscriptionStatus, // socketService 상태 우선 사용
    subscribers: optimisticSubscribers,
    isLoading: state.isLoading,
    error: state.error,
    connectionLost: state.connectionLost
  };
};

export default useCVESubscription;
