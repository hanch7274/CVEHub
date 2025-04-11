// socket/useCVESubscription.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from 'core/socket/hooks/useSocket';
import { useAuth } from 'features/auth/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from 'shared/api/queryKeys';
import logger from 'shared/utils/logging';
import socketService from 'core/socket/services/socketService';
import { SUBSCRIPTION_EVENTS } from 'core/socket/services/constants';

// 구독자 타입 정의
export interface Subscriber {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  profileImage?: string;
}

// 구독 상태 타입
interface SubscriptionState {
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * CVE 구독 관련 훅
 * - 구독/구독취소 액션 제공
 * - 구독자 정보 조회 (중앙 관리 시스템 활용)
 */
export function useCVESubscription(cveId: string) {
  const { socket, connected, on } = useSocket();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // 구독 상태 (socketService 기반으로 변경)
  const [state, setState] = useState<SubscriptionState>({
    isSubscribed: socketService.isSubscribedToCVE(cveId),
    isLoading: false,
    error: null
  });
  
  // 기본적인 refs
  const componentIdRef = useRef(`cve-subscription-${cveId}`);
  const attemptedInitialSubscriptionRef = useRef(false);
  
  // 구독 상태 조회 (socketService 사용)
  useEffect(() => {
    // socketService에서 구독 상태 가져오기
    const isSubscribed = socketService.isSubscribedToCVE(cveId);
    
    setState(prev => ({
      ...prev,
      isSubscribed
    }));
    
    logger.debug('useCVESubscription', `초기 구독 상태 로드: ${isSubscribed ? '구독중' : '미구독'}`, {
      cveId,
      isSubscribed
    });
  }, [cveId]);
  
  // 구독자 목록 가져오기 (중앙 관리 시스템에서)
  const getSubscribers = useCallback(() => {
    // 쿼리 클라이언트에서 구독자 목록 가져오기
    const subscribersKey = [QUERY_KEYS.CVE_SUBSCRIBERS, cveId];
    let subscribers: Subscriber[] = queryClient.getQueryData(subscribersKey) || [];
    
    return subscribers;
  }, [cveId, queryClient]);
  
  // 구독하기 (socketService 사용)
  const subscribe = useCallback((silent: boolean = false) => {
    if (!socket || !connected || !user) {
      if (!silent) {
        setState(prev => ({
          ...prev,
          error: '소켓 연결이 없거나 로그인되지 않았습니다.'
        }));
      }
      return;
    }
    
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null
    }));
    
    logger.debug('useCVESubscription', `CVE 구독 시도: ${cveId}`, { cveId });
    
    // socketService를 통해 구독 요청 전송 (콜백 활용)
    socketService.subscribeCVE(cveId, (success, error) => {
      if (success) {
        // 성공 시 UI 상태 업데이트
        setState(prev => ({
          ...prev,
          isSubscribed: true,
          isLoading: false
        }));
        
        logger.info('useCVESubscription', `CVE 구독 성공: ${cveId}`, { cveId });
      } else {
        // 실패 시 오류 상태로 업데이트
        setState(prev => ({
          ...prev,
          isSubscribed: false, // 구독 실패로 상태 변경
          isLoading: false,
          error: error || '구독 요청 실패'
        }));
        
        logger.error('useCVESubscription', `CVE 구독 실패: ${cveId}`, { 
          cveId, 
          error 
        });
      }
    });
    
    // 낙관적 UI 업데이트 제거 (콜백에서 처리)
    
  }, [cveId, socket, connected, user]);
  
  // 구독 취소하기 (socketService 사용)
  const unsubscribe = useCallback((silent: boolean = false) => {
    if (!socket || !connected) {
      if (!silent) {
        setState(prev => ({
          ...prev,
          error: '소켓 연결이 없습니다.'
        }));
      }
      return;
    }
    
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null
    }));
    
    logger.debug('useCVESubscription', `CVE 구독 취소 시도: ${cveId}`, { cveId });
    
    // socketService를 통해 구독 취소 요청 전송 (콜백 활용)
    socketService.unsubscribeCVE(cveId, (success, error) => {
      if (success) {
        // 성공 시 UI 상태 업데이트
        setState(prev => ({
          ...prev,
          isSubscribed: false,
          isLoading: false
        }));
        
        logger.info('useCVESubscription', `CVE 구독 취소 성공: ${cveId}`, { cveId });
      } else {
        // 실패 시 오류 상태로 업데이트
        setState(prev => ({
          ...prev,
          isSubscribed: true, // 구독 상태 유지
          isLoading: false,
          error: error || '구독 취소 요청 실패'
        }));
        
        logger.error('useCVESubscription', `CVE 구독 취소 실패: ${cveId}`, {
          cveId,
          error
        });
      }
    });
    
    // 낙관적 UI 업데이트 제거 (콜백에서 처리)
    
  }, [cveId, socket, connected]);
  
  // 초기 구독 시도
  useEffect(() => {
    // 구독자가 있는지 확인하고, 이미 구독 중이면 UI 업데이트
    if (connected && user && !attemptedInitialSubscriptionRef.current) {
      const isSubscribed = socketService.isSubscribedToCVE(cveId);
      if (isSubscribed) {
        logger.debug('useCVESubscription', `이전 구독 상태 확인: ${cveId}`, { cveId });
        setState(prev => ({
          ...prev,
          isSubscribed: true
        }));
      }
      attemptedInitialSubscriptionRef.current = true;
    }
  }, [cveId, connected, user]);
  
  // 구독 상태 변경 감시
  useEffect(() => {
    // 서버에서 구독 상태 업데이트 수신 시 처리
    const unsubscribe = on(SUBSCRIPTION_EVENTS.SUBSCRIPTION_STATUS, (data: any) => {
      if (data && data.cveId === cveId) {
        const isSubscribed = !!data.subscribed;
        
        // 로컬 상태와 다를 경우에만 업데이트
        if (state.isSubscribed !== isSubscribed) {
          setState(prev => ({
            ...prev,
            isSubscribed,
            isLoading: false,
            error: null
          }));
          
          // socketService 상태도 업데이트
          socketService.updateSubscription(cveId, isSubscribed);
          
          logger.debug('useCVESubscription', `구독 상태 업데이트: ${isSubscribed ? '구독중' : '미구독'}`, {
            cveId,
            isSubscribed
          });
        }
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [cveId, on, state.isSubscribed]);
  
  // 정리 함수
  useEffect(() => {
    return () => {
      logger.debug('useCVESubscription', `구독 훅 정리: ${cveId}`, { cveId });
    };
  }, [cveId]);
  
  return {
    // 구독 관련 상태 및 액션
    isSubscribed: state.isSubscribed,
    isLoading: state.isLoading,
    error: state.error,
    subscribe,
    unsubscribe,
    
    // 구독자 목록 접근자
    getSubscribers,
  };
}